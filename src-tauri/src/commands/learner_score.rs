use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::grading_computation::{self, ComputedTermGrade};
use crate::repository::learner_score::{
    self, LearnerScore, LearnerScoreRosterEntry, LearnerScoreStatus,
};
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `assessment_item_id` is client-supplied the same legitimate way
/// `section_id` already is elsewhere — `learner_score::roster_for_item`
/// resolves it within the caller's school first and returns `None` for a
/// foreign/unknown id.
#[tauri::command]
pub fn roster_for_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
) -> AppResult<Option<Vec<LearnerScoreRosterEntry>>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner_score::roster_for_item(&conn, &school_id, &assessment_item_id)
}

/// `assessment_item_id`/`learner_id` identify WHAT and WHO; `school_id`
/// comes only from the session, and `recorded_by_user_id` is the
/// session's own `user_id` — never a client-supplied parameter, so a
/// caller cannot attribute a score entry to a different teacher.
///
/// ADR-0067/0069 sync wiring (fourth entity, following `Learner`/
/// `Attendance`/`Section`): the exact same enrollment-gated
/// encrypt-on-enqueue pattern as `commands::attendance::record_attendance`
/// — see that command's own doc comment. `LearnerScore` was chosen over
/// the other still-unwired entities (`SectionMembership`,
/// `AssessmentItem`, `TeachingAssignment`, `Subject`, `GradingPeriod`,
/// `SubjectAttendance`) because it already has a mature, re-recordable
/// write path (`learner_score::record`, an upsert keyed on
/// `(assessment_item_id, learner_id)` exactly like `attendance::record`
/// is keyed on `(learner_id, attendance_date)`) AND is the entity a
/// teacher's day-to-day gradebook work changes most often and most
/// urgently needs reflected across a shared school-laptop hub -- e.g. a
/// grade adviser reviewing a subject teacher's just-recorded quiz scores
/// before running `compute_learner_term_grade` on another device -- unlike
/// rarely-changing reference data (`Subject`, `GradingPeriod`,
/// `TeachingAssignment`).
#[tauri::command]
pub fn record_learner_score(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
    learner_id: String,
    status: LearnerScoreStatus,
    score: Option<f64>,
) -> AppResult<Option<LearnerScore>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_learner_score_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &assessment_item_id,
        &learner_id,
        status,
        score,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::attendance::resolve_sspk_if_enrolled`.
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

/// Shared logic exercised directly by this module's own tests -- same
/// reason as `commands::attendance::record_attendance_with_optional_sync`.
/// `sspk` is `None` when this school has never enrolled a device: behaves
/// exactly as this command did before ADR-0067 existed. When `Some`, the
/// score write and the outbox enqueue are atomic together in one
/// `SAVEPOINT`.
#[allow(clippy::too_many_arguments)]
fn record_learner_score_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    recorded_by_user_id: &str,
    assessment_item_id: &str,
    learner_id: &str,
    status: LearnerScoreStatus,
    score: Option<f64>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<LearnerScore>> {
    let Some(sspk) = sspk else {
        return learner_score::record(
            conn,
            school_id,
            assessment_item_id,
            learner_id,
            status,
            score,
            recorded_by_user_id,
        );
    };

    conn.execute_batch("SAVEPOINT record_learner_score_with_sync")?;
    let outcome = (|| -> AppResult<Option<LearnerScore>> {
        let recorded = learner_score::record(
            conn,
            school_id,
            assessment_item_id,
            learner_id,
            status,
            score,
            recorded_by_user_id,
        )?;
        if let Some(recorded) = &recorded {
            enqueue_learner_score_sync_change(
                conn,
                school_id,
                recorded_by_user_id,
                recorded,
                sspk,
            )?;
        }
        Ok(recorded)
    })();

    match outcome {
        Ok(recorded) => {
            conn.execute_batch("RELEASE record_learner_score_with_sync")?;
            Ok(recorded)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_learner_score_with_sync; RELEASE record_learner_score_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a recorded/updated learner
/// score row. Like `commands::attendance::enqueue_attendance_sync_change`
/// (a re-recordable write, unlike `Learner`/`Section`'s create-only
/// unconditional `base_version = 0`), `base_version` here is this
/// device's own last-known version for this exact entity id, read from
/// `sync_version_cache`, so a real second edit is not misreported as a
/// stale conflict against itself.
fn enqueue_learner_score_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    recorded: &LearnerScore,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version =
        sync_version_cache::known_version(conn, school_id, EntityKind::LearnerScore, &recorded.id)?;
    let plaintext = serde_json::to_vec(recorded)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::LearnerScore,
        entity_id: parse_sync_uuid(&recorded.id, "learner score id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// See `commands::attendance::parse_sync_uuid`'s doc comment -- identical
/// reasoning, duplicated per module rather than shared across command
/// modules.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// `class_record_id`/`learner_id` are client-supplied the same legitimate
/// way `assessment_item_id` already is above — `grading_computation::compute_term_grade`
/// resolves `class_record_id` within the caller's school first and returns
/// `None` for a foreign/unknown id or a not-yet-computable grade (see that
/// function's doc comment for what "not yet computable" means). `school_id`
/// comes only from the session.
#[tauri::command]
pub fn compute_learner_term_grade(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
    learner_id: String,
) -> AppResult<Option<ComputedTermGrade>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading_computation::compute_term_grade(&conn, &school_id, &class_record_id, &learner_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        assessment_item, class_record, grading, learner, school, section, section_membership,
        subject, user,
    };
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

    /// School + class record (section+subject+grading period) + one
    /// assessment item (max_score 20) + an enrolled learner + a teacher
    /// user -- mirrors `repository::learner_score::tests::setup` exactly,
    /// the minimum fixture `record_learner_score_with_optional_sync`
    /// needs. Returns (school_id, item_id, learner_id, teacher_id).
    fn setup() -> (Connection, String, String, String, String) {
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
        let item = assessment_item::create(&conn, &s.id, &cr.id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let l = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        section_membership::enroll(&conn, &s.id, &sec.id, &l.id, "2026-06-08").unwrap();
        let teacher = user::create_user(&conn, "teacher.a", "password", "A Teacher").unwrap();
        (conn, s.id, item.id, l.id, teacher.id)
    }

    #[test]
    fn record_learner_score_with_no_sspk_behaves_exactly_like_a_plain_record() {
        let (conn, school_id, item_id, learner_id, teacher_id) = setup();

        let recorded = record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(18.0),
            None,
        )
        .unwrap();

        assert!(recorded.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn record_learner_score_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, item_id, learner_id, teacher_id) = setup();
        let sspk = test_sspk();

        let recorded = record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(18.0),
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::LearnerScore);
        assert_eq!(entry.change.entity_id.to_string(), recorded.id);
        assert_eq!(entry.change.actor_user_id.to_string(), teacher_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: LearnerScore = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, recorded);
    }

    #[test]
    fn re_recording_the_same_entity_enqueues_with_the_known_base_version_not_zero() {
        let (conn, school_id, item_id, learner_id, teacher_id) = setup();
        let sspk = test_sspk();

        record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(10.0),
            Some(&sspk),
        )
        .unwrap();
        let pending = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        let first_id = pending[0].change.entity_id;
        // Simulate this device's first change having already been pushed
        // and acknowledged -- advancing its known version, exactly as
        // `sync_client::push_once` does on acceptance.
        sync_outbox::acknowledge(&conn, &school_id, &pending[0].change.change_id.to_string())
            .unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &school_id,
            EntityKind::LearnerScore,
            &first_id.to_string(),
            1,
        )
        .unwrap();

        record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(19.0),
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].change.base_version, 1);
    }

    #[test]
    fn record_learner_score_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, item_id, learner_id, teacher_id) = setup();
        let sspk = test_sspk();

        record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(18.0),
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_score_never_enqueues_an_outbox_row() {
        let (conn, school_id, item_id, learner_id, teacher_id) = setup();
        let sspk = test_sspk();

        // Score above the item's max_score (20.0) -- rejected by
        // `learner_score::record` itself, returning `Ok(None)`.
        let result = record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(999.0),
            Some(&sspk),
        )
        .unwrap();

        assert!(result.is_none());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected domain write must never enqueue a sync change"
        );
    }
}
