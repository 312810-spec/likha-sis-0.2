use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::schedule_meeting::{self, CreateMeetingOutcome, ScheduleMeeting};
use crate::repository::teaching_assignment::{
    self, TeacherLoad, TeachingAssignment, TeachingAssignmentDetail,
};

/// `section_id`/`subject_id`/`teacher_user_id` are client-supplied the
/// same legitimate way every other referenced id already is in this
/// codebase (`class_record::create`'s section/subject/grading-period
/// ids, `create_learner`'s school-derived scope) -- `teaching_assignment::create`
/// verifies each resolves within the caller's own school before writing.
/// `school_id` comes only from the session, gated by the School-Head-only
/// `ManageTeachingAssignments` capability.
#[tauri::command]
pub fn create_teaching_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
    section_id: String,
    subject_id: String,
) -> AppResult<Option<TeachingAssignment>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::create(&conn, &school_id, &teacher_user_id, &section_id, &subject_id)
}

/// Removes any existing assignment for `(section_id, subject_id)` and
/// creates a new one for `new_teacher_user_id` -- an explicit
/// reassignment, never a silent overwrite (see
/// `teaching_assignment::replace_teacher`'s doc comment).
#[tauri::command]
pub fn replace_teacher_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    subject_id: String,
    new_teacher_user_id: String,
) -> AppResult<Option<TeachingAssignment>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::replace_teacher(&conn, &school_id, &section_id, &subject_id, &new_teacher_user_id)
}

#[tauri::command]
pub fn remove_teaching_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::remove(&conn, &school_id, &id)
}

/// Reference data any authenticated school member may read -- matching
/// this codebase's established convention that section/subject/roster
/// information is generally viewable within one's own school without a
/// dedicated capability (e.g. `list_learners_by_school`).
#[tauri::command]
pub fn list_teaching_assignments_by_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    teaching_assignment::list_by_section_in_school(&conn, &school_id, &section_id)
}

/// A teacher may always list their own assignments; listing another
/// teacher's requires `auth::authorize_view_teacher_load`'s School-Head
/// check (same rule, reused here rather than a second gate function).
#[tauri::command]
pub fn list_teacher_assignments(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_view_teacher_load(&conn, &sessions, &teacher_user_id)?;
    teaching_assignment::list_by_teacher_in_school(&conn, &school_id, &teacher_user_id)
}

/// See `auth::authorize_view_teacher_load`'s doc comment: self, or a
/// School Head viewing a colleague within the same school.
#[tauri::command]
pub fn get_teacher_load(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
) -> AppResult<TeacherLoad> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_view_teacher_load(&conn, &sessions, &teacher_user_id)?;
    teaching_assignment::teacher_load(&conn, &school_id, &teacher_user_id)
}

/// `weekday`/`starts_at`/`ends_at`/`room` are client-supplied;
/// `teaching_assignment::create`'s own conflict checks (teacher, section,
/// room) run before any write -- see `CreateMeetingOutcome`'s doc
/// comment for why this returns a specific reason rather than the
/// codebase's usual collapsed-`None` convention.
#[tauri::command]
pub fn create_schedule_meeting(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    weekday: i64,
    starts_at: String,
    ends_at: String,
    room: Option<String>,
) -> AppResult<CreateMeetingOutcome> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    schedule_meeting::create(
        &conn,
        &school_id,
        &teaching_assignment_id,
        weekday,
        &starts_at,
        &ends_at,
        room.as_deref(),
    )
}

#[tauri::command]
pub fn list_schedule_meetings_by_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<ScheduleMeeting>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    schedule_meeting::list_by_assignment_in_school(&conn, &school_id, &teaching_assignment_id)
}
