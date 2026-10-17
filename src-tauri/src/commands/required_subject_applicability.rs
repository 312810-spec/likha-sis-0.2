//! Session-derived authority; no caller-supplied school or actor fields.
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::required_subject_applicability::{
    self as applicability, AppendVersion, ApplicabilityContext, ApplicabilitySelection,
    ApplicabilityVersion,
};

#[tauri::command]
pub fn append_required_subject_version(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    request: AppendVersion,
) -> AppResult<ApplicabilityVersion> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    applicability::append_authorized(&conn, &actor, &school, &request)
}

#[tauri::command]
pub fn select_required_subject_version(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    context: ApplicabilityContext,
) -> AppResult<ApplicabilitySelection> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    applicability::select_authorized(&conn, &actor, &school, &context)
}

#[tauri::command]
pub fn list_required_subject_versions(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    context: ApplicabilityContext,
) -> AppResult<Vec<ApplicabilityVersion>> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    applicability::history_authorized(&conn, &actor, &school, &context)
}

#[tauri::command]
pub fn pin_report_required_subject_version(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    draft_id: String,
    expected_version_id: String,
) -> AppResult<ApplicabilityVersion> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    applicability::pin_draft_authorized(&conn, &actor, &school, &draft_id, &expected_version_id)
}

#[tauri::command]
pub fn get_report_required_subject_pin(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    draft_id: String,
) -> AppResult<Option<ApplicabilityVersion>> {
    let conn = lock_db(&db);
    let (actor, school) = sessions.require_active_session(&conn)?;
    applicability::pinned_draft_authorized(&conn, &actor, &school, &draft_id)
}
