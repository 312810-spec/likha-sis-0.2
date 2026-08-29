use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::school_branding::{self, SchoolBranding};

/// Uploads/replaces the caller's school's logo and derives its theme
/// from it. `school_id` is always session-derived, never client-supplied
/// -- matching every other tenant-scoped command in this codebase.
#[tauri::command]
pub fn set_school_branding(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    logo_bytes: Vec<u8>,
    logo_mime: String,
) -> AppResult<SchoolBranding> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    school_branding::set(&conn, &school_id, &logo_bytes, &logo_mime)
}

/// Reads the caller's own school's branding -- deliberately ungated
/// beyond an active session (matching `list_sections`/other read paths):
/// every teacher needs the theme to render the app shell, not just
/// whoever can change it.
#[tauri::command]
pub fn get_school_branding(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<SchoolBranding>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    school_branding::get(&conn, &school_id)
}

/// The raw logo bytes (base64-friendly `Vec<u8>`, Tauri serializes this
/// as a JSON byte array) plus its MIME type, for rendering an `<img>`
/// preview. Same read access as `get_school_branding`.
#[tauri::command]
pub fn get_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<(Vec<u8>, String)>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    school_branding::get_logo(&conn, &school_id)
}

/// Reverts the caller's school to the default (unbranded) theme.
#[tauri::command]
pub fn clear_school_branding(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    school_branding::clear(&conn, &school_id)
}
