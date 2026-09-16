use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::attendance::{self, MonthlyAttendanceReport};

/// Returns the last calendar date in `year`/`month`, or `None` for an
/// invalid month. The adviser monthly boundary uses one explicit point in
/// time for authorization: the end of the reporting month. This matches
/// the existing SF2-inspired export's adviser-name lookup and avoids
/// silently treating a subject assignment or UI selection as authority.
fn month_end_date(year: i32, month: u32) -> Option<String> {
    let days = match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 if (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0) => 29,
        2 => 28,
        _ => return None,
    };
    Some(format!("{year}-{month:02}-{days:02}"))
}

/// Read-only monthly attendance preview for the caller's advisory section.
///
/// This is NOT an official SF2 form. It returns the repository's existing
/// SF2-shaped monthly attendance grid only after the trusted Rust boundary
/// revalidates that the caller is the section's active adviser on the last
/// day of the requested month (or a School Head in the same school).
#[tauri::command]
pub fn adviser_monthly_attendance_summary(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    year: i32,
    month: u32,
) -> AppResult<MonthlyAttendanceReport> {
    let conn = lock_db(&db);
    adviser_monthly_attendance_summary_authorized(&conn, &sessions, &section_id, year, month)
}

fn adviser_monthly_attendance_summary_authorized(
    conn: &Connection,
    sessions: &SessionManager,
    section_id: &str,
    year: i32,
    month: u32,
) -> AppResult<MonthlyAttendanceReport> {
    let Some(as_of_date) = month_end_date(year, month) else {
        // Frontend application services validate the month before invoking
        // native commands. A malformed direct IPC request still fails closed
        // here rather than receiving even an empty school-scoped report.
        return Err(AppError::Unauthorized);
    };
    let (_actor_user_id, school_id) =
        auth::authorize_adviser_of_section(conn, sessions, section_id, &as_of_date)?;
    attendance::monthly_grid_for_section(conn, &school_id, section_id, year, month)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{learner, school, section, section_advisory, section_membership, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn setup_adviser_monthly() -> (Connection, SessionManager, String, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
        let learner = learner::create(&conn, &school.id, "Juan", "Dela Cruz", None, None).unwrap();
        section_membership::enroll(&conn, &school.id, &section.id, &learner.id, "2026-06-01")
            .unwrap();
        let adviser = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &adviser.id, &school.id).unwrap();
        section_advisory::assign(&conn, &school.id, &section.id, &adviser.id, "2026-06-01")
            .unwrap();
        let sessions = SessionManager::new();
        auth::login(&conn, &sessions, "ana.cruz", "password", &school.id).unwrap();
        (conn, sessions, school.id, section.id, learner.id)
    }

    #[test]
    fn month_end_date_handles_common_and_leap_year_months() {
        assert_eq!(month_end_date(2026, 8).as_deref(), Some("2026-08-31"));
        assert_eq!(month_end_date(2028, 2).as_deref(), Some("2028-02-29"));
        assert_eq!(month_end_date(2026, 2).as_deref(), Some("2026-02-28"));
        assert_eq!(month_end_date(2026, 13), None);
    }

    #[test]
    fn active_month_end_adviser_can_read_the_existing_monthly_grid() {
        let (conn, sessions, school_id, section_id, learner_id) = setup_adviser_monthly();
        attendance::record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            attendance::AttendanceStatus::Absent,
        )
        .unwrap();

        let report =
            adviser_monthly_attendance_summary_authorized(&conn, &sessions, &section_id, 2026, 8)
                .unwrap();

        assert_eq!(report.year, 2026);
        assert_eq!(report.month, 8);
        assert_eq!(report.learners.len(), 1);
        assert_eq!(report.learners[0].learner_id, learner_id);
        assert_eq!(report.learners[0].absent_count, 1);
    }

    #[test]
    fn non_adviser_cannot_read_an_advisory_monthly_grid() {
        let (conn, sessions, school_id, section_id, _learner_id) = setup_adviser_monthly();
        let other = user::create_user(&conn, "other.teacher", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &school_id).unwrap();
        auth::login(&conn, &sessions, "other.teacher", "password", &school_id).unwrap();

        let result =
            adviser_monthly_attendance_summary_authorized(&conn, &sessions, &section_id, 2026, 8);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn assignment_starting_after_month_end_does_not_authorize_that_month() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let section = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
        let adviser = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(&conn, &adviser.id, &school.id).unwrap();
        section_advisory::assign(&conn, &school.id, &section.id, &adviser.id, "2026-09-01")
            .unwrap();
        let sessions = SessionManager::new();
        auth::login(&conn, &sessions, "ana.cruz", "password", &school.id).unwrap();

        let result =
            adviser_monthly_attendance_summary_authorized(&conn, &sessions, &section.id, 2026, 8);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn invalid_month_fails_closed_before_any_monthly_report_is_returned() {
        let (conn, sessions, _school_id, section_id, _learner_id) = setup_adviser_monthly();

        let result =
            adviser_monthly_attendance_summary_authorized(&conn, &sessions, &section_id, 2026, 13);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }
}
