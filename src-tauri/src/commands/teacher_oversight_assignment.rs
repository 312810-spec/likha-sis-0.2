//! Tauri command surface for Teacher Oversight Assignment (Batch 17).
//! Mirrors `commands::section_advisory` exactly: School-Head-only
//! assign/end, gated by this domain's own `ManageTeacherOversightAssignments`
//! capability (see that variant's doc comment for why it is not folded
//! into `ManageTeachingAssignments`/`ManageSectionAdvisories`).

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::teacher_oversight_assignment::{
    self, AssignOversightOutcome, EndOversightOutcome, TeacherOversightAssignment,
};

/// `master_teacher_user_id`/`teacher_user_id` are client-supplied the
/// same legitimate way `assign_section_adviser`'s equivalents already
/// are -- `teacher_oversight_assignment::assign` verifies each resolves
/// within the caller's own school (and that `master_teacher_user_id`
/// actually holds the `master_teacher` role) before writing.
#[tauri::command]
pub fn assign_teacher_oversight(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    master_teacher_user_id: String,
    teacher_user_id: String,
    starts_on: String,
) -> AppResult<AssignOversightOutcome> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageTeacherOversightAssignments,
    )?;
    teacher_oversight_assignment::assign(
        &conn,
        &school_id,
        &master_teacher_user_id,
        &teacher_user_id,
        &starts_on,
    )
}

/// Ends an open oversight assignment. Reassignment is "end the old one,
/// then assign a new one" -- the same two-call shape
/// `section_advisory`'s own assign/end pair already establishes, not a
/// separate "reassign" command.
#[tauri::command]
pub fn end_teacher_oversight(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
    assignment_id: String,
    ends_on: String,
) -> AppResult<EndOversightOutcome> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageTeacherOversightAssignments,
    )?;
    teacher_oversight_assignment::end(
        &conn,
        &school_id,
        &teacher_user_id,
        &assignment_id,
        &ends_on,
    )
}

/// Reference data any authenticated school member may read -- matching
/// `current_section_adviser`'s own no-dedicated-capability read
/// convention.
#[tauri::command]
pub fn current_teacher_overseer(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
    as_of_date: String,
) -> AppResult<Option<TeacherOversightAssignment>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    teacher_oversight_assignment::current_overseer_for_teacher(
        &conn,
        &school_id,
        &teacher_user_id,
        &as_of_date,
    )
}

/// The School-Head-facing management screen's full list -- gated by the
/// same capability as assign/end, since seeing who oversees whom is part
/// of the same administrative authority.
#[tauri::command]
pub fn list_teacher_oversight_assignments(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<TeacherOversightAssignment>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageTeacherOversightAssignments,
    )?;
    teacher_oversight_assignment::list_for_school(&conn, &school_id)
}

/// A Master Teacher's own review-queue scope: every teacher they
/// currently oversee, in their own school. Any authenticated member may
/// call this -- it simply returns an empty list for someone who is not
/// currently overseeing anyone, matching `list_adviser_view_sections`'s
/// own no-dedicated-capability convention for a self-scoped read.
#[tauri::command]
pub fn list_teachers_i_oversee(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    as_of_date: String,
) -> AppResult<Vec<TeacherOversightAssignment>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    teacher_oversight_assignment::list_teachers_overseen_by(
        &conn,
        &school_id,
        &user_id,
        &as_of_date,
    )
}
