use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
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

/// WAVE 1A RBAC Foundation's representative authorization proof: only a
/// session holding the Registrar or School Head role in this school may
/// enroll a learner — see `docs/adr/0036-rbac-foundation.md`. A Teacher
/// session is rejected with `Unauthorized`, the same fail-closed error
/// every other authorization denial in this codebase already returns.
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
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
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

/// Candidate learners that might already be the same person as one
/// described by the given name/LRN, for a Registrar to compare before
/// deciding to create a new record -- never auto-merged. Same
/// `ManageLearners` gate as `create_learner`, since this exists to inform
/// that same decision. See `repository::learner::find_candidates`'s doc
/// comment for the exact matching rule.
#[tauri::command]
pub fn find_learner_candidates(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
) -> AppResult<Vec<Learner>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner::find_candidates(&conn, &school_id, &given_name, &family_name, lrn.as_deref())
}

/// Manual Create Learner's duplicate-aware entry point (Wave 2U) --
/// reuses `learner::find_candidates` (already relied on by SF1 import)
/// through `learner::create_with_duplicate_check` rather than a second
/// detection engine. `create_learner` above is left unchanged as the
/// low-level primitive SF1 import's own commit path still calls
/// directly; this command is the one the manual Create Learner UI calls.
/// Same `ManageLearners` gate as `create_learner`, since this performs
/// the same action with an added review step.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_learner_with_duplicate_check(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    given_name: String,
    family_name: String,
    lrn: Option<String>,
    sex: Option<String>,
    confirmed: bool,
) -> AppResult<learner::CreateLearnerOutcome> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    learner::create_with_duplicate_check(
        &conn,
        &school_id,
        &given_name,
        &family_name,
        lrn.as_deref(),
        sex.as_deref(),
        confirmed,
    )
}

/// Same Registrar/School Head gate as `create_learner` — editing a
/// learner's identity/records is the same "manage learners" capability,
/// not a separate one.
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
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
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
