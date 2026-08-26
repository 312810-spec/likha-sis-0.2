use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
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

/// Gated by `ManageTeachingAssignments` -- defining what sections/classes
/// exist for a school year is a structural scheduling-authority decision,
/// the same domain `docs/adr/0039-teacher-load-class-schedule-foundation.md`
/// already scoped to School Head only, not `ManageLearners` (which governs
/// an individual learner's own record/enrollment, a Registrar's
/// operational job rather than a School Head's structural one). Previously
/// ungated beyond an active session (any role) -- closed as a real
/// authorization gap found during Wave 2A, fixed in Wave 2A.1. See
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[tauri::command]
pub fn create_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    school_year: String,
    grade_level: String,
    name: String,
) -> AppResult<Section> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    section::create(&conn, &school_id, &school_year, &grade_level, &name)
}

/// `section_id`/`learner_id` identify WHAT and WHO; `school_id` still comes
/// only from the session. Returns `None`, not an error, when either id
/// doesn't resolve within the caller's own school — see
/// `repository::section_membership::enroll`'s doc comment. Gated by the
/// same `ManageLearners` capability as `create_learner`/`update_learner` --
/// enrolling/transferring a learner is "manage learners," not a separate
/// capability (matches `update_learner`'s own established convention).
/// Previously ungated beyond an active session (any role) -- closed as a
/// real authorization gap during Wave 2A, see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[tauri::command]
pub fn enroll_learner_in_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    starts_on: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
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

/// A learner's full enrollment (section-placement) history -- ungated
/// beyond an active session, matching `commands::learner::get_learner`'s
/// existing "reads stay open, writes are capability-gated" convention.
#[tauri::command]
pub fn list_learner_enrollment_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Vec<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::list_by_learner_in_school(&conn, &school_id, &learner_id)
}

/// A learner's current (still-open) section placement, if any -- see
/// `repository::section_membership::current_membership_for_learner_in_school`'s
/// doc comment for why this is derived, not a stored flag.
#[tauri::command]
pub fn get_current_enrollment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Option<SectionMembership>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    section_membership::current_membership_for_learner_in_school(&conn, &school_id, &learner_id)
}
