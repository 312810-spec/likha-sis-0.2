use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::learner::{self, Learner};

/// `school_id` is deliberately NOT a parameter here — it is derived from
/// the current session, never accepted from the caller. See ADR-0004:
/// this is a strictly stronger guarantee than re-validating a
/// caller-supplied school_id, because there is no parameter to forget to
/// check on a future change.
#[tauri::command]
pub fn list_learners_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Learner>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::list_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn create_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
) -> AppResult<Learner> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::create(
        &conn,
        &school_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
    )
}

/// `learner_id` identifies WHICH learner; `school_id` (which one it must
/// belong to) still comes only from the session, never from the caller —
/// so a caller cannot read a different school's learner even by guessing
/// its id. Returns `None`, not an error, when the id doesn't resolve
/// within the caller's own school — "doesn't exist" and "exists
/// elsewhere" are indistinguishable on purpose.
#[tauri::command]
pub fn get_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<Learner>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::find_by_id_in_school(&conn, &school_id, &learner_id)
}

#[tauri::command]
pub fn update_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
) -> AppResult<Option<Learner>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner::update(
        &conn,
        &school_id,
        &learner_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
    )
}
