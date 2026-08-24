//! Integration proofs for the M12b assessment-items/scores phase,
//! standing in for `commands::assessment_item::*` and
//! `commands::learner_score::*` directly — same pattern as
//! `tests/class_record.rs`.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{
    assessment_item, class_record, grading, learner, learner_score, school, section,
    section_membership, subject, user,
};

const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

fn login_as_a_teacher_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> SessionManager {
    let teacher = user::create_user(conn, username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

/// Standing in for `commands::assessment_item::create_assessment_item`.
fn create_item_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    class_record_id: &str,
    category_id: &str,
    name: &str,
    max_score: f64,
) -> app_lib::error::AppResult<Option<assessment_item::AssessmentItem>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    assessment_item::create(conn, &school_id, class_record_id, category_id, name, max_score)
}

/// Standing in for `commands::learner_score::record_learner_score`.
#[allow(clippy::too_many_arguments)]
fn record_score_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    assessment_item_id: &str,
    learner_id: &str,
    status: learner_score::LearnerScoreStatus,
    score: Option<f64>,
) -> app_lib::error::AppResult<Option<learner_score::LearnerScore>> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    learner_score::record(conn, &school_id, assessment_item_id, learner_id, status, score, &user_id)
}

/// Builds a school with a class record and an enrolled learner, logged
/// in as a teacher at that school. Returns
/// (sessions, class_record_id, learner_id).
fn setup_school(
    conn: &rusqlite::Connection,
    school_name: &str,
    username: &str,
) -> (SessionManager, String, String) {
    let school = school::create(conn, school_name).unwrap();
    let sessions = login_as_a_teacher_at(conn, &school.id, username);
    let sec = section::create(conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let sub = subject::create(conn, &school.id, "Mathematics").unwrap();
    let period = grading::create(conn, &school.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
        .unwrap()
        .unwrap();
    let cr = class_record::create(conn, &school.id, &sec.id, &sub.id, &period.id, K10_POLICY)
        .unwrap()
        .unwrap();
    let l = learner::create(conn, &school.id, "Ana", "Cruz", None, None).unwrap();
    section_membership::enroll(conn, &school.id, &sec.id, &l.id, "2026-06-08").unwrap();
    (sessions, cr.id, l.id)
}

#[test]
fn a_teacher_can_create_an_item_and_record_a_score_for_their_own_schools_class_record() {
    let conn = open_test_db();
    let (sessions, class_record_id, learner_id) = setup_school(&conn, "School A", "teacher.a");

    let item =
        create_item_as_current_session(&conn, &sessions, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
    let score = record_score_as_current_session(
        &conn,
        &sessions,
        &item.id,
        &learner_id,
        learner_score::LearnerScoreStatus::Scored,
        Some(18.0),
    )
    .unwrap()
    .unwrap();

    assert_eq!(score.score, Some(18.0));
}

#[test]
fn a_teacher_cannot_create_an_item_using_another_schools_class_record() {
    let conn = open_test_db();
    let (_sessions_b, foreign_class_record_id, _learner_b) = setup_school(&conn, "School B", "teacher.b");
    let (sessions_a, ..) = setup_school(&conn, "School A", "teacher.a");

    let result = create_item_as_current_session(
        &conn,
        &sessions_a,
        &foreign_class_record_id,
        WRITTEN_WORKS,
        "Quiz 1",
        20.0,
    )
    .unwrap();

    assert_eq!(result, None, "cross-school class-record reference must be rejected");
}

#[test]
fn a_teacher_cannot_record_a_score_for_another_schools_item() {
    let conn = open_test_db();
    let (sessions_b, class_record_b, learner_b) = setup_school(&conn, "School B", "teacher.b");
    let item_b =
        create_item_as_current_session(&conn, &sessions_b, &class_record_b, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

    let (sessions_a, ..) = setup_school(&conn, "School A", "teacher.a");

    let result = record_score_as_current_session(
        &conn,
        &sessions_a,
        &item_b.id,
        &learner_b,
        learner_score::LearnerScoreStatus::Scored,
        Some(10.0),
    )
    .unwrap();

    assert_eq!(result, None);
}

#[test]
fn creating_an_assessment_item_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let (_sessions, class_record_id, _learner_id) = setup_school(&conn, "School A", "teacher.a");
    let sessions = SessionManager::new(); // nobody logged in

    let result =
        create_item_as_current_session(&conn, &sessions, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn recording_a_score_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let (sessions_a, class_record_id, learner_id) = setup_school(&conn, "School A", "teacher.a");
    let item = create_item_as_current_session(&conn, &sessions_a, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
        .unwrap()
        .unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = record_score_as_current_session(
        &conn,
        &sessions,
        &item.id,
        &learner_id,
        learner_score::LearnerScoreStatus::Scored,
        Some(10.0),
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_recorded_score_is_attributed_to_the_session_that_recorded_it_not_a_client_supplied_id() {
    let conn = open_test_db();
    let (sessions, class_record_id, learner_id) = setup_school(&conn, "School A", "teacher.a");
    let item =
        create_item_as_current_session(&conn, &sessions, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

    let score = record_score_as_current_session(
        &conn,
        &sessions,
        &item.id,
        &learner_id,
        learner_score::LearnerScoreStatus::Scored,
        Some(15.0),
    )
    .unwrap()
    .unwrap();

    let (expected_user_id, _) = sessions.require_active_session(&conn).unwrap();
    assert_eq!(score.recorded_by_user_id, expected_user_id);
}
