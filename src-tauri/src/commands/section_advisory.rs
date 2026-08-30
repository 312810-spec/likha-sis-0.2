use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::section_advisory::{
    self, AssignAdviserOutcome, EndAdvisoryOutcome, SectionAdvisory,
};

/// `section_id`/`teacher_user_id` are client-supplied the same
/// legitimate way `create_teaching_assignment`'s equivalents already
/// are -- `section_advisory::assign` verifies each resolves within the
/// caller's own school before writing. School-Head-only, gated by its
/// own `ManageSectionAdvisories` capability (see that variant's doc
/// comment for why this is not folded into `ManageTeachingAssignments`).
#[tauri::command]
pub fn assign_section_adviser(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    teacher_user_id: String,
    starts_on: String,
) -> AppResult<AssignAdviserOutcome> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageSectionAdvisories)?;
    section_advisory::assign(&conn, &school_id, &section_id, &teacher_user_id, &starts_on)
}

#[tauri::command]
pub fn end_section_adviser(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    advisory_id: String,
    ends_on: String,
) -> AppResult<EndAdvisoryOutcome> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageSectionAdvisories)?;
    section_advisory::end(&conn, &school_id, &section_id, &advisory_id, &ends_on)
}

/// Reference data any authenticated school member may read -- matching
/// this codebase's established convention that section-level
/// information (who teaches it, who advises it) is generally viewable
/// within one's own school without a dedicated capability (e.g.
/// `list_teaching_assignments_by_section`).
#[tauri::command]
pub fn current_section_adviser(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Option<SectionAdvisory>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_advisory::current_adviser_for_section(&conn, &school_id, &section_id, &as_of_date)
}
