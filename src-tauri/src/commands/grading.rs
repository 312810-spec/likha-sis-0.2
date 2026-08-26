use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::grading::{self, GradingPeriod, GradingPolicy, GradingPolicyPeriod};

/// Reference data, not scoped to any session/school — every school sees
/// the same DepEd-sourced set of grading policies. Still requires an
/// active session (matching every other command here) so this can't be
/// probed pre-login.
#[tauri::command]
pub fn list_grading_policies(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<GradingPolicy>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    grading::list_policies(&conn)
}

#[tauri::command]
pub fn list_grading_policy_periods(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    policy_id: String,
) -> AppResult<Vec<GradingPolicyPeriod>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    grading::list_periods_for_policy(&conn, &policy_id)
}

/// `school_id` is derived from the session, never a parameter — same
/// convention as every other command here.
#[tauri::command]
pub fn list_grading_periods_by_school_year(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
) -> AppResult<Vec<GradingPeriod>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading::list_by_school_year(&conn, &school_id, &school_year)
}

/// `policy_period_id` is client-supplied the same legitimate way
/// `section_id` already is elsewhere in this codebase — it identifies a
/// fixed piece of reference data, not tenant data, so there is nothing
/// for it to leak; `school_id` still comes only from the session.
#[tauri::command]
pub fn create_grading_period(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    policy_period_id: String,
    starts_on: String,
    ends_on: String,
) -> AppResult<Option<GradingPeriod>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading::create(
        &conn,
        &school_id,
        &school_year,
        &policy_period_id,
        &starts_on,
        &ends_on,
    )
}
