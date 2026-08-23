use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, SessionManager};
use crate::commands::{auth::to_dto, auth::CurrentSession, lock_db};
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstallationStatus {
    pub needs_setup: bool,
}

/// Backend-trusted first-run check. The frontend must decide whether to
/// show the setup screen from this, never from a client-side flag alone.
#[tauri::command]
pub fn installation_status(db: State<'_, Mutex<Connection>>) -> AppResult<InstallationStatus> {
    let conn = lock_db(&db);
    Ok(InstallationStatus {
        needs_setup: auth::installation_needs_setup(&conn)?,
    })
}

/// Creates the first school, first user, and their membership atomically,
/// then signs the new user in. See `auth::bootstrap_installation` for the
/// one-time-only guarantee and why the check happens inside the
/// transaction rather than before it.
#[tauri::command]
pub fn bootstrap_installation(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_name: String,
    username: String,
    mut password: String,
    display_name: String,
) -> AppResult<CurrentSession> {
    let mut conn = lock_db(&db);
    let result = auth::bootstrap_installation(
        &mut conn,
        &sessions,
        &school_name,
        &username,
        &password,
        &display_name,
    );
    password.zeroize();
    let session = result?;
    to_dto(&conn, &session)
}
