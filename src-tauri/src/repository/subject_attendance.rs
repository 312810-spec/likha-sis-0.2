use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{section_membership, teaching_assignment};

/// A scheduled class meeting either happened (`Held`, and attendance can
/// be recorded/edited) or didn't (`NoClass` — suspension, holiday,
/// school activity, teacher leave, etc.). The spec's third state, "not
/// checked," is deliberately NOT stored here — it is the absence of any
/// row for a given `(teaching_assignment_id, session_date)`, the same
/// "no row = not yet recorded" idiom `attendance_records` already
/// established (see `docs/product/SUBJECT-ATTENDANCE-SPEC.md`).
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum SessionStatus {
    Held,
    NoClass,
}

impl SessionStatus {
    fn as_db_str(self) -> &'static str {
        match self {
            SessionStatus::Held => "held",
            SessionStatus::NoClass => "no_class",
        }
    }

    fn from_db_str(s: &str) -> rusqlite::Result<SessionStatus> {
        match s {
            "held" => Ok(SessionStatus::Held),
            "no_class" => Ok(SessionStatus::NoClass),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unrecognized subject_attendance_sessions.status: {other}").into(),
            )),
        }
    }
}

/// The four DepEd-familiar per-learner marks this internal monitoring
/// tool uses — deliberately its own enum, not a reuse of
/// `attendance::AttendanceStatus` (which has no `Late`, since SF2 itself
/// has no separate late code; see that enum's own doc comment). Subject
/// Attendance is not SF2 and must never silently inherit SF2's exact
/// code set as if the two were the same record.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum EntryStatus {
    Present,
    Absent,
    Late,
    Excused,
}

impl EntryStatus {
    fn as_db_str(self) -> &'static str {
        match self {
            EntryStatus::Present => "present",
            EntryStatus::Absent => "absent",
            EntryStatus::Late => "late",
            EntryStatus::Excused => "excused",
        }
    }

    fn from_db_str(s: &str) -> rusqlite::Result<EntryStatus> {
        match s {
            "present" => Ok(EntryStatus::Present),
            "absent" => Ok(EntryStatus::Absent),
            "late" => Ok(EntryStatus::Late),
            "excused" => Ok(EntryStatus::Excused),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unrecognized subject_attendance_entries.status: {other}").into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectAttendanceSession {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub section_id: String,
    pub subject_id: String,
    pub session_date: String,
    pub status: SessionStatus,
    pub created_by_user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectAttendanceEntry {
    pub id: String,
    pub session_id: String,
    pub membership_id: String,
    pub learner_id: String,
    pub status: EntryStatus,
    pub note: Option<String>,
    pub updated_at: String,
}

/// One roster row for a session's Attendance Check screen: the exact
/// enrollment membership valid on the session's own date, joined with
/// that learner's entry for this session if one has been recorded yet.
/// `entry_status: None` means "not yet marked," never "absent" — an
/// unmarked learner must never be silently treated as any real status.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectAttendanceRosterRow {
    pub membership_id: String,
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub entry_status: Option<EntryStatus>,
}

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

fn row_to_session(row: &rusqlite::Row) -> rusqlite::Result<SubjectAttendanceSession> {
    Ok(SubjectAttendanceSession {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        section_id: row.get(3)?,
        subject_id: row.get(4)?,
        session_date: row.get(5)?,
        status: SessionStatus::from_db_str(&row.get::<_, String>(6)?)?,
        created_by_user_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

const SESSION_SELECT: &str = "SELECT id, school_id, teaching_assignment_id, section_id, \
     subject_id, session_date, status, created_by_user_id, created_at, updated_at \
     FROM subject_attendance_sessions";

/// Idempotently opens (or returns the existing) session for one class on
/// one day — a second call with the same `teaching_assignment_id` +
/// `session_date` never creates a duplicate, closing the exact "duplicate
/// saves or sync retries must not create duplicate sessions" requirement
/// via `INSERT ... ON CONFLICT DO NOTHING` rather than a
/// check-then-insert race. Returns `Ok(None)` if `teaching_assignment_id`
/// does not resolve within `school_id` — the caller (the command layer)
/// is expected to have already verified the caller owns this assignment;
/// this is defense-in-depth against a forged id, not the primary gate.
pub fn open_or_get_session(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    session_date: &str,
    actor_user_id: &str,
) -> AppResult<Option<SubjectAttendanceSession>> {
    if !is_iso_date(session_date) {
        return Ok(None);
    }
    let assignment =
        match teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)? {
            Some(a) => a,
            None => return Ok(None),
        };

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO subject_attendance_sessions \
             (id, school_id, teaching_assignment_id, section_id, subject_id, session_date, status, created_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT (teaching_assignment_id, session_date) DO NOTHING",
        (
            &id,
            school_id,
            teaching_assignment_id,
            &assignment.section_id,
            &assignment.subject_id,
            session_date,
            SessionStatus::Held.as_db_str(),
            actor_user_id,
        ),
    )?;

    conn.query_row(
        &format!(
            "{SESSION_SELECT} WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND session_date = ?3"
        ),
        (school_id, teaching_assignment_id, session_date),
        row_to_session,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Marks a day `NoClass` for one assignment — same idempotent
/// create-or-update shape as `open_or_get_session`, except an existing
/// `Held` session (one that may already carry recorded entries) is left
/// untouched rather than silently overwritten; the caller must reopen it
/// explicitly (a `Held` session cannot become `NoClass` by accident).
pub fn mark_no_class(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    session_date: &str,
    actor_user_id: &str,
) -> AppResult<Option<SubjectAttendanceSession>> {
    if !is_iso_date(session_date) {
        return Ok(None);
    }
    let assignment =
        match teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)? {
            Some(a) => a,
            None => return Ok(None),
        };

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO subject_attendance_sessions \
             (id, school_id, teaching_assignment_id, section_id, subject_id, session_date, status, created_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8) \
         ON CONFLICT (teaching_assignment_id, session_date) DO NOTHING",
        (
            &id,
            school_id,
            teaching_assignment_id,
            &assignment.section_id,
            &assignment.subject_id,
            session_date,
            SessionStatus::NoClass.as_db_str(),
            actor_user_id,
        ),
    )?;

    conn.query_row(
        &format!(
            "{SESSION_SELECT} WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND session_date = ?3"
        ),
        (school_id, teaching_assignment_id, session_date),
        row_to_session,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Records (or amends) one learner's mark for one session.
/// `RecordEntryOutcome` distinguishes the ways this can legitimately not
/// proceed from a successful write — never a raw DB error for an
/// ordinary stale-roster or forged-id case.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum RecordEntryOutcome {
    Recorded {
        entry: SubjectAttendanceEntry,
    },
    SessionNotFound,
    /// The session is `NoClass` — there is nothing to mark attendance
    /// against.
    SessionIsNoClass,
    /// `membership_id` does not belong to this session's own
    /// `section_id`, or does not belong to `school_id` at all — refused
    /// rather than silently accepted, the same defense-in-depth
    /// `section_membership::enroll_membership` already applies to a
    /// caller-supplied identifier.
    MembershipNotInSession,
}

pub fn record_entry(
    conn: &Connection,
    school_id: &str,
    session_id: &str,
    membership_id: &str,
    status: EntryStatus,
    note: Option<&str>,
    actor_user_id: &str,
) -> AppResult<RecordEntryOutcome> {
    let session = match find_session_by_id_in_school(conn, school_id, session_id)? {
        Some(s) => s,
        None => return Ok(RecordEntryOutcome::SessionNotFound),
    };
    if session.status == SessionStatus::NoClass {
        return Ok(RecordEntryOutcome::SessionIsNoClass);
    }

    let roster = section_membership::current_roster(
        conn,
        school_id,
        &session.section_id,
        &session.session_date,
    )?;
    let member = match roster.iter().find(|m| m.membership_id == membership_id) {
        Some(m) => m,
        None => return Ok(RecordEntryOutcome::MembershipNotInSession),
    };

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO subject_attendance_entries \
             (id, session_id, membership_id, learner_id, status, note, created_by_user_id, updated_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7) \
         ON CONFLICT (session_id, membership_id) \
         DO UPDATE SET status = excluded.status, note = excluded.note, \
                        updated_by_user_id = excluded.updated_by_user_id, \
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (
            &id,
            session_id,
            membership_id,
            &member.learner_id,
            status.as_db_str(),
            note,
            actor_user_id,
        ),
    )?;

    let entry = conn.query_row(
        "SELECT id, session_id, membership_id, learner_id, status, note, updated_at \
         FROM subject_attendance_entries WHERE session_id = ?1 AND membership_id = ?2",
        (session_id, membership_id),
        |row| {
            Ok(SubjectAttendanceEntry {
                id: row.get(0)?,
                session_id: row.get(1)?,
                membership_id: row.get(2)?,
                learner_id: row.get(3)?,
                status: EntryStatus::from_db_str(&row.get::<_, String>(4)?)?,
                note: row.get(5)?,
                updated_at: row.get(6)?,
            })
        },
    )?;

    Ok(RecordEntryOutcome::Recorded { entry })
}

/// One roster row per currently-valid membership for the session's date,
/// each joined with its recorded entry if one exists. Reuses
/// `section_membership::current_roster` unchanged — the same
/// authoritative "who was actually enrolled that day" query Section
/// Roster already established — rather than a second, competing roster
/// query.
pub fn roster_for_session(
    conn: &Connection,
    school_id: &str,
    session_id: &str,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let session = match find_session_by_id_in_school(conn, school_id, session_id)? {
        Some(s) => s,
        None => return Ok(None),
    };

    let roster = section_membership::current_roster(
        conn,
        school_id,
        &session.section_id,
        &session.session_date,
    )?;

    let mut stmt = conn.prepare(
        "SELECT membership_id, status FROM subject_attendance_entries WHERE session_id = ?1",
    )?;
    let entries: std::collections::HashMap<String, EntryStatus> = stmt
        .query_map((session_id,), |row| {
            let membership_id: String = row.get(0)?;
            let status = EntryStatus::from_db_str(&row.get::<_, String>(1)?)?;
            Ok((membership_id, status))
        })?
        .collect::<Result<_, _>>()?;

    Ok(Some(
        roster
            .into_iter()
            .map(|m| SubjectAttendanceRosterRow {
                entry_status: entries.get(&m.membership_id).copied(),
                membership_id: m.membership_id,
                learner_id: m.learner_id,
                given_name: m.given_name,
                family_name: m.family_name,
            })
            .collect(),
    ))
}

/// Marks every currently-unmarked roster member `Present` and never
/// overwrites an existing mark — the same idiom `attendance::bulk_mark_present`
/// already established for daily attendance, applied to Subject
/// Attendance's own separate storage.
pub fn mark_all_present(
    conn: &Connection,
    school_id: &str,
    session_id: &str,
    actor_user_id: &str,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let roster = match roster_for_session(conn, school_id, session_id)? {
        Some(r) => r,
        None => return Ok(None),
    };
    for row in roster.iter().filter(|r| r.entry_status.is_none()) {
        record_entry(
            conn,
            school_id,
            session_id,
            &row.membership_id,
            EntryStatus::Present,
            None,
            actor_user_id,
        )?;
    }
    roster_for_session(conn, school_id, session_id)
}

pub fn find_session_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    session_id: &str,
) -> AppResult<Option<SubjectAttendanceSession>> {
    conn.query_row(
        &format!("{SESSION_SELECT} WHERE id = ?1 AND school_id = ?2"),
        (session_id, school_id),
        row_to_session,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every recorded session for one teaching assignment, most recent
/// first — the data an eventual "Today's Classes"/history screen needs,
/// scoped by `school_id` AND `teaching_assignment_id` together so a
/// forged/cross-school id can never leak another school's sessions.
pub fn list_sessions_for_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<SubjectAttendanceSession>> {
    let mut stmt = conn.prepare(&format!(
        "{SESSION_SELECT} WHERE school_id = ?1 AND teaching_assignment_id = ?2 \
         ORDER BY session_date DESC"
    ))?;
    let rows = stmt.query_map((school_id, teaching_assignment_id), row_to_session)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// One learner's raw attendance counts and current standing for the
/// Subject Monitor screen -- deliberately no automatic flag or
/// threshold beyond the raw streak number: `docs/product/SUBJECT-ATTENDANCE-SPEC.md`
/// explicitly defers "configurable school thresholds for follow-up" as
/// a later, separately-designed enhancement, not something to guess at
/// here.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectAttendanceMonitorRow {
    pub membership_id: String,
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub present_count: i64,
    pub absent_count: i64,
    pub late_count: i64,
    pub excused_count: i64,
    /// Consecutive `Absent` marks counting back from the most recent
    /// `Held` session with an entry, stopping at the first non-`Absent`
    /// mark or the first session this learner was never marked for --
    /// an unmarked ("no row = not yet recorded") session never
    /// contributes to or silently breaks a streak the wrong way, it
    /// simply stops the count where certainty ends.
    pub current_consecutive_absences: i64,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectAttendanceMonitor {
    pub held_session_count: i64,
    pub rows: Vec<SubjectAttendanceMonitorRow>,
}

/// Learner-by-learner attendance counts across every `Held` session
/// recorded so far for one teaching assignment -- the spec's own
/// "Subject Monitor" (recommended-order step 6). Scoped to the exact
/// same authorization anchor every other Subject Attendance function
/// already uses (`authorize_own_assignment`, called by the command
/// layer before this) -- a reporting view over data the caller already
/// owns, not a new authorization shape.
///
/// Rows are scoped to the roster as of `as_of_date` (reusing
/// `section_membership::current_roster`, the same "current roster"
/// every other Subject Attendance screen already uses) -- a learner who
/// has since transferred out no longer appears here, even if they have
/// historical entries. Showing a monitor row for a learner no longer in
/// the class is a deliberately deferred enhancement, not attempted in
/// this first slice. Returns `Ok(None)` for an invalid date or an
/// assignment that doesn't resolve in `school_id`, matching this
/// module's other functions' convention.
pub fn monitor_for_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    as_of_date: &str,
) -> AppResult<Option<SubjectAttendanceMonitor>> {
    if !is_iso_date(as_of_date) {
        return Ok(None);
    }
    let assignment =
        match teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)? {
            Some(a) => a,
            None => return Ok(None),
        };

    let roster =
        section_membership::current_roster(conn, school_id, &assignment.section_id, as_of_date)?;

    // Every `Held` session's id, most-recent-first -- walked per learner
    // below so an unmarked session (no entry row) is a real, visible gap
    // in the sequence, not silently skipped the way iterating only over
    // existing entries would (an absence three sessions ago and one from
    // yesterday are not "consecutive" just because nothing was recorded
    // in between).
    let mut session_stmt = conn.prepare(
        "SELECT id FROM subject_attendance_sessions \
         WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND status = 'held' \
         ORDER BY session_date DESC",
    )?;
    let held_session_ids: Vec<String> = session_stmt
        .query_map((school_id, teaching_assignment_id), |row| row.get(0))?
        .collect::<Result<_, _>>()?;

    let mut entry_stmt = conn.prepare(
        "SELECT e.session_id, e.membership_id, e.status \
         FROM subject_attendance_entries e \
         JOIN subject_attendance_sessions s ON s.id = e.session_id \
         WHERE s.school_id = ?1 AND s.teaching_assignment_id = ?2 AND s.status = 'held'",
    )?;
    let entries: Vec<(String, String, EntryStatus)> = entry_stmt
        .query_map((school_id, teaching_assignment_id), |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                EntryStatus::from_db_str(&row.get::<_, String>(2)?)?,
            ))
        })?
        .collect::<Result<_, _>>()?;

    let mut status_by_session_and_membership: std::collections::HashMap<
        (String, String),
        EntryStatus,
    > = std::collections::HashMap::new();
    for (session_id, membership_id, status) in entries {
        status_by_session_and_membership.insert((session_id, membership_id), status);
    }

    let rows = roster
        .into_iter()
        .map(|m| {
            let mut present_count = 0i64;
            let mut absent_count = 0i64;
            let mut late_count = 0i64;
            let mut excused_count = 0i64;
            let mut current_consecutive_absences = 0i64;
            let mut streak_still_counting = true;

            for session_id in &held_session_ids {
                let status = status_by_session_and_membership
                    .get(&(session_id.clone(), m.membership_id.clone()));
                match status {
                    Some(EntryStatus::Present) => present_count += 1,
                    Some(EntryStatus::Absent) => absent_count += 1,
                    Some(EntryStatus::Late) => late_count += 1,
                    Some(EntryStatus::Excused) => excused_count += 1,
                    None => {}
                }
                if streak_still_counting {
                    if status == Some(&EntryStatus::Absent) {
                        current_consecutive_absences += 1;
                    } else {
                        streak_still_counting = false;
                    }
                }
            }

            SubjectAttendanceMonitorRow {
                membership_id: m.membership_id,
                learner_id: m.learner_id,
                given_name: m.given_name,
                family_name: m.family_name,
                present_count,
                absent_count,
                late_count,
                excused_count,
                current_consecutive_absences,
            }
        })
        .collect();

    Ok(Some(SubjectAttendanceMonitor {
        held_session_count: held_session_ids.len() as i64,
        rows,
    }))
}

/// One subject's Subject Monitor data for the Adviser View screen --
/// the same [`SubjectAttendanceMonitor`] any subject teacher already
/// sees on their own Subject Monitor screen, plus enough identity
/// (`subjectName`, `teacherUserId`) for an adviser to tell which
/// subject and colleague each row belongs to when viewing every
/// subject taught in their advisory section at once.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AdviserAssignmentMonitor {
    pub teaching_assignment_id: String,
    pub subject_id: String,
    pub subject_name: String,
    pub teacher_user_id: String,
    pub monitor: SubjectAttendanceMonitor,
}

/// The spec's own "Adviser View" (`docs/product/SUBJECT-ATTENDANCE-SPEC.md`)
/// -- read-only Subject Attendance signals across every subject taught
/// in one section, for that section's adviser. Deliberately reuses
/// [`monitor_for_assignment`] per teaching assignment rather than a
/// second aggregation query: this is the exact same per-learner
/// counts/streak computation a subject teacher already sees, just
/// gathered across every subject in the section instead of scoped to
/// one teacher's own assignment. Authorization
/// (`auth::authorize_adviser_of_section`) is the caller's
/// responsibility, exactly like `monitor_for_assignment`'s own callers
/// authorize via `authorize_own_assignment` first -- this function
/// trusts `school_id`/`section_id` as already-verified.
///
/// An unknown or cross-school `section_id`, or an invalid `as_of_date`,
/// resolves to an empty list -- matching
/// `teaching_assignment::list_by_section_in_school`'s own established
/// "no row = nothing to show" convention for section-scoped reference
/// data, rather than a distinct error a caller would have to unwrap.
pub fn adviser_monitor_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<Vec<AdviserAssignmentMonitor>> {
    if !is_iso_date(as_of_date) {
        return Ok(Vec::new());
    }
    let assignments = teaching_assignment::list_by_section_in_school(conn, school_id, section_id)?;
    let mut rows = Vec::with_capacity(assignments.len());
    for assignment in assignments {
        if let Some(monitor) = monitor_for_assignment(conn, school_id, &assignment.id, as_of_date)?
        {
            rows.push(AdviserAssignmentMonitor {
                teaching_assignment_id: assignment.id,
                subject_id: assignment.subject_id,
                subject_name: assignment.subject_name,
                teacher_user_id: assignment.teacher_user_id,
                monitor,
            });
        }
    }
    Ok(rows)
}

/// Returns `Err(AppError::Unauthorized)` unless `session`'s active user
/// is exactly the teacher on `teaching_assignment_id` within their own
/// school — the "own assignment only" rule
/// `docs/product/SUBJECT-ATTENDANCE-SPEC.md` requires, matching
/// `auth::authorize_view_teacher_load`'s "self" branch rather than a
/// role-based `Capability` (whether this passes depends on *which*
/// assignment is targeted, not on a fixed role set). Placed here, next
/// to the domain it gates, rather than in `auth::mod` — this rule is
/// specific to Subject Attendance's own authorization anchor.
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

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{
        learner, school, section, section_membership, subject, teaching_assignment, user,
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        section_id: String,
        teacher_id: String,
        learner_id: String,
        assignment_id: String,
        membership_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let t = user::create_user(
            conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        user::add_school_membership(conn, &t.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(conn, &s.id, &t.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        let l = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let membership =
            section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-06-01").unwrap();

        Fixture {
            school_id: s.id,
            section_id: sec.id,
            teacher_id: t.id,
            learner_id: l.id,
            assignment_id: assignment.id,
            membership_id: membership.unwrap().id,
        }
    }

    #[test]
    fn open_or_get_session_creates_a_held_session() {
        let conn = open_test_db();
        let f = seed(&conn);

        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(session.status, SessionStatus::Held);
        assert_eq!(session.teaching_assignment_id, f.assignment_id);
    }

    #[test]
    fn open_or_get_session_is_idempotent_and_never_creates_a_duplicate() {
        let conn = open_test_db();
        let f = seed(&conn);

        let first = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        let second = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(first.id, second.id, "a retry must reuse the same session");
        let count: i64 = conn
            .query_row(
                "SELECT count(*) FROM subject_attendance_sessions",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn open_or_get_session_returns_none_for_a_forged_assignment_id() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = open_or_get_session(
            &conn,
            &f.school_id,
            "does-not-exist",
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn mark_no_class_does_not_overwrite_an_already_held_session() {
        let conn = open_test_db();
        let f = seed(&conn);
        let held = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        let after = mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(after.id, held.id);
        assert_eq!(
            after.status,
            SessionStatus::Held,
            "an already-open session must not be silently flipped to no_class"
        );
    }

    #[test]
    fn record_entry_marks_a_learner_present() {
        let conn = open_test_db();
        let f = seed(&conn);
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        let outcome = record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        match outcome {
            RecordEntryOutcome::Recorded { entry } => {
                assert_eq!(entry.status, EntryStatus::Present);
            }
            other => panic!("expected Recorded, got {other:?}"),
        }
    }

    #[test]
    fn record_entry_amends_an_existing_mark_without_creating_a_duplicate_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        let outcome = record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Late,
            Some("arrived at 8:10"),
            &f.teacher_id,
        )
        .unwrap();

        match outcome {
            RecordEntryOutcome::Recorded { entry } => {
                assert_eq!(entry.status, EntryStatus::Late);
                assert_eq!(entry.note.as_deref(), Some("arrived at 8:10"));
            }
            other => panic!("expected Recorded, got {other:?}"),
        }
        let count: i64 = conn
            .query_row("SELECT count(*) FROM subject_attendance_entries", [], |r| {
                r.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "amending must update in place, not add a row");
    }

    #[test]
    fn record_entry_refuses_a_session_marked_no_class() {
        let conn = open_test_db();
        let f = seed(&conn);
        let session = mark_no_class(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        let outcome = record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        assert_eq!(outcome, RecordEntryOutcome::SessionIsNoClass);
    }

    #[test]
    fn record_entry_refuses_a_membership_id_from_a_different_section() {
        let conn = open_test_db();
        let f = seed(&conn);
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        let other_section = section::create(&conn, &f.school_id, "2026-2027", "8", "Luna").unwrap();
        let other_learner =
            learner::create(&conn, &f.school_id, "Bo", "Reyes", None, None).unwrap();
        let other_membership = section_membership::enroll(
            &conn,
            &f.school_id,
            &other_section.id,
            &other_learner.id,
            "2026-06-01",
        )
        .unwrap()
        .unwrap();

        let outcome = record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &other_membership.id,
            EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        assert_eq!(outcome, RecordEntryOutcome::MembershipNotInSession);
    }

    #[test]
    fn record_entry_refuses_a_membership_not_yet_enrolled_on_the_session_date() {
        let conn = open_test_db();
        let f = seed(&conn);
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-01-01",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();

        let outcome = record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Present,
            None,
            &f.teacher_id,
        )
        .unwrap();

        assert_eq!(
            outcome,
            RecordEntryOutcome::MembershipNotInSession,
            "the learner's membership does not start until 2026-06-01"
        );
    }

    #[test]
    fn mark_all_present_never_overwrites_an_existing_mark() {
        let conn = open_test_db();
        let f = seed(&conn);
        let section_id =
            teaching_assignment::find_by_id_in_school(&conn, &f.school_id, &f.assignment_id)
                .unwrap()
                .unwrap()
                .section_id;
        let other_learner =
            learner::create(&conn, &f.school_id, "Bo", "Reyes", None, None).unwrap();
        let second_membership = section_membership::enroll(
            &conn,
            &f.school_id,
            &section_id,
            &other_learner.id,
            "2026-06-01",
        )
        .unwrap()
        .unwrap();
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Absent,
            None,
            &f.teacher_id,
        )
        .unwrap();

        let roster = mark_all_present(&conn, &f.school_id, &session.id, &f.teacher_id)
            .unwrap()
            .unwrap();

        let first = roster
            .iter()
            .find(|r| r.membership_id == f.membership_id)
            .unwrap();
        assert_eq!(
            first.entry_status,
            Some(EntryStatus::Absent),
            "an existing Absent mark must survive Mark all present"
        );
        let second = roster
            .iter()
            .find(|r| r.membership_id == second_membership.id)
            .unwrap();
        assert_eq!(second.entry_status, Some(EntryStatus::Present));
    }

    #[test]
    fn roster_for_session_never_flags_a_different_schools_session_id() {
        let conn = open_test_db();
        let other_school = school::create(&conn, "Another School").unwrap();

        let result = roster_for_session(&conn, &other_school.id, "does-not-exist").unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn authorize_own_assignment_denies_a_different_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let result =
            authorize_own_assignment(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_own_assignment_allows_the_assignments_own_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn list_sessions_for_assignment_never_leaks_a_different_schools_sessions() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-29",
            &f.teacher_id,
        )
        .unwrap();
        let other_school = school::create(&conn, "Another School").unwrap();

        let sessions =
            list_sessions_for_assignment(&conn, &other_school.id, &f.assignment_id).unwrap();

        assert!(sessions.is_empty());
    }

    fn open_and_mark(conn: &Connection, f: &Fixture, session_date: &str, status: EntryStatus) {
        let session = open_or_get_session(
            conn,
            &f.school_id,
            &f.assignment_id,
            session_date,
            &f.teacher_id,
        )
        .unwrap()
        .unwrap();
        record_entry(
            conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            status,
            None,
            &f.teacher_id,
        )
        .unwrap();
    }

    #[test]
    fn monitor_for_assignment_returns_none_for_an_unknown_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result =
            monitor_for_assignment(&conn, &f.school_id, "does-not-exist", "2026-08-29").unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn monitor_for_assignment_returns_none_for_an_invalid_date() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result =
            monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "08/29/2026").unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn monitor_for_assignment_counts_each_status_and_the_held_session_count() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-24", EntryStatus::Present);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Late);
        open_and_mark(&conn, &f, "2026-08-26", EntryStatus::Excused);
        open_and_mark(&conn, &f, "2026-08-27", EntryStatus::Present);

        let monitor = monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();

        assert_eq!(monitor.held_session_count, 4);
        assert_eq!(monitor.rows.len(), 1);
        let row = &monitor.rows[0];
        assert_eq!(row.membership_id, f.membership_id);
        assert_eq!(row.present_count, 2);
        assert_eq!(row.late_count, 1);
        assert_eq!(row.excused_count, 1);
        assert_eq!(row.absent_count, 0);
    }

    #[test]
    fn monitor_for_assignment_computes_the_current_consecutive_absence_streak() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-24", EntryStatus::Present);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Absent);
        open_and_mark(&conn, &f, "2026-08-26", EntryStatus::Absent);
        open_and_mark(&conn, &f, "2026-08-27", EntryStatus::Absent);

        let monitor = monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();

        assert_eq!(monitor.rows[0].current_consecutive_absences, 3);
        assert_eq!(monitor.rows[0].absent_count, 3);
    }

    #[test]
    fn monitor_for_assignment_streak_stops_at_the_first_non_absent_mark() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-24", EntryStatus::Absent);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Present);
        open_and_mark(&conn, &f, "2026-08-26", EntryStatus::Absent);
        open_and_mark(&conn, &f, "2026-08-27", EntryStatus::Absent);

        let monitor = monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();

        // Most recent two (08-26, 08-27) are Absent; 08-25 (Present) stops
        // the streak from reaching further back to 08-24's own Absent.
        assert_eq!(monitor.rows[0].current_consecutive_absences, 2);
        assert_eq!(monitor.rows[0].absent_count, 3);
    }

    #[test]
    fn monitor_for_assignment_streak_stops_at_an_unmarked_session_never_counting_it() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Absent);
        // 2026-08-27 is opened (Held) but never marked for this learner --
        // an unmarked session must never be silently treated as Absent.
        open_or_get_session(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-08-27",
            &f.teacher_id,
        )
        .unwrap();
        open_and_mark(&conn, &f, "2026-08-28", EntryStatus::Absent);

        let monitor = monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();

        assert_eq!(monitor.held_session_count, 3);
        assert_eq!(monitor.rows[0].current_consecutive_absences, 1);
        assert_eq!(monitor.rows[0].absent_count, 2);
    }

    #[test]
    fn monitor_for_assignment_excludes_a_learner_who_has_since_transferred_out() {
        let mut conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Absent);

        section_membership::end_membership(
            &mut conn,
            &f.school_id,
            &f.learner_id,
            &f.membership_id,
            "2026-08-26",
        )
        .unwrap();

        let monitor = monitor_for_assignment(&conn, &f.school_id, &f.assignment_id, "2026-08-29")
            .unwrap()
            .unwrap();

        assert!(monitor.rows.is_empty());
        // The session/entry data itself is untouched -- only today's
        // roster-scoped view excludes the now-transferred learner.
        assert_eq!(monitor.held_session_count, 1);
    }

    #[test]
    fn monitor_for_assignment_never_leaks_a_different_schools_data() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Absent);
        let other_school = school::create(&conn, "Another School").unwrap();

        let result =
            monitor_for_assignment(&conn, &other_school.id, &f.assignment_id, "2026-08-29")
                .unwrap();

        assert!(result.is_none());
    }

    fn add_second_subject_assignment(
        conn: &Connection,
        f: &Fixture,
        teacher_id: &str,
        subject_name: &str,
    ) -> teaching_assignment::TeachingAssignment {
        let sub = subject::create(conn, &f.school_id, subject_name).unwrap();
        teaching_assignment::create(conn, &f.school_id, teacher_id, &f.section_id, &sub.id)
            .unwrap()
            .unwrap()
    }

    #[test]
    fn adviser_monitor_for_section_covers_every_subject_taught_in_the_section() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Present);
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();
        let second =
            add_second_subject_assignment(&conn, &f, &other_teacher.id, "Araling Panlipunan");
        let session = open_or_get_session(
            &conn,
            &f.school_id,
            &second.id,
            "2026-08-25",
            &other_teacher.id,
        )
        .unwrap()
        .unwrap();
        record_entry(
            &conn,
            &f.school_id,
            &session.id,
            &f.membership_id,
            EntryStatus::Absent,
            None,
            &other_teacher.id,
        )
        .unwrap();

        let rows =
            adviser_monitor_for_section(&conn, &f.school_id, &f.section_id, "2026-08-29").unwrap();

        assert_eq!(rows.len(), 2);
        let math = rows
            .iter()
            .find(|r| r.teaching_assignment_id == f.assignment_id)
            .unwrap();
        assert_eq!(math.subject_name, "Mathematics");
        assert_eq!(math.teacher_user_id, f.teacher_id);
        assert_eq!(math.monitor.rows[0].present_count, 1);
        let ap = rows
            .iter()
            .find(|r| r.teaching_assignment_id == second.id)
            .unwrap();
        assert_eq!(ap.subject_name, "Araling Panlipunan");
        assert_eq!(ap.teacher_user_id, other_teacher.id);
        assert_eq!(ap.monitor.rows[0].absent_count, 1);
    }

    #[test]
    fn adviser_monitor_for_section_returns_empty_for_a_section_with_no_assignments() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "8", "Bonifacio").unwrap();

        let rows = adviser_monitor_for_section(&conn, &s.id, &sec.id, "2026-08-29").unwrap();

        assert!(rows.is_empty());
    }

    #[test]
    fn adviser_monitor_for_section_returns_empty_for_an_invalid_date() {
        let conn = open_test_db();
        let f = seed(&conn);

        let rows =
            adviser_monitor_for_section(&conn, &f.school_id, &f.section_id, "not-a-date").unwrap();

        assert!(rows.is_empty());
    }

    #[test]
    fn adviser_monitor_for_section_never_leaks_a_different_schools_data() {
        let conn = open_test_db();
        let f = seed(&conn);
        open_and_mark(&conn, &f, "2026-08-25", EntryStatus::Absent);
        let other_school = school::create(&conn, "Another School").unwrap();

        let rows =
            adviser_monitor_for_section(&conn, &other_school.id, &f.section_id, "2026-08-29")
                .unwrap();

        assert!(rows.is_empty());
    }
}
