use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::school_planning::{self, SchoolPlanningInput, SchoolPlanningItem};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;
#[tauri::command]
pub fn list_school_planning_items(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SchoolPlanningItem>> {
    let conn = lock_db(&db);
    let school = sessions.require_active_school_scope(&conn)?;
    school_planning::list(&conn, &school)
}
#[tauri::command]
pub fn save_school_planning_item(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    input: SchoolPlanningInput,
    id: Option<String>,
    expected_revision: Option<u32>,
) -> AppResult<SchoolPlanningItem> {
    let conn = lock_db(&db);
    let (school, actor) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    if !crate::repository::role::list_roles(&conn, &actor, &school)?
        .iter()
        .any(|r| r == "school_head")
    {
        return Err(AppError::Unauthorized);
    }
    school_planning::save(
        &conn,
        &school,
        &actor,
        &input,
        id.as_deref(),
        expected_revision,
    )
}
