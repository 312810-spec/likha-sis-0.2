//! Command-boundary proofs for Wave 2Z's Class Schedule UI.
//! `create_schedule_meeting`/`list_schedule_meetings_by_assignment`
//! existed since Teacher Load/Class Schedule Foundation (ADR-0039) but
//! had never been proven at the command boundary -- only
//! `repository::schedule_meeting`'s own unit tests exercised `create`
//! directly, bypassing `auth::authorize_capability`/
//! `auth::authorize_view_teacher_load`'s gates entirely.
//! `remove_schedule_meeting` is new this wave. Standing in for the
//! real `#[tauri::command]` functions, the same pattern
//! `tests/teaching_assignment_management.rs` already uses.

use std::path::Path;

use app_lib::auth::{self, Capability, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::schedule_meeting::{self, CreateMeetingOutcome, ScheduleMeeting};
use app_lib::repository::{role, school, section, subject, teaching_assignment, user};

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

/// Standing in for `commands::teaching_assignment::create_schedule_meeting`.
#[allow(clippy::too_many_arguments)]
fn create_meeting_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
    room: Option<&str>,
) -> app_lib::error::AppResult<CreateMeetingOutcome> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageTeachingAssignments)?;
    schedule_meeting::create(
        conn,
        &school_id,
        teaching_assignment_id,
        weekday,
        starts_at,
        ends_at,
        room,
    )
}

/// Standing in for `commands::teaching_assignment::remove_schedule_meeting`.
fn remove_meeting_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    id: &str,
) -> app_lib::error::AppResult<bool> {
    let school_id =
        auth::authorize_capability(conn, sessions, Capability::ManageTeachingAssignments)?;
    schedule_meeting::remove(conn, &school_id, id)
}

/// Standing in for `commands::teaching_assignment::list_schedule_meetings_by_assignment`.
fn list_meetings_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
) -> app_lib::error::AppResult<Vec<ScheduleMeeting>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    let Some(assignment) =
        teaching_assignment::find_by_id_in_school(conn, &school_id, teaching_assignment_id)?
    else {
        return Ok(Vec::new());
    };
    auth::authorize_view_teacher_load(conn, sessions, &assignment.teacher_user_id)?;
    schedule_meeting::list_by_assignment_in_school(conn, &school_id, teaching_assignment_id)
}

struct Fixture {
    assignment_id: String,
}

fn seed(conn: &rusqlite::Connection, school_id: &str, teacher_username: &str) -> Fixture {
    let teacher = user::create_user(conn, teacher_username, "password", "A Teacher").unwrap();
    user::add_school_membership(conn, &teacher.id, school_id).unwrap();
    let sec = section::create(conn, school_id, "2026-2027", "7", "Mabini").unwrap();
    let sub = subject::create(conn, school_id, "Mathematics").unwrap();
    let assignment = teaching_assignment::create(conn, school_id, &teacher.id, &sec.id, &sub.id)
        .unwrap()
        .unwrap();
    Fixture {
        assignment_id: assignment.id,
    }
}

#[test]
fn a_school_head_can_create_and_list_a_schedule_meeting() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let outcome = create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();
    assert!(matches!(outcome, CreateMeetingOutcome::Created(_)));

    let listed = list_meetings_as_current_session(&conn, &head_sessions, &f.assignment_id).unwrap();
    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].weekday, 0);
}

#[test]
fn a_teacher_cannot_create_a_schedule_meeting() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");
    let f = seed(&conn, &school_a.id, "teacher.a");

    let result = create_meeting_as_current_session(
        &conn,
        &teacher_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn creating_a_meeting_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let f = seed(&conn, &school_a.id, "teacher.a");
    let no_session = SessionManager::new();

    let result = create_meeting_as_current_session(
        &conn,
        &no_session,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn creating_a_duplicate_meeting_returns_the_typed_conflict_outcome_at_the_command_boundary() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();

    let outcome = create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();

    assert_eq!(outcome, CreateMeetingOutcome::Duplicate);
}

#[test]
fn a_school_head_can_remove_a_schedule_meeting() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let CreateMeetingOutcome::Created(meeting) = create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap() else {
        panic!("expected Created");
    };

    let removed = remove_meeting_as_current_session(&conn, &head_sessions, &meeting.id).unwrap();

    assert!(removed);
    let listed = list_meetings_as_current_session(&conn, &head_sessions, &f.assignment_id).unwrap();
    assert!(listed.is_empty());
}

#[test]
fn a_teacher_cannot_remove_a_schedule_meeting() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    let CreateMeetingOutcome::Created(meeting) = create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap() else {
        panic!("expected Created");
    };
    let teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = remove_meeting_as_current_session(&conn, &teacher_sessions, &meeting.id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_teacher_can_list_their_own_schedule() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();
    let teacher_sessions = SessionManager::new();
    auth::login(
        &conn,
        &teacher_sessions,
        "teacher.a",
        "password",
        &school_a.id,
    )
    .unwrap();

    let listed =
        list_meetings_as_current_session(&conn, &teacher_sessions, &f.assignment_id).unwrap();

    assert_eq!(listed.len(), 1);
}

#[test]
fn a_teacher_cannot_list_a_colleagues_schedule() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();
    let other_teacher_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = list_meetings_as_current_session(&conn, &other_teacher_sessions, &f.assignment_id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_head_can_list_any_teachers_schedule() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");
    let f = seed(&conn, &school_a.id, "teacher.a");
    create_meeting_as_current_session(
        &conn,
        &head_sessions,
        &f.assignment_id,
        0,
        "08:00",
        "08:50",
        None,
    )
    .unwrap();

    let listed = list_meetings_as_current_session(&conn, &head_sessions, &f.assignment_id).unwrap();

    assert_eq!(listed.len(), 1);
    assert_eq!(listed[0].teaching_assignment_id, f.assignment_id);
}
