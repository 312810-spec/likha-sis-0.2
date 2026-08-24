use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::grading_computation::{self, ComputedTermGrade};
use crate::repository::learner_score::{self, LearnerScore, LearnerScoreRosterEntry, LearnerScoreStatus};

/// `assessment_item_id` is client-supplied the same legitimate way
/// `section_id` already is elsewhere — `learner_score::roster_for_item`
/// resolves it within the caller's school first and returns `None` for a
/// foreign/unknown id.
#[tauri::command]
pub fn roster_for_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
) -> AppResult<Option<Vec<LearnerScoreRosterEntry>>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    learner_score::roster_for_item(&conn, &school_id, &assessment_item_id)
}

/// `assessment_item_id`/`learner_id` identify WHAT and WHO; `school_id`
/// comes only from the session, and `recorded_by_user_id` is the
/// session's own `user_id` — never a client-supplied parameter, so a
/// caller cannot attribute a score entry to a different teacher.
#[tauri::command]
pub fn record_learner_score(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    assessment_item_id: String,
    learner_id: String,
    status: LearnerScoreStatus,
    score: Option<f64>,
) -> AppResult<Option<LearnerScore>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    learner_score::record(&conn, &school_id, &assessment_item_id, &learner_id, status, score, &user_id)
}

/// `class_record_id`/`learner_id` are client-supplied the same legitimate
/// way `assessment_item_id` already is above — `grading_computation::compute_term_grade`
/// resolves `class_record_id` within the caller's school first and returns
/// `None` for a foreign/unknown id or a not-yet-computable grade (see that
/// function's doc comment for what "not yet computable" means). `school_id`
/// comes only from the session.
#[tauri::command]
pub fn compute_learner_term_grade(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
    learner_id: String,
) -> AppResult<Option<ComputedTermGrade>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    grading_computation::compute_term_grade(&conn, &school_id, &class_record_id, &learner_id)
}
