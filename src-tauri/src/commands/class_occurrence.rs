use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::class_occurrence::{
    self, ClassOccurrence, LearnerFollowupMarker, OccurrenceOutcome,
};

/// The classroom session is always the signed-in teacher's own -- `school_id`
/// and `actor_user_id` come only from the active session, never
/// client-supplied, and every write below re-checks that the caller is the
/// teacher on `teaching_assignment_id`. `occurrence_date` is
/// client-supplied, matching this codebase's established convention for
/// "what day is it" (`open_subject_attendance_session`'s `session_date`,
/// `get_my_day_summary`'s `today_date`) -- a wall-clock fact, not tenant
/// scope or authorization data, so trusting the caller's local calendar is
/// the same non-security-sensitive choice made elsewhere.
fn authorize(
    conn: &Connection,
    sessions: &State<'_, SessionManager>,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let (user_id, school_id) = sessions.require_active_session(conn)?;
    class_occurrence::authorize_own_assignment(conn, &user_id, &school_id, teaching_assignment_id)
}

/// Opens one class for its session: starts a fresh occurrence or resumes the
/// one already in flight. Returns the full outcome so the cockpit can
/// distinguish "started" from "already open" (resume) and from a refused
/// restart of a class already delivered or cancelled.
#[tauri::command]
pub fn start_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
) -> AppResult<OccurrenceOutcome> {
    let conn = lock_db(&db);
    authorize(&conn, &sessions, &teaching_assignment_id)?;
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::start(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &occurrence_date,
        &user_id,
    )
}

/// Records what actually happened in the open class -- the real slot, the
/// learning target, quick evidence, and notes. `null` for any optional field
/// means "unchanged", which is why the target/evidence/notes are optional at
/// all: the cockpit saves a partial capture without blanking fields it was
/// not given.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn capture_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    actual_starts_at: Option<String>,
    actual_ends_at: Option<String>,
    actual_room: Option<String>,
    learning_target: Option<String>,
    quick_evidence: Option<String>,
    notes: Option<String>,
) -> AppResult<Option<ClassOccurrence>> {
    let conn = lock_db(&db);
    authorize(&conn, &sessions, &teaching_assignment_id)?;
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::capture(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &occurrence_date,
        actual_starts_at.as_deref(),
        actual_ends_at.as_deref(),
        actual_room.as_deref(),
        learning_target.as_deref(),
        quick_evidence.as_deref(),
        notes.as_deref(),
    )
}

/// Finishes the open class and writes its summary. Refused while attendance
/// has not been checked -- the outcome names which case applied, so the
/// cockpit can route the teacher to attendance rather than guess.
#[tauri::command]
pub fn finish_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    summary: String,
) -> AppResult<OccurrenceOutcome> {
    let conn = lock_db(&db);
    authorize(&conn, &sessions, &teaching_assignment_id)?;
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::finish(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &occurrence_date,
        &summary,
    )
}

/// Cancels a class. Requires a reason -- CTOS.md §5, "weather/advisory
/// information does not automatically cancel class": a cancellation is a
/// human decision and the record must say which one.
#[tauri::command]
pub fn cancel_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
    reason: String,
) -> AppResult<OccurrenceOutcome> {
    let conn = lock_db(&db);
    authorize(&conn, &sessions, &teaching_assignment_id)?;
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::cancel(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &occurrence_date,
        &reason,
        &user_id,
    )
}

/// Reopens a delivered or cancelled class so it can be corrected. Bumps
/// `revision`; the attendance entries underneath are untouched.
#[tauri::command]
pub fn reopen_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
) -> AppResult<OccurrenceOutcome> {
    let conn = lock_db(&db);
    authorize(&conn, &sessions, &teaching_assignment_id)?;
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::reopen(&conn, &school_id, &teaching_assignment_id, &occurrence_date)
}

/// The occurrence for one class on one date, or `null` -- which is the
/// honest "this class has not been started" state.
#[tauri::command]
pub fn get_class_occurrence(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    occurrence_date: String,
) -> AppResult<Option<ClassOccurrence>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::find_for_assignment_on_date(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &occurrence_date,
    )
}

/// Every recorded occurrence for one class, newest first -- the session
/// history the summary/review step reads.
#[tauri::command]
pub fn list_class_occurrences(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<ClassOccurrence>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::list_for_assignment(&conn, &school_id, &teaching_assignment_id)
}

/// Marks one learner for follow-up in this class. CTOS.md §6.1's "learner
/// follow-up due where appropriate" -- the teacher's explicit, persisted
/// decision, not a derived streak.
#[tauri::command]
pub fn mark_learner_followup(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_occurrence_id: String,
    section_membership_id: String,
    reason: String,
) -> AppResult<Option<LearnerFollowupMarker>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::mark_followup(
        &conn,
        &school_id,
        &class_occurrence_id,
        &section_membership_id,
        &reason,
        &user_id,
    )
}

/// Clears a follow-up marker without deleting it, so CTOS.md §6.4's "what
/// requires learner follow-up?" stays answerable over history.
#[tauri::command]
pub fn clear_learner_followup(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_occurrence_id: String,
    section_membership_id: String,
) -> AppResult<Option<LearnerFollowupMarker>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::clear_followup(
        &conn,
        &school_id,
        &class_occurrence_id,
        &section_membership_id,
        &user_id,
    )
}

/// Every follow-up marker on one occurrence, open and cleared alike.
#[tauri::command]
pub fn list_learner_followup_markers(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_occurrence_id: String,
) -> AppResult<Vec<LearnerFollowupMarker>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = sessions.require_active_session(&conn)?;
    class_occurrence::list_markers_for_occurrence(&conn, &school_id, &class_occurrence_id)
}
