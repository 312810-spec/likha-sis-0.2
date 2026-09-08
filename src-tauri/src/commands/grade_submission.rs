//! Tauri commands for the interim Multi-Tier Review & Audit Pipeline
//! (ADR-0073). `submit_grades_for_review` gates on
//! `auth::authorize_grade_submission_owner` (self-or-School-Head);
//! `decide_grade_submission`/`list_grade_submissions_for_school`/
//! `get_principal_overview_dashboard` gate on
//! `Capability::ManageGradeSubmissionReview` (School Head, playing the
//! interim approver/principal role — see the ADR).

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::grade_submission::{self, GradeSubmission, SubmissionNote};
use crate::repository::section_membership;

#[tauri::command]
pub fn submit_grades_for_review(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
) -> AppResult<GradeSubmission> {
    let conn = lock_db(&db);
    let (user_id, school_id) =
        auth::authorize_grade_submission_owner(&conn, &sessions, &class_record_id)?;
    grade_submission::submit(&conn, &school_id, &class_record_id, &user_id)
}

#[tauri::command]
pub fn decide_grade_submission(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    submission_id: String,
    approve: bool,
    feedback_note: Option<String>,
) -> AppResult<GradeSubmission> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageGradeSubmissionReview,
    )?;
    grade_submission::decide(
        &conn,
        &school_id,
        &submission_id,
        &user_id,
        approve,
        feedback_note.as_deref(),
    )
}

#[tauri::command]
pub fn list_grade_submissions_for_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<GradeSubmission>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    grade_submission::list_for_school(&conn, &school_id)
}

#[tauri::command]
pub fn list_grade_submission_notes(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    submission_id: String,
) -> AppResult<Vec<SubmissionNote>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    grade_submission::list_notes(&conn, &school_id, &submission_id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrincipalDashboardRow {
    pub learner_id: String,
    pub general_average: Option<f64>,
}

/// Principal (School-Head) Overview Dashboard: composite-grade view for
/// one section, reusing `grade_submission::composite_grades_for_section`
/// (itself reusing `grading_computation` — no new grade engine). The
/// submission-status matrix half is `list_grade_submissions_for_school`
/// above; the frontend combines both, matching this codebase's
/// established pattern of composing narrow commands rather than one
/// monolithic dashboard query.
#[tauri::command]
pub fn get_principal_overview_dashboard(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<PrincipalDashboardRow>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    let roster =
        section_membership::roster_for_section(&conn, &school_id, &section_id, &as_of_date)?;
    let learner_ids: Vec<String> = roster.into_iter().map(|m| m.learner_id).collect();
    let averages = grade_submission::composite_grades_for_section(
        &conn,
        &school_id,
        &section_id,
        &learner_ids,
    )?;
    Ok(averages
        .into_iter()
        .map(|(learner_id, general_average)| PrincipalDashboardRow {
            learner_id,
            general_average,
        })
        .collect())
}
