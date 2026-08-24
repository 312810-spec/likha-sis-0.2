//! Integration proofs for the M12a class-record foundation, standing in
//! for `commands::class_record::*` and `commands::subject::*` directly —
//! same pattern as `tests/grading.rs`.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{class_record, grading, school, section, subject, user};

const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
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

/// Standing in for `commands::class_record::create_class_record`.
fn create_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    subject_id: &str,
    grading_period_id: &str,
) -> app_lib::error::AppResult<Option<class_record::ClassRecord>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    class_record::create(conn, &school_id, section_id, subject_id, grading_period_id, K10_POLICY)
}

/// Standing in for `commands::class_record::list_class_records_by_school`.
fn list_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Vec<class_record::ClassRecordDetail>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    class_record::list_by_school(conn, &school_id)
}

/// Builds a school with a section and a matching grading period (both
/// SY 2026-2027) plus a subject, ready to be joined into a class record.
fn setup_school(
    conn: &rusqlite::Connection,
    school_name: &str,
    username: &str,
) -> (SessionManager, String, String, String) {
    let school = school::create(conn, school_name).unwrap();
    let sessions = login_as_a_teacher_at(conn, &school.id, username);
    let sec = section::create(conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
    let sub = subject::create(conn, &school.id, "Mathematics").unwrap();
    let period = grading::create(conn, &school.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
        .unwrap()
        .unwrap();
    (sessions, sec.id, sub.id, period.id)
}

#[test]
fn a_teacher_can_open_and_list_their_own_schools_class_record() {
    let conn = open_test_db();
    let (sessions, section_id, subject_id, period_id) = setup_school(&conn, "School A", "teacher.a");

    create_as_current_session(&conn, &sessions, &section_id, &subject_id, &period_id)
        .unwrap()
        .unwrap();

    let records = list_as_current_session(&conn, &sessions).unwrap();
    assert_eq!(records.len(), 1);
    assert_eq!(records[0].section_name, "Mabini");
    assert_eq!(records[0].subject_name, "Mathematics");
}

#[test]
fn a_teacher_cannot_open_a_class_record_using_another_schools_section() {
    let conn = open_test_db();
    let (_sessions_b, foreign_section_id, _sub_b, _period_b) =
        setup_school(&conn, "School B", "teacher.b");
    let (sessions_a, _section_a, subject_a, period_a) = setup_school(&conn, "School A", "teacher.a");

    let result =
        create_as_current_session(&conn, &sessions_a, &foreign_section_id, &subject_a, &period_a)
            .unwrap();

    assert_eq!(result, None, "cross-school section reference must be rejected");
}

#[test]
fn a_teachers_class_records_never_include_another_schools() {
    let conn = open_test_db();
    let (sessions_b, section_b, subject_b, period_b) = setup_school(&conn, "School B", "teacher.b");
    create_as_current_session(&conn, &sessions_b, &section_b, &subject_b, &period_b)
        .unwrap()
        .unwrap();

    let (sessions_a, ..) = setup_school(&conn, "School A", "teacher.a");

    let records = list_as_current_session(&conn, &sessions_a).unwrap();

    assert!(records.is_empty());
}

#[test]
fn creating_a_class_record_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let (_sessions, section_id, subject_id, period_id) = setup_school(&conn, "School A", "teacher.a");
    let sessions = SessionManager::new(); // nobody logged in

    let result = create_as_current_session(&conn, &sessions, &section_id, &subject_id, &period_id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn listing_class_records_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    school::create(&conn, "School A").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = list_as_current_session(&conn, &sessions);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}
