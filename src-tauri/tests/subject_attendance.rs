//! Command-boundary proofs for Wave 2V's Subject Attendance Foundation
//! (`docs/product/SUBJECT-ATTENDANCE-SPEC.md`). Standing in for
//! `commands::subject_attendance::*` directly, the same pattern
//! `tests/learner_management.rs`/`tests/enrollment.rs` already use.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::subject_attendance::{
    self, AdviserAssignmentMonitor, EntryStatus, RecordEntryOutcome, SubjectAttendanceMonitor,
    SubjectAttendanceRosterRow, SubjectAttendanceSession,
};
use app_lib::repository::{
    learner, role, school, section, section_advisory, section_membership, subject,
    teaching_assignment, user,
};

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

/// Standing in for `commands::subject_attendance::open_subject_attendance_session`.
fn open_session_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
    session_date: &str,
) -> app_lib::error::AppResult<Option<SubjectAttendanceSession>> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    subject_attendance::authorize_own_assignment(
        conn,
        &user_id,
        &school_id,
        teaching_assignment_id,
    )?;
    subject_attendance::open_or_get_session(
        conn,
        &school_id,
        teaching_assignment_id,
        session_date,
        &user_id,
    )
}

/// Standing in for `commands::subject_attendance::record_subject_attendance_entry`.
fn record_entry_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
    session_id: &str,
    membership_id: &str,
    status: EntryStatus,
) -> app_lib::error::AppResult<RecordEntryOutcome> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    subject_attendance::authorize_own_assignment(
        conn,
        &user_id,
        &school_id,
        teaching_assignment_id,
    )?;
    subject_attendance::record_entry(
        conn,
        &school_id,
        session_id,
        membership_id,
        status,
        None,
        &user_id,
    )
}

/// Standing in for `commands::subject_attendance::mark_subject_attendance_all_present`.
fn mark_all_present_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
    session_id: &str,
) -> app_lib::error::AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    subject_attendance::authorize_own_assignment(
        conn,
        &user_id,
        &school_id,
        teaching_assignment_id,
    )?;
    subject_attendance::mark_all_present(conn, &school_id, session_id, &user_id)
}

/// Standing in for `commands::subject_attendance::list_subject_attendance_sessions`.
fn list_sessions_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
) -> app_lib::error::AppResult<Vec<SubjectAttendanceSession>> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    subject_attendance::authorize_own_assignment(
        conn,
        &user_id,
        &school_id,
        teaching_assignment_id,
    )?;
    subject_attendance::list_sessions_for_assignment(conn, &school_id, teaching_assignment_id)
}

/// Standing in for `commands::subject_attendance::subject_attendance_monitor`.
fn monitor_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    teaching_assignment_id: &str,
    as_of_date: &str,
) -> app_lib::error::AppResult<Option<SubjectAttendanceMonitor>> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    subject_attendance::authorize_own_assignment(
        conn,
        &user_id,
        &school_id,
        teaching_assignment_id,
    )?;
    subject_attendance::monitor_for_assignment(conn, &school_id, teaching_assignment_id, as_of_date)
}

/// Standing in for `commands::subject_attendance::adviser_section_monitor`.
fn adviser_section_monitor_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    as_of_date: &str,
) -> app_lib::error::AppResult<Vec<AdviserAssignmentMonitor>> {
    let (_user_id, school_id) =
        auth::authorize_adviser_of_section(conn, sessions, section_id, as_of_date)?;
    subject_attendance::adviser_monitor_for_section(conn, &school_id, section_id, as_of_date)
}

struct Fixture {
    section_id: String,
    assignment_id: String,
    membership_id: String,
}

fn seed(conn: &rusqlite::Connection, sessions: &SessionManager) -> Fixture {
    let (teacher_id, school_id) = sessions.require_active_session(conn).unwrap();
    let sec = section::create(conn, &school_id, "2026-2027", "7", "Mabini").unwrap();
    let sub = subject::create(conn, &school_id, "Mathematics").unwrap();
    let assignment = teaching_assignment::create(conn, &school_id, &teacher_id, &sec.id, &sub.id)
        .unwrap()
        .unwrap();
    let l = learner::create(conn, &school_id, "Ana", "Cruz", None, None).unwrap();
    let membership = section_membership::enroll(conn, &school_id, &sec.id, &l.id, "2026-06-01")
        .unwrap()
        .unwrap();

    Fixture {
        section_id: sec.id,
        assignment_id: assignment.id,
        membership_id: membership.id,
    }
}

#[test]
fn a_teacher_can_open_a_session_for_their_own_assignment_and_mark_attendance() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions);

    let session = open_session_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();
    let outcome = record_entry_as_current_session(
        &conn,
        &sessions,
        &f.assignment_id,
        &session.id,
        &f.membership_id,
        EntryStatus::Present,
    )
    .unwrap();

    assert!(matches!(outcome, RecordEntryOutcome::Recorded { .. }));
}

#[test]
fn a_teacher_cannot_open_a_session_for_an_assignment_they_do_not_own() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let other_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result =
        open_session_as_current_session(&conn, &other_sessions, &f.assignment_id, "2026-08-29");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn opening_a_session_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions);
    let no_session = SessionManager::new();

    let result =
        open_session_as_current_session(&conn, &no_session, &f.assignment_id, "2026-08-29");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_teacher_cannot_record_attendance_against_a_different_teachers_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let session =
        open_session_as_current_session(&conn, &owner_sessions, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();
    let other_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = record_entry_as_current_session(
        &conn,
        &other_sessions,
        &f.assignment_id,
        &session.id,
        &f.membership_id,
        EntryStatus::Present,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn mark_all_present_never_overwrites_an_existing_mark_at_the_command_boundary() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions);
    let session = open_session_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();
    record_entry_as_current_session(
        &conn,
        &sessions,
        &f.assignment_id,
        &session.id,
        &f.membership_id,
        EntryStatus::Absent,
    )
    .unwrap();

    let roster =
        mark_all_present_as_current_session(&conn, &sessions, &f.assignment_id, &session.id)
            .unwrap()
            .unwrap();

    let row = roster
        .iter()
        .find(|r| r.membership_id == f.membership_id)
        .unwrap();
    assert_eq!(row.entry_status, Some(EntryStatus::Absent));
}

#[test]
fn a_second_school_never_sees_the_first_schools_sessions() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions_a = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions_a);
    open_session_as_current_session(&conn, &sessions_a, &f.assignment_id, "2026-08-29").unwrap();

    let school_b = school::create(&conn, "School B").unwrap();
    let sessions_b = login_as_a_teacher_at(&conn, &school_b.id, "teacher.c");

    // A teacher at School B can never even pass authorization for an
    // assignment id that belongs to School A -- there is no session to
    // list, list_sessions_as_current_session itself fails closed.
    let result = list_sessions_as_current_session(&conn, &sessions_b, &f.assignment_id);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn re_opening_a_session_that_already_exists_returns_the_same_session_not_a_duplicate() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions);

    let first = open_session_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();
    let second = open_session_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();

    assert_eq!(first.id, second.id);
    let all = list_sessions_as_current_session(&conn, &sessions, &f.assignment_id).unwrap();
    assert_eq!(all.len(), 1);
}

#[test]
fn a_teacher_can_view_the_monitor_for_their_own_assignment() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &sessions);
    let session = open_session_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();
    record_entry_as_current_session(
        &conn,
        &sessions,
        &f.assignment_id,
        &session.id,
        &f.membership_id,
        EntryStatus::Absent,
    )
    .unwrap();

    let monitor = monitor_as_current_session(&conn, &sessions, &f.assignment_id, "2026-08-29")
        .unwrap()
        .unwrap();

    assert_eq!(monitor.held_session_count, 1);
    assert_eq!(monitor.rows.len(), 1);
    assert_eq!(monitor.rows[0].membership_id, f.membership_id);
    assert_eq!(monitor.rows[0].absent_count, 1);
    assert_eq!(monitor.rows[0].current_consecutive_absences, 1);
}

#[test]
fn a_teacher_cannot_view_the_monitor_for_an_assignment_they_do_not_own() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let other_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = monitor_as_current_session(&conn, &other_sessions, &f.assignment_id, "2026-08-29");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_sections_adviser_can_view_the_adviser_monitor_for_that_section() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let session =
        open_session_as_current_session(&conn, &owner_sessions, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();
    record_entry_as_current_session(
        &conn,
        &owner_sessions,
        &f.assignment_id,
        &session.id,
        &f.membership_id,
        EntryStatus::Absent,
    )
    .unwrap();
    let adviser_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.adviser");
    let (adviser_id, _) = adviser_sessions.require_active_session(&conn).unwrap();
    section_advisory::assign(
        &conn,
        &school_a.id,
        &f.section_id,
        &adviser_id,
        "2026-06-01",
    )
    .unwrap();

    let rows = adviser_section_monitor_as_current_session(
        &conn,
        &adviser_sessions,
        &f.section_id,
        "2026-08-29",
    )
    .unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].teaching_assignment_id, f.assignment_id);
    assert_eq!(rows[0].monitor.rows[0].absent_count, 1);
}

#[test]
fn a_teacher_who_does_not_advise_the_section_cannot_view_the_adviser_monitor() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let other_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.b");

    let result = adviser_section_monitor_as_current_session(
        &conn,
        &other_sessions,
        &f.section_id,
        "2026-08-29",
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn a_school_head_can_view_the_adviser_monitor_without_advising_the_section() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let head_sessions = login_as_a_school_head_at(&conn, &school_a.id, "head.a");

    let rows = adviser_section_monitor_as_current_session(
        &conn,
        &head_sessions,
        &f.section_id,
        "2026-08-29",
    )
    .unwrap();

    assert_eq!(rows.len(), 1);
    assert_eq!(rows[0].teaching_assignment_id, f.assignment_id);
}

#[test]
fn viewing_the_adviser_monitor_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let owner_sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let f = seed(&conn, &owner_sessions);
    let no_session = SessionManager::new();

    let result =
        adviser_section_monitor_as_current_session(&conn, &no_session, &f.section_id, "2026-08-29");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}
