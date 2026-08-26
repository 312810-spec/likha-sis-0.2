//! Integration proofs for the M11 grading-period foundation, standing in
//! for `commands::grading::*` directly — same pattern as
//! `tests/attendance_management.rs`.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::{grading, school, user};

const TERM_1: &str = "00000000-0000-7000-8000-000000000011";

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

/// Standing in for `commands::grading::create_grading_period`.
fn create_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    school_year: &str,
    policy_period_id: &str,
    starts_on: &str,
    ends_on: &str,
) -> app_lib::error::AppResult<Option<grading::GradingPeriod>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    grading::create(
        conn,
        &school_id,
        school_year,
        policy_period_id,
        starts_on,
        ends_on,
    )
}

/// Standing in for `commands::grading::list_grading_periods_by_school_year`.
fn list_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    school_year: &str,
) -> app_lib::error::AppResult<Vec<grading::GradingPeriod>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    grading::list_by_school_year(conn, &school_id, school_year)
}

#[test]
fn a_teacher_can_create_and_list_their_own_schools_grading_periods() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    create_as_current_session(
        &conn,
        &sessions,
        "2026-2027",
        TERM_1,
        "2026-06-08",
        "2026-09-15",
    )
    .unwrap()
    .unwrap();

    let periods = list_as_current_session(&conn, &sessions, "2026-2027").unwrap();
    assert_eq!(periods.len(), 1);
    assert_eq!(periods[0].label, "1st Term");
}

#[test]
fn a_teachers_grading_periods_never_include_another_schools() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    let sessions_b = login_as_a_teacher_at(&conn, &school_b.id, "teacher.b");
    create_as_current_session(
        &conn,
        &sessions_b,
        "2026-2027",
        TERM_1,
        "2026-06-08",
        "2026-09-15",
    )
    .unwrap();

    let school_a = school::create(&conn, "School A").unwrap();
    let sessions_a = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    let periods = list_as_current_session(&conn, &sessions_a, "2026-2027").unwrap();

    assert!(periods.is_empty());
}

#[test]
fn creating_a_grading_period_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    school::create(&conn, "School A").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = create_as_current_session(
        &conn,
        &sessions,
        "2026-2027",
        TERM_1,
        "2026-06-08",
        "2026-09-15",
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn listing_grading_periods_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    school::create(&conn, "School A").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = list_as_current_session(&conn, &sessions, "2026-2027");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_seeded_grading_policies_are_visible_reference_data() {
    let conn = open_test_db();

    let policies = grading::list_policies(&conn).unwrap();

    assert_eq!(policies.len(), 2);
    assert!(policies
        .iter()
        .any(|p| p.is_default && p.name == "DepEd Three-Term School Calendar"));
}
