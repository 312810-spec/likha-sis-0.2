use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::export::sanitize_filename_component;
use crate::export::sf2::{self, Sf2Export};
use crate::export::FieldDisclosure;
use crate::repository::attendance::{self, MonthlyAttendanceReport};
use crate::repository::{school, section, section_advisory, user};

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

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AdviserSf2ExportResult {
    pub file_path: String,
    pub disclosure: FieldDisclosure,
}

/// Writes the existing SF2-inspired CSV for the caller's advisory section.
///
/// Unlike the legacy school-scoped export command, this Adviser Room wrapper
/// revalidates the advisory assignment at the trusted Rust boundary using the
/// same month-end authorization point as the preview. It does not make the
/// CSV an official/submission-ready DepEd form; the existing disclosure is
/// returned unchanged and remains the source of truth for omitted fields.
#[tauri::command]
pub fn adviser_export_section_monthly_sf2(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    year: i32,
    month: u32,
) -> AppResult<AdviserSf2ExportResult> {
    let conn = lock_db(&db);
    let (export, section_name) =
        adviser_monthly_sf2_export_authorized(&conn, &sessions, &section_id, year, month)?;

    let export_dir = app
        .path()
        .document_dir()
        .or_else(|_| app.path().app_data_dir())
        .map_err(|e| std::io::Error::other(e.to_string()))?
        .join("LIKHA-SIS");
    std::fs::create_dir_all(&export_dir)?;
    let file_name = format!(
        "SF2_{}_{year}-{month:02}.csv",
        sanitize_filename_component(&section_name.replace(' ', "_"))
    );
    let file_path = export_dir.join(file_name);
    std::fs::write(&file_path, export.csv)?;

    Ok(AdviserSf2ExportResult {
        file_path: file_path.to_string_lossy().to_string(),
        disclosure: export.disclosure,
    })
}

fn adviser_monthly_sf2_export_authorized(
    conn: &Connection,
    sessions: &SessionManager,
    section_id: &str,
    year: i32,
    month: u32,
) -> AppResult<(Sf2Export, String)> {
    let Some(as_of_date) = month_end_date(year, month) else {
        return Err(AppError::Unauthorized);
    };
    let (_actor_user_id, school_id) =
        auth::authorize_adviser_of_section(conn, sessions, section_id, &as_of_date)?;

    let school = school::find_by_id(conn, &school_id)?.ok_or(AppError::Unauthorized)?;
    let section = section::find_by_id_in_school(conn, &school_id, section_id)?
        .ok_or(AppError::Unauthorized)?;
    let report = attendance::monthly_grid_for_section(conn, &school_id, section_id, year, month)?;
    let adviser =
        section_advisory::current_adviser_for_section(conn, &school_id, section_id, &as_of_date)?;
    let adviser_name = if let Some(assignment) = adviser {
        user::find_by_id(conn, &assignment.teacher_user_id)?.map(|u| u.display_name)
    } else {
        None
    };
    let section_name = section.name.clone();
    let export = sf2::build_sf2_export(&school, &section, adviser_name.as_deref(), &report);
    Ok((export, section_name))
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
    fn active_adviser_can_build_the_existing_sf2_inspired_export() {
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

        let (export, section_name) =
            adviser_monthly_sf2_export_authorized(&conn, &sessions, &section_id, 2026, 8).unwrap();

        assert_eq!(section_name, "Mabini");
        assert!(export.csv.contains("School Name,Rizal Elementary"));
        assert!(export.csv.contains("Class Adviser,Ana Cruz"));
        assert!(export.csv.contains("Report for the Month of,August 2026"));
        assert!(export.csv.contains("# This is a DepEd-SF2-inspired export"));
        assert!(!export.disclosure.omitted_fields.is_empty());
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
    fn non_adviser_cannot_build_the_adviser_sf2_export() {
        let (conn, sessions, school_id, section_id, _learner_id) = setup_adviser_monthly();
        let other = user::create_user(&conn, "other.teacher", "password", "Other Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &school_id).unwrap();
        auth::login(&conn, &sessions, "other.teacher", "password", &school_id).unwrap();

        let result = adviser_monthly_sf2_export_authorized(&conn, &sessions, &section_id, 2026, 8);

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

    #[test]
    fn invalid_month_fails_closed_before_any_sf2_export_is_built() {
        let (conn, sessions, _school_id, section_id, _learner_id) = setup_adviser_monthly();

        let result = adviser_monthly_sf2_export_authorized(&conn, &sessions, &section_id, 2026, 13);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }
}
