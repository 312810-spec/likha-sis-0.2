//! Integration proofs for the M7/M9 attendance vertical slice, standing in
//! for `commands::attendance::*` and `commands::section::*` directly — same
//! pattern as `tests/learner_management.rs`.

use std::path::Path;

use app_lib::auth::{self, SessionManager};
use app_lib::error::AppError;
use app_lib::repository::attendance::{self, AttendanceStatus};
use app_lib::repository::{learner, school, section, section_membership, user};

fn open_test_db() -> rusqlite::Connection {
    app_lib::db::open(Path::new(":memory:"), &app_lib::crypto::generate_key()).unwrap()
}

/// Standing in for `commands::attendance::record_attendance`.
fn record_attendance_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    learner_id: &str,
    date: &str,
    status: AttendanceStatus,
) -> app_lib::error::AppResult<Option<attendance::AttendanceRecord>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    attendance::record(conn, &school_id, section_id, learner_id, date, status)
}

/// Standing in for `commands::attendance::attendance_roster_for_date`.
fn roster_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    date: &str,
) -> app_lib::error::AppResult<Vec<attendance::AttendanceRosterEntry>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    attendance::roster_for_section_date(conn, &school_id, section_id, date)
}

/// Standing in for `commands::attendance::bulk_mark_attendance_present`.
fn bulk_mark_present_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    date: &str,
) -> app_lib::error::AppResult<Vec<attendance::AttendanceRosterEntry>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    attendance::bulk_mark_present(conn, &school_id, section_id, date)
}

/// Standing in for `commands::attendance::monthly_attendance_summary`.
fn monthly_summary_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    year: i32,
    month: u32,
) -> app_lib::error::AppResult<attendance::MonthlyAttendanceReport> {
    let school_id = sessions.require_active_school_scope(conn)?;
    attendance::monthly_grid_for_section(conn, &school_id, section_id, year, month)
}

/// Standing in for `commands::section::enroll_learner_in_section`.
fn enroll_as_current_session(
    conn: &rusqlite::Connection,
    sessions: &SessionManager,
    section_id: &str,
    learner_id: &str,
    starts_on: &str,
) -> app_lib::error::AppResult<Option<section_membership::SectionMembership>> {
    let school_id = sessions.require_active_school_scope(conn)?;
    section_membership::enroll(conn, &school_id, section_id, learner_id, starts_on)
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

/// Creates a school, a section within it, a learner enrolled in that
/// section as of 2026-08-01, and a logged-in session for a teacher at that
/// school. Returns (school_id, section_id, learner_id, sessions).
fn setup_enrolled_learner_with_session(
    conn: &rusqlite::Connection,
    username: &str,
) -> (String, String, String, SessionManager) {
    let s = school::create(conn, "School A").unwrap();
    let sec = section::create(conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = login_as_a_teacher_at(conn, &s.id, username);
    let l = learner::create(conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
    enroll_as_current_session(conn, &sessions, &sec.id, &l.id, "2026-08-01")
        .unwrap()
        .unwrap();
    (s.id, sec.id, l.id, sessions)
}

#[test]
fn a_teacher_can_mark_and_see_attendance_for_their_own_schools_learner() {
    let conn = open_test_db();
    let (_school_id, section_id, learner_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let recorded = record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_id,
        &learner_id,
        "2026-08-24",
        AttendanceStatus::Present,
    )
    .unwrap()
    .unwrap();
    assert_eq!(recorded.status, AttendanceStatus::Present);

    let roster = roster_as_current_session(&conn, &sessions, &section_id, "2026-08-24").unwrap();
    assert_eq!(roster.len(), 1);
    assert_eq!(roster[0].status, Some(AttendanceStatus::Present));
}

#[test]
fn a_teacher_cannot_mark_attendance_for_another_schools_learner() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let other_schools_learner =
        learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");

    let result = record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_a.id,
        &other_schools_learner.id,
        "2026-08-24",
        AttendanceStatus::Absent,
    )
    .unwrap();

    assert_eq!(
        result, None,
        "must not reveal or affect another school's learner"
    );
}

#[test]
fn a_teacher_cannot_mark_attendance_using_another_schools_section() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let learner_a = learner::create(&conn, &school_a.id, "Juan", "Dela Cruz", None, None).unwrap();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();

    let result = record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_b.id,
        &learner_a.id,
        "2026-08-24",
        AttendanceStatus::Present,
    )
    .unwrap();

    assert_eq!(
        result, None,
        "must not accept a section id belonging to another school"
    );
}

#[test]
fn a_teachers_roster_view_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let (_school_id, section_id, _learner_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();
    let learner_b = learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();
    section_membership::enroll(
        &conn,
        &school_b.id,
        &section_b.id,
        &learner_b.id,
        "2026-08-01",
    )
    .unwrap();

    let roster = roster_as_current_session(&conn, &sessions, &section_id, "2026-08-24").unwrap();

    assert_eq!(roster.len(), 1, "only school A's section's own member");
}

#[test]
fn recording_attendance_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let learner_row = learner::create(&conn, &school_a.id, "Ana", "Santos", None, None).unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_a.id,
        &learner_row.id,
        "2026-08-24",
        AttendanceStatus::Present,
    );

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn viewing_the_roster_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = roster_as_current_session(&conn, &sessions, &section_a.id, "2026-08-24");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn bulk_marking_present_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result =
        bulk_mark_present_as_current_session(&conn, &sessions, &section_a.id, "2026-08-24");

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn bulk_marking_present_never_marks_another_schools_section() {
    let conn = open_test_db();
    let (_school_a, section_a, _, _sessions_a) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    let sessions_b = login_as_a_teacher_at(&conn, &school_b.id, "teacher.b");

    let roster =
        bulk_mark_present_as_current_session(&conn, &sessions_b, &section_a, "2026-08-24").unwrap();

    assert!(roster.is_empty());
    let roster_a =
        roster_as_current_session(&conn, &_sessions_a, &section_a, "2026-08-24").unwrap();
    assert_eq!(
        roster_a[0].status, None,
        "school A's learner must remain unmarked"
    );
}

#[test]
fn bulk_marking_present_marks_the_callers_own_unmarked_roster() {
    let conn = open_test_db();
    let (_school_id, section_id, learner_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let roster =
        bulk_mark_present_as_current_session(&conn, &sessions, &section_id, "2026-08-24").unwrap();

    let entry = roster.iter().find(|e| e.learner_id == learner_id).unwrap();
    assert_eq!(entry.status, Some(AttendanceStatus::Present));
}

#[test]
fn marking_a_learner_twice_on_the_same_date_overwrites_rather_than_duplicates() {
    let conn = open_test_db();
    let (_school_id, section_id, learner_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_id,
        &learner_id,
        "2026-08-24",
        AttendanceStatus::Absent,
    )
    .unwrap();
    record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_id,
        &learner_id,
        "2026-08-24",
        AttendanceStatus::Present,
    )
    .unwrap();

    let roster = roster_as_current_session(&conn, &sessions, &section_id, "2026-08-24").unwrap();
    assert_eq!(roster.len(), 1, "one learner, one roster row, not two");
    assert_eq!(roster[0].status, Some(AttendanceStatus::Present));
}

#[test]
fn a_teachers_monthly_summary_never_includes_another_schools_learners() {
    let conn = open_test_db();
    let school_b = school::create(&conn, "School B").unwrap();
    let section_b = section::create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();
    let learner_b = learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();
    section_membership::enroll(
        &conn,
        &school_b.id,
        &section_b.id,
        &learner_b.id,
        "2026-08-01",
    )
    .unwrap();
    attendance::record(
        &conn,
        &school_b.id,
        &section_b.id,
        &learner_b.id,
        "2026-08-24",
        AttendanceStatus::Present,
    )
    .unwrap();
    let (_school_a, section_a, _learner_a, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");

    let report = monthly_summary_as_current_session(&conn, &sessions, &section_a, 2026, 8).unwrap();

    assert_eq!(
        report.learners.len(),
        1,
        "only school A's section's own member"
    );
    assert_eq!(report.learners[0].present_count, 0);
}

#[test]
fn viewing_the_monthly_summary_requires_a_session_even_if_a_caller_tries_to_bypass_ui_checks() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = SessionManager::new(); // nobody logged in

    let result = monthly_summary_as_current_session(&conn, &sessions, &section_a.id, 2026, 8);

    assert!(matches!(result, Err(AppError::Unauthorized)));
}

#[test]
fn the_monthly_summary_correctly_totals_a_teachers_own_schools_marks() {
    let conn = open_test_db();
    let (_school_id, section_id, learner_id, sessions) =
        setup_enrolled_learner_with_session(&conn, "teacher.a");
    record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_id,
        &learner_id,
        "2026-08-24", // Monday
        AttendanceStatus::Present,
    )
    .unwrap();
    record_attendance_as_current_session(
        &conn,
        &sessions,
        &section_id,
        &learner_id,
        "2026-08-25", // Tuesday
        AttendanceStatus::Absent,
    )
    .unwrap();

    let report =
        monthly_summary_as_current_session(&conn, &sessions, &section_id, 2026, 8).unwrap();

    let learner = &report.learners[0];
    assert_eq!(learner.present_count, 1);
    assert_eq!(learner.absent_count, 1);
}

#[test]
fn a_teacher_can_create_a_section_and_enroll_a_learner_in_it() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let learner_a = learner::create(&conn, &school_a.id, "Juan", "Dela Cruz", None, None).unwrap();

    let school_id = sessions.require_active_school_scope(&conn).unwrap();
    let created_section = section::create(&conn, &school_id, "2025-2026", "7", "Mabini").unwrap();
    let membership = enroll_as_current_session(
        &conn,
        &sessions,
        &created_section.id,
        &learner_a.id,
        "2026-08-01",
    )
    .unwrap()
    .unwrap();

    assert_eq!(membership.section_id, created_section.id);
    assert_eq!(membership.learner_id, learner_a.id);
}

#[test]
fn enrolling_a_learner_from_another_school_is_rejected_even_with_a_valid_session() {
    let conn = open_test_db();
    let school_a = school::create(&conn, "School A").unwrap();
    let section_a = section::create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
    let sessions = login_as_a_teacher_at(&conn, &school_a.id, "teacher.a");
    let school_b = school::create(&conn, "School B").unwrap();
    let learner_b = learner::create(&conn, &school_b.id, "Ana", "Santos", None, None).unwrap();

    let result =
        enroll_as_current_session(&conn, &sessions, &section_a.id, &learner_b.id, "2026-08-01")
            .unwrap();

    assert_eq!(result, None);
}
