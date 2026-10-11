use crate::repository::{
    class_occurrence,
    classroom_draft::{self, ClassroomDraft, ClassroomDraftFields},
};
use crate::{auth::SessionManager, commands::lock_db, error::AppResult};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;

// Every operation revalidates assignment ownership and active-school membership.
// Caller-supplied owner/school identifiers are deliberately absent.
#[tauri::command]
pub fn load_classroom_draft(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    expected_revision: i64,
) -> AppResult<Option<ClassroomDraft>> {
    let conn = lock_db(&db);
    let (owner, school) = sessions.require_active_session(&conn)?;
    class_occurrence::authorize_own_assignment(&conn, &owner, &school, &teaching_assignment_id)?;
    classroom_draft::load(
        &conn,
        &owner,
        &school,
        &teaching_assignment_id,
        &occurrence_date,
        expected_revision,
    )
}
#[tauri::command]
pub fn save_classroom_draft(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    expected_revision: i64,
    fields: ClassroomDraftFields,
) -> AppResult<ClassroomDraft> {
    let conn = lock_db(&db);
    let (owner, school) = sessions.require_active_session(&conn)?;
    class_occurrence::authorize_own_assignment(&conn, &owner, &school, &teaching_assignment_id)?;
    classroom_draft::save(
        &conn,
        &owner,
        &school,
        &teaching_assignment_id,
        &occurrence_date,
        expected_revision,
        &fields,
    )
}
#[tauri::command]
pub fn remove_classroom_draft(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    expected_revision: i64,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let (owner, school) = sessions.require_active_session(&conn)?;
    class_occurrence::authorize_own_assignment(&conn, &owner, &school, &teaching_assignment_id)?;
    classroom_draft::remove(
        &conn,
        &owner,
        &school,
        &teaching_assignment_id,
        &occurrence_date,
        expected_revision,
    )
}
