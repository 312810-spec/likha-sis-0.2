use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::learner_support::{self, LearnerSupportCase};

/// Opens a learning-support case on one learner for one class — CTOS.md
/// §M08's loop: the teacher turns the evidence they just marked for
/// follow-up into an explicit plan (need → goal → intervention).
///
/// `school_id` and `actor_user_id` come only from the active session, per
/// `.claude/rules/architecture.md`'s tenant-scope rule — never
/// client-supplied. Ownership is re-derived from the occurrence's own
/// assignment inside the repository, so a `class_occurrence_id` from
/// another teacher's class is rejected at the boundary, not by the caller.
#[tauri::command]
pub fn open_learner_support_case(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_occurrence_id: String,
    section_membership_id: String,
    need: String,
    goal: String,
    intervention: String,
) -> AppResult<Option<LearnerSupportCase>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    learner_support::open_case(
        &conn,
        &school_id,
        &class_occurrence_id,
        &section_membership_id,
        &need,
        &goal,
        &intervention,
        &user_id,
    )
}

/// Records the loop's participation step, moving the case to
/// `in_progress`. `Ok(None)` for an unknown case or one that is no longer
/// `open` — the status the UI already shows is what tells the teacher why.
#[tauri::command]
pub fn record_learner_support_participation(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    case_id: String,
    participation: String,
) -> AppResult<Option<LearnerSupportCase>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    learner_support::record_participation(&conn, &school_id, &case_id, &participation, &user_id)
}

/// Records the loop's outcome and resolves the case. `Ok(None)` for an
/// unknown case or one that has not yet recorded participation — a case
/// cannot be closed before the intervention was delivered.
#[tauri::command]
pub fn resolve_learner_support_case(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    case_id: String,
    outcome: String,
) -> AppResult<Option<LearnerSupportCase>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    learner_support::resolve(&conn, &school_id, &case_id, &outcome, &user_id)
}

/// Every support case on one occurrence, open and resolved alike — the
/// intervention history for this class.
#[tauri::command]
pub fn list_learner_support_cases(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_occurrence_id: String,
) -> AppResult<Vec<LearnerSupportCase>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    learner_support::list_for_occurrence(&conn, &school_id, &class_occurrence_id)
}
