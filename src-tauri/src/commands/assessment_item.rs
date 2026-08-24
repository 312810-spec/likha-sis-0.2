use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::assessment_item::{self, AssessmentItem, AssessmentItemDetail};

/// `class_record_id` is client-supplied the same legitimate way
/// `section_id` already is in `enroll_learner_in_section` —
/// `assessment_item::list_by_class_record` scopes its query by
/// `school_id` AND `class_record_id` together, so a foreign
/// `class_record_id` returns an empty list rather than leaking rows.
#[tauri::command]
pub fn list_assessment_items_by_class_record(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
) -> AppResult<Vec<AssessmentItemDetail>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::list_by_class_record(&conn, &school_id, &class_record_id)
}

/// `class_record_id`/`category_id` are client-supplied the same way —
/// `assessment_item::create` verifies `class_record_id` resolves within
/// the caller's school and `category_id` exists before writing;
/// `school_id` still comes only from the session.
#[tauri::command]
pub fn create_assessment_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
    category_id: String,
    name: String,
    max_score: f64,
) -> AppResult<Option<AssessmentItem>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    assessment_item::create(&conn, &school_id, &class_record_id, &category_id, &name, max_score)
}
