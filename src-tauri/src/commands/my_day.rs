use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::my_day::{self, MyDaySummary};

/// "My Day" -- the signed-in teacher's own combined schedule-plus-pending
/// view. Always self, never a `teacher_user_id` parameter: unlike
/// `get_teacher_load`/`list_teacher_assignments` (which a School Head may
/// also call for a colleague via `auth::authorize_view_teacher_load`), this
/// view has no such School-Head use case in this slice's scope -- it is
/// squarely "what does *I*, the signed-in teacher, need to do today,"
/// mirroring `TeacherWorkspaceScreen`'s own always-self shape. `school_id`
/// and `teacher_user_id` both come only from the active session, per
/// `.claude/rules/architecture.md`'s tenant-scope rule -- never
/// client-supplied.
///
/// `today_weekday`/`today_date` ARE client-supplied, matching this
/// codebase's own established convention for "what day/time is it"
/// (`open_subject_attendance_session`'s `session_date`,
/// `create_schedule_meeting`'s `weekday`) -- these are wall-clock/calendar
/// facts, not tenant-scope or authorization data, so trusting the caller's
/// local clock here is the same non-security-sensitive choice this
/// codebase already makes elsewhere; this also avoids pulling in a new
/// server-side date/time crate for the sole purpose of one command.
/// `today_weekday` follows the `0 = Sunday … 6 = Saturday` convention
/// `domain/schedule-meeting.ts` established, matching JavaScript's
/// `Date.prototype.getDay()`, which is exactly what the frontend already
/// computes for `TodaysClassesScreen`.
#[tauri::command]
pub fn get_my_day_summary(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    today_weekday: i64,
    today_date: String,
) -> AppResult<MyDaySummary> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    my_day::summary_for_teacher(&conn, &school_id, &user_id, today_weekday, &today_date)
}
