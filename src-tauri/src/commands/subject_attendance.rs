use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::subject_attendance::{
    self, AdviserAttendanceOverview, EntryStatus, RecordEntryOutcome, SubjectAttendanceMonitor,
    SubjectAttendanceRosterRow, SubjectAttendanceSession,
};

/// Every assignment-owned command in this file gates on
/// `subject_attendance::authorize_own_assignment` -- the caller must be
/// exactly the teacher on `teaching_assignment_id`, matching
/// `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s "only for subject-section
/// assignments they are authorized to teach" rule. This is deliberately
/// NOT `Capability::ManageLearners`/`ManageTeachingAssignments` -- those
/// gate a role across the whole school; this gates one specific
/// assignment, the same shape `auth::authorize_view_teacher_load`
/// already uses for "self." Adviser/School-Head access is a separate
/// read-only command at the bottom of this file, gated by
/// `authorize_adviser_of_section`; it never shares or weakens this
/// assignment-owner write boundary.
#[tauri::command]
pub fn open_subject_attendance_session(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_date: String,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::open_or_get_session(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &session_date,
        &user_id,
    )
}

#[tauri::command]
pub fn mark_subject_attendance_no_class(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_date: String,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::mark_no_class(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &session_date,
        &user_id,
    )
}

/// `teaching_assignment_id` is required alongside `session_id` purely for
/// authorization -- `session_id` alone cannot be checked against "does
/// the caller own this" without first resolving which assignment it
/// belongs to, and resolving it from an unauthenticated read would leak
/// whether a given `session_id` exists at all. Re-checking after
/// resolving the session (below) confirms the two actually correspond,
/// so a caller cannot pass a real assignment they own alongside a
/// `session_id` belonging to a different one.
#[tauri::command]
pub fn record_subject_attendance_entry(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
    membership_id: String,
    status: EntryStatus,
    note: Option<String>,
) -> AppResult<RecordEntryOutcome> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Err(crate::error::AppError::Unauthorized);
        }
    }
    subject_attendance::record_entry(
        &conn,
        &school_id,
        &session_id,
        &membership_id,
        status,
        note.as_deref(),
        &user_id,
    )
}

#[tauri::command]
pub fn mark_subject_attendance_all_present(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Err(crate::error::AppError::Unauthorized);
        }
    }
    subject_attendance::mark_all_present(&conn, &school_id, &session_id, &user_id)
}

#[tauri::command]
pub fn subject_attendance_roster_for_session(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Ok(None);
        }
    }
    subject_attendance::roster_for_session(&conn, &school_id, &session_id)
}

#[tauri::command]
pub fn list_subject_attendance_sessions(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::list_sessions_for_assignment(&conn, &school_id, &teaching_assignment_id)
}

/// Subject Monitor -- `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s
/// per-learner attendance report for one teaching assignment. Reuses
/// `authorize_own_assignment` unchanged: this is a reporting view over
/// data the caller already owns, not a new authorization shape. Adviser
/// View uses a separate section-wide read model and gate below; this
/// command remains strictly the subject teacher's own monitor.
#[tauri::command]
pub fn subject_attendance_monitor(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    as_of_date: String,
) -> AppResult<Option<SubjectAttendanceMonitor>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::monitor_for_assignment(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &as_of_date,
    )
}

/// Adviser View -- read-only Subject Attendance signals across one
/// advisory section. The Wave 3E gate is the trusted boundary: active
/// section advisers and School Heads pass; another teacher and every
/// cross-school id fail closed. No write function is reachable here.
#[tauri::command]
pub fn adviser_subject_attendance_overview(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Option<AdviserAttendanceOverview>> {
    let conn = lock_db(&db);
    let (_, school_id) =
        crate::auth::authorize_adviser_of_section(&conn, &sessions, &section_id, &as_of_date)?;
    subject_attendance::adviser_overview_for_section(&conn, &school_id, &section_id, &as_of_date)
}
