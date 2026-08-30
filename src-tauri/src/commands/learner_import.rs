use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::learner_import::{
    self, ImportBatchResult, ImportDecision, ImportLogEntry, PreviewRow,
};

/// Same `ManageLearners` gate as `create_learner`/`update_learner` --
/// bulk import is "manage many learners at once," not a separate
/// authority. Never writes anything: parses `csv_text` and flags any
/// potential duplicate already in this school for the caller to review.
#[tauri::command]
pub fn preview_learner_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    csv_text: String,
) -> AppResult<Vec<PreviewRow>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner_import::preview(&conn, &school_id, &csv_text)
}

/// Commits a reviewed batch atomically. `imported_by_user_id` for
/// provenance comes only from the session (`authorize_capability_with_user`),
/// never from the caller -- matching every other session-derived value
/// in this codebase.
#[tauri::command]
pub fn commit_learner_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    decisions: Vec<ImportDecision>,
) -> AppResult<ImportBatchResult> {
    let mut conn = lock_db(&db);
    let (user_id, school_id) =
        auth::authorize_capability_with_user(&conn, &sessions, Capability::ManageLearners)?;
    learner_import::commit_batch(&mut conn, &school_id, &user_id, &decisions)
}

/// The full provenance trail for one import batch -- same read access as
/// `list_learners_by_school` (any active session in the school), since
/// this is an audit view, not a write surface.
#[tauri::command]
pub fn get_learner_import_log(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    batch_id: String,
) -> AppResult<Vec<ImportLogEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner_import::log_for_batch(&conn, &school_id, &batch_id)
}
