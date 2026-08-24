use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::assessment_category::{self, AssessmentCategory, AssessmentCategorySet};

/// Reference data, not scoped to any session/school — every school sees
/// the same DepEd-sourced set of assessment category sets. Still requires
/// an active session, matching `commands::grading::list_grading_policies`.
#[tauri::command]
pub fn list_assessment_category_sets(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<AssessmentCategorySet>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    assessment_category::list_category_sets(&conn)
}

#[tauri::command]
pub fn list_assessment_categories_for_set(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    set_id: String,
) -> AppResult<Vec<AssessmentCategory>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    assessment_category::list_categories_for_set(&conn, &set_id)
}
