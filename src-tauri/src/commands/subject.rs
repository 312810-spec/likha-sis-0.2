use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::subject::{self, Subject};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::section::list_sections_by_school`.
#[tauri::command]
pub fn list_subjects_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Subject>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    subject::list_by_school(&conn, &school_id)
}

/// `school_id` comes only from the session; `name`'s own `UNIQUE
/// (school_id, name)` constraint is enforced by `subject::create` and
/// surfaces as an `Err`.
///
/// ADR-0067/0069 sync wiring (sixth entity wired end to end, following
/// `Learner`/`Attendance`/`Section`/`LearnerScore`/`AssessmentItem`): the
/// exact same enrollment-gated encrypt-on-enqueue pattern as
/// `commands::section::create_section` — see that command's own doc
/// comment. `Subject` was chosen over the remaining unwired entities
/// (`SectionMembership`, `TeachingAssignment`, `GradingPeriod`,
/// `SubjectAttendance`) because it has exactly one mature write verb
/// (`subject::create`, no `update`/`rename` yet), unlike
/// `SectionMembership` (five temporal verbs), `TeachingAssignment`
/// (`create` + `replace_teacher` + `remove`), and `SubjectAttendance`
/// (session-open + no-class + per-entry recording across two tables) —
/// each of those would need a materially larger multi-verb slice than
/// this task's "wire that ONE entity" scope and TDD budget allow safely
/// in one pass, the same reasoning the prior slice already applied to
/// rule out `SectionMembership` (see `commands::assessment_item`'s own
/// doc comment). `Subject` is also the one still-unwired entity every
/// other entity's own hub-side correctness depends on: `class_record`,
/// `teaching_assignment`, and `assessment_item` all carry a hard
/// `subject_id` FK, so a subject created on a teacher's laptop that
/// never reaches the school-laptop hub would silently strand any of
/// those dependent rows synced from elsewhere — the same
/// FK-completeness reasoning `commands::section`'s own doc comment used
/// to justify wiring `Section` ahead of `SectionMembership`. Like
/// `Section`/`AssessmentItem`, only `create` is wired here — there is no
/// `update`/`rename` command to wire (see `repository::subject::
/// upsert_from_sync`'s own doc comment on why the upsert still tolerates
/// a future one without changes).
#[tauri::command]
pub fn create_subject(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    name: String,
) -> AppResult<Subject> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_subject_with_optional_sync(&conn, &school_id, &actor_user_id, &name, sspk.as_ref())
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

/// Shared logic behind `create_subject`, kept separate so it can be
/// exercised directly in this module's own tests without a real Tauri
/// `AppHandle` -- same reason as `commands::section::
/// create_section_with_optional_sync`. `sspk` is `None` when this school
/// has never enrolled a device: behaves exactly as it did before
/// ADR-0067 existed, no `SAVEPOINT`, no outbox row. When `Some`, the
/// subject insert and the outbox enqueue are atomic together in one
/// `SAVEPOINT` -- a rejected create (e.g. the duplicate-name `UNIQUE`
/// constraint) never enqueues an outbox row, since the enqueue only runs
/// after `subject::create` has already returned successfully.
fn create_subject_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    name: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Subject> {
    let Some(sspk) = sspk else {
        return subject::create(conn, school_id, name);
    };

    conn.execute_batch("SAVEPOINT create_subject_with_sync")?;
    let outcome = (|| -> AppResult<Subject> {
        let created = subject::create(conn, school_id, name)?;
        enqueue_subject_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_subject_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_subject_with_sync; RELEASE create_subject_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created subject.
/// `base_version` is unconditionally `0` -- same rationale as
/// `commands::section::enqueue_section_sync_change`'s identical comment:
/// this `entity_id` has never existed before this exact call (only
/// `create` is wired to the outbox).
fn enqueue_subject_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &Subject,
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
        entity_kind: EntityKind::Subject,
        entity_id: parse_sync_uuid(&created.id, "subject id")?,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::school;
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn setup() -> (Connection, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let user = crate::repository::user::create_user(&conn, "ana.cruz", "password", "Ana Cruz")
            .unwrap();
        (conn, school.id, user.id)
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    #[test]
    fn create_subject_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, actor_user_id) = setup();

        let created = create_subject_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Mathematics",
            None,
        )
        .unwrap();

        assert_eq!(created.name, "Mathematics");
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_subject_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        let created = create_subject_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Mathematics",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::Subject);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_user_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: Subject = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_subject_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();

        create_subject_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Mathematics",
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let (conn, school_id, actor_user_id) = setup();
        let sspk = test_sspk();
        create_subject_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Mathematics",
            Some(&sspk),
        )
        .unwrap();

        // Same name in the same school hits `subjects`' own `UNIQUE
        // (school_id, name)` constraint inside `subject::create`.
        let result = create_subject_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            "Mathematics",
            Some(&sspk),
        );

        assert!(result.is_err());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(
            queued.len(),
            1,
            "a rejected create must never enqueue a second outbox row"
        );
    }
}
