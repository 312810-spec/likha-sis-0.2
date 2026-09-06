use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::grading::{self, GradingPeriod, GradingPolicy, GradingPolicyPeriod};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Reference data, not scoped to any session/school — every school sees
/// the same DepEd-sourced set of grading policies. Still requires an
/// active session (matching every other command here) so this can't be
/// probed pre-login.
#[tauri::command]
pub fn list_grading_policies(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<GradingPolicy>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    grading::list_policies(&conn)
}

#[tauri::command]
pub fn list_grading_policy_periods(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    policy_id: String,
) -> AppResult<Vec<GradingPolicyPeriod>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    grading::list_periods_for_policy(&conn, &policy_id)
}

/// `school_id` is derived from the session, never a parameter — same
/// convention as every other command here.
#[tauri::command]
pub fn list_grading_periods_by_school_year(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
) -> AppResult<Vec<GradingPeriod>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading::list_by_school_year(&conn, &school_id, &school_year)
}

/// `policy_period_id` is client-supplied the same legitimate way
/// `section_id` already is elsewhere in this codebase — it identifies a
/// fixed piece of reference data, not tenant data, so there is nothing
/// for it to leak; `school_id` still comes only from the session.
///
/// ADR-0067/0069 sync wiring (eighth entity wired end to end, following
/// `Learner`/`Attendance`/`Section`/`LearnerScore`/`AssessmentItem`/
/// `Subject`/`TeachingAssignment`): the exact same enrollment-gated
/// encrypt-on-enqueue pattern as `commands::subject::create_subject` and
/// `commands::teaching_assignment::create_teaching_assignment` — see
/// those commands' own doc comments. Only `create` is wired here,
/// matching `Section`/`Subject`/`TeachingAssignment`'s own create-only
/// precedent: there is no `update`/`remove` command on grading periods
/// today, so `upsert_from_sync` (see its own doc comment) is the only
/// materializer this entity needs. `SubjectAttendance` remains the next
/// unwired entity; `SectionMembership` is a multi-verb entity deferred
/// pending its own design.
#[tauri::command]
pub fn create_grading_period(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    policy_period_id: String,
    starts_on: String,
    ends_on: String,
) -> AppResult<Option<GradingPeriod>> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_grading_period_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &school_year,
        &policy_period_id,
        &starts_on,
        &ends_on,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::subject::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `create_grading_period`, kept separate so it can
/// be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as
/// `commands::subject::create_subject_with_optional_sync`. `sspk` is
/// `None` when this school has never enrolled a device: behaves exactly
/// as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox row.
/// When `Some`, the period insert and the outbox enqueue are atomic
/// together in one `SAVEPOINT` -- a rejected create (unknown
/// `policy_period_id`, an end date before the start date, or the
/// duplicate `(school_id, school_year, policy_period_id)` constraint)
/// never enqueues an outbox row, since the enqueue only runs when
/// `grading::create` actually returned a row.
#[allow(clippy::too_many_arguments)]
fn create_grading_period_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    school_year: &str,
    policy_period_id: &str,
    starts_on: &str,
    ends_on: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<GradingPeriod>> {
    let Some(sspk) = sspk else {
        return grading::create(
            conn,
            school_id,
            school_year,
            policy_period_id,
            starts_on,
            ends_on,
        );
    };

    conn.execute_batch("SAVEPOINT create_grading_period_with_sync")?;
    let outcome = (|| -> AppResult<Option<GradingPeriod>> {
        let created = grading::create(
            conn,
            school_id,
            school_year,
            policy_period_id,
            starts_on,
            ends_on,
        )?;
        if let Some(created) = &created {
            enqueue_grading_period_sync_change(conn, school_id, actor_user_id, created, sspk)?;
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_grading_period_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_grading_period_with_sync; RELEASE create_grading_period_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created grading
/// period. `base_version` is unconditionally `0` -- same rationale as
/// `commands::subject::enqueue_subject_sync_change`'s identical comment:
/// this `entity_id` has never existed before this exact call (only
/// `create` is wired to the outbox).
fn enqueue_grading_period_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &GradingPeriod,
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
        entity_kind: EntityKind::GradingPeriod,
        entity_id: parse_sync_uuid(&created.id, "grading period id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::subject::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::school;

    fn open_test_db() -> Connection {
        crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";

    /// A school and an actor user id -- mirrors
    /// `commands::subject::tests::setup`'s shape.
    fn setup() -> (Connection, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let actor = crate::repository::user::create_user(&conn, "ana.cruz", "password", "Ana Cruz")
            .unwrap();
        (conn, school.id, actor.id)
    }

    #[test]
    fn create_grading_period_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, actor_id) = setup();

        let created = create_grading_period_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
            None,
        )
        .unwrap();

        assert!(created.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_grading_period_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, actor_id) = setup();
        let sspk = test_sspk();

        let created = create_grading_period_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::GradingPeriod);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: GradingPeriod = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_grading_period_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, actor_id) = setup();
        let sspk = test_sspk();

        create_grading_period_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let (conn, school_id, actor_id) = setup();
        let sspk = test_sspk();
        // An unknown policy_period_id is an invalid reference --
        // `grading::create` returns `Ok(None)`.
        let result = create_grading_period_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            "2026-2027",
            "does-not-exist",
            "2026-06-08",
            "2026-09-15",
            Some(&sspk),
        )
        .unwrap();

        assert_eq!(result, None);
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected create must never enqueue an outbox row"
        );
    }
}
