//! ADR-0070: Tauri commands for the secondary structural-lock PIN. Thin
//! `State`-unwrapping wrappers around `auth::*` -- all real logic
//! (validation, hashing, gating) lives in `auth`/`crypto::pin_lock`/
//! `repository::structural_lock`, matching this codebase's established
//! command-layer convention.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;

/// Sets (or replaces) the caller's own school's structural-lock PIN.
/// School Head only.
#[tauri::command]
pub fn set_structural_lock_pin(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    pin: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    auth::set_structural_lock_pin(&conn, &sessions, &pin)
}

/// Removes the caller's own school's structural-lock PIN entirely.
/// School Head only.
#[tauri::command]
pub fn clear_structural_lock_pin(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    auth::clear_structural_lock_pin(&conn, &sessions)
}

/// Whether the caller's own school currently has a structural-lock PIN
/// configured. Any authenticated member of the school.
#[tauri::command]
pub fn has_structural_lock_pin(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::has_structural_lock_pin(&conn, &sessions)
}

/// Attempts to unlock the structural lock for the current session, for
/// `auth::STRUCTURAL_LOCK_UNLOCK_WINDOW`. Returns `true` on a correct
/// PIN, `false` for a wrong PIN or a school with no PIN configured --
/// never an error for either of those two cases (only for "no active
/// session at all").
#[tauri::command]
pub fn verify_structural_lock_pin(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    pin: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    auth::verify_structural_lock_pin(&conn, &sessions, &pin)
}
