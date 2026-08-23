use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, Session, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::{school, user};

/// What the frontend is allowed to know about the current session: never
/// a password hash, never the raw session bookkeeping — just enough to
/// show "logged in as ... at ..." and to know when to prompt for login
/// again.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CurrentSession {
    pub user_id: String,
    pub username: String,
    pub display_name: String,
    pub school_id: String,
    pub school_name: String,
    pub expires_at_unix_ms: u64,
}

pub(crate) fn to_dto(conn: &Connection, session: &Session) -> AppResult<CurrentSession> {
    let user = user::find_by_id(conn, &session.user_id)?.ok_or(AppError::Unauthorized)?;
    let school = school::find_by_id(conn, &session.school_id)?.ok_or(AppError::Unauthorized)?;
    let expires_at_unix_ms = session
        .expires_at
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;

    Ok(CurrentSession {
        user_id: user.id,
        username: user.username,
        display_name: user.display_name,
        school_id: school.id,
        school_name: school.name,
        expires_at_unix_ms,
    })
}

#[tauri::command]
pub fn login(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    username: String,
    mut password: String,
    school_id: String,
) -> AppResult<CurrentSession> {
    let conn = lock_db(&db);
    let result = auth::login(&conn, &sessions, &username, &password, &school_id);
    password.zeroize();
    let session = result?;
    to_dto(&conn, &session)
}

#[tauri::command]
pub fn logout(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    auth::logout(&conn, &sessions)
}

#[tauri::command]
pub fn current_session(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<CurrentSession>> {
    let conn = lock_db(&db);
    match sessions.current() {
        Some(session) if session.is_active(SystemTime::now()) => Ok(Some(to_dto(&conn, &session)?)),
        _ => Ok(None),
    }
}
