use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::assessment_item::{self, AssessmentItem, AssessmentItemDetail};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `class_record_id` is client-supplied the same legitimate way
/// `section_id` already is in `enroll_learner_in_section` —
/// `assessment_item::list_by_class_record` scopes its query by
/// `school_id` AND `class_record_id` together, so a foreign
/// `class_record_id` returns an empty list rather than leaking rows.
#[tauri::command]
pub fn list_assessment_items_by_class_record(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
) -> AppResult<Vec<AssessmentItemDetail>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::list_by_class_record(&conn, &school_id, &class_record_id)
}

/// `class_record_id`/`category_id` are client-supplied the same way —
/// `assessment_item::create` verifies `class_record_id` resolves within
/// the caller's school and `category_id` exists before writing;
/// `school_id` still comes only from the session.
///
/// ADR-0067/0069 sync wiring (sixth entity, following `Learner`/
/// `Attendance`/`Section`/`LearnerScore`): the exact same
/// enrollment-gated encrypt-on-enqueue pattern as
/// `commands::section::create_section` — see that command's own doc
/// comment. `AssessmentItem` was chosen over the remaining unwired
/// entities (`SectionMembership`, `TeachingAssignment`, `Subject`,
/// `GradingPeriod`, `SubjectAttendance`) because it already has a mature
/// write path (`assessment_item::create`, existence-checked against both
/// `class_record_id` and a leaf `category_id`) AND is the entity a
/// teacher creates routinely throughout a grading period — a new quiz or
/// task item, entered on whichever device is at hand, must be visible on
/// the school-laptop hub before another teacher/adviser can record scores
/// against it (`learner_scores.assessment_item_id` is a hard FK) — unlike
/// `SectionMembership`, whose write surface is five separate temporal
/// verbs (`enroll`/`enroll_membership`/`transfer_membership`/
/// `end_membership`/`correct_same_day_placement`) that would need
/// wiring together as one slice, and unlike the rarely-changing
/// once-a-term reference data (`Subject`, `GradingPeriod`,
/// `TeachingAssignment`). Like `Section`, only `create` is wired here —
/// `rename`/`update`/`delete` are deliberately left for a later slice
/// (see `repository::assessment_item::upsert_from_sync`'s own doc
/// comment on why that upsert already tolerates a future
/// `rename`/`update` round-trip without changes).
#[tauri::command]
pub fn create_assessment_item(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
    category_id: String,
    name: String,
    max_score: f64,
) -> AppResult<Option<AssessmentItem>> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_assessment_item_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &class_record_id,
        &category_id,
        &name,
        max_score,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::section::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `create_assessment_item`, kept separate so it can
/// be exercised directly in this module's own tests without a real Tauri
/// `AppHandle` -- same reason as
/// `commands::section::create_section_with_optional_sync`. `sspk` is
/// `None` when this school has never enrolled a device: behaves exactly
/// as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox row. When
/// `Some`, the item insert and the outbox enqueue are atomic together in
/// one `SAVEPOINT`.
#[allow(clippy::too_many_arguments)]
fn create_assessment_item_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    class_record_id: &str,
    category_id: &str,
    name: &str,
    max_score: f64,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<AssessmentItem>> {
    let Some(sspk) = sspk else {
        return assessment_item::create(
            conn,
            school_id,
            class_record_id,
            category_id,
            name,
            max_score,
        );
    };

    conn.execute_batch("SAVEPOINT create_assessment_item_with_sync")?;
    let outcome = (|| -> AppResult<Option<AssessmentItem>> {
        let created = assessment_item::create(
            conn,
            school_id,
            class_record_id,
            category_id,
            name,
            max_score,
        )?;
        if let Some(created) = &created {
            enqueue_assessment_item_sync_change(conn, school_id, actor_user_id, created, sspk)?;
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_assessment_item_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_assessment_item_with_sync; RELEASE create_assessment_item_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created assessment
/// item. `base_version` is unconditionally `0` -- same rationale as
/// `commands::section::enqueue_section_sync_change`'s identical comment:
/// this `entity_id` has never existed before this exact call (only
/// `create` is wired to the outbox, never `rename`/`update`/`delete`).
fn enqueue_assessment_item_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &AssessmentItem,
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
        entity_kind: EntityKind::AssessmentItem,
        entity_id: parse_sync_uuid(&created.id, "assessment item id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::section::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// Renames an assessment item — always permitted, scored or not, since
/// `name` never affects grade computation. See
/// `assessment_item::rename`'s doc comment for the verification behind
/// that claim.
#[tauri::command]
pub fn rename_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
    name: String,
) -> AppResult<Option<AssessmentItem>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::rename(&conn, &school_id, &id, &name)
}

/// Fully edits an assessment item (name/category/max score) — only
/// permitted while it has no recorded scores yet. See
/// `assessment_item::update`'s doc comment for why category/max-score
/// changes are blocked once scores exist.
#[tauri::command]
pub fn update_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
    name: String,
    category_id: String,
    max_score: f64,
) -> AppResult<Option<AssessmentItem>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::update(&conn, &school_id, &id, &name, &category_id, max_score)
}

/// Deletes an assessment item — only permitted while it has no recorded
/// scores yet. See `assessment_item::delete`'s doc comment.
#[tauri::command]
pub fn delete_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::delete(&conn, &school_id, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{class_record, grading, school, section, subject};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    /// School + a full class record chain (section + subject + grading
    /// period) -- the minimum fixture
    /// `create_assessment_item_with_optional_sync` needs. Returns
    /// (school_id, class_record_id, teacher_id).
    fn setup() -> (Connection, String, String, String) {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(&conn, &s.id, "Mathematics").unwrap();
        let period = grading::create(
            &conn,
            &s.id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let cr = class_record::create(&conn, &s.id, &sec.id, &sub.id, &period.id, K10_POLICY, None)
            .unwrap()
            .unwrap();
        let teacher =
            crate::repository::user::create_user(&conn, "teacher.a", "password", "A Teacher")
                .unwrap();
        (conn, s.id, cr.id, teacher.id)
    }

    #[test]
    fn create_assessment_item_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, class_record_id, teacher_id) = setup();

        let created = create_assessment_item_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &class_record_id,
            WRITTEN_WORKS,
            "Quiz 1",
            20.0,
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
    fn create_assessment_item_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, class_record_id, teacher_id) = setup();
        let sspk = test_sspk();

        let created = create_assessment_item_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &class_record_id,
            WRITTEN_WORKS,
            "Quiz 1",
            20.0,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::AssessmentItem);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), teacher_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: AssessmentItem = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_assessment_item_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, class_record_id, teacher_id) = setup();
        let sspk = test_sspk();

        create_assessment_item_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &class_record_id,
            WRITTEN_WORKS,
            "Quiz 1",
            20.0,
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let (conn, school_id, _class_record_id, teacher_id) = setup();
        let sspk = test_sspk();
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_class_record = {
            let sec = section::create(&conn, &other_school.id, "2026-2027", "7", "Rizal").unwrap();
            let sub = subject::create(&conn, &other_school.id, "Science").unwrap();
            let period = grading::create(
                &conn,
                &other_school.id,
                "2026-2027",
                TERM_1,
                "2026-06-08",
                "2026-09-15",
            )
            .unwrap()
            .unwrap();
            class_record::create(
                &conn,
                &other_school.id,
                &sec.id,
                &sub.id,
                &period.id,
                K10_POLICY,
                None,
            )
            .unwrap()
            .unwrap()
        };

        let result = create_assessment_item_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &other_class_record.id,
            WRITTEN_WORKS,
            "Quiz 1",
            20.0,
            Some(&sspk),
        )
        .unwrap();

        assert_eq!(
            result, None,
            "a cross-school class_record_id must still be rejected"
        );
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected write must never enqueue a sync change for it"
        );
    }
}
