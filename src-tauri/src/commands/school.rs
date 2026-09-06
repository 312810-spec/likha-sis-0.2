use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::school::{self, School};

#[tauri::command]
pub fn list_schools(db: State<'_, Mutex<Connection>>) -> AppResult<Vec<School>> {
    let conn = lock_db(&db);
    school::list_all(&conn)
}

#[tauri::command]
pub fn create_school(db: State<'_, Mutex<Connection>>, name: String) -> AppResult<School> {
    let conn = lock_db(&db);
    school::create(&conn, &name)
}

/// Logos are a small identity icon, not a document store -- 512 KiB is
/// generous headroom for a sidebar/header-sized PNG/JPEG/WebP while
/// keeping the encrypted working database from growing unboundedly.
const MAX_LOGO_BYTES: usize = 512 * 1024;

/// Deliberately narrow: this is what actually renders in an `<img>` in
/// the app shell today. Anything else (SVG in particular -- arbitrary
/// script content) is rejected rather than allow-listed later.
const ALLOWED_LOGO_MIME_TYPES: &[&str] = &["image/png", "image/jpeg", "image/webp"];

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SchoolLogoDto {
    pub mime: String,
    pub bytes: Vec<u8>,
}

/// Uploads or replaces the caller's own school's branding logo. School
/// Head only (`ManageSchoolBranding`) -- `school_id` is always
/// session-derived, never a parameter, matching every other tenant-write
/// command in this codebase. Rejects an oversized upload or a MIME type
/// outside `ALLOWED_LOGO_MIME_TYPES` at this layer, before any bytes
/// reach the repository -- this codebase's established convention that
/// validation lives at the command/application boundary, not the
/// repository (see `.claude/rules/architecture.md`).
#[tauri::command]
pub fn set_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    mime: String,
    bytes: Vec<u8>,
) -> AppResult<()> {
    if bytes.is_empty() {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            "logo upload must not be empty".to_string(),
        )));
    }
    if bytes.len() > MAX_LOGO_BYTES {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!(
                "logo upload of {} bytes exceeds the {MAX_LOGO_BYTES}-byte limit",
                bytes.len()
            ),
        )));
    }
    if !ALLOWED_LOGO_MIME_TYPES.contains(&mime.as_str()) {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("unsupported logo type '{mime}'"),
        )));
    }

    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    school::set_logo(&conn, &school_id, &mime, &bytes)
}

/// Reads back the caller's own school's branding logo, if any. Any
/// authenticated member of the school may view it (it renders in the
/// shared app shell for every role) -- session-scoped read, no
/// dedicated capability, matching this codebase's convention for
/// same-school reference data (e.g. `current_section_adviser`).
#[tauri::command]
pub fn get_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<SchoolLogoDto>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let logo = school::get_logo(&conn, &school_id)?;
    Ok(logo.map(|l| SchoolLogoDto {
        mime: l.mime,
        bytes: l.bytes,
    }))
}

/// Removes the caller's own school's branding logo. School Head only,
/// same `ManageSchoolBranding` gate as `set_school_logo`.
#[tauri::command]
pub fn clear_school_logo(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageSchoolBranding)?;
    school::clear_logo(&conn, &school_id)
}
