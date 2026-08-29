//! Command-boundary proofs for Wave 2Y's Teaching Assignments UI.
//! `create_teaching_assignment`/`remove_teaching_assignment`/
//! `list_teaching_assignments_by_section` existed since Teacher
//! Load/Class Schedule Foundation (ADR-0039) but had never been proven
//! at the command boundary -- only `repository::teaching_assignment`'s
//! own unit tests exercised them directly, bypassing
//! `auth::authorize_capability`'s gate entirely. `list_school_members`
//! is new this wave. Standing in for the real `#[tauri::command]`
//! functions, the same pattern `tests/subject_attendance.rs` and
//! `tests/learner_management.rs` already use.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::teaching_assignment::{
    self, TeachingAssignment, TeachingAssignmentDetail,
};
use app_lib::repository::user::SchoolMember;
use app_lib::repository::{role, school, section, subject, user};

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

/// Standing in for `commands::teaching_assignment::create_teaching_assignment`.
fn create_assignment_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teacher_user_id: &str,
    section_id: &str,
    subject_id: &str,
) -> app_lib::error::AppResult<Option<TeachingAssignment>> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::create(conn, &school_id, teacher_user_id, section_id, subject_id)
}

/// Standing in for `commands::teaching_assignment::remove_teaching_assignment`.
fn remove_assignment_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    id: &str,
) -> app_lib::error::AppResult<bool> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::remove(conn, &school_id, id)
}

/// Standing in for `commands::teaching_assignment::list_teaching_assignments_by_section`.
fn list_assignments_by_section_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
) -> app_lib::error::AppResult<Vec<TeachingAssignmentDetail>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    teaching_assignment::list_by_section_in_school(conn, &school_id, section_id)
}

/// Standing in for `commands::user::list_school_members`.
fn list_school_members_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
) -> app_lib::error::AppResult<Vec<SchoolMember>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    user::list_members_in_school(conn, &school_id)
}

struct Fixture {
    teacher_id: String,
    section_id: String,
    subject_id: String,
}

fn seed(conn: &rusqlite::Connection, school_id: &str, teacher_username: &str) -> Fixture {
    let teacher = user::create_user(conn, teacher_username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    let sec = section::create(conn, school_id, "2026-2027", "7", "Mabini").unwrap();
    let sub = subject::create(conn, school_id, "Mathematics").unwrap();
    Fixture {
        teacher_id: teacher.id,
        section_id: sec.id,
        subject_id: sub.id,
    }
}

#[test]
fn a_school_head_can_create_and_list_a_teaching_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let created = create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    )
    .unwrap()
    .unwrap();

    let listed =
        list_assignments_by_section_as_current_session(&conn, &head_sessions, &f.section_id)
            .unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].id, created.id);
    assert_eq!(listed[0].teacher_user_id, f.teacher_id);
}

#[test]
fn a_teacher_cannot_create_a_teaching_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let result = create_assignment_as_current_session(
        &conn,
        &teacher_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn creating_an_assignment_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let f = seed(&conn, &school_a.id, "teacher.a");
    let no_session = SessionManager::new();

    let result = create_assignment_as_current_session(
        &conn,
        &no_session,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_head_can_remove_a_teaching_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let created = create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    )
    .unwrap()
    .unwrap();

    let removed = remove_assignment_as_current_session(&conn, &head_sessions, &created.id).unwrap();

    assert!(removed);
    let listed =
        list_assignments_by_section_as_current_session(&conn, &head_sessions, &f.section_id)
            .unwrap();
    assert!(listed.is_empty());
}

#[test]
fn a_teacher_cannot_remove_a_teaching_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let created = create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    )
    .unwrap()
    .unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = remove_assignment_as_current_session(&conn, &teacher_sessions, &created.id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn creating_a_second_assignment_for_the_same_section_and_subject_is_rejected() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    )
    .unwrap()
    .unwrap();
    let other_teacher =
        user::create_user(&conn, "teacher.c", "password", "Another Teacher").unwrap();
    user::add_school_membership(&conn, &other_teacher.id, &school_a.id).unwrap();

    let result = create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &other_teacher.id,
        &f.section_id,
        &f.subject_id,
    );

    assert!(result.is_err());
}

/// Reference data: any authenticated school member may view assignments
/// for a section within their own school, not just a School Head --
/// matching `list_teaching_assignments_by_section`'s documented
/// convention.
#[test]
fn a_teacher_can_list_teaching_assignments_for_a_section_in_their_own_school() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_assignment_as_current_session(
        &conn,
        &head_sessions,
        &f.teacher_id,
        &f.section_id,
        &f.subject_id,
    )
    .unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let listed =
        list_assignments_by_section_as_current_session(&conn, &teacher_sessions, &f.section_id)
            .unwrap();

    assert_eq!(listed.len(), 1);
}

#[test]
fn list_school_members_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    seed(&conn, &school_a.id, "teacher.a");
    let no_session = SessionManager::new();

    let result = list_school_members_as_current_session(&conn, &no_session);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn list_school_members_never_includes_a_different_schools_members() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions_a = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    seed(&conn, &school_b.id, "teacher.b");

    let members = list_school_members_as_current_session(&conn, &sessions_a).unwrap();

    // Only "teacher.a" (the caller, from login_as_a_teacher_at) belongs
    // to School A -- School B's own seeded member must never appear.
    assert_eq!(members.len(), 1);
    assert_eq!(members[0].username, "teacher.a");
}
