//! Tauri commands for Formative Assessment (ESRU) logging (ADR-0082).
//! `school_id` is always derived from the authenticated session, never a
//! client-supplied argument, per
//! `docs/adr/0004-authentication-and-local-session.md`. Both commands gate
//! on `formative_assessment::authorize_own_assignment` -- the caller must
//! be exactly the teacher on `teaching_assignment_id`, the same
//! "Teacher-owns-this-assignment" shape `subject_attendance` already
//! established (see that module's own doc comment, and
//! `repository::formative_assessment`'s doc comment for why this feature
//! follows that shape rather than a school-wide `Capability`).
//!
//! **Only a per-assignment list command is exposed here** (not a
//! cross-subject "every ESRU log for this learner" command, even though
//! `repository::formative_assessment::list_for_learner` exists and is
//! tested) -- a cross-subject view would need its own authorization
//! rule (who may see a learner's ESRU logs across subjects they don't
//! teach?), which is a genuinely different question from "may this
//! teacher log/view ESRU for their own class," and is deliberately out of
//! scope for this slice.
//!
//! ADR-0067/0069 sync wiring: the exact same enrollment-gated
//! encrypt-on-enqueue pattern as `commands::transfer_record::record_transfer`.
//! Create-only for this first slice -- there is no edit/amend path yet
//! (see ADR-0082's deferred-scope note), so only `record_formative_assessment`
//! is wired.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::formative_assessment::{self, FormativeAssessmentLog};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Records one ESRU observation for a learner under one of the caller's
/// own teaching assignments. See `repository::formative_assessment::create`
/// for validation detail -- `esru_rating` must be exactly one of the four
/// bare letters (`E`/`S`/`R`/`U`), never the gloss word.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_formative_assessment(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    learner_id: String,
    grading_period_id: String,
    activity_name: String,
    esru_rating: String,
    notes: Option<String>,
) -> AppResult<FormativeAssessmentLog> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    formative_assessment::authorize_own_assignment(
        &conn,
        &actor_user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &teaching_assignment_id,
        &learner_id,
        &grading_period_id,
        &activity_name,
        &esru_rating,
        notes.as_deref(),
        sspk.as_ref(),
    )
}

/// Every ESRU log recorded under one of the caller's own teaching
/// assignments, most recent first.
#[tauri::command]
pub fn list_formative_assessment_logs_for_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<FormativeAssessmentLog>> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    formative_assessment::authorize_own_assignment(
        &conn,
        &actor_user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    formative_assessment::list_for_assignment(&conn, &school_id, &teaching_assignment_id)
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::transfer_record::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `record_formative_assessment`, kept separate so it
/// can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as `commands::transfer_record`'s
/// equivalent. `sspk` is `None` when this school has never enrolled a
/// device: behaves exactly as it did before ADR-0067 existed, no
/// `SAVEPOINT`, no outbox row. When `Some`, the insert and the outbox
/// enqueue are atomic together in one `SAVEPOINT` -- a rejected create
/// (unknown assignment/learner/grading period, invalid rating, empty
/// activity name) never enqueues an outbox row.
#[allow(clippy::too_many_arguments)]
fn record_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    teaching_assignment_id: &str,
    learner_id: &str,
    grading_period_id: &str,
    activity_name: &str,
    esru_rating: &str,
    notes: Option<&str>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<FormativeAssessmentLog> {
    let Some(sspk) = sspk else {
        return formative_assessment::create(
            conn,
            school_id,
            teaching_assignment_id,
            learner_id,
            grading_period_id,
            activity_name,
            esru_rating,
            notes,
            actor_user_id,
        );
    };

    conn.execute_batch("SAVEPOINT record_formative_assessment_with_sync")?;
    let outcome = (|| -> AppResult<FormativeAssessmentLog> {
        let created = formative_assessment::create(
            conn,
            school_id,
            teaching_assignment_id,
            learner_id,
            grading_period_id,
            activity_name,
            esru_rating,
            notes,
            actor_user_id,
        )?;
        enqueue_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE record_formative_assessment_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_formative_assessment_with_sync; \
                 RELEASE record_formative_assessment_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a newly-created formative
/// assessment log, carrying the full current row. `base_version` always
/// comes from `sync_version_cache::known_version`, matching every other
/// entity's own shape.
fn enqueue_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    log: &FormativeAssessmentLog,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = crate::repository::sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::FormativeAssessmentLog,
        &log.id,
    )?;
    let plaintext = serde_json::to_vec(log)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::FormativeAssessmentLog,
        entity_id: parse_sync_uuid(&log.id, "formative assessment log id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::transfer_record::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::payload_key::PAYLOAD_KEY_LEN;
    use crate::error::AppError;

    fn open_test_db() -> Connection {
        db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [7u8; PAYLOAD_KEY_LEN]
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        assignment_id: String,
        learner_id: String,
        grading_period_id: String,
    }

    /// Seeds a school, teacher, section, subject, teaching assignment,
    /// learner, and grading period.
    fn seed(conn: &Connection) -> Fixture {
        let school = crate::repository::school::create(conn, "Test School").unwrap();
        let teacher = crate::repository::user::create_user(
            conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        crate::repository::user::add_school_membership(conn, &teacher.id, &school.id).unwrap();
        let section =
            crate::repository::section::create(conn, &school.id, "2026-2027", "7", "Mabini")
                .unwrap();
        let subject = crate::repository::subject::create(conn, &school.id, "Mathematics").unwrap();
        let assignment = crate::repository::teaching_assignment::create(
            conn,
            &school.id,
            &teacher.id,
            &section.id,
            &subject.id,
        )
        .unwrap()
        .unwrap();
        let learner =
            crate::repository::learner::create(conn, &school.id, "Ana", "Cruz", None, None)
                .unwrap();
        let policy_period_id: String = conn
            .query_row("SELECT id FROM grading_policy_periods LIMIT 1", [], |row| {
                row.get(0)
            })
            .unwrap();
        let grading_period_id = Uuid::now_v7().to_string();
        conn.execute(
            "INSERT INTO grading_periods \
                (id, school_id, school_year, policy_period_id, starts_on, ends_on) \
             VALUES (?1, ?2, '2026-2027', ?3, '2026-06-01', '2026-08-31')",
            (&grading_period_id, &school.id, &policy_period_id),
        )
        .unwrap();

        Fixture {
            school_id: school.id,
            teacher_id: teacher.id,
            assignment_id: assignment.id,
            learner_id: learner.id,
            grading_period_id,
        }
    }

    fn record(
        conn: &Connection,
        f: &Fixture,
        sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
    ) -> AppResult<FormativeAssessmentLog> {
        record_with_optional_sync(
            conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            None,
            sspk,
        )
    }

    #[test]
    fn authorize_own_assignment_allows_the_assignments_own_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = formative_assessment::authorize_own_assignment(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &f.assignment_id,
        );

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_own_assignment_denies_a_different_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = crate::repository::user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        crate::repository::user::add_school_membership(&conn, &other_teacher.id, &f.school_id)
            .unwrap();

        let result = formative_assessment::authorize_own_assignment(
            &conn,
            &other_teacher.id,
            &f.school_id,
            &f.assignment_id,
        );

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn create_via_repository_and_list_for_assignment_round_trip() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = formative_assessment::create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "E",
            Some("Great participation"),
            &f.teacher_id,
        )
        .unwrap();

        let logs = formative_assessment::list_for_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap();
        assert_eq!(logs.len(), 1);
        assert_eq!(logs[0].id, created.id);
        assert_eq!(logs[0].esru_rating, "E");
    }

    #[test]
    fn create_rejects_the_full_gloss_word_as_a_rating() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = formative_assessment::create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "Exploration",
            None,
            &f.teacher_id,
        );

        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn with_no_sspk_behaves_exactly_like_a_plain_record() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = record(&conn, &f, None).unwrap();
        assert_eq!(created.esru_rating, "E");

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 0, "no sspk means no outbox row");
    }

    #[test]
    fn with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = record(&conn, &f, Some(&sspk)).unwrap();

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 1);

        let (kind, entity_id): (String, String) = conn
            .query_row("SELECT entity_kind, entity_id FROM sync_outbox", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(kind, "formative_assessment_log");
        assert_eq!(entity_id, created.id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let result = record_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            &f.learner_id,
            &f.grading_period_id,
            "Quiz 1",
            "Exploration", // the full gloss word must be rejected, not just the letter
            None,
            Some(&sspk),
        );
        assert!(result.is_err());

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 0);
    }
}
