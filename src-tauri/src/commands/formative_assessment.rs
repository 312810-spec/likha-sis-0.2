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
//! Sync wiring (Checkpoint 4, ADR-0082) is not yet present -- these two
//! commands still call the repository layer directly. See
//! `docs/CURRENT-HANDOFF.md`'s Batch 11 entry.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::formative_assessment::{self, FormativeAssessmentLog};

/// Records one ESRU observation for a learner under one of the caller's
/// own teaching assignments. See `repository::formative_assessment::create`
/// for validation detail -- `esru_rating` must be exactly one of the four
/// bare letters (`E`/`S`/`R`/`U`), never the gloss word.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_formative_assessment(
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
    formative_assessment::create(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &learner_id,
        &grading_period_id,
        &activity_name,
        &esru_rating,
        notes.as_deref(),
        &actor_user_id,
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::error::AppError;
    use uuid::Uuid;

    fn open_test_db() -> Connection {
        crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap()
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
}
