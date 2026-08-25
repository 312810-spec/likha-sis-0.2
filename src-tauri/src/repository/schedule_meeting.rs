use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::teaching_assignment;

/// When/where a `TeachingAssignment` occurs, one row per recurring
/// weekly slot. `starts_at`/`ends_at` are local wall-clock "HH:MM" text
/// -- see `docs/adr/0039-teacher-load-class-schedule-foundation.md` for
/// why this is deliberately not a UTC timestamp.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleMeeting {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
    pub room: Option<String>,
    pub created_at: String,
}

/// Every reason `create` can decline, distinct enough that a caller can
/// show a specific message -- unlike the cross-school `Option<None>`
/// convention used elsewhere in this codebase (which deliberately
/// collapses reasons to avoid leaking tenant-boundary information),
/// scheduling conflicts are not a security-sensitive distinction within
/// one's own school, and a usable scheduling UI needs to say what went
/// wrong (see this milestone's "clear conflict messages" requirement).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "outcome", content = "meeting", rename_all = "camelCase")]
pub enum CreateMeetingOutcome {
    Created(ScheduleMeeting),
    UnknownAssignment,
    InvalidWeekday,
    InvalidTime,
    TeacherConflict,
    SectionConflict,
    RoomConflict,
    Duplicate,
}

/// Parses "HH:MM" into minutes-since-midnight, rejecting anything the
/// schema's own `GLOB '[0-2][0-9]:[0-5][0-9]'` CHECK is too coarse to
/// catch (e.g. "29:00" matches that glob but is not a real time) --
/// and, going the other direction, rejecting anything that would pass
/// numeric parsing but then fail that same GLOB, such as a missing
/// leading zero ("8:00" parses fine as hour=8 but isn't the exact
/// two-digit shape the schema requires). The round-trip check
/// (`format!("{h:02}:{m:02}") == time`) catches that case in Rust,
/// returning a clean `InvalidTime` outcome instead of letting a raw
/// `CHECK` constraint error surface from the `INSERT` below.
fn parse_minutes(time: &str) -> Option<u32> {
    let (h, m) = time.split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    if h > 23 || m > 59 {
        return None;
    }
    if format!("{h:02}:{m:02}") != time {
        return None;
    }
    Some(h * 60 + m)
}

/// Validates `teaching_assignment_id` resolves in `school_id`, that
/// `starts_at`/`ends_at` are real times with `starts_at < ends_at`, then
/// checks the three conflict invariants this foundation actually needs
/// (teacher, section, room) before inserting -- not a solver, just the
/// checks required to keep manually-created schedules correct. Weekday
/// is 0-6 (structural `CHECK` in the schema); `room` is optional.
#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
    room: Option<&str>,
) -> AppResult<CreateMeetingOutcome> {
    let Some(assignment) =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
    else {
        return Ok(CreateMeetingOutcome::UnknownAssignment);
    };

    // Validated here, in Rust, rather than trusted to the schema's own
    // `CHECK (weekday BETWEEN 0 AND 6)` alone -- see the `INSERT`
    // statement below's doc comment for why a `CHECK` failure must never
    // be allowed to reach it.
    if !(0..=6).contains(&weekday) {
        return Ok(CreateMeetingOutcome::InvalidWeekday);
    }

    let (Some(start_minutes), Some(end_minutes)) = (parse_minutes(starts_at), parse_minutes(ends_at))
    else {
        return Ok(CreateMeetingOutcome::InvalidTime);
    };
    if start_minutes >= end_minutes {
        return Ok(CreateMeetingOutcome::InvalidTime);
    }

    // Must run before `has_teacher_conflict`: an exact duplicate (same
    // assignment, weekday, and time range) always shares its teacher with
    // itself, so the overlap check below would otherwise always report it
    // as a `TeacherConflict` and the `UNIQUE` constraint's own `Duplicate`
    // outcome could never actually be returned.
    if has_exact_duplicate(conn, school_id, teaching_assignment_id, weekday, starts_at, ends_at)? {
        return Ok(CreateMeetingOutcome::Duplicate);
    }
    if has_teacher_conflict(conn, school_id, &assignment.teacher_user_id, weekday, starts_at, ends_at)? {
        return Ok(CreateMeetingOutcome::TeacherConflict);
    }
    if has_section_conflict(conn, school_id, &assignment.section_id, weekday, starts_at, ends_at)? {
        return Ok(CreateMeetingOutcome::SectionConflict);
    }
    if let Some(room) = room {
        if has_room_conflict(conn, school_id, room, weekday, starts_at, ends_at)? {
            return Ok(CreateMeetingOutcome::RoomConflict);
        }
    }

    let id = Uuid::now_v7().to_string();
    // Deliberately `ON CONFLICT ... DO NOTHING`, never `INSERT OR
    // IGNORE` -- the RBAC milestone's own lesson (see the
    // `local-database`/`auth-authorization` skills): `OR IGNORE`
    // silently swallows *any* constraint violation on the statement,
    // including the two `CHECK`s and both FKs this table has, not just
    // the intended `UNIQUE (teaching_assignment_id, weekday, starts_at,
    // ends_at)` conflict. `ON CONFLICT` only suppresses the named
    // conflict target, so an unexpected `CHECK`/FK failure here would
    // still surface as a real `Err`, exactly as it should -- a caller
    // must never see a false `Duplicate` when the real reason is
    // something else this function failed to validate first.
    let inserted = conn.execute(
        "INSERT INTO schedule_meetings \
             (id, school_id, teaching_assignment_id, weekday, starts_at, ends_at, room) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT (teaching_assignment_id, weekday, starts_at, ends_at) DO NOTHING",
        (&id, school_id, teaching_assignment_id, weekday, starts_at, ends_at, room),
    )?;
    if inserted == 0 {
        return Ok(CreateMeetingOutcome::Duplicate);
    }

    let meeting = find_by_id_in_school(conn, school_id, &id)?
        .expect("row just inserted must exist");
    Ok(CreateMeetingOutcome::Created(meeting))
}

fn has_exact_duplicate(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM schedule_meetings \
             WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND weekday = ?3 \
               AND starts_at = ?4 AND ends_at = ?5)",
        (school_id, teaching_assignment_id, weekday, starts_at, ends_at),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn has_teacher_conflict(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM schedule_meetings sm \
             JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id \
             WHERE ta.teacher_user_id = ?1 AND ta.school_id = ?2 AND sm.weekday = ?3 \
               AND sm.starts_at < ?5 AND ?4 < sm.ends_at)",
        (teacher_user_id, school_id, weekday, starts_at, ends_at),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn has_section_conflict(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM schedule_meetings sm \
             JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id \
             WHERE ta.section_id = ?1 AND ta.school_id = ?2 AND sm.weekday = ?3 \
               AND sm.starts_at < ?5 AND ?4 < sm.ends_at)",
        (section_id, school_id, weekday, starts_at, ends_at),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

fn has_room_conflict(
    conn: &Connection,
    school_id: &str,
    room: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM schedule_meetings \
             WHERE room = ?1 AND school_id = ?2 AND weekday = ?3 \
               AND starts_at < ?5 AND ?4 < ends_at)",
        (room, school_id, weekday, starts_at, ends_at),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<ScheduleMeeting>> {
    conn.query_row(
        "SELECT id, school_id, teaching_assignment_id, weekday, starts_at, ends_at, room, created_at \
         FROM schedule_meetings WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_meeting,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every meeting for one assignment, ordered for a readable weekly view.
pub fn list_by_assignment_in_school(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<ScheduleMeeting>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, teaching_assignment_id, weekday, starts_at, ends_at, room, created_at \
         FROM schedule_meetings WHERE school_id = ?1 AND teaching_assignment_id = ?2 \
         ORDER BY weekday, starts_at",
    )?;
    let rows = stmt.query_map((school_id, teaching_assignment_id), row_to_meeting)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Sum of every meeting's duration, in minutes, across all of
/// `teacher_user_id`'s assignments in `school_id` -- the one piece
/// `teaching_assignment::teacher_load` cannot compute without reaching
/// into this table, since duration lives on the meeting, not the
/// assignment.
pub fn total_weekly_minutes_for_teacher(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
) -> AppResult<i64> {
    let mut stmt = conn.prepare(
        "SELECT sm.starts_at, sm.ends_at FROM schedule_meetings sm \
         JOIN teaching_assignments ta ON ta.id = sm.teaching_assignment_id \
         WHERE ta.teacher_user_id = ?1 AND ta.school_id = ?2",
    )?;
    let rows = stmt.query_map((teacher_user_id, school_id), |row| {
        let starts_at: String = row.get(0)?;
        let ends_at: String = row.get(1)?;
        Ok((starts_at, ends_at))
    })?;
    let mut total = 0i64;
    for row in rows {
        let (starts_at, ends_at) = row?;
        let start = parse_minutes(&starts_at).unwrap_or(0) as i64;
        let end = parse_minutes(&ends_at).unwrap_or(0) as i64;
        total += end - start;
    }
    Ok(total)
}

fn row_to_meeting(row: &rusqlite::Row) -> rusqlite::Result<ScheduleMeeting> {
    Ok(ScheduleMeeting {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        weekday: row.get(3)?,
        starts_at: row.get(4)?,
        ends_at: row.get(5)?,
        room: row.get(6)?,
        created_at: row.get(7)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{school, section, subject, user},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// A school with one teacher, two sections, one subject, and one
    /// teaching assignment already created (section 1 + subject).
    fn setup(conn: &Connection) -> (String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment =
            teaching_assignment::create(conn, &s.id, &teacher.id, &sec.id, &sub.id).unwrap().unwrap();
        (s.id, teacher.id, assignment.id)
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);

        let outcome = create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();

        let CreateMeetingOutcome::Created(meeting) = outcome else {
            panic!("expected Created, got {outcome:?}");
        };
        let found = find_by_id_in_school(&conn, &school_id, &meeting.id).unwrap();
        assert_eq!(found, Some(meeting));
    }

    #[test]
    fn create_rejects_an_unknown_assignment() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let outcome = create(&conn, &school_id, "does-not-exist", 0, "08:00", "08:50", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::UnknownAssignment);
    }

    #[test]
    fn create_rejects_an_end_time_that_is_not_after_the_start_time() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);

        let outcome = create(&conn, &school_id, &assignment_id, 0, "09:00", "08:00", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::InvalidTime);
    }

    #[test]
    fn create_rejects_an_hour_out_of_range_even_though_it_matches_the_schemas_glob() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);

        // "29:00" matches the schema's shape-only GLOB check but is not
        // a real time -- must still be rejected by Rust-side parsing.
        let outcome = create(&conn, &school_id, &assignment_id, 0, "29:00", "29:50", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::InvalidTime);
    }

    /// Caught by this project's own adversarial self-review: "8:00"
    /// (missing the leading zero) parses fine numerically (hour 8 is
    /// valid) but does not match the schema's `GLOB
    /// '[0-2][0-9]:[0-5][0-9]'` shape -- without this round-trip check,
    /// such an input would sail past every Rust-side validation here
    /// only to fail as a raw, ungraceful `CHECK` constraint error at the
    /// final `INSERT`, instead of the clean `InvalidTime` outcome every
    /// other malformed-time case already returns.
    #[test]
    fn create_rejects_a_time_missing_its_leading_zero() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);

        let outcome = create(&conn, &school_id, &assignment_id, 0, "8:00", "8:50", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::InvalidTime);
    }

    /// Caught by this test during this function's own TDD pass: the
    /// first draft relied only on the schema's `CHECK (weekday BETWEEN 0
    /// AND 6)`, reached via a bare `INSERT OR IGNORE` -- which would have
    /// silently reported a bogus `Duplicate` for an out-of-range weekday
    /// instead of ever raising the `CHECK` failure, since `OR IGNORE`
    /// swallows *any* constraint violation, not just the intended
    /// `UNIQUE` one. Fixed by validating the range in Rust first and
    /// switching the insert to `ON CONFLICT ... DO NOTHING` (see
    /// `create`'s doc comments) -- this test pins that fix in place.
    #[test]
    fn create_rejects_a_weekday_outside_0_to_6() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);

        let outcome = create(&conn, &school_id, &assignment_id, 7, "08:00", "08:50", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::InvalidWeekday);
    }

    #[test]
    fn create_rejects_an_overlapping_meeting_for_the_same_teacher() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();
        // A second assignment for the same teacher, a different section.
        let other_section = section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment =
            teaching_assignment::create(&conn, &school_id, &teacher_id, &other_section.id, &sub.id)
                .unwrap()
                .unwrap();

        let outcome =
            create(&conn, &school_id, &other_assignment.id, 0, "08:30", "09:20", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::TeacherConflict);
    }

    #[test]
    fn create_accepts_an_adjacent_non_overlapping_meeting_for_the_same_teacher() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();
        let other_section = section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment =
            teaching_assignment::create(&conn, &school_id, &teacher_id, &other_section.id, &sub.id)
                .unwrap()
                .unwrap();

        let outcome =
            create(&conn, &school_id, &other_assignment.id, 0, "08:50", "09:40", None).unwrap();

        assert!(matches!(outcome, CreateMeetingOutcome::Created(_)));
    }

    #[test]
    fn create_rejects_an_overlapping_meeting_for_the_same_section_with_a_different_teacher() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();
        let section_id = teaching_assignment::find_by_id_in_school(&conn, &school_id, &assignment_id)
            .unwrap()
            .unwrap()
            .section_id;
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment =
            teaching_assignment::create(&conn, &school_id, &other_teacher.id, &section_id, &sub.id)
                .unwrap()
                .unwrap();

        let outcome =
            create(&conn, &school_id, &other_assignment.id, 0, "08:30", "09:20", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::SectionConflict);
    }

    #[test]
    fn create_rejects_an_overlapping_meeting_in_the_same_room() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", Some("Room 101")).unwrap();
        let other_section = section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment = teaching_assignment::create(
            &conn,
            &school_id,
            &other_teacher.id,
            &other_section.id,
            &sub.id,
        )
        .unwrap()
        .unwrap();

        let outcome = create(
            &conn,
            &school_id,
            &other_assignment.id,
            0,
            "08:30",
            "09:20",
            Some("Room 101"),
        )
        .unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::RoomConflict);
    }

    #[test]
    fn create_rejects_an_exact_duplicate_meeting() {
        let conn = open_test_db();
        let (school_id, _teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();

        let outcome = create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap();

        assert_eq!(outcome, CreateMeetingOutcome::Duplicate);
    }

    #[test]
    fn total_weekly_minutes_for_teacher_sums_every_meeting_across_assignments() {
        let conn = open_test_db();
        let (school_id, teacher_id, assignment_id) = setup(&conn);
        create(&conn, &school_id, &assignment_id, 0, "08:00", "08:50", None).unwrap(); // 50 min
        create(&conn, &school_id, &assignment_id, 2, "08:00", "08:50", None).unwrap(); // 50 min
        let other_section = section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let other_assignment =
            teaching_assignment::create(&conn, &school_id, &teacher_id, &other_section.id, &sub.id)
                .unwrap()
                .unwrap();
        create(&conn, &school_id, &other_assignment.id, 1, "09:00", "10:00", None).unwrap(); // 60 min

        let total = total_weekly_minutes_for_teacher(&conn, &school_id, &teacher_id).unwrap();

        assert_eq!(total, 160);
    }
}
