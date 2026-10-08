//! CTOS M09 — the Teacher Load Maker's command surface.
//!
//! Every write is gated by the School-Head-only
//! `ManageTeachingAssignments` capability — the same one the manual
//! teaching-assignment screens already use, because publishing a
//! timetable is the same authority class as assigning a teacher. Reads
//! are open to any authenticated member of the school: a teacher
//! looking at the published plan is reading their own schedule.
//!
//! `school_id` is *always* resolved from the session at the trusted
//! boundary, never taken from the client; every id the client does send
//! is re-verified as belonging to that school by the repository layer it
//! is handed to.

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::schedule_plan::{
    self, PlanPlacement, PublishOutcome, PublishedViews, SchedulePlan,
};
use crate::repository::scheduling_inputs::{
    self, ScheduleRoom, ScheduleSettings, ScheduleSettingsUpdate, SubjectScheduleRequirement,
    TeacherUnavailability,
};
use crate::scheduling::check::Violation;
use crate::scheduling::pipeline::{self, GenerationResponse};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::State;
/// The school's bell grid and workload limits — Prepare.
#[tauri::command]
pub fn get_schedule_settings(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<ScheduleSettings> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    scheduling_inputs::ensure(&conn, &school_id)
}

#[tauri::command]
pub fn update_schedule_settings(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    update: ScheduleSettingsUpdate,
) -> AppResult<ScheduleSettings> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::update(
        &conn,
        &school_id,
        &update.day_starts_at,
        &update.day_ends_at,
        update.school_days,
        update.period_minutes,
        update.passing_minutes,
        update.max_daily_teaching_minutes,
        update.max_weekly_teaching_minutes,
    )
}

/// The windows a teacher is not available for classroom teaching —
/// ancillary duties, meetings, the daily-time problem the Mandaue
/// research names first.
#[tauri::command]
pub fn list_teacher_unavailability(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<TeacherUnavailability>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    scheduling_inputs::list_unavailability_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn add_teacher_unavailability(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
    weekday: i64,
    starts_at: String,
    ends_at: String,
    reason: Option<String>,
) -> AppResult<TeacherUnavailability> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::add_unavailability(
        &conn,
        &school_id,
        &teacher_user_id,
        weekday,
        &starts_at,
        &ends_at,
        reason.as_deref(),
    )
}

#[tauri::command]
pub fn remove_teacher_unavailability(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::remove_unavailability(&conn, &school_id, &id)
}

/// The rooms and labs a school can schedule classes into.
#[tauri::command]
pub fn list_schedule_rooms(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<ScheduleRoom>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    scheduling_inputs::list_rooms_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn create_schedule_room(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    name: String,
    is_lab: bool,
) -> AppResult<ScheduleRoom> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::create_room(&conn, &school_id, &name, is_lab)
}

#[tauri::command]
pub fn remove_schedule_room(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::remove_room(&conn, &school_id, &id)
}

/// Each subject's weekly minutes requirement. Kept on a local table
/// rather than a column on `subjects` because `subjects` is a synced
/// entity and an unsynced column would silently fail to propagate to a
/// teacher's device.
#[tauri::command]
pub fn list_subject_schedule_requirements(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SubjectScheduleRequirement>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    scheduling_inputs::list_requirements_by_school(&conn, &school_id)
}

#[tauri::command]
pub fn set_subject_schedule_requirement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    subject_id: String,
    required_weekly_minutes: i64,
) -> AppResult<SubjectScheduleRequirement> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    scheduling_inputs::set_requirement(&conn, &school_id, &subject_id, required_weekly_minutes)
}

/// Generate — Prepare, Confirm, Lock and Generate in one call. Loads
/// every constraint input, fingerprints it into the draft, runs the
/// generator and stages its placements. Re-running replaces the draft.
#[tauri::command]
pub fn generate_schedule_plan(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<GenerationResponse> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    pipeline::generate_plan(&conn, &school_id)
}

/// The draft's placements, with the names a repair screen needs.
#[tauri::command]
pub fn list_schedule_plan_placements(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plan_id: String,
) -> AppResult<Vec<PlanPlacement>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    schedule_plan::list_placements(&conn, &school_id, &plan_id)
}

/// Repair — move one placement to a slot a human chooses.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn move_schedule_plan_placement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plan_id: String,
    placement_id: String,
    weekday: i64,
    starts_at: String,
    ends_at: String,
    room: Option<String>,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    schedule_plan::move_placement(
        &conn,
        &school_id,
        &plan_id,
        &placement_id,
        weekday,
        &starts_at,
        &ends_at,
        room.as_deref(),
    )
}

/// Repair — drop a placement the generator put somewhere unworkable.
#[tauri::command]
pub fn remove_schedule_plan_placement(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plan_id: String,
    placement_id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let (school_id, _) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    schedule_plan::remove_placement(&conn, &school_id, &plan_id, &placement_id)
}

/// Validate — the independent checker, run on demand. Deliberately a
/// separate command from `publish_schedule_plan` so a School Head can
/// see what is wrong *before* committing, and so the frontend can show
/// violations against a draft without implying it tried to publish.
#[tauri::command]
pub fn validate_schedule_plan(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plan_id: String,
) -> AppResult<Vec<Violation>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    crate::scheduling::check::check(&conn, &school_id, &plan_id)
}

/// Publish — Lock again, Validate independently, then go live in one
/// transaction. The outcome is reported as a value, never as an error:
/// a stale or violating plan is the workflow speaking, not a crash.
#[tauri::command]
pub fn publish_schedule_plan(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plan_id: String,
) -> AppResult<PublishOutcome> {
    let mut conn = lock_db(&db);
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    schedule_plan::publish(&mut conn, &school_id, &plan_id, &actor_user_id)
}

/// The published plan's teacher, section and room views — one revision,
/// resolved three ways.
#[tauri::command]
pub fn list_published_schedule_views(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<PublishedViews>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    schedule_plan::published_views(&conn, &school_id)
}

/// Every plan revision, newest first — superseded ones included, since
/// they record which timetable was actually live when.
#[tauri::command]
pub fn list_schedule_plans(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SchedulePlan>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    schedule_plan::list_plans(&conn, &school_id)
}

/// The school's working draft, if there is one.
#[tauri::command]
pub fn current_schedule_plan(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<SchedulePlan>> {
    let conn = lock_db(&db);
    let (school_id, _) = sessions.require_active_session(&conn)?;
    schedule_plan::current_draft(&conn, &school_id)
}
