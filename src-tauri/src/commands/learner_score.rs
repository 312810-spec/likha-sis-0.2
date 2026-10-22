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
    self, LearnerScore, LearnerScoreCorrection, LearnerScoreRosterEntry, LearnerScoreStatus,
};
use crate::repository::{
    device_credential, device_identity, entity_sync_status, sync_outbox, sync_version_cache,
};
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
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    require_score_item_access(&conn, &school_id, &user_id, &assessment_item_id)?;
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
/// CTOS M01: `correction_reason` is required only when this call *replaces*
/// an existing score. `learner_score::record` rejects a real correction that
/// omits it and ignores it for a first-time recording.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_learner_score(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
    learner_id: String,
    status: LearnerScoreStatus,
    score: Option<f64>,
    correction_reason: Option<String>,
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
        correction_reason.as_deref(),
        sspk.as_ref(),
    )
}

/// Returns conservative sync evidence for one persisted Class Record score.
/// The score id is never accepted from the client: it is resolved only after
/// the session user is revalidated as owner of the matching teaching
/// assignment and that assignment matches the assessment item's class record.
#[tauri::command]
pub fn get_learner_score_sync_status(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    assessment_item_id: String,
    learner_id: String,
) -> AppResult<Option<entity_sync_status::EntitySyncState>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    let Some(score_id) = learner_score::score_entity_id_for_owned_assignment(
        &conn,
        &school_id,
        &user_id,
        &teaching_assignment_id,
        &assessment_item_id,
        &learner_id,
    )?
    else {
        return Ok(None);
    };

    entity_sync_status::status_for_entity(&conn, &school_id, EntityKind::LearnerScore, &score_id)
        .map(Some)
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

/// Reuse the existing trusted assessment-item authority: current assignment
/// ownership (or the established school-head role), never UI navigation state.
fn require_score_item_access(
    conn: &Connection,
    school_id: &str,
    user_id: &str,
    assessment_item_id: &str,
) -> AppResult<()> {
    if !crate::auth::data_scope::can_resolve_entity(
        conn,
        user_id,
        school_id,
        EntityKind::AssessmentItem,
        assessment_item_id,
    )? {
        return Err(AppError::Unauthorized);
    }
    Ok(())
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
    correction_reason: Option<&str>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<LearnerScore>> {
    require_score_item_access(conn, school_id, recorded_by_user_id, assessment_item_id)?;
    let Some(sspk) = sspk else {
        return learner_score::record(
            conn,
            school_id,
            assessment_item_id,
            learner_id,
            status,
            score,
            recorded_by_user_id,
            correction_reason,
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
            correction_reason,
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
    compute_term_grade_for_session(&conn, &sessions, &class_record_id, &learner_id)
}

// Command seam: session validation and grade read stay together in native tests.
fn compute_term_grade_for_session(
    conn: &Connection,
    sessions: &SessionManager,
    class_record_id: &str,
    learner_id: &str,
) -> AppResult<Option<ComputedTermGrade>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    grading_computation::compute_term_grade(conn, &school_id, class_record_id, learner_id)
}

/// CTOS M01: the correction lineage for one learner's score on one
/// assessment item, newest first. `school_id` comes only from the session;
/// the ids are client-supplied the same legitimate way they are above, and
/// `correction_history` scopes every row to the caller's school so a
/// cross-school id yields an empty list, not another school's history.
#[tauri::command]
pub fn learner_score_correction_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
    learner_id: String,
) -> AppResult<Vec<LearnerScoreCorrection>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    require_score_item_access(&conn, &school_id, &user_id, &assessment_item_id)?;
    learner_score::correction_history(&conn, &school_id, &assessment_item_id, &learner_id)
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
        setup_with_connection(open_test_db())
    }

    fn setup_with_connection(conn: Connection) -> (Connection, String, String, String, String) {
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
        user::add_school_membership(&conn, &teacher.id, &s.id).unwrap();
        crate::repository::teaching_assignment::create(&conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        (conn, s.id, item.id, l.id, teacher.id)
    }

    fn grade_session(conn: &Connection, school: &str, actor: &str) -> SessionManager {
        let sessions = SessionManager::new();
        let id = crate::repository::session::insert(conn, actor, school, "+8 hours").unwrap();
        let now = std::time::SystemTime::now();
        sessions.set(crate::auth::Session {
            id,
            user_id: actor.to_owned(),
            school_id: school.to_owned(),
            created_at: now,
            expires_at: now + crate::auth::SESSION_DURATION,
            last_activity_at: now,
        });
        sessions
    }

    fn grade_fixture() -> (Connection, String, String, String, String) {
        let (conn, school, item, learner, teacher) = setup();
        let record = assessment_item::find_by_id_in_school(&conn, &school, &item)
            .unwrap()
            .unwrap()
            .class_record_id;
        let categories = {
            let mut stmt = conn
                .prepare(
                    "SELECT wc.category_id FROM grading_weight_components wc \
                     WHERE wc.policy_id = ?1 AND NOT EXISTS(SELECT 1 FROM assessment_categories c \
                     WHERE c.parent_category_id = wc.category_id)",
                )
                .unwrap();
            let categories = stmt
                .query_map([K10_POLICY], |row| row.get::<_, String>(0))
                .unwrap()
                .collect::<Result<Vec<_>, _>>()
                .unwrap();
            categories
        };
        for category in categories {
            let id = if category == WRITTEN_WORKS {
                item.clone()
            } else {
                assessment_item::create(&conn, &school, &record, &category, "Synthetic grade", 20.0)
                    .unwrap()
                    .unwrap()
                    .id
            };
            learner_score::record(
                &conn,
                &school,
                &id,
                &learner,
                LearnerScoreStatus::Scored,
                Some(0.0),
                &teacher,
                None,
            )
            .unwrap()
            .unwrap();
        }
        let grade = grading_computation::compute_term_grade(&conn, &school, &record, &learner)
            .unwrap()
            .expect("positive control must have a real computable zero grade");
        assert_eq!(grade.initial_grade, 0.0);
        assert!(grade.complete);
        (conn, school, record, learner, teacher)
    }

    fn grade_data_counts(conn: &Connection) -> (i64, i64, i64) {
        conn.query_row(
            "SELECT (SELECT COUNT(*) FROM learner_scores), \
             (SELECT COUNT(*) FROM learner_score_corrections), (SELECT COUNT(*) FROM sync_outbox)",
            [],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .unwrap()
    }

    #[test]
    fn grade_read_rejects_unassigned_same_school_teacher() {
        let (conn, school, record, learner, _) = grade_fixture();
        let outsider =
            user::create_user(&conn, "grade.outsider", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &outsider.id, &school).unwrap();
        let sessions = grade_session(&conn, &school, &outsider.id);
        let before = grade_data_counts(&conn);
        let result = compute_term_grade_for_session(&conn, &sessions, &record, &learner);
        assert!(
            matches!(result, Err(AppError::Unauthorized)),
            "unexpected grade read: {result:?}"
        );
        assert_eq!(grade_data_counts(&conn), before);
    }

    #[test]
    fn grade_read_rechecks_assignment_replacement_for_existing_session() {
        let (conn, school, record, learner, teacher) = grade_fixture();
        let sessions = grade_session(&conn, &school, &teacher);
        assert!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner)
                .unwrap()
                .is_some()
        );
        let replacement =
            user::create_user(&conn, "grade.replacement", "password", "Replacement").unwrap();
        user::add_school_membership(&conn, &replacement.id, &school).unwrap();
        conn.execute(
            "UPDATE teaching_assignments SET teacher_user_id = ?1 WHERE school_id = ?2",
            (&replacement.id, &school),
        )
        .unwrap();
        assert!(matches!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner),
            Err(AppError::Unauthorized)
        ));
        let current = grade_session(&conn, &school, &replacement.id);
        assert!(
            compute_term_grade_for_session(&conn, &current, &record, &learner)
                .unwrap()
                .is_some()
        );
    }

    #[test]
    fn grade_read_rechecks_school_head_role_revocation() {
        let (conn, school, record, learner, _) = grade_fixture();
        let head =
            user::create_user(&conn, "grade.head", "password", "Synthetic School Head").unwrap();
        user::add_school_membership(&conn, &head.id, &school).unwrap();
        crate::repository::role::grant(
            &conn,
            &head.id,
            &school,
            crate::repository::role::SCHOOL_HEAD,
        )
        .unwrap();
        let sessions = grade_session(&conn, &school, &head.id);
        assert!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner)
                .unwrap()
                .is_some()
        );
        crate::repository::role::revoke(
            &conn,
            &head.id,
            &school,
            crate::repository::role::SCHOOL_HEAD,
        )
        .unwrap();
        assert!(matches!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn grade_read_preserves_zero_and_missing_without_writing() {
        let (conn, school, record, learner, teacher) = grade_fixture();
        let sessions = grade_session(&conn, &school, &teacher);
        let expected =
            grading_computation::compute_term_grade(&conn, &school, &record, &learner).unwrap();
        let before = grade_data_counts(&conn);
        assert_eq!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner).unwrap(),
            expected
        );
        let missing = learner::create(&conn, &school, "No", "Evidence", None, None).unwrap();
        assert!(
            compute_term_grade_for_session(&conn, &sessions, &record, &missing.id)
                .unwrap()
                .is_none()
        );
        assert_eq!(grade_data_counts(&conn), before);
    }

    #[test]
    fn grade_read_keeps_foreign_unknown_record_and_revoked_session_closed() {
        let (conn, school, record, learner, teacher) = grade_fixture();
        let sessions = grade_session(&conn, &school, &teacher);
        assert!(
            compute_term_grade_for_session(&conn, &sessions, "unknown", &learner)
                .unwrap()
                .is_none()
        );
        let other = school::create(&conn, "Synthetic Other School").unwrap();
        user::add_school_membership(&conn, &teacher, &other.id).unwrap();
        let foreign = grade_session(&conn, &other.id, &teacher);
        assert!(
            compute_term_grade_for_session(&conn, &foreign, &record, &learner)
                .unwrap()
                .is_none()
        );
        crate::repository::session::revoke(&conn, &sessions.current().unwrap().id).unwrap();
        assert!(matches!(
            compute_term_grade_for_session(&conn, &sessions, &record, &learner),
            Err(AppError::Unauthorized)
        ));
        assert!(matches!(
            compute_term_grade_for_session(&conn, &SessionManager::new(), &record, &learner),
            Err(AppError::Unauthorized)
        ));
    }

    #[test]
    fn command_rejects_unassigned_same_school_teacher_without_writing() {
        let (conn, school, item, learner, _) = setup();
        let outsider =
            user::create_user(&conn, "other.teacher", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &outsider.id, &school).unwrap();
        for sspk in [None, Some(test_sspk())] {
            let result = record_learner_score_with_optional_sync(
                &conn,
                &school,
                &outsider.id,
                &item,
                &learner,
                LearnerScoreStatus::Scored,
                Some(18.0),
                None,
                sspk.as_ref(),
            );
            assert!(matches!(result, Err(AppError::Unauthorized)));
        }
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM learner_scores", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
        assert!(sync_outbox::pending_for_school(&conn, &school, 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn command_local_correction_failure_rolls_back_history() {
        let (conn, school, item, learner, teacher) = setup();
        record_learner_score_with_optional_sync(
            &conn,
            &school,
            &teacher,
            &item,
            &learner,
            LearnerScoreStatus::Scored,
            Some(18.0),
            None,
            None,
        )
        .unwrap()
        .unwrap();
        conn.execute_batch("CREATE TEMP TRIGGER reject_score_update BEFORE UPDATE ON learner_scores BEGIN SELECT RAISE(ABORT, 'synthetic interrupted update'); END;").unwrap();
        let result = record_learner_score_with_optional_sync(
            &conn,
            &school,
            &teacher,
            &item,
            &learner,
            LearnerScoreStatus::Scored,
            Some(19.0),
            Some("Synthetic correction"),
            None,
        );
        assert!(result.is_err());
        assert!(
            learner_score::correction_history(&conn, &school, &item, &learner)
                .unwrap()
                .is_empty()
        );
        let roster = learner_score::roster_for_item(&conn, &school, &item)
            .unwrap()
            .unwrap();
        assert_eq!(roster[0].score, Some(18.0));
    }

    #[test]
    fn score_item_access_is_revoked_after_assignment_replacement() {
        let (conn, school, item, learner, teacher) = setup();
        let replacement =
            user::create_user(&conn, "replacement", "password", "Replacement Teacher").unwrap();
        user::add_school_membership(&conn, &replacement.id, &school).unwrap();
        assert!(require_score_item_access(&conn, &school, &teacher, &item).is_ok());
        conn.execute(
            "UPDATE teaching_assignments SET teacher_user_id = ?1 WHERE school_id = ?2",
            (&replacement.id, &school),
        )
        .unwrap();
        assert!(matches!(
            require_score_item_access(&conn, &school, &teacher, &item),
            Err(AppError::Unauthorized)
        ));
        assert!(require_score_item_access(&conn, &school, &replacement.id, &item).is_ok());
        let result = record_learner_score_with_optional_sync(
            &conn,
            &school,
            &teacher,
            &item,
            &learner,
            LearnerScoreStatus::Scored,
            Some(18.0),
            None,
            None,
        );
        assert!(matches!(result, Err(AppError::Unauthorized)));
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM learner_scores", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn command_score_and_encrypted_outbox_survive_database_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("command-score-recovery.db");
        let key = crate::crypto::generate_key();
        let (conn, school_id, item_id, learner_id, teacher_id) =
            setup_with_connection(crate::db::open(&path, &key).unwrap());
        let sspk = test_sspk();
        let recorded = record_learner_score_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(18.0),
            None,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();
        let queued_before = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued_before.len(), 1);
        let device_id = device_identity::current_or_create(&conn).unwrap();
        conn.close().unwrap();

        // Exercise the command's shared save logic, not the Tauri session/key
        // ceremony, OS process recovery or a real hub acknowledgment.
        let conn = crate::db::open(&path, &key).unwrap();
        let roster = learner_score::roster_for_item(&conn, &school_id, &item_id)
            .unwrap()
            .unwrap();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].learner_id, learner_id);
        assert_eq!(roster[0].score, Some(18.0));
        assert_eq!(roster[0].status, Some(LearnerScoreStatus::Scored));
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued, queued_before);
        let change = &queued[0].change;
        assert_eq!(change.entity_id.to_string(), recorded.id);
        assert_eq!(change.entity_kind, EntityKind::LearnerScore);
        assert_eq!(change.actor_user_id.to_string(), teacher_id);
        assert_eq!(change.device_id.to_string(), device_id);
        assert_eq!(
            device_identity::current_or_create(&conn).unwrap(),
            device_id
        );
        let plaintext = payload_key::decrypt_payload(&sspk, &change.encrypted_payload).unwrap();
        let recovered: LearnerScore = serde_json::from_slice(&plaintext).unwrap();
        assert_eq!(recovered, recorded);
        assert_eq!(
            entity_sync_status::status_for_entity(
                &conn,
                &school_id,
                EntityKind::LearnerScore,
                &recorded.id,
            )
            .unwrap(),
            entity_sync_status::EntitySyncState::WaitingToSync
        );
    }

    #[test]
    fn failed_command_enqueue_preserves_prior_score_and_queue_after_reopen() {
        // Cover both a first score and a correction to an existing score.
        for has_prior_score in [false, true] {
            let dir = tempfile::tempdir().unwrap();
            let path = dir.path().join("command-score-rollback.db");
            let key = crate::crypto::generate_key();
            let (conn, school_id, item_id, learner_id, teacher_id) =
                setup_with_connection(crate::db::open(&path, &key).unwrap());
            let sspk = test_sspk();
            if has_prior_score {
                record_learner_score_with_optional_sync(
                    &conn,
                    &school_id,
                    &teacher_id,
                    &item_id,
                    &learner_id,
                    LearnerScoreStatus::Scored,
                    Some(10.0),
                    None,
                    Some(&sspk),
                )
                .unwrap()
                .unwrap();
            }
            let roster_before =
                learner_score::roster_for_item(&conn, &school_id, &item_id).unwrap();
            let queue_before = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
            assert_eq!(queue_before.len(), usize::from(has_prior_score));
            // Fail only at enqueue, after the domain write has succeeded.
            // A TEMP trigger is scoped to this connection, not the reopened DB.
            conn.execute_batch(
                "CREATE TEMP TRIGGER reject_score_enqueue BEFORE INSERT ON sync_outbox
                 BEGIN SELECT RAISE(ABORT, 'synthetic enqueue failure'); END;",
            )
            .unwrap();
            let error = record_learner_score_with_optional_sync(
                &conn,
                &school_id,
                &teacher_id,
                &item_id,
                &learner_id,
                LearnerScoreStatus::Scored,
                Some(19.0),
                Some("synthetic correction reason for the enqueue-failure fixture"),
                Some(&sspk),
            )
            .unwrap_err();
            assert!(error.to_string().contains("synthetic enqueue failure"));
            assert!(
                conn.is_autocommit(),
                "failed save must release its savepoint"
            );
            conn.close().unwrap();

            let conn = crate::db::open(&path, &key).unwrap();
            assert_eq!(
                learner_score::roster_for_item(&conn, &school_id, &item_id).unwrap(),
                roster_before
            );
            assert_eq!(
                sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap(),
                queue_before
            );
            // Recovery remains writable; retry creates exactly one new change.
            record_learner_score_with_optional_sync(
                &conn,
                &school_id,
                &teacher_id,
                &item_id,
                &learner_id,
                LearnerScoreStatus::Scored,
                Some(19.0),
                Some("recount after reopen"),
                Some(&sspk),
            )
            .unwrap()
            .unwrap();
            let roster = learner_score::roster_for_item(&conn, &school_id, &item_id)
                .unwrap()
                .unwrap();
            assert_eq!(roster[0].score, Some(19.0));
            assert_eq!(
                sync_outbox::pending_for_school(&conn, &school_id, 10)
                    .unwrap()
                    .len(),
                queue_before.len() + 1
            );
        }
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
            None,
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
            None,
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
            Some("recount after reopen"),
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
            None,
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
            None,
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
