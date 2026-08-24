use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::section::{self, Section};
use crate::repository::section_membership::{self, SectionMembership, SectionRosterMember};

/// `school_id` is derived from the session, never a parameter — same
/// convention as `commands::learner::list_learners_by_school`.
#[tauri::command]
pub fn list_sections_by_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<Section>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section::list_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn create_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    grade_level: String,
    name: String,
) -> AppResult<Section> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section::create(&conn, &school_id, &school_year, &grade_level, &name)
}

/// `section_id`/`learner_id` identify WHAT and WHO; `school_id` still comes
/// only from the session. Returns `None`, not an error, when either id
/// doesn't resolve within the caller's own school — see
/// `repository::section_membership::enroll`'s doc comment.
#[tauri::command]
pub fn enroll_learner_in_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    starts_on: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::enroll(&conn, &school_id, &section_id, &learner_id, &starts_on)
}

/// `section_id` is client-supplied the same way `learner_id` already is
/// elsewhere — isolation holds because
/// `repository::section_membership::roster_for_section` scopes its query by
/// `school_id` AND `section_id` together, so a `section_id` from another
/// school returns an empty roster rather than leaking rows.
#[tauri::command]
pub fn section_roster(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<SectionRosterMember>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::roster_for_section(&conn, &school_id, &section_id, &as_of_date)
}
