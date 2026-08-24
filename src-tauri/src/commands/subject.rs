use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::subject::{self, Subject};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::section::list_sections_by_school`.
#[tauri::command]
pub fn list_subjects_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Subject>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    subject::list_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn create_subject(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    name: String,
) -> AppResult<Subject> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    subject::create(&conn, &school_id, &name)
}
