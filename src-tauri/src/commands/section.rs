use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::section::{self, Section};
use crate::repository::section_membership::{
    self, CorrectPlacementOutcome, CurrentRosterMember, EndMembershipOutcome, EnrollOutcome,
    EnrollmentCandidate, SectionMembership, TransferOutcome,
};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::learner::list_learners_by_school`.
#[tauri::command]
pub fn list_sections_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Section>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section::list_by_school(&conn, &school_id)
}

/// Gated by `ManageTeachingAssignments` -- defining what sections/classes
/// exist for a school year is a structural scheduling-authority decision,
/// the same domain `docs/adr/0039-teacher-load-class-schedule-foundation.md`
/// already scoped to School Head only, not `ManageLearners` (which governs
/// an individual learner's own record/enrollment, a Registrar's
/// operational job rather than a School Head's structural one). Previously
/// ungated beyond an active session (any role) -- closed as a real
/// authorization gap found during Wave 2A, fixed in Wave 2A.1. See
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
///
/// ADR-0067/0069 sync wiring (third entity, following `Learner`/
/// `Attendance`): the exact same enrollment-gated encrypt-on-enqueue
/// pattern as `commands::learner::create_learner` — see that command's
/// own doc comment. Chosen over `SectionMembership` as the next entity
/// because `attendance_records.section_id` is the actual FK that pulled
/// `Attendance` changes hit (see `commands::attendance`'s own doc
/// comment) — wiring `Section` directly closes that gap, whereas
/// `SectionMembership` has no FK relationship to `attendance_records` at
/// all and would not help it. `Section` also has no `update` command
/// today, so this is a create-only write exactly like `Learner`
/// (`base_version` unconditionally `0`).
#[tauri::command]
pub fn create_section(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    grade_level: String,
    name: String,
) -> AppResult<Section> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_section_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &school_year,
        &grade_level,
        &name,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::learner::resolve_sspk_if_enrolled`.
fn resolve_sspk_if_enrolled(
    app: &AppHandle,
    conn: &Connection,
    school_id: &str,
) -> AppResult<Option<[u8; PAYLOAD_KEY_LEN]>> {
    if device_credential::has_active_for_school(conn, school_id)? {
        Ok(Some(db::load_or_mint_sspk(app)?))
    } else {
        Ok(None)
    }
}

/// Shared logic behind `create_section`, kept separate so it can be
/// exercised directly in this module's own tests without a real Tauri
/// `AppHandle` -- same reason as
/// `commands::learner::create_learner_with_optional_sync`. `sspk` is
/// `None` when this school has never enrolled a device: behaves exactly
/// as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox row. When
/// `Some`, the section insert and the outbox enqueue are atomic together
/// in one `SAVEPOINT`.
fn create_section_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    school_year: &str,
    grade_level: &str,
    name: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Section> {
    let Some(sspk) = sspk else {
        return section::create(conn, school_id, school_year, grade_level, name);
    };

    conn.execute_batch("SAVEPOINT create_section_with_sync")?;
    let outcome = (|| -> AppResult<Section> {
        let created = section::create(conn, school_id, school_year, grade_level, name)?;
        enqueue_section_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_section_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_section_with_sync; RELEASE create_section_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created section.
/// `base_version` is unconditionally `0` -- same rationale as
/// `commands::learner::enqueue_learner_sync_change`'s identical comment:
/// this `entity_id` has never existed before this exact call.
fn enqueue_section_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &Section,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let plaintext = serde_json::to_vec(created)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::Section,
        entity_id: parse_sync_uuid(&created.id, "section id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::learner::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// `section_id`/`learner_id` identify WHAT and WHO; `school_id` still comes
/// only from the session. Returns `None`, not an error, when either id
/// doesn't resolve within the caller's own school — see
/// `repository::section_membership::enroll`'s doc comment. Gated by the
/// same `ManageLearners` capability as `create_learner`/`update_learner` --
/// enrolling/transferring a learner is "manage learners," not a separate
/// capability (matches `update_learner`'s own established convention).
/// Previously ungated beyond an active session (any role) -- closed as a
/// real authorization gap during Wave 2A, see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[tauri::command]
pub fn enroll_learner_in_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    starts_on: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enroll(&conn, &school_id, &section_id, &learner_id, &starts_on)
}

/// The current roster for the Section Roster screen. `section_id` is
/// client-supplied the same way `learner_id` already is elsewhere —
/// isolation holds because
/// `repository::section_membership::current_roster` scopes its query by
/// `school_id` AND `section_id` together, so a `section_id` from another
/// school returns an empty roster rather than leaking rows. Ungated beyond
/// an active session, matching this codebase's "reads stay open, writes are
/// capability-gated" convention.
#[tauri::command]
pub fn section_roster(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<CurrentRosterMember>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::current_roster(&conn, &school_id, &section_id, &as_of_date)
}

/// Transfers a currently-enrolled learner to another section, effective
/// `effective_on`. `from_membership_id`/`to_section_id`/`learner_id`
/// identify WHICH placement and WHERE; `school_id` still comes only from the
/// session. Gated by `ManageLearners` -- the same capability as
/// `enroll_learner_in_section`, since "moving a learner between sections" is
/// managing that learner's enrollment (ADR-0042). The structured
/// `TransferOutcome` distinguishes success from stale-roster, unknown
/// membership, unknown/`same` destination, and an effective date before the
/// placement began -- the UI maps each to its own message; none expose SQL,
/// ids, or another school's data.
#[tauri::command]
pub fn transfer_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    from_membership_id: String,
    to_section_id: String,
    effective_on: String,
) -> AppResult<TransferOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::transfer_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &from_membership_id,
        &to_section_id,
        &effective_on,
    )
}

/// Ends a currently-enrolled learner's specific open membership, effective
/// `effective_on`. Sets `ends_on` (never deletes), so the placement history
/// is preserved. `membership_id`/`learner_id` identify WHICH placement;
/// `school_id` comes only from the session. Gated by `ManageLearners`, same
/// as transfer/enroll. The structured `EndMembershipOutcome` distinguishes
/// success from stale-roster, unknown membership, and an effective date
/// before the placement began.
#[tauri::command]
pub fn end_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    membership_id: String,
    effective_on: String,
) -> AppResult<EndMembershipOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::end_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &membership_id,
        &effective_on,
    )
}

/// Every learner in the session's school with their current open
/// membership state, for the Section Roster "Enroll learner" picker.
/// Gated by `ManageLearners` -- a school-wide learner lookup, the same
/// class of read as `find_learner_candidates` (also `ManageLearners`),
/// not the narrow open-read convention. `school_id` is session-derived;
/// the query in `section_membership::enrollable_learners` constrains
/// scope on learners, memberships, and sections together.
#[tauri::command]
pub fn list_enrollable_learners(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<EnrollmentCandidate>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enrollable_learners(&conn, &school_id)
}

/// Places an existing, eligible learner into a section, effective
/// `starts_on`. `learner_id`/`section_id` identify WHO and WHERE;
/// `school_id` comes only from the session. Gated by `ManageLearners`,
/// the same capability as `enroll_learner_in_section` /
/// `transfer_learner_membership` / `end_learner_membership`. The
/// structured `EnrollOutcome` distinguishes success from an unknown or
/// cross-school learner/section, a learner already actively enrolled
/// (transfer required -- never performed here), an overlapping retained
/// membership, an invalid start date, and a backdated start that would
/// strand dependent records. None expose SQL, ids beyond the caller's
/// school, or another school's data.
#[tauri::command]
pub fn enroll_learner_membership(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    section_id: String,
    starts_on: String,
) -> AppResult<EnrollOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::enroll_membership(
        &mut conn,
        &school_id,
        &learner_id,
        &section_id,
        &starts_on,
    )
}

/// Corrects a same-day data-entry mistake: `membership_id` was placed in
/// the wrong section *today*, and the strict half-open interval policy
/// (ADR-0042 Wave 2Q addendum) refuses the obvious fix -- a same-day
/// transfer -- because it would create a zero-length interval. This is not
/// a transfer: it updates the *same* row's section in place, exactly once,
/// retaining the original section. `learner_id`/`membership_id`/
/// `to_section_id` identify WHO and WHICH placement; `school_id` comes only
/// from the session. Gated by `ManageLearners`, same as
/// `enroll_learner_membership`/`transfer_learner_membership`. The
/// structured `CorrectPlacementOutcome` distinguishes success from a stale
/// or forged membership, a placement not entered today, an
/// already-corrected double submit, an unknown/same destination, and a
/// dependent-record conflict -- see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s Wave 2S
/// addendum for the full decision record.
#[tauri::command]
pub fn correct_same_day_placement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    membership_id: String,
    to_section_id: String,
    as_of_date: String,
) -> AppResult<CorrectPlacementOutcome> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    section_membership::correct_same_day_placement(
        &mut conn,
        &school_id,
        &learner_id,
        &membership_id,
        &to_section_id,
        &as_of_date,
    )
}

/// A learner's full enrollment (section-placement) history -- ungated
/// beyond an active session, matching `commands::learner::get_learner`'s
/// existing "reads stay open, writes are capability-gated" convention.
#[tauri::command]
pub fn list_learner_enrollment_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Vec<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::list_by_learner_in_school(&conn, &school_id, &learner_id)
}

/// A learner's current (still-open) section placement, if any -- see
/// `repository::section_membership::current_membership_for_learner_in_school`'s
/// doc comment for why this is derived, not a stored flag.
#[tauri::command]
pub fn get_current_enrollment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::current_membership_for_learner_in_school(&conn, &school_id, &learner_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{school, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn setup() -> (Connection, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let user = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        (conn, school.id, user.id)
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    #[test]
    fn create_section_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, actor_user_id) = setup();

        let created = create_section_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "2025-2026",
            "7",
            "Mabini",
            None,
        )
        .unwrap();

        assert_eq!(created.name, "Mabini");
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_section_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        let created = create_section_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "2025-2026",
            "7",
            "Mabini",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::Section);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_user_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: Section = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_section_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        create_section_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "2025-2026",
            "7",
            "Mabini",
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }
}
