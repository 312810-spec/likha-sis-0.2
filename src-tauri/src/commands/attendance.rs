use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::attendance::{
    self, AttendanceRecord, AttendanceRosterEntry, AttendanceStatus, MonthlyAttendanceReport,
};

/// `school_id` is derived from the session, never a parameter — see
/// `commands::learner::list_learners_by_school` for the same convention.
/// `section_id` identifies WHICH section's roster; it is a legitimately
/// client-supplied identifier the same way `learner_id` already is
/// elsewhere in this codebase — isolation is still enforced, because
/// `repository::attendance::roster_for_section_date` scopes its query by
/// `school_id` AND `section_id` together, so a `section_id` from another
/// school simply returns an empty roster rather than leaking rows.
#[tauri::command]
pub fn attendance_roster_for_date(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    attendance_date: String,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::roster_for_section_date(&conn, &school_id, &section_id, &attendance_date)
}

/// `learner_id`/`section_id` identify WHO and WHICH section; `school_id`
/// still comes only from the session. Returns `None`, not an error, when
/// `section_id` doesn't resolve within the caller's own school, when
/// `learner_id` doesn't either, or when the learner isn't an active member
/// of that section on that date — see `repository::attendance::record`'s
/// doc comment.
#[tauri::command]
pub fn record_attendance(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    attendance_date: String,
    status: AttendanceStatus,
) -> AppResult<Option<AttendanceRecord>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::record(
        &conn,
        &school_id,
        &section_id,
        &learner_id,
        &attendance_date,
        status,
    )
}

/// Marks every currently-unmarked learner on `section_id`'s roster for
/// `attendance_date` as Present, leaving any already-marked learner
/// untouched — see `repository::attendance::bulk_mark_present`'s doc
/// comment for why this never overwrites an existing mark. `school_id` is
/// derived from the session; `section_id` is client-supplied the same way
/// as every other attendance command here.
#[tauri::command]
pub fn bulk_mark_attendance_present(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    attendance_date: String,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::bulk_mark_present(&conn, &school_id, &section_id, &attendance_date)
}

/// `school_id` is derived from the session, never a parameter — same
/// convention as every other command here. `section_id` is client-supplied
/// for the same reason as `attendance_roster_for_date` above. `year`/`month`
/// sanity (a real month 1-12) is validated one layer up in
/// `AttendanceApplicationService`; an out-of-range `month` here degrades
/// to an empty report rather than an error (see
/// `repository::attendance::monthly_grid_for_section`'s doc comment).
#[tauri::command]
pub fn monthly_attendance_summary(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    year: i32,
    month: u32,
) -> AppResult<MonthlyAttendanceReport> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::monthly_grid_for_section(&conn, &school_id, &section_id, year, month)
}
