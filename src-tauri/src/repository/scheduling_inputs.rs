//! The four constraint-input tables of CTOS M09 — the school's own
//! scheduling parameters, teacher availability, the room/lab registry,
//! and subject weekly-minute requirements. They exist for one purpose:
//! to feed `scheduling::constraints`, the input model the Teacher Load
//! Maker locks and generates against. Every value is an explicit,
//! human-confirmable input; the engine invents none of them (see the
//! migration's own doc comment and
//! `docs/research/deped-mandaue-teacher-load-2026.md`).
//!
//! None of these tables is in the sync allowlist, and deliberately so —
//! they are school-setup data, not a teacher's per-device work, and
//! `schedule_meetings` itself is not synced either. Their staleness is
//! guarded by the plan's `input_fingerprint` instead, which is what
//! makes a plan published against yesterday's inputs reject today.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::schedule_meeting::parse_minutes;

/// The school's scheduling parameters — the bell grid and the three
/// workload limits. One row per school, materialized on first read by
/// `ensure`, so a school that has never opened the planner has full
/// national-policy defaults rather than an absent grid.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettings {
    pub school_id: String,
    pub day_starts_at: String,
    pub day_ends_at: String,
    /// Weekdays the school is in session, counted from Monday. 5 is
    /// Mon-Fri; 6 adds Saturday make-up days. The generator lays
    /// meetings onto exactly the first `school_days` weekdays.
    pub school_days: i64,
    pub period_minutes: i64,
    pub passing_minutes: i64,
    pub max_daily_teaching_minutes: i64,
    pub max_weekly_teaching_minutes: i64,
    pub updated_at: String,
}

/// The client's write shape for [`ScheduleSettings`]. A struct, not
/// eight optional command arguments, because the grid is updated as one
/// coherent whole — see [`update`].
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleSettingsUpdate {
    pub day_starts_at: String,
    pub day_ends_at: String,
    pub school_days: i64,
    pub period_minutes: i64,
    pub passing_minutes: i64,
    pub max_daily_teaching_minutes: i64,
    pub max_weekly_teaching_minutes: i64,
}

/// Returns the school's settings, inserting the default row if none
/// exists yet. Idempotent by construction — the only writer of this row
/// besides `update`.
pub fn ensure(conn: &Connection, school_id: &str) -> AppResult<ScheduleSettings> {
    if let Some(existing) = find(conn, school_id)? {
        return Ok(existing);
    }
    conn.execute(
        "INSERT INTO schedule_settings (school_id) VALUES (?1)",
        [school_id],
    )?;
    find(conn, school_id)?.ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))
}

fn find(conn: &Connection, school_id: &str) -> AppResult<Option<ScheduleSettings>> {
    conn.query_row(
        "SELECT school_id, day_starts_at, day_ends_at, school_days, period_minutes, \
          passing_minutes, max_daily_teaching_minutes, max_weekly_teaching_minutes, updated_at \
         FROM schedule_settings WHERE school_id = ?1",
        [school_id],
        row_to_settings,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Writes all eight parameters at once. A partial update would let the
/// school keep a stale `day_ends_at` alongside a new `period_minutes`,
/// and the grid is a single coherent thing, not eight independent knobs.
/// Validation lives here in Rust — the schema's `CHECK`s catch shape only,
/// the same division `schedule_meeting::create` already established.
#[allow(clippy::too_many_arguments)]
pub fn update(
    conn: &Connection,
    school_id: &str,
    day_starts_at: &str,
    day_ends_at: &str,
    school_days: i64,
    period_minutes: i64,
    passing_minutes: i64,
    max_daily_teaching_minutes: i64,
    max_weekly_teaching_minutes: i64,
) -> AppResult<ScheduleSettings> {
    validate_time(day_starts_at, "School day start")?;
    validate_time(day_ends_at, "School day end")?;
    let start = parse_minutes(day_starts_at).expect("validated above");
    let end = parse_minutes(day_ends_at).expect("validated above");
    if start >= end {
        return Err(AppError::Validation(
            "School day must end after it starts.".to_string(),
        ));
    }
    validate_range(school_days, 1, 7, "School days per week")?;
    validate_range(period_minutes, 5, 240, "Period length")?;
    validate_range(passing_minutes, 0, 240, "Passing time")?;
    validate_range(max_daily_teaching_minutes, 30, 1440, "Daily teaching limit")?;
    validate_range(
        max_weekly_teaching_minutes,
        30,
        10080,
        "Weekly teaching limit",
    )?;

    let changed = conn.execute(
        "INSERT INTO schedule_settings \
             (school_id, day_starts_at, day_ends_at, school_days, period_minutes, passing_minutes, \
              max_daily_teaching_minutes, max_weekly_teaching_minutes, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT(school_id) DO UPDATE SET \
             day_starts_at = excluded.day_starts_at, \
             day_ends_at = excluded.day_ends_at, \
             school_days = excluded.school_days, \
             period_minutes = excluded.period_minutes, \
             passing_minutes = excluded.passing_minutes, \
             max_daily_teaching_minutes = excluded.max_daily_teaching_minutes, \
             max_weekly_teaching_minutes = excluded.max_weekly_teaching_minutes, \
             updated_at = excluded.updated_at",
        (
            school_id,
            day_starts_at,
            day_ends_at,
            school_days,
            period_minutes,
            passing_minutes,
            max_daily_teaching_minutes,
            max_weekly_teaching_minutes,
        ),
    )?;
    if changed == 0 {
        return Err(AppError::Database(rusqlite::Error::QueryReturnedNoRows));
    }
    find(conn, school_id)?.ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))
}

/// A recurring weekly window a teacher is **not** available for classroom
/// teaching. Modelling the blocked windows (not the free ones) means a
/// fully-available teacher is simply absent from this table — the common
/// case, which therefore costs nothing to represent.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeacherUnavailability {
    pub id: String,
    pub school_id: String,
    pub teacher_user_id: String,
    pub weekday: i64,
    pub starts_at: String,
    pub ends_at: String,
    pub reason: Option<String>,
    pub created_at: String,
}

/// `teacher_user_id` is caller-supplied the same legitimate way every
/// other referenced id in this codebase is, and is verified to resolve
/// in `school_id` before the write — mirroring how
/// `teaching_assignment::create` validates its own teacher reference
/// rather than trusting it. Overlapping blocked windows are allowed
/// (two reasons may cover the same hour); only an exact duplicate is
/// rejected, by the schema's own `UNIQUE`.
pub fn add_unavailability(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    weekday: i64,
    starts_at: &str,
    ends_at: &str,
    reason: Option<&str>,
) -> AppResult<TeacherUnavailability> {
    validate_weekday(weekday)?;
    validate_time(starts_at, "Unavailable from")?;
    validate_time(ends_at, "Unavailable until")?;
    if parse_minutes(starts_at).expect("validated") >= parse_minutes(ends_at).expect("validated") {
        return Err(AppError::Validation(
            "An unavailable window must end after it starts.".to_string(),
        ));
    }
    if !crate::repository::user::is_member_of_school(conn, teacher_user_id, school_id)? {
        return Err(AppError::Validation(
            "That teacher is not a member of this school.".to_string(),
        ));
    }
    let trimmed = reason.and_then(|r| {
        let t = r.trim();
        if t.is_empty() {
            None
        } else {
            Some(t.to_string())
        }
    });
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO teacher_unavailability \
             (id, school_id, teacher_user_id, weekday, starts_at, ends_at, reason) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        (
            &id,
            school_id,
            teacher_user_id,
            weekday,
            starts_at,
            ends_at,
            trimmed,
        ),
    )?;
    find_unavailability(conn, school_id, &id)?
        .ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))
}

fn find_unavailability(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<TeacherUnavailability>> {
    conn.query_row(
        "SELECT id, school_id, teacher_user_id, weekday, starts_at, ends_at, reason, created_at \
         FROM teacher_unavailability WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_unavailability,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn remove_unavailability(conn: &Connection, school_id: &str, id: &str) -> AppResult<bool> {
    let affected = conn.execute(
        "DELETE FROM teacher_unavailability WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
    )?;
    Ok(affected > 0)
}

pub fn list_unavailability_by_school(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Vec<TeacherUnavailability>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, teacher_user_id, weekday, starts_at, ends_at, reason, created_at \
         FROM teacher_unavailability WHERE school_id = ?1 \
         ORDER BY teacher_user_id, weekday, starts_at",
    )?;
    let rows = stmt.query_map([school_id], row_to_unavailability)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// A schedulable room or lab. `schedule_meetings.room` predates this
/// table and remains free text; this registry is what the generator picks
/// from and what the checker validates against, and it does not
/// retroactively constrain rows the school already wrote.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ScheduleRoom {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub is_lab: bool,
    pub created_at: String,
}

pub fn create_room(
    conn: &Connection,
    school_id: &str,
    name: &str,
    is_lab: bool,
) -> AppResult<ScheduleRoom> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(AppError::Validation("A room needs a name.".to_string()));
    }
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO schedule_rooms (id, school_id, name, is_lab) VALUES (?1, ?2, ?3, ?4)",
        (&id, school_id, trimmed, is_lab),
    )?;
    find_room(conn, school_id, &id)?.ok_or(AppError::Database(rusqlite::Error::QueryReturnedNoRows))
}

fn find_room(conn: &Connection, school_id: &str, id: &str) -> AppResult<Option<ScheduleRoom>> {
    conn.query_row(
        "SELECT id, school_id, name, is_lab, created_at \
         FROM schedule_rooms WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_room,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn remove_room(conn: &Connection, school_id: &str, id: &str) -> AppResult<bool> {
    let affected = conn.execute(
        "DELETE FROM schedule_rooms WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
    )?;
    Ok(affected > 0)
}

pub fn list_rooms_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<ScheduleRoom>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, name, is_lab, created_at \
         FROM schedule_rooms WHERE school_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map([school_id], row_to_room)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// How many weekly instructional minutes a subject is scheduled for —
/// the demand side of the load maker. Lives in its own table rather than
/// a column on `subjects` because `subjects` is a synced entity and a
/// column there without a payload mapping would silently fail to travel
/// between a teacher's devices; scheduling inputs are school-setup data,
/// guarded by the plan fingerprint, and stay local.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SubjectScheduleRequirement {
    pub subject_id: String,
    pub school_id: String,
    pub required_weekly_minutes: i64,
    pub updated_at: String,
}

/// `subject_id` is verified to resolve in `school_id` first — the same
/// in-school reference check `subject` and `teaching_assignment` already
/// make their own callers' ids pass.
pub fn set_requirement(
    conn: &Connection,
    school_id: &str,
    subject_id: &str,
    required_weekly_minutes: i64,
) -> AppResult<SubjectScheduleRequirement> {
    validate_range(required_weekly_minutes, 0, 2400, "Required weekly minutes")?;
    if crate::repository::subject::find_by_id_in_school(conn, school_id, subject_id)?.is_none() {
        return Err(AppError::Validation(
            "That subject does not belong to this school.".to_string(),
        ));
    }
    conn.execute(
        "INSERT INTO subject_schedule_requirements \
             (subject_id, school_id, required_weekly_minutes, updated_at) \
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT(subject_id) DO UPDATE SET \
             required_weekly_minutes = excluded.required_weekly_minutes, \
             updated_at = excluded.updated_at",
        (subject_id, school_id, required_weekly_minutes),
    )?;
    conn.query_row(
        "SELECT subject_id, school_id, required_weekly_minutes, updated_at \
         FROM subject_schedule_requirements WHERE subject_id = ?1 AND school_id = ?2",
        (subject_id, school_id),
        row_to_requirement,
    )
    .map_err(Into::into)
}

pub fn list_requirements_by_school(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Vec<SubjectScheduleRequirement>> {
    let mut stmt = conn.prepare(
        "SELECT subject_id, school_id, required_weekly_minutes, updated_at \
         FROM subject_schedule_requirements WHERE school_id = ?1 \
         ORDER BY subject_id",
    )?;
    let rows = stmt.query_map([school_id], row_to_requirement)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn validate_time(value: &str, label: &str) -> AppResult<()> {
    if parse_minutes(value).is_none() {
        return Err(AppError::Validation(format!(
            "{label} must be a valid 24-hour HH:MM time."
        )));
    }
    Ok(())
}

fn validate_weekday(weekday: i64) -> AppResult<()> {
    if !(0..=6).contains(&weekday) {
        return Err(AppError::Validation(
            "Weekday must be between Sunday (0) and Saturday (6).".to_string(),
        ));
    }
    Ok(())
}

fn validate_range(value: i64, low: i64, high: i64, label: &str) -> AppResult<()> {
    if !(low..=high).contains(&value) {
        return Err(AppError::Validation(format!(
            "{label} must be between {low} and {high}."
        )));
    }
    Ok(())
}

fn row_to_settings(row: &rusqlite::Row) -> rusqlite::Result<ScheduleSettings> {
    Ok(ScheduleSettings {
        school_id: row.get(0)?,
        day_starts_at: row.get(1)?,
        day_ends_at: row.get(2)?,
        school_days: row.get(3)?,
        period_minutes: row.get(4)?,
        passing_minutes: row.get(5)?,
        max_daily_teaching_minutes: row.get(6)?,
        max_weekly_teaching_minutes: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn row_to_unavailability(row: &rusqlite::Row) -> rusqlite::Result<TeacherUnavailability> {
    Ok(TeacherUnavailability {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teacher_user_id: row.get(2)?,
        weekday: row.get(3)?,
        starts_at: row.get(4)?,
        ends_at: row.get(5)?,
        reason: row.get(6)?,
        created_at: row.get(7)?,
    })
}

fn row_to_room(row: &rusqlite::Row) -> rusqlite::Result<ScheduleRoom> {
    Ok(ScheduleRoom {
        id: row.get(0)?,
        school_id: row.get(1)?,
        name: row.get(2)?,
        is_lab: row.get(3)?,
        created_at: row.get(4)?,
    })
}

fn row_to_requirement(row: &rusqlite::Row) -> rusqlite::Result<SubjectScheduleRequirement> {
    Ok(SubjectScheduleRequirement {
        subject_id: row.get(0)?,
        school_id: row.get(1)?,
        required_weekly_minutes: row.get(2)?,
        updated_at: row.get(3)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school, repository::subject, repository::user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// A school with one teacher member and two subjects, the shape every
    /// test in this module builds on.
    fn setup(conn: &Connection) -> (String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let math = subject::create(conn, &s.id, "Mathematics").unwrap();
        (s.id, teacher.id, math.id)
    }

    #[test]
    fn ensure_creates_the_default_row_and_is_idempotent() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let first = ensure(&conn, &school_id).unwrap();
        // National-policy defaults, not engine-invented ones: the 360-minute
        // daily cap is DepEd Order No. 005 s. 2024's six-hour classroom
        // teaching ceiling, editable by the school.
        assert_eq!(first.max_daily_teaching_minutes, 360);
        assert_eq!(first.day_starts_at, "07:30");

        let second = ensure(&conn, &school_id).unwrap();
        assert_eq!(first, second, "ensure must not insert a second row");
    }

    #[test]
    fn update_persists_every_parameter() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let updated = update(&conn, &school_id, "08:00", "16:00", 6, 60, 15, 300, 1500).unwrap();

        assert_eq!(updated.day_starts_at, "08:00");
        assert_eq!(updated.school_days, 6);
        assert_eq!(updated.period_minutes, 60);
        assert_eq!(updated.max_daily_teaching_minutes, 300);
        // A re-read proves it landed in the row, not just in the return value.
        assert_eq!(ensure(&conn, &school_id).unwrap(), updated);
    }

    #[test]
    fn update_rejects_a_day_that_does_not_end_after_it_starts() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let result = update(&conn, &school_id, "08:00", "08:00", 5, 60, 15, 300, 1500);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_rejects_a_time_that_is_not_hh_mm_shaped() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let result = update(&conn, &school_id, "8:00", "16:00", 5, 60, 15, 300, 1500);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_rejects_a_period_out_of_range() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let result = update(&conn, &school_id, "08:00", "16:00", 5, 1, 15, 300, 1500);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn update_rejects_school_days_out_of_range() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let result = update(&conn, &school_id, "08:00", "16:00", 8, 60, 15, 300, 1500);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn add_unavailability_validates_the_teacher_is_in_the_school() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);
        let outsider = user::create_user(&conn, "outsider", "password", "Outsider").unwrap();

        let result = add_unavailability(&conn, &school_id, &outsider.id, 1, "12:00", "13:00", None);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn add_unavailability_rejects_an_inverted_window() {
        let conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);

        let result = add_unavailability(&conn, &school_id, &teacher_id, 1, "13:00", "12:00", None);

        assert!(matches!(result, Err(AppError::Validation(_))));
    }

    #[test]
    fn unavailability_round_trips_and_is_scoped_to_the_school() {
        let conn = open_test_db();
        let (school_id, teacher_id, _) = setup(&conn);
        let added = add_unavailability(
            &conn,
            &school_id,
            &teacher_id,
            1,
            "12:00",
            "13:00",
            Some("Fixed ancillary duty"),
        )
        .unwrap();

        assert_eq!(added.reason.as_deref(), Some("Fixed ancillary duty"));
        assert_eq!(
            list_unavailability_by_school(&conn, &school_id)
                .unwrap()
                .len(),
            1
        );

        // A blank reason is stored as NULL, never as an empty string.
        let blank = add_unavailability(
            &conn,
            &school_id,
            &teacher_id,
            2,
            "12:00",
            "13:00",
            Some("  "),
        )
        .unwrap();
        assert!(blank.reason.is_none());

        // Removal is school-scoped: another school cannot delete it.
        let other = school::create(&conn, "Other School").unwrap();
        assert!(!remove_unavailability(&conn, &other.id, &added.id).unwrap());
        assert_eq!(
            list_unavailability_by_school(&conn, &school_id)
                .unwrap()
                .len(),
            2
        );
    }

    #[test]
    fn room_round_trips_and_rejects_a_blank_name() {
        let conn = open_test_db();
        let (school_id, ..) = setup(&conn);

        let lab = create_room(&conn, &school_id, "Science Laboratory", true).unwrap();
        assert!(lab.is_lab);
        assert_eq!(
            list_rooms_by_school(&conn, &school_id).unwrap(),
            vec![lab.clone()]
        );

        assert!(matches!(
            create_room(&conn, &school_id, "  ", false),
            Err(AppError::Validation(_))
        ));
        // A duplicate name is the schema's own UNIQUE, not a Rust check.
        assert!(create_room(&conn, &school_id, "Science Laboratory", false).is_err());

        assert!(remove_room(&conn, &school_id, &lab.id).unwrap());
        assert!(list_rooms_by_school(&conn, &school_id).unwrap().is_empty());
    }

    #[test]
    fn set_requirement_validates_the_subject_is_in_the_school() {
        let conn = open_test_db();
        let (school_id, _, math_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_subject = subject::create(&conn, &other_school.id, "Physics").unwrap();

        assert!(matches!(
            set_requirement(&conn, &school_id, &other_subject.id, 300),
            Err(AppError::Validation(_))
        ));

        let set = set_requirement(&conn, &school_id, &math_id, 300).unwrap();
        assert_eq!(set.required_weekly_minutes, 300);
        // Upsert, not insert-then-duplicate.
        let again = set_requirement(&conn, &school_id, &math_id, 250).unwrap();
        assert_eq!(again.required_weekly_minutes, 250);
        assert_eq!(
            list_requirements_by_school(&conn, &school_id)
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn set_requirement_rejects_minutes_out_of_range() {
        let conn = open_test_db();
        let (school_id, _, math_id) = setup(&conn);

        assert!(matches!(
            set_requirement(&conn, &school_id, &math_id, 10_000),
            Err(AppError::Validation(_))
        ));
    }
}
