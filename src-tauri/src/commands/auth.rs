use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;
use zeroize::Zeroize;

use crate::auth::{self, Session, SessionManager, IDLE_TIMEOUT};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::audit_log::{self, AuditLogEntry};
use crate::repository::{school, user};

/// A review/troubleshooting cap, not a pagination limit — this screen is
/// "what happened recently," not a full historical export.
const AUDIT_LOG_LIST_LIMIT: u32 = 200;

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
    /// When this session will be idle-timed-out absent further activity
    /// -- `session.last_activity_at + IDLE_TIMEOUT`, a pure read with no
    /// side effect (this function never slides the window itself; only
    /// `SessionManager::require_active_session` does that). See ADR-0026.
    pub idle_expires_at_unix_ms: u64,
}

pub(crate) fn to_dto(conn: &Connection, session: &Session) -> AppResult<CurrentSession> {
    let user = user::find_by_id(conn, &session.user_id)?.ok_or(AppError::Unauthorized)?;
    let school = school::find_by_id(conn, &session.school_id)?.ok_or(AppError::Unauthorized)?;
    let expires_at_unix_ms = session
        .expires_at
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64;
    let idle_expires_at_unix_ms = (session.last_activity_at + IDLE_TIMEOUT)
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
        idle_expires_at_unix_ms,
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

/// Explicitly slides the idle-timeout window forward, the same way any
/// other protected command does via `require_active_school_scope` -- but
/// with no data side effect of its own, for the sole purpose of a
/// teacher dismissing the frontend's "session expiring soon" warning
/// (see ADR-0026) without needing to navigate anywhere. Returns the
/// refreshed `CurrentSession` (a new `idle_expires_at_unix_ms`) so the
/// frontend can reset its own warning timer from the authoritative
/// server value rather than assuming a fixed offset.
#[tauri::command]
pub fn extend_session(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<CurrentSession> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    let session = sessions.current().ok_or(AppError::Unauthorized)?;
    to_dto(&conn, &session)
}

/// The most recent authentication events (login/logout/lockout) for the
/// caller's own school — `school_id` comes only from the session, same
/// convention as every other command. There is no "view another
/// school's audit log" capability, matching this app's single-role
/// model (see `docs/product/M8-DECISION.md`'s Roles & Permissions
/// follow-up — every teacher already has full access within their own
/// school, so this simply extends that same scope, not a new privilege
/// tier).
#[tauri::command]
pub fn list_audit_log(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<AuditLogEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    audit_log::list_for_school(&conn, &school_id, AUDIT_LOG_LIST_LIMIT)
}
