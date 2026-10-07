use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{lesson_plan, schedule_meeting, subject_attendance, teaching_assignment};

/// The four states M06's acceptance clause names. Every one is stored, not
/// derived, so a caller reading a row can never collapse two of them by
/// choosing the wrong join.
///
/// The distinction this enum exists to preserve is CTOS.md §5's
/// "assignment ≠ planned meeting ≠ actual class occurrence", plus §6.3's
/// "scheduled class / changed/cancelled class / actual delivered occurrence".
/// `schedule_meetings` is the planned meeting; this row is the actual
/// occurrence, and these four states are the occurrence's own states --
/// nothing here is a statement about the recurring plan, which M09 owns.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum OccurrenceStatus {
    /// Opened and still on its recurring slot -- no actual slot recorded yet,
    /// or the recorded actual slot matches the plan exactly.
    Planned,
    /// An actual slot is recorded and it does not match the recurring plan --
    /// including the case where no plan row existed at all (an off-schedule
    /// class). The class is still expected to happen or has happened, but it
    /// is not the class the schedule described.
    Changed,
    /// The class did not occur. Requires a non-empty reason: CTOS.md §5,
    /// "weather/advisory information does not automatically cancel class".
    Cancelled,
    /// The class occurred and the teacher finished it.
    Delivered,
}

impl OccurrenceStatus {
    pub fn as_db_str(self) -> &'static str {
        match self {
            OccurrenceStatus::Planned => "planned",
            OccurrenceStatus::Changed => "changed",
            OccurrenceStatus::Cancelled => "cancelled",
            OccurrenceStatus::Delivered => "delivered",
        }
    }

    fn from_db_str(s: &str) -> rusqlite::Result<OccurrenceStatus> {
        match s {
            "planned" => Ok(OccurrenceStatus::Planned),
            "changed" => Ok(OccurrenceStatus::Changed),
            "cancelled" => Ok(OccurrenceStatus::Cancelled),
            "delivered" => Ok(OccurrenceStatus::Delivered),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unrecognized class_occurrences.status: {other}").into(),
            )),
        }
    }
}

/// Every reason a start/finish/cancel/reopen call can decline. Distinct
/// rather than collapsed to `Option<None>` because these are a teacher's own
/// class occurrences within their own school -- the codebase's
/// cross-school "collapse reasons to avoid leaking tenant boundaries" rule
/// does not apply here, and the classroom flow needs to say exactly what is
/// wrong (see `schedule_meeting::CreateMeetingOutcome` for the same call).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "outcome", content = "occurrence", rename_all = "camelCase")]
pub enum OccurrenceOutcome {
    /// `start` created the occurrence.
    Started(ClassOccurrence),
    /// `finish`/`cancel`/`reopen` changed an existing one.
    Updated(ClassOccurrence),
    /// `start` found an occurrence already in flight; the caller resumes it.
    AlreadyOpen(ClassOccurrence),
    /// The caller is not the teacher on this assignment.
    NotYourClass,
    /// `teaching_assignment_id` does not resolve within `school_id`.
    UnknownAssignment,
    /// `occurrence_date` was not a real ISO `YYYY-MM-DD` calendar date.
    InvalidDate,
    /// A `delivered` occurrence was already confirmed for this class and
    /// date. It must be reopened explicitly; it is never silently rewritten.
    AlreadyDelivered,
    /// A `cancelled` occurrence already exists for this class and date.
    AlreadyCancelled,
    /// `finish`/`reopen` was called on an occurrence that was never started.
    NotStarted,
    /// `finish` was called on a cancelled occurrence; it must be reopened
    /// first.
    CancelledCannotFinish,
    /// `cancel` was called without a reason, or with an empty/whitespace one.
    CancelRequiresReason,
    /// `finish` was called on a class whose attendance has not been checked
    /// at all. Attendance is its own record (ADR-0055) and a separate one,
    /// but a delivered occurrence is the teacher's confirmation the class
    /// happened -- confirming a class nobody was marked for would let
    /// "delivered" mean nothing.
    AttendanceNotChecked,
}

/// One actual class occurrence: the third term of CTOS.md §5's scheduling
/// invariant. Mirrors `ClassOccurrence` on the TypeScript side exactly.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClassOccurrence {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub occurrence_date: String,
    pub status: OccurrenceStatus,
    pub planned_starts_at: Option<String>,
    pub planned_ends_at: Option<String>,
    pub planned_room: Option<String>,
    pub actual_starts_at: Option<String>,
    pub actual_ends_at: Option<String>,
    pub actual_room: Option<String>,
    pub learning_target: String,
    pub quick_evidence: String,
    pub notes: String,
    pub summary: String,
    pub cancelled_reason: String,
    pub started_at: Option<String>,
    pub finished_at: Option<String>,
    pub cancelled_at: Option<String>,
    pub revision: i64,
    pub created_by_user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

/// One persisted follow-up marker on one enrollment for one occurrence.
/// Cleared, never deleted, so CTOS.md §6.4's "what requires learner
/// follow-up?" can be answered over history rather than only right now.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct LearnerFollowupMarker {
    pub id: String,
    pub school_id: String,
    pub class_occurrence_id: String,
    pub section_membership_id: String,
    pub reason: String,
    /// `Some` once a teacher cleared the marker; `None` while it stands.
    pub cleared_at: Option<String>,
    pub marked_by_user_id: String,
    pub marked_at: String,
}

/// The recurring-plan snapshot for one date: `(starts_at, ends_at, room)`.
type PlannedSlot = (Option<String>, Option<String>, Option<String>);

fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let all_digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    if !(all_digits(0..4) && all_digits(5..7) && all_digits(8..10)) {
        return false;
    }
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

/// Every timestamp this module writes is generated by SQLite itself, with
/// the same `strftime('%Y-%m-%dT%H:%M:%fZ', 'now')` expression the schema's
/// own column defaults use -- this codebase has no Rust clock dependency,
/// and every row is re-read after it is written, so the value returned to a
/// caller is always the database's, never a Rust-side reconstruction of it.
fn row_to_occurrence(row: &rusqlite::Row) -> rusqlite::Result<ClassOccurrence> {
    Ok(ClassOccurrence {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        occurrence_date: row.get(3)?,
        status: OccurrenceStatus::from_db_str(&row.get::<_, String>(4)?)?,
        planned_starts_at: row.get(5)?,
        planned_ends_at: row.get(6)?,
        planned_room: row.get(7)?,
        actual_starts_at: row.get(8)?,
        actual_ends_at: row.get(9)?,
        actual_room: row.get(10)?,
        learning_target: row.get(11)?,
        quick_evidence: row.get(12)?,
        notes: row.get(13)?,
        summary: row.get(14)?,
        cancelled_reason: row.get(15)?,
        started_at: row.get(16)?,
        finished_at: row.get(17)?,
        cancelled_at: row.get(18)?,
        revision: row.get(19)?,
        created_by_user_id: row.get(20)?,
        created_at: row.get(21)?,
        updated_at: row.get(22)?,
    })
}

const OCCURRENCE_SELECT: &str = "SELECT id, school_id, teaching_assignment_id, \
     occurrence_date, status, planned_starts_at, planned_ends_at, planned_room, \
     actual_starts_at, actual_ends_at, actual_room, learning_target, quick_evidence, \
     notes, summary, cancelled_reason, started_at, finished_at, cancelled_at, \
     revision, created_by_user_id, created_at, updated_at \
     FROM class_occurrences";

fn row_to_marker(row: &rusqlite::Row) -> rusqlite::Result<LearnerFollowupMarker> {
    Ok(LearnerFollowupMarker {
        id: row.get(0)?,
        school_id: row.get(1)?,
        class_occurrence_id: row.get(2)?,
        section_membership_id: row.get(3)?,
        reason: row.get(4)?,
        cleared_at: row.get(5)?,
        marked_by_user_id: row.get(6)?,
        marked_at: row.get(7)?,
    })
}

const MARKER_SELECT: &str = "SELECT id, school_id, class_occurrence_id, \
     section_membership_id, reason, cleared_at, marked_by_user_id, marked_at \
     FROM learner_followup_markers";

/// The caller must be exactly the teacher on `teaching_assignment_id` --
/// mirroring `subject_attendance::authorize_own_assignment`. Classroom Mode
/// is the teacher's own cockpit; there is no School-Head view of another
/// teacher's live class in this milestone.
pub fn authorize_own_assignment(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let assignment =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
            .ok_or(AppError::Unauthorized)?;
    if assignment.teacher_user_id != user_id {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

/// The weekday for one ISO date, in the `0 = Sunday … 6 = Saturday`
/// convention `domain/schedule-meeting.ts` established (matching JavaScript's
/// `Date.prototype.getDay()`). Used to find the recurring-plan slot this
/// occurrence was scheduled from. Kept local rather than pulling in a
/// date crate for one arithmetic call, matching the codebase's own stated
/// preference for wall-clock/calendar facts (see `commands::my_day`).
fn weekday_for(date: &str) -> Option<i64> {
    if !is_iso_date(date) {
        return None;
    }
    let year: i64 = date[0..4].parse().ok()?;
    let month: i64 = date[5..7].parse().ok()?;
    let day: i64 = date[8..10].parse().ok()?;
    // Zeller's congruence (Saturday=0 form), shifted so Sunday is 0.
    let (y, m) = if month < 3 {
        (year - 1, month + 12)
    } else {
        (year, month)
    };
    let k = y % 100;
    let j = y / 100;
    let h = (day + (13 * (m + 1)) / 5 + k + k / 4 + j / 4 + 5 * j) % 7;
    // Zeller returns 0 = Saturday … 6 = Friday; shift to 0 = Sunday.
    Some((h + 6) % 7)
}

/// The recurring slot this date falls on, or `(None, None, None)` when the
/// schedule has no meeting for that weekday at all.
fn find_planned_slot(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
) -> AppResult<PlannedSlot> {
    let Some(weekday) = weekday_for(occurrence_date) else {
        return Ok((None, None, None));
    };
    let slot =
        schedule_meeting::list_by_assignment_in_school(conn, school_id, teaching_assignment_id)?
            .into_iter()
            .find(|meeting| meeting.weekday == weekday);
    Ok((
        slot.as_ref().map(|m| m.starts_at.clone()),
        slot.as_ref().map(|m| m.ends_at.clone()),
        slot.and_then(|m| m.room),
    ))
}

/// True when the occurrence carries actual detail that differs from the plan
/// it was scheduled from. A class recorded with no plan row at all counts as
/// deviating: the schedule did not describe it, which is exactly the
/// "changed" state the acceptance clause requires to stay visible. An
/// occurrence with no actual detail recorded at all does not deviate -- it
/// is still on its plan.
fn deviates_from_plan(occurrence: &ClassOccurrence) -> bool {
    let nothing_recorded = occurrence.actual_starts_at.is_none()
        && occurrence.actual_ends_at.is_none()
        && occurrence.actual_room.is_none();
    if nothing_recorded {
        return false;
    }
    let Some(plan_start) = &occurrence.planned_starts_at else {
        // No recurring slot existed; any recorded detail is off-schedule.
        return true;
    };
    occurrence.actual_starts_at.as_deref() != Some(plan_start.as_str())
        || occurrence.actual_ends_at.as_deref() != occurrence.planned_ends_at.as_deref()
        || occurrence.actual_room != occurrence.planned_room
}

/// Starts (or resumes) one class occurrence for one assignment on one date.
/// Idempotent per `(teaching_assignment_id, occurrence_date)`: a second call
/// returns the existing in-flight occurrence as `AlreadyOpen` rather than
/// creating a duplicate or resetting captured work. A `delivered` or
/// `cancelled` occurrence is never silently reopened -- `AlreadyDelivered` /
/// `AlreadyCancelled` force an explicit `reopen` so a confirmed class is not
/// rewritten by accident, mirroring `subject_attendance`'s own refusal to
/// overwrite a `Held` session.
pub fn start(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
    actor_user_id: &str,
) -> AppResult<OccurrenceOutcome> {
    if !is_iso_date(occurrence_date) {
        return Ok(OccurrenceOutcome::InvalidDate);
    }
    if teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?.is_none()
    {
        return Ok(OccurrenceOutcome::UnknownAssignment);
    }
    if let Some(existing) =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
    {
        return Ok(match existing.status {
            OccurrenceStatus::Delivered => OccurrenceOutcome::AlreadyDelivered,
            OccurrenceStatus::Cancelled => OccurrenceOutcome::AlreadyCancelled,
            OccurrenceStatus::Planned | OccurrenceStatus::Changed => {
                OccurrenceOutcome::AlreadyOpen(existing)
            }
        });
    }

    // Snapshot the recurring plan as it stands right now. A later schedule
    // edit must not rewrite what this occurrence was planned as; the
    // versioned/effective-dated schedule is M09's scope, and a snapshot is
    // the honest minimum until then.
    let (planned_starts_at, planned_ends_at, planned_room) =
        find_planned_slot(conn, school_id, teaching_assignment_id, occurrence_date)?;

    // Seed the learning target from today's lesson plan for this class, if
    // one has been authored -- a snapshot, not a join: the plan can be edited
    // later, and this occurrence records what was targeted in *this* class.
    let learning_target = lesson_plan::find_by_assignment_and_date(
        conn,
        school_id,
        teaching_assignment_id,
        occurrence_date,
    )?
    .map(|plan| {
        if plan.learning_competency_code.trim().is_empty() {
            plan.learning_competency
        } else {
            format!(
                "{} ({})",
                plan.learning_competency, plan.learning_competency_code
            )
        }
    })
    .unwrap_or_default();

    conn.execute(
        "INSERT INTO class_occurrences \
             (id, school_id, teaching_assignment_id, occurrence_date, status, \
              planned_starts_at, planned_ends_at, planned_room, \
              learning_target, started_at, created_by_user_id, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?10, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))",
        params![
            Uuid::now_v7().to_string(),
            school_id,
            teaching_assignment_id,
            occurrence_date,
            OccurrenceStatus::Planned.as_db_str(),
            planned_starts_at,
            planned_ends_at,
            planned_room,
            &learning_target,
            actor_user_id,
        ],
    )?;

    let occurrence =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
            .ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))?;
    Ok(OccurrenceOutcome::Started(occurrence))
}

/// Records what actually happened for one in-flight occurrence: the real
/// slot, the learning target, quick evidence, and notes. Writing an actual
/// slot that differs from the plan moves the occurrence to `changed`, which
/// is what keeps "changed" and "planned" distinguishable after the fact.
/// `Ok(None)` when no occurrence exists for this class and date.
#[allow(clippy::too_many_arguments)]
pub fn capture(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
    actual_starts_at: Option<&str>,
    actual_ends_at: Option<&str>,
    actual_room: Option<&str>,
    learning_target: Option<&str>,
    quick_evidence: Option<&str>,
    notes: Option<&str>,
) -> AppResult<Option<ClassOccurrence>> {
    let Some(occurrence) =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
    else {
        return Ok(None);
    };
    if matches!(occurrence.status, OccurrenceStatus::Cancelled) {
        return Ok(Some(occurrence));
    }

    let mut updated = occurrence;
    updated.actual_starts_at = actual_starts_at.map(str::to_string);
    updated.actual_ends_at = actual_ends_at.map(str::to_string);
    updated.actual_room = actual_room.map(str::to_string);
    if let Some(target) = learning_target {
        updated.learning_target = target.to_string();
    }
    if let Some(evidence) = quick_evidence {
        updated.quick_evidence = evidence.to_string();
    }
    if let Some(notes_text) = notes {
        updated.notes = notes_text.to_string();
    }
    updated.status = if deviates_from_plan(&updated) {
        OccurrenceStatus::Changed
    } else {
        OccurrenceStatus::Planned
    };

    conn.execute(
        "UPDATE class_occurrences \
         SET actual_starts_at = ?1, actual_ends_at = ?2, actual_room = ?3, \
             learning_target = ?4, quick_evidence = ?5, notes = ?6, \
             status = ?7, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?8 AND id = ?9",
        params![
            &updated.actual_starts_at,
            &updated.actual_ends_at,
            &updated.actual_room,
            &updated.learning_target,
            &updated.quick_evidence,
            &updated.notes,
            updated.status.as_db_str(),
            school_id,
            &updated.id,
        ],
    )?;

    find_by_id_in_school(conn, school_id, &updated.id)
}

/// Finishes an in-flight occurrence, writing the session summary. `delivered`
/// is the teacher's confirmation the class happened, so it is refused while
/// attendance has not been checked at all -- confirming a class nobody was
/// marked for would let "delivered" mean nothing. An occurrence that was
/// never started cannot be finished, and a cancelled one cannot be finished
/// without first reopening it.
pub fn finish(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
    summary: &str,
) -> AppResult<OccurrenceOutcome> {
    let Some(occurrence) =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
    else {
        return Ok(OccurrenceOutcome::NotStarted);
    };
    match occurrence.status {
        OccurrenceStatus::Cancelled => return Ok(OccurrenceOutcome::CancelledCannotFinish),
        OccurrenceStatus::Delivered => return Ok(OccurrenceOutcome::AlreadyDelivered),
        OccurrenceStatus::Planned | OccurrenceStatus::Changed => {}
    }

    if !attendance_is_settled(conn, school_id, &occurrence)? {
        return Ok(OccurrenceOutcome::AttendanceNotChecked);
    }

    conn.execute(
        "UPDATE class_occurrences \
         SET status = ?1, summary = ?2, finished_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?3 AND id = ?4",
        params![
            OccurrenceStatus::Delivered.as_db_str(),
            summary,
            school_id,
            &occurrence.id,
        ],
    )?;

    let delivered = find_by_id_in_school(conn, school_id, &occurrence.id)?
        .ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))?;
    Ok(OccurrenceOutcome::Updated(delivered))
}

/// True when attendance for this class and date has been decided one way or
/// the other. An explicit `no_class` decision is itself a completed
/// attendance decision. A `held` session needs at least one recorded entry
/// -- unless the section had nobody on the roster that day, in which case
/// there was nobody to mark and an empty session is not a gap.
fn attendance_is_settled(
    conn: &Connection,
    school_id: &str,
    occurrence: &ClassOccurrence,
) -> AppResult<bool> {
    let Some(session) = subject_attendance::find_session_for_assignment_on_date(
        conn,
        school_id,
        &occurrence.teaching_assignment_id,
        &occurrence.occurrence_date,
    )?
    else {
        return Ok(false);
    };
    match session.status {
        subject_attendance::SessionStatus::NoClass => Ok(true),
        subject_attendance::SessionStatus::Held => {
            if subject_attendance::count_entries_for_session(conn, &session.id)? > 0 {
                return Ok(true);
            }
            let roster = crate::repository::section_membership::current_roster(
                conn,
                school_id,
                &session.section_id,
                &session.session_date,
            )?;
            Ok(roster.is_empty())
        }
    }
}

/// Cancels an occurrence. Requires a non-empty reason: CTOS.md §5,
/// "weather/advisory information does not automatically cancel class" -- a
/// cancellation is a human decision and the record must say which one.
pub fn cancel(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
    reason: &str,
    actor_user_id: &str,
) -> AppResult<OccurrenceOutcome> {
    if reason.trim().is_empty() {
        return Ok(OccurrenceOutcome::CancelRequiresReason);
    }
    if !is_iso_date(occurrence_date) {
        return Ok(OccurrenceOutcome::InvalidDate);
    }
    if teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?.is_none()
    {
        return Ok(OccurrenceOutcome::UnknownAssignment);
    }

    let (planned_starts_at, planned_ends_at, planned_room) =
        find_planned_slot(conn, school_id, teaching_assignment_id, occurrence_date)?;

    // `ON CONFLICT DO UPDATE` rather than `DO NOTHING`: cancelling a class
    // that already has an in-flight occurrence is legitimate (the teacher
    // started it, then the class was called off), and the cancellation must
    // win rather than be swallowed. A `delivered` occurrence is still
    // protected -- the `status <> 'delivered'` guard leaves it untouched and
    // the re-read below reports `AlreadyDelivered` instead of undoing a
    // confirmed class.
    conn.execute(
        "INSERT INTO class_occurrences \
             (id, school_id, teaching_assignment_id, occurrence_date, status, \
              planned_starts_at, planned_ends_at, planned_room, \
              cancelled_reason, cancelled_at, created_by_user_id, started_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), ?10, \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT (teaching_assignment_id, occurrence_date) DO UPDATE \
             SET status = ?5, cancelled_reason = ?9, \
                 cancelled_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 finished_at = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE class_occurrences.school_id = ?2 \
           AND class_occurrences.status <> 'delivered'",
        params![
            Uuid::now_v7().to_string(),
            school_id,
            teaching_assignment_id,
            occurrence_date,
            OccurrenceStatus::Cancelled.as_db_str(),
            planned_starts_at,
            planned_ends_at,
            planned_room,
            reason,
            actor_user_id,
        ],
    )?;

    let Some(occurrence) =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
    else {
        return Ok(OccurrenceOutcome::UnknownAssignment);
    };
    if occurrence.status == OccurrenceStatus::Delivered {
        return Ok(OccurrenceOutcome::AlreadyDelivered);
    }
    Ok(OccurrenceOutcome::Updated(occurrence))
}

/// Reopens a delivered or cancelled occurrence back to its pre-terminal
/// state, bumping `revision`. The occurrence is working data, not an issued
/// record -- full amendment history is M11's scope, and the attendance
/// entries underneath are untouched and remain the real audit trail.
pub fn reopen(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
) -> AppResult<OccurrenceOutcome> {
    let Some(occurrence) =
        find_for_assignment_on_date(conn, school_id, teaching_assignment_id, occurrence_date)?
    else {
        return Ok(OccurrenceOutcome::NotStarted);
    };
    if !matches!(
        occurrence.status,
        OccurrenceStatus::Delivered | OccurrenceStatus::Cancelled
    ) {
        return Ok(OccurrenceOutcome::AlreadyOpen(occurrence));
    }

    let restored = if deviates_from_plan(&occurrence) {
        OccurrenceStatus::Changed
    } else {
        OccurrenceStatus::Planned
    };
    conn.execute(
        "UPDATE class_occurrences \
         SET status = ?1, revision = revision + 1, finished_at = NULL, cancelled_at = NULL, \
             cancelled_reason = '', summary = '', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?2 AND id = ?3",
        params![restored.as_db_str(), school_id, &occurrence.id],
    )?;

    let reopened = find_by_id_in_school(conn, school_id, &occurrence.id)?
        .ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))?;
    Ok(OccurrenceOutcome::Updated(reopened))
}

/// Marks one learner for follow-up on one occurrence. Keyed by enrollment
/// membership, matching `subject_attendance_entries` -- the span is what was
/// actually in the section on this date, not a bare `learner_id`. Returns
/// `Ok(None)` for an unknown occurrence or a membership that is not on this
/// section's roster for this date, and `Err(Unauthorized)` when the caller is
/// not this class's teacher.
pub fn mark_followup(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
    section_membership_id: &str,
    reason: &str,
    actor_user_id: &str,
) -> AppResult<Option<LearnerFollowupMarker>> {
    let Some(occurrence) = find_by_id_in_school(conn, school_id, class_occurrence_id)? else {
        return Ok(None);
    };
    authorize_own_assignment(
        conn,
        actor_user_id,
        school_id,
        &occurrence.teaching_assignment_id,
    )?;
    let assignment = teaching_assignment::find_by_id_in_school(
        conn,
        school_id,
        &occurrence.teaching_assignment_id,
    )?
    .ok_or(AppError::Unauthorized)?;
    let on_roster = crate::repository::section_membership::current_roster(
        conn,
        school_id,
        &assignment.section_id,
        &occurrence.occurrence_date,
    )?
    .iter()
    .any(|member| member.membership_id == section_membership_id);
    if !on_roster {
        return Ok(None);
    }

    conn.execute(
        "INSERT INTO learner_followup_markers \
             (id, school_id, class_occurrence_id, section_membership_id, reason, \
              marked_by_user_id, marked_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT (class_occurrence_id, section_membership_id) DO UPDATE \
             SET reason = ?5, cleared_at = NULL, marked_by_user_id = ?6, \
                 marked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        params![
            Uuid::now_v7().to_string(),
            school_id,
            class_occurrence_id,
            section_membership_id,
            reason,
            actor_user_id,
        ],
    )?;
    marker_for(conn, school_id, class_occurrence_id, section_membership_id)
}

/// Clears a marker without deleting it, so CTOS.md §6.4's "what requires
/// learner follow-up?" stays answerable over history.
pub fn clear_followup(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
    section_membership_id: &str,
    actor_user_id: &str,
) -> AppResult<Option<LearnerFollowupMarker>> {
    let Some(occurrence) = find_by_id_in_school(conn, school_id, class_occurrence_id)? else {
        return Ok(None);
    };
    authorize_own_assignment(
        conn,
        actor_user_id,
        school_id,
        &occurrence.teaching_assignment_id,
    )?;

    conn.execute(
        "UPDATE learner_followup_markers \
         SET cleared_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?1 AND class_occurrence_id = ?2 AND section_membership_id = ?3 \
           AND cleared_at IS NULL",
        params![school_id, class_occurrence_id, section_membership_id],
    )?;
    marker_for(conn, school_id, class_occurrence_id, section_membership_id)
}

/// Every marker on one occurrence, open and cleared alike.
pub fn list_markers_for_occurrence(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
) -> AppResult<Vec<LearnerFollowupMarker>> {
    let mut stmt = conn.prepare(&format!(
        "{MARKER_SELECT} WHERE school_id = ?1 AND class_occurrence_id = ?2 \
         ORDER BY marked_at"
    ))?;
    let rows = stmt.query_map(params![school_id, class_occurrence_id], row_to_marker)?;
    let mut markers = Vec::new();
    for row in rows {
        markers.push(row?);
    }
    Ok(markers)
}

fn marker_for(
    conn: &Connection,
    school_id: &str,
    class_occurrence_id: &str,
    section_membership_id: &str,
) -> AppResult<Option<LearnerFollowupMarker>> {
    conn.query_row(
        &format!(
            "{MARKER_SELECT} \
             WHERE school_id = ?1 AND class_occurrence_id = ?2 AND section_membership_id = ?3"
        ),
        params![school_id, class_occurrence_id, section_membership_id],
        row_to_marker,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The one occurrence for one class on one date, or `None` -- which is the
/// honest "this class has not been started" state, never a fabricated
/// `planned` row built from the schedule alone. CTOS.md §5: "a planned
/// schedule does not prove a class occurred."
pub fn find_for_assignment_on_date(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    occurrence_date: &str,
) -> AppResult<Option<ClassOccurrence>> {
    conn.query_row(
        &format!(
            "{OCCURRENCE_SELECT} \
             WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND occurrence_date = ?3"
        ),
        params![school_id, teaching_assignment_id, occurrence_date],
        row_to_occurrence,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every occurrence for one class, newest first -- the session history the
/// classroom's summary/review step reads.
pub fn list_for_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<ClassOccurrence>> {
    let mut stmt = conn.prepare(&format!(
        "{OCCURRENCE_SELECT} \
         WHERE school_id = ?1 AND teaching_assignment_id = ?2 \
         ORDER BY occurrence_date DESC"
    ))?;
    let rows = stmt.query_map(
        params![school_id, teaching_assignment_id],
        row_to_occurrence,
    )?;
    let mut occurrences = Vec::new();
    for row in rows {
        occurrences.push(row?);
    }
    Ok(occurrences)
}

fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    occurrence_id: &str,
) -> AppResult<Option<ClassOccurrence>> {
    conn.query_row(
        &format!("{OCCURRENCE_SELECT} WHERE school_id = ?1 AND id = ?2"),
        params![school_id, occurrence_id],
        row_to_occurrence,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{
        school, section, subject, subject_attendance, teaching_assignment as ta_repo, user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        other_teacher_id: String,
        assignment_id: String,
        section_id: String,
    }

    /// A school, two teachers, one section, one subject, one assignment, and
    /// one Wednesday (weekday 3) meeting 08:00-08:50. 2026-09-09 is a
    /// Wednesday, which is what lets the plan-snapshot tests line up.
    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        let other = user::create_user(conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        user::add_school_membership(conn, &other.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = ta_repo::create(conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        crate::repository::schedule_meeting::create(
            conn,
            &s.id,
            &assignment.id,
            3,
            "08:00",
            "08:50",
            Some("Room A"),
        )
        .unwrap();
        Fixture {
            school_id: s.id,
            teacher_id: teacher.id,
            other_teacher_id: other.id,
            assignment_id: assignment.id,
            section_id: sec.id,
        }
    }

    fn enroll_one_learner(conn: &Connection, f: &Fixture, given: &str, family: &str) -> String {
        let learner =
            crate::repository::learner::create(conn, &f.school_id, given, family, None, None)
                .unwrap();
        crate::repository::section_membership::enroll(
            conn,
            &f.school_id,
            &f.section_id,
            &learner.id,
            "2026-06-01",
        )
        .unwrap()
        .unwrap()
        .id
    }

    fn started_occurrence(conn: &Connection, f: &Fixture, date: &str) -> ClassOccurrence {
        match start(conn, &f.school_id, &f.assignment_id, date, &f.teacher_id).unwrap() {
            OccurrenceOutcome::Started(o) => o,
            other => panic!("expected Started, got {other:?}"),
        }
    }

    #[test]
    fn weekday_for_matches_the_schedules_own_convention() {
        // 2026-09-09 is a Wednesday; the schedule seeds weekday 3 for it.
        assert_eq!(weekday_for("2026-09-09"), Some(3));
        // Sunday and Saturday at the two ends of the 0-6 range.
        assert_eq!(weekday_for("2026-09-06"), Some(0));
        assert_eq!(weekday_for("2026-09-12"), Some(6));
        assert_eq!(weekday_for("not-a-date"), None);
    }

    #[test]
    fn starting_snapshots_the_recurring_plan_and_opens_planned() {
        let conn = open_test_db();
        let f = seed(&conn);

        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        assert_eq!(occurrence.status, OccurrenceStatus::Planned);
        assert_eq!(occurrence.planned_starts_at.as_deref(), Some("08:00"));
        assert_eq!(occurrence.planned_ends_at.as_deref(), Some("08:50"));
        assert_eq!(occurrence.planned_room.as_deref(), Some("Room A"));
        assert!(occurrence.started_at.is_some());
    }

    #[test]
    fn starting_is_idempotent_and_returns_the_open_occurrence() {
        let conn = open_test_db();
        let f = seed(&conn);

        let first = start(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();
        let second = start(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();

        let id = match &first {
            OccurrenceOutcome::Started(o) => o.id.clone(),
            other => panic!("expected Started, got {other:?}"),
        };
        match second {
            OccurrenceOutcome::AlreadyOpen(o) => assert_eq!(o.id, id),
            other => panic!("expected AlreadyOpen, got {other:?}"),
        }
        // Exactly one row, not two.
        assert_eq!(
            list_for_assignment(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn a_class_off_the_recurring_schedule_starts_with_no_plan_snapshot() {
        let conn = open_test_db();
        let f = seed(&conn);

        // 2026-09-10 is a Thursday; the seeded meeting is Wednesday-only.
        let occurrence = started_occurrence(&conn, &f, "2026-09-10");

        assert!(occurrence.planned_starts_at.is_none());
        assert!(occurrence.learning_target.is_empty());
    }

    #[test]
    fn the_learning_target_is_seeded_from_that_days_lesson_plan() {
        let conn = open_test_db();
        let f = seed(&conn);
        use crate::repository::lesson_plan::{self, LessonPlanFields};
        lesson_plan::create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
            &LessonPlanFields {
                learning_competency: "Adds polynomials",
                learning_competency_code: "M7AL-Ig-1",
                learning_objectives: "line one\nline two",
                connection_to_previous_learning: "",
                learning_experiences: "",
                assessment: "",
                ways_forward: "",
            },
        )
        .unwrap();

        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        assert_eq!(occurrence.learning_target, "Adds polynomials (M7AL-Ig-1)");
    }

    #[test]
    fn the_learning_target_is_blank_when_no_lesson_plan_exists_for_that_day() {
        let conn = open_test_db();
        let f = seed(&conn);
        use crate::repository::lesson_plan::{self, LessonPlanFields};
        // A plan for a *different* day must not seed this occurrence.
        lesson_plan::create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-16",
            &f.teacher_id,
            &LessonPlanFields {
                learning_competency: "Subtracts polynomials",
                learning_competency_code: "M7AL-Ig-2",
                learning_objectives: "",
                connection_to_previous_learning: "",
                learning_experiences: "",
                assessment: "",
                ways_forward: "",
            },
        )
        .unwrap();

        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        assert!(occurrence.learning_target.is_empty());
    }

    #[test]
    fn a_bad_date_or_unknown_assignment_is_reported_not_written() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert_eq!(
            start(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-13-45",
                &f.teacher_id
            )
            .unwrap(),
            OccurrenceOutcome::InvalidDate
        );
        assert_eq!(
            start(
                &conn,
                &f.school_id,
                "no-such-assignment",
                "2026-09-09",
                &f.teacher_id
            )
            .unwrap(),
            OccurrenceOutcome::UnknownAssignment
        );
        assert!(list_for_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn recording_an_actual_slot_that_matches_the_plan_stays_planned() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");

        let updated = capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            Some("08:00"),
            Some("08:50"),
            Some("Room A"),
            None,
            None,
            None,
        )
        .unwrap()
        .expect("the occurrence exists");

        assert_eq!(updated.status, OccurrenceStatus::Planned);
    }

    #[test]
    fn recording_an_actual_slot_that_differs_from_the_plan_becomes_changed() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");

        let updated = capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            Some("09:00"),
            Some("09:50"),
            Some("Room B"),
            Some("Adds polynomials"),
            Some("Exit slips collected"),
            Some("Projector failed"),
        )
        .unwrap()
        .expect("the occurrence exists");

        assert_eq!(updated.status, OccurrenceStatus::Changed);
        assert_eq!(updated.learning_target, "Adds polynomials");
        assert_eq!(updated.quick_evidence, "Exit slips collected");
        assert_eq!(updated.notes, "Projector failed");
    }

    #[test]
    fn only_the_room_changed_is_still_a_changed_class() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");

        let updated = capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            Some("08:00"),
            Some("08:50"),
            Some("Gym"),
            None,
            None,
            None,
        )
        .unwrap()
        .expect("the occurrence exists");

        assert_eq!(
            updated.status,
            OccurrenceStatus::Changed,
            "a class moved to another room is not the class the schedule described"
        );
    }

    #[test]
    fn an_off_schedule_class_with_a_recorded_slot_is_changed() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-10");

        let updated = capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-10",
            Some("07:30"),
            Some("08:20"),
            None,
            None,
            None,
            None,
        )
        .unwrap()
        .expect("the occurrence exists");

        assert_eq!(
            updated.status,
            OccurrenceStatus::Changed,
            "a class with no recurring slot is off-schedule, which is the changed state"
        );
    }

    #[test]
    fn capture_on_an_unknown_class_is_none() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert!(capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            Some("08:00"),
            Some("08:50"),
            None,
            None,
            None,
            None,
        )
        .unwrap()
        .is_none());
    }

    #[test]
    fn finishing_requires_attendance_to_have_been_checked() {
        let conn = open_test_db();
        let f = seed(&conn);
        enroll_one_learner(&conn, &f, "Ana", "Cruz");
        started_occurrence(&conn, &f, "2026-09-09");

        assert_eq!(
            finish(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-09",
                "Went well"
            )
            .unwrap(),
            OccurrenceOutcome::AttendanceNotChecked
        );

        // Still in flight, not delivered.
        let occurrence =
            find_for_assignment_on_date(&conn, &f.school_id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .unwrap();
        assert_eq!(occurrence.status, OccurrenceStatus::Planned);
    }

    #[test]
    fn finishing_a_no_class_day_is_allowed_without_entries() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        // An explicit no-class decision is itself a completed attendance
        // decision, so it satisfies the gate.
        subject_attendance::mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();

        let outcome = finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();
        match outcome {
            OccurrenceOutcome::Updated(o) => {
                assert_eq!(o.status, OccurrenceStatus::Delivered);
                assert_eq!(o.summary, "Went well");
                assert!(o.finished_at.is_some());
            }
            other => panic!("expected Updated(delivered), got {other:?}"),
        }
    }

    #[test]
    fn finishing_after_marks_are_recorded_delivers_the_occurrence() {
        let conn = open_test_db();
        let f = seed(&conn);
        let membership = enroll_one_learner(&conn, &f, "Ana", "Cruz");
        started_occurrence(&conn, &f, "2026-09-09");
        let session = subject_attendance::open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        subject_attendance::record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &membership,
            subject_attendance::EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        let outcome = finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();
        match outcome {
            OccurrenceOutcome::Updated(o) => assert_eq!(o.status, OccurrenceStatus::Delivered),
            other => panic!("expected Updated(delivered), got {other:?}"),
        }
    }

    #[test]
    fn a_class_with_an_empty_roster_can_be_finished_with_no_entries() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        // Nobody is enrolled, so an empty held session has nobody it failed
        // to mark.
        subject_attendance::open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();

        let outcome = finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();
        match outcome {
            OccurrenceOutcome::Updated(o) => assert_eq!(o.status, OccurrenceStatus::Delivered),
            other => panic!("expected Updated(delivered), got {other:?}"),
        }
    }

    #[test]
    fn a_delivered_occurrence_is_not_silently_rewritten_by_start() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        subject_attendance::mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();
        finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();

        assert_eq!(
            start(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-09",
                &f.teacher_id
            )
            .unwrap(),
            OccurrenceOutcome::AlreadyDelivered
        );
        // The recorded summary survives the refused restart.
        let occurrence =
            find_for_assignment_on_date(&conn, &f.school_id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .unwrap();
        assert_eq!(occurrence.summary, "Went well");
    }

    #[test]
    fn cancelling_requires_a_reason() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert_eq!(
            cancel(
                &conn,
                &f.school_id,
                &f.assignment_id,
                "2026-09-09",
                "",
                &f.teacher_id
            )
            .unwrap(),
            OccurrenceOutcome::CancelRequiresReason
        );
        assert!(
            find_for_assignment_on_date(&conn, &f.school_id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .is_none(),
            "nothing was written"
        );
    }

    #[test]
    fn cancelling_an_unstarted_class_records_a_cancelled_occurrence() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = cancel(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "School-wide suspension",
            &f.teacher_id,
        )
        .unwrap();
        let occurrence = match outcome {
            OccurrenceOutcome::Updated(o) => o,
            other => panic!("expected Updated, got {other:?}"),
        };

        assert_eq!(occurrence.status, OccurrenceStatus::Cancelled);
        assert_eq!(occurrence.cancelled_reason, "School-wide suspension");
        assert!(occurrence.cancelled_at.is_some());
        // The cancelled record still shows what had been scheduled.
        assert_eq!(occurrence.planned_starts_at.as_deref(), Some("08:00"));
    }

    #[test]
    fn cancelling_an_in_flight_class_overwrites_the_open_occurrence() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");

        let outcome = cancel(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Teacher on leave",
            &f.teacher_id,
        )
        .unwrap();
        let occurrence = match outcome {
            OccurrenceOutcome::Updated(o) => o,
            other => panic!("expected Updated, got {other:?}"),
        };

        assert_eq!(occurrence.status, OccurrenceStatus::Cancelled);
        assert!(
            occurrence.finished_at.is_none(),
            "finishing and cancelling are mutually exclusive"
        );
    }

    #[test]
    fn a_delivered_occurrence_cannot_be_cancelled_after_the_fact() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        subject_attendance::mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();
        finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();

        let outcome = cancel(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Actually it did not happen",
            &f.teacher_id,
        )
        .unwrap();

        assert_eq!(outcome, OccurrenceOutcome::AlreadyDelivered);
        let occurrence =
            find_for_assignment_on_date(&conn, &f.school_id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .unwrap();
        assert_eq!(occurrence.status, OccurrenceStatus::Delivered);
    }

    #[test]
    fn reopening_a_delivered_occurrence_restores_the_prior_state_and_bumps_revision() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        capture(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            Some("09:00"),
            Some("09:50"),
            None,
            None,
            None,
            None,
        )
        .unwrap();
        subject_attendance::mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            &f.teacher_id,
        )
        .unwrap();
        finish(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Went well",
        )
        .unwrap();
        assert_eq!(
            find_for_assignment_on_date(&conn, &f.school_id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .unwrap()
                .revision,
            0
        );

        let outcome = reopen(&conn, &f.school_id, &f.assignment_id, "2026-09-09").unwrap();
        let reopened = match outcome {
            OccurrenceOutcome::Updated(o) => o,
            other => panic!("expected Updated, got {other:?}"),
        };

        assert_eq!(reopened.status, OccurrenceStatus::Changed);
        assert_eq!(reopened.revision, 1);
        assert!(reopened.finished_at.is_none());
        assert!(
            reopened.summary.is_empty(),
            "the finished summary is cleared on reopen, not retained as if still delivered"
        );
    }

    #[test]
    fn reopening_a_cancelled_occurrence_returns_to_planned() {
        let conn = open_test_db();
        let f = seed(&conn);
        cancel(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-09",
            "Suspension",
            &f.teacher_id,
        )
        .unwrap();

        let outcome = reopen(&conn, &f.school_id, &f.assignment_id, "2026-09-09").unwrap();
        let reopened = match outcome {
            OccurrenceOutcome::Updated(o) => o,
            other => panic!("expected Updated, got {other:?}"),
        };

        assert_eq!(reopened.status, OccurrenceStatus::Planned);
        assert!(reopened.cancelled_reason.is_empty());
    }

    #[test]
    fn reopening_an_in_flight_occurrence_is_a_no_op_reported_as_already_open() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");

        let outcome = reopen(&conn, &f.school_id, &f.assignment_id, "2026-09-09").unwrap();
        match outcome {
            OccurrenceOutcome::AlreadyOpen(o) => {
                assert_eq!(o.status, OccurrenceStatus::Planned);
                assert_eq!(o.revision, 0, "revision only counts real reopenings");
            }
            other => panic!("expected AlreadyOpen, got {other:?}"),
        }
    }

    #[test]
    fn a_teacher_cannot_start_another_teachers_class_occurrence() {
        let conn = open_test_db();
        let f = seed(&conn);

        assert!(
            authorize_own_assignment(&conn, &f.other_teacher_id, &f.school_id, &f.assignment_id)
                .is_err(),
            "Teacher B is not on this assignment"
        );
        // Teacher A's occurrence was never written and Teacher B has none.
        assert!(list_for_assignment(&conn, &f.school_id, &f.assignment_id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn an_occurrence_cannot_be_read_across_a_school_boundary() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        let other_school = school::create(&conn, "Other School").unwrap();

        assert!(
            find_for_assignment_on_date(&conn, &other_school.id, &f.assignment_id, "2026-09-09")
                .unwrap()
                .is_none(),
            "the occurrence does not exist in another school, even with a real assignment id"
        );
    }

    #[test]
    fn a_followup_marker_can_be_set_and_cleared_without_being_deleted() {
        let conn = open_test_db();
        let f = seed(&conn);
        let membership = enroll_one_learner(&conn, &f, "Ana", "Cruz");
        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        let marker = mark_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            "Absent again; call home",
            &f.teacher_id,
        )
        .unwrap()
        .expect("the marker was written");
        assert!(marker.cleared_at.is_none());
        assert_eq!(marker.reason, "Absent again; call home");

        let cleared = clear_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            &f.teacher_id,
        )
        .unwrap()
        .expect("the marker still exists");
        assert!(cleared.cleared_at.is_some(), "cleared, not deleted");

        // History is retained, so §6.4's "what requires follow-up?" is
        // answerable after the fact.
        assert_eq!(
            list_markers_for_occurrence(&conn, &f.school_id, &occurrence.id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn marking_followup_again_after_clearing_reopens_the_marker() {
        let conn = open_test_db();
        let f = seed(&conn);
        let membership = enroll_one_learner(&conn, &f, "Ana", "Cruz");
        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        mark_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            "First concern",
            &f.teacher_id,
        )
        .unwrap();
        clear_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            &f.teacher_id,
        )
        .unwrap();
        let reopened = mark_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            "Recurring",
            &f.teacher_id,
        )
        .unwrap()
        .expect("the marker was reopened");

        assert!(
            reopened.cleared_at.is_none(),
            "a reopened marker stands again"
        );
        assert_eq!(
            list_markers_for_occurrence(&conn, &f.school_id, &occurrence.id)
                .unwrap()
                .len(),
            1,
            "still one marker, not a duplicate"
        );
    }

    #[test]
    fn another_teacher_cannot_mark_followup_on_a_class_that_is_not_theirs() {
        let conn = open_test_db();
        let f = seed(&conn);
        let membership = enroll_one_learner(&conn, &f, "Ana", "Cruz");
        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        let result = mark_followup(
            &conn,
            &f.school_id,
            &occurrence.id,
            &membership,
            "Not my class",
            &f.other_teacher_id,
        );

        assert!(result.is_err(), "Teacher B is unauthorized here");
        assert!(
            list_markers_for_occurrence(&conn, &f.school_id, &occurrence.id)
                .unwrap()
                .is_empty(),
            "no marker was written"
        );
    }

    #[test]
    fn a_marker_for_an_unknown_membership_or_occurrence_is_refused() {
        let conn = open_test_db();
        let f = seed(&conn);
        let occurrence = started_occurrence(&conn, &f, "2026-09-09");

        assert!(
            mark_followup(
                &conn,
                &f.school_id,
                &occurrence.id,
                "no-such-membership",
                "x",
                &f.teacher_id
            )
            .unwrap()
            .is_none(),
            "an unknown membership is refused"
        );
        assert!(
            mark_followup(
                &conn,
                &f.school_id,
                "no-such-occurrence",
                "no-such-membership",
                "x",
                &f.teacher_id
            )
            .unwrap()
            .is_none(),
            "an unknown occurrence is refused"
        );
    }

    #[test]
    fn occurrences_for_one_class_are_listed_newest_first() {
        let conn = open_test_db();
        let f = seed(&conn);
        started_occurrence(&conn, &f, "2026-09-09");
        started_occurrence(&conn, &f, "2026-09-16");

        let list = list_for_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();

        assert_eq!(list.len(), 2);
        assert_eq!(list[0].occurrence_date, "2026-09-16");
        assert_eq!(list[1].occurrence_date, "2026-09-09");
    }
}
