use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::class_record::{self, ClassRecord, ClassRecordDetail};
use crate::repository::grading_computation::{self, GradingWeightPolicy};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::section::list_sections_by_school`.
#[tauri::command]
pub fn list_class_records_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<ClassRecordDetail>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    class_record::list_by_school(&conn, &school_id)
}

/// Reference data, not scoped to any session/school — every school sees
/// the same DepEd-sourced set of grade-weighting policies. Still requires
/// an active session (matching every other command here) so this can't
/// be probed pre-login. Populates the weight-policy picker a teacher uses
/// when creating a class record — see `create_class_record`.
#[tauri::command]
pub fn list_grading_weight_policies(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<GradingWeightPolicy>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    grading_computation::list_weight_policies(&conn)
}

/// `section_id`/`subject_id`/`grading_period_id`/`weight_policy_id` are
/// client-supplied the same legitimate way `section_id` already is in
/// `enroll_learner_in_section` — `class_record::create` verifies each
/// resolves within the caller's own school (and that the section and
/// grading period share a school year) before writing; `school_id` still
/// comes only from the session. `curriculum_version_id` is deliberately
/// not yet a parameter here — this command always requests the current
/// default (see `class_record::create`'s doc comment for why that's a
/// deliberate deviation from `weight_policy_id`'s always-explicit
/// convention). Exposing an explicit choice is future work for when a
/// teacher genuinely needs one — see
/// `docs/adr/0037-curriculum-key-stage-versioning.md`.
#[tauri::command]
pub fn create_class_record(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    subject_id: String,
    grading_period_id: String,
    weight_policy_id: String,
) -> AppResult<Option<ClassRecord>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    class_record::create(
        &conn,
        &school_id,
        &section_id,
        &subject_id,
        &grading_period_id,
        &weight_policy_id,
        None,
    )
}
