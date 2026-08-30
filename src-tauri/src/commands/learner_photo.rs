use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::learner_photo;

/// Same `ManageLearners` gate as `create_learner`/`update_learner` --
/// setting a learner's photo is the same "manage learners" capability,
/// not a separate one. Returns `false` when `learner_id` doesn't resolve
/// in the caller's own school.
#[tauri::command]
pub fn set_learner_photo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    photo_bytes: Vec<u8>,
    photo_mime: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner_photo::set(&conn, &school_id, &learner_id, &photo_bytes, &photo_mime)
}

/// The raw photo bytes plus MIME type, for rendering an `<img>` preview.
/// Same read access as `get_learner`: any active session in the school.
#[tauri::command]
pub fn get_learner_photo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<(Vec<u8>, String)>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner_photo::get(&conn, &school_id, &learner_id)
}

/// Removes a learner's photo, if any.
#[tauri::command]
pub fn clear_learner_photo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner_photo::clear(&conn, &school_id, &learner_id)
}
