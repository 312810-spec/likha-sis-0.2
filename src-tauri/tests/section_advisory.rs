//! Command-boundary proofs for Wave 3E's Section Advisory Foundation.
//! See `docs/adr/0056-section-advisory-foundation.md`. Standing in for
//! the real `#[tauri::command]` functions, the same pattern
//! `tests/teaching_assignment_management.rs` and `tests/subject_attendance.rs`
//! already use.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::section_advisory::{self, AssignAdviserOutcome, SectionAdvisory};
use app_lib::repository::{role, school, section, user};

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
    role::grant(conn, &teacher.id, school_id, role::TEACHER).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

fn login_as_a_school_head_at(
    conn: &rusqlite::Connection,
    school_id: &str,
    username: &str,
) -> SessionManager {
    let head = user::create_user(conn, username, "password", "A School Head").unwrap();
    user::add_school_membership(conn, &head.id, school_id).unwrap();
    role::grant(conn, &head.id, school_id, role::SCHOOL_HEAD).unwrap();
    let sessions = SessionManager::new();
    auth::login(conn, &sessions, username, "password", school_id).unwrap();
    sessions
}

/// Standing in for `commands::section_advisory::assign_section_adviser`.
fn assign_adviser_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    teacher_user_id: &str,
    starts_on: &str,
) -> app_lib::error::AppResult<AssignAdviserOutcome> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageSectionAdvisories)?;
    section_advisory::assign(conn, &school_id, section_id, teacher_user_id, starts_on)
}

/// Standing in for `commands::section_advisory::end_section_adviser`.
fn end_adviser_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    advisory_id: &str,
    ends_on: &str,
) -> app_lib::error::AppResult<section_advisory::EndAdvisoryOutcome> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageSectionAdvisories)?;
    section_advisory::end(conn, &school_id, section_id, advisory_id, ends_on)
}

/// Standing in for `commands::section_advisory::current_section_adviser`.
fn current_adviser_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    as_of_date: &str,
) -> app_lib::error::AppResult<Option<SectionAdvisory>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    section_advisory::current_adviser_for_section(conn, &school_id, section_id, as_of_date)
}

/// Standing in for `commands::section_advisory::list_adviser_view_sections`.
fn adviser_view_sections_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    as_of_date: &str,
) -> app_lib::error::AppResult<Vec<section::Section>> {
    let (user_id, school_id, can_review_all) = auth::resolve_adviser_view_scope(conn, sessions)?;
    if can_review_all {
        section::list_by_school(conn, &school_id)
    } else {
        section_advisory::list_sections_for_adviser(conn, &school_id, &user_id, as_of_date)
    }
}

struct Fixture {
    section_id: String,
    teacher_id: String,
}

fn seed(conn: &rusqlite::Connection, school_id: &str, teacher_username: &str) -> Fixture {
    let sec = section::create(conn, school_id, "2026-2027", "7", "Mabini").unwrap();
    let teacher = user::create_user(conn, teacher_username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    Fixture {
        section_id: sec.id,
        teacher_id: teacher.id,
    }
}

#[test]
fn a_school_head_can_assign_and_read_back_a_sections_adviser() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let outcome = assign_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    )
    .unwrap();
    assert!(matches!(outcome, AssignAdviserOutcome::Assigned { .. }));

    let current =
        current_adviser_as_current_session(&conn, &head_sessions, &f.section_id, "2026-08-29")
            .unwrap()
            .unwrap();
    assert_eq!(current.teacher_user_id, f.teacher_id);
}

#[test]
fn a_teacher_cannot_assign_a_section_adviser() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let result = assign_adviser_as_current_session(
        &conn,
        &teacher_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn assigning_an_adviser_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let f = seed(&conn, &school_a.id, "teacher.a");
    let no_session = SessionManager::new();

    let result = assign_adviser_as_current_session(
        &conn,
        &no_session,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_head_can_end_a_sections_adviser() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let assigned = assign_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    )
    .unwrap();
    let advisory_id = match assigned {
        AssignAdviserOutcome::Assigned { advisory } => advisory.id,
        other => panic!("expected Assigned, got {other:?}"),
    };

    let end_outcome = end_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &advisory_id,
        "2026-08-01",
    )
    .unwrap();

    assert!(matches!(
        end_outcome,
        section_advisory::EndAdvisoryOutcome::Ended { .. }
    ));
    let current =
        current_adviser_as_current_session(&conn, &head_sessions, &f.section_id, "2026-08-29")
            .unwrap();
    assert!(current.is_none());
}

#[test]
fn a_teacher_cannot_end_a_sections_adviser() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let assigned = assign_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    )
    .unwrap();
    let advisory_id = match assigned {
        AssignAdviserOutcome::Assigned { advisory } => advisory.id,
        other => panic!("expected Assigned, got {other:?}"),
    };
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = end_adviser_as_current_session(
        &conn,
        &teacher_sessions,
        &f.section_id,
        &advisory_id,
        "2026-08-01",
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

/// Reference data: any authenticated school member may read who
/// currently advises a section within their own school, not just a
/// School Head -- matching `list_teaching_assignments_by_section`'s
/// documented convention.
#[test]
fn a_teacher_can_read_a_sections_current_adviser_in_their_own_school() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    assign_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    )
    .unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let current =
        current_adviser_as_current_session(&conn, &teacher_sessions, &f.section_id, "2026-08-29")
            .unwrap();

    assert!(current.is_some());
}

#[test]
fn adviser_view_picker_returns_only_the_teachers_active_advisory_section() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let adviser_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let (adviser_id, _) = adviser_sessions.require_active_session(&conn).unwrap();
    let advisory_section =
        section::create(&conn, &school_a.id, "2026-2027", "7", "Mabini").unwrap();
    section::create(&conn, &school_a.id, "2026-2027", "7", "Rizal").unwrap();
    section_advisory::assign(
        &conn,
        &school_a.id,
        &advisory_section.id,
        &adviser_id,
        "2026-06-01",
    )
    .unwrap();

    let sections =
        adviser_view_sections_as_current_session(&conn, &adviser_sessions, "2026-08-29").unwrap();

    assert_eq!(sections.len(), 1);
    assert_eq!(sections[0].id, advisory_section.id);
}

#[test]
fn adviser_view_picker_returns_every_own_school_section_to_a_school_head() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    section::create(&conn, &school_a.id, "2026-2027", "7", "Mabini").unwrap();
    section::create(&conn, &school_a.id, "2026-2027", "7", "Rizal").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    section::create(&conn, &school_b.id, "2026-2027", "7", "Bonifacio").unwrap();

    let sections =
        adviser_view_sections_as_current_session(&conn, &head_sessions, "2026-08-29").unwrap();

    assert_eq!(sections.len(), 2);
    assert!(sections
        .iter()
        .all(|section| section.school_id == school_a.id));
}

#[test]
fn a_second_school_never_sees_the_first_schools_current_adviser() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    assign_adviser_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        &f.teacher_id,
        "2026-06-01",
    )
    .unwrap();

    let school_b = school::create(&conn, "School B").unwrap();
    let sessions_b = login_as_a_teacher_at(&conn, &school_b.id, "teacher.c");

    let current =
        current_adviser_as_current_session(&conn, &sessions_b, &f.section_id, "2026-08-29")
            .unwrap();

    assert!(current.is_none());
}
