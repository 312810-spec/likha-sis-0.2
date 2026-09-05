use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{learner, section, section_membership};

/// DepEd's actual per-day attendance codes, verified against a real
/// `CONSO SF v2025.xlsx` School Form 2 workbook: Present (blank),
/// Absent (x), Tardy (shaded) — there is no official "Excused" code. An
/// earlier version of this app shipped a 4th `Late`/`Excused` pairing that
/// did not match DepEd; `Late` is the direct rename to `Tardy`, and
/// `Excused` (which has no DepEd equivalent) is migrated to `Absent` by
/// migration 5 — see `docs/adr/0008-section-foundation-and-attendance-semantics.md`.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AttendanceStatus {
    Present,
    Absent,
    Tardy,
}

impl AttendanceStatus {
    fn as_db_str(self) -> &'static str {
        match self {
            AttendanceStatus::Present => "present",
            AttendanceStatus::Absent => "absent",
            AttendanceStatus::Tardy => "tardy",
        }
    }

    /// The `CHECK` constraint on `attendance_records.status` should make an
    /// unrecognized value impossible for any row this application ever
    /// wrote — but a fallible conversion (a `rusqlite::Error`, not a panic)
    /// is still the right shape here: it turns "the constraint was somehow
    /// bypassed" (dropped constraint, manual DB edit, a future migration
    /// bug, or a pre-migration-5 'excused'/'late' row that somehow survived)
    /// into a normal, recoverable `AppError::Database` for the one command
    /// that hit it, instead of crashing the whole application.
    fn from_db_str(s: &str) -> rusqlite::Result<AttendanceStatus> {
        match s {
            "present" => Ok(AttendanceStatus::Present),
            "absent" => Ok(AttendanceStatus::Absent),
            "tardy" => Ok(AttendanceStatus::Tardy),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unknown attendance status: {other}").into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceRecord {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub learner_id: String,
    pub attendance_date: String,
    pub status: AttendanceStatus,
    pub recorded_at: String,
}

/// One roster row for a given date: a learner joined with their attendance
/// status for that date, or `None` if nobody has marked them yet. Built
/// this way (a `LEFT JOIN` from the full roster, not a plain list of
/// `attendance_records`) so a teacher always sees every learner in their
/// school, including the ones nobody has marked today.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AttendanceRosterEntry {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub status: Option<AttendanceStatus>,
    pub recorded_at: Option<String>,
}

/// Records (or overwrites) `learner_id`'s attendance status for
/// `attendance_date` within `section_id`, scoped to `school_id`. Verifies,
/// in order: the section belongs to this school, the learner belongs to
/// this school, and the learner holds an active membership in this section
/// on this date (via `section_membership::is_active_member`) — so
/// attendance can never be recorded for a learner who isn't actually on
/// that section's roster for that day, even if the caller somehow supplied
/// a learner id from elsewhere in the same school. Returns `None` for any
/// of those failures, never distinguishing which one, matching the rest of
/// this codebase's isolation convention (`learner::find_by_id_in_school`).
pub fn record(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
    attendance_date: &str,
    status: AttendanceStatus,
) -> AppResult<Option<AttendanceRecord>> {
    if section::find_by_id_in_school(conn, school_id, section_id)?.is_none() {
        return Ok(None);
    }
    if learner::find_by_id_in_school(conn, school_id, learner_id)?.is_none() {
        return Ok(None);
    }
    if !section_membership::is_active_member(
        conn,
        school_id,
        section_id,
        learner_id,
        attendance_date,
    )? {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO attendance_records \
             (id, school_id, section_id, learner_id, attendance_date, status) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6) \
         ON CONFLICT (learner_id, attendance_date) \
         DO UPDATE SET status = excluded.status, \
                        section_id = excluded.section_id, \
                        recorded_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (
            &id,
            school_id,
            section_id,
            learner_id,
            attendance_date,
            status.as_db_str(),
        ),
    )?;

    conn.query_row(
        "SELECT id, school_id, section_id, learner_id, attendance_date, status, recorded_at \
         FROM attendance_records \
         WHERE learner_id = ?1 AND attendance_date = ?2 AND school_id = ?3",
        (learner_id, attendance_date, school_id),
        row_to_record,
    )
    .map(Some)
    .map_err(AppError::from)
}

/// Sync-pull counterpart to `record` — materializes an `AttendanceRecord`
/// this device received (already validated/enqueued by whichever device
/// originally called `record`), instead of re-deriving one from raw
/// caller input. Mirrors `learner::upsert_from_sync`'s exact shape: an
/// `INSERT ... ON CONFLICT(id) DO UPDATE` keyed on the row's own stable
/// `id` (not the `(learner_id, attendance_date)` unique constraint
/// `record`'s own insert conflicts on) — the same `id`, minted once on the
/// originating device, is what every other device's pulled copy of this
/// row must converge on, exactly like a learner's `id` does. Not
/// re-validating section/roster membership here is deliberate and safe:
/// this data already passed that check on the device that originally
/// called `record`; re-deriving it here would let a stale local
/// section/membership row on THIS device silently reject a pull that is
/// actually correct hub-side truth. `.claude/rules/architecture.md`: all
/// SQL stays in Rust/this repository module, never in `sync_client`.
pub fn upsert_from_sync(conn: &Connection, record: &AttendanceRecord) -> AppResult<()> {
    conn.execute(
        "INSERT INTO attendance_records \
             (id, school_id, section_id, learner_id, attendance_date, status, recorded_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT(id) DO UPDATE SET \
             school_id = excluded.school_id, \
             section_id = excluded.section_id, \
             learner_id = excluded.learner_id, \
             attendance_date = excluded.attendance_date, \
             status = excluded.status, \
             recorded_at = excluded.recorded_at",
        (
            &record.id,
            &record.school_id,
            &record.section_id,
            &record.learner_id,
            &record.attendance_date,
            record.status.as_db_str(),
            &record.recorded_at,
        ),
    )?;
    Ok(())
}

/// The school-scoped lookup safe to expose as a command: a caller can only
/// ever resolve an attendance record within the school they explicitly ask
/// about. Returns `None` both when no record has this id and when it
/// belongs to a different school — the two are indistinguishable on
/// purpose, matching `learner::find_by_id_in_school`/
/// `section::find_by_id_in_school`. Added for the conflict-review screen,
/// which needs to show a teacher what THIS device's own unsynced edit
/// currently looks like alongside the incoming hub version.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    record_id: &str,
) -> AppResult<Option<AttendanceRecord>> {
    conn.query_row(
        "SELECT id, school_id, section_id, learner_id, attendance_date, status, recorded_at \
         FROM attendance_records WHERE id = ?1 AND school_id = ?2",
        (record_id, school_id),
        row_to_record,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The roster for `section_id` on `attendance_date` — every learner with an
/// active membership in that section on that date, paired with their
/// attendance status for that date if one has been recorded. Isolation is
/// enforced in the `WHERE` clause on `section_memberships.school_id` **and**
/// independently on the joined `learners` row (`l.school_id = ?1`, matching
/// `section_membership::roster_for_section*`), not by joining every school's
/// attendance and filtering afterward — a forged cross-school membership row
/// cannot leak a learner's name here.
pub fn roster_for_section_date(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    attendance_date: &str,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let mut stmt = conn.prepare(
        "SELECT l.id, l.given_name, l.family_name, a.status, a.recorded_at \
         FROM learners l \
         JOIN section_memberships sm ON sm.learner_id = l.id \
         LEFT JOIN attendance_records a \
           ON a.learner_id = l.id AND a.attendance_date = ?3 AND a.section_id = ?2 \
              AND a.school_id = ?1 \
         WHERE sm.section_id = ?2 AND sm.school_id = ?1 AND l.school_id = ?1 \
           AND sm.starts_on <= ?3 AND (sm.ends_on IS NULL OR ?3 < sm.ends_on) \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map((school_id, section_id, attendance_date), |row| {
        let status: Option<String> = row.get(3)?;
        Ok(AttendanceRosterEntry {
            learner_id: row.get(0)?,
            given_name: row.get(1)?,
            family_name: row.get(2)?,
            status: status
                .as_deref()
                .map(AttendanceStatus::from_db_str)
                .transpose()?,
            recorded_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Marks every learner on `section_id`'s roster for `attendance_date` who
/// does not already have an attendance status that day as `Present`, then
/// returns the resulting roster. An already-marked learner (Present,
/// Absent, or Tardy) is left untouched -- this is a productivity shortcut
/// for the common case (most of the class is present most days), not a
/// blanket overwrite, so it can never silently discard a mark a teacher
/// already made (e.g. clicking "Mark all present" after already marking
/// one learner Absent must not flip that learner back to Present). Reuses
/// `record` for each learner it does mark, so the same isolation/roster
/// validation applies per learner as any individual mark would get; reuses
/// `roster_for_section_date` for both reading who needs marking and
/// producing the final result, so an unknown/foreign `section_id` simply
/// yields an empty roster and marks nobody, matching that function's own
/// isolation convention.
pub fn bulk_mark_present(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    attendance_date: &str,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let roster = roster_for_section_date(conn, school_id, section_id, attendance_date)?;
    for entry in roster.iter().filter(|e| e.status.is_none()) {
        record(
            conn,
            school_id,
            section_id,
            &entry.learner_id,
            attendance_date,
            AttendanceStatus::Present,
        )?;
    }
    roster_for_section_date(conn, school_id, section_id, attendance_date)
}

/// A learner's attendance across one calendar month: one entry per day of
/// the month (index 0 = day 1), `None` for an unmarked day, plus running
/// totals — the shape DepEd's SF2 (Daily Attendance Report of Learners)
/// is built around (a monthly grid, one row per learner). This is
/// intentionally an SF2-*shaped* summary, not a verified reproduction of
/// the current official template — see `docs/product/M8-DECISION.md`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyLearnerAttendance {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    pub sex: Option<String>,
    pub days: Vec<Option<AttendanceStatus>>,
    pub present_count: u32,
    pub absent_count: u32,
    pub tardy_count: u32,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyAttendanceReport {
    pub year: i32,
    pub month: u32,
    /// Calendar day-of-month numbers that are school days (Mon-Fri) this
    /// month, in order — parallel to each learner's `days` array.
    pub school_days: Vec<u32>,
    pub learners: Vec<MonthlyLearnerAttendance>,
}

fn is_leap_year(year: i32) -> bool {
    (year % 4 == 0 && year % 100 != 0) || (year % 400 == 0)
}

fn days_in_month(year: i32, month: u32) -> u32 {
    match month {
        1 | 3 | 5 | 7 | 8 | 10 | 12 => 31,
        4 | 6 | 9 | 11 => 30,
        2 => {
            if is_leap_year(year) {
                29
            } else {
                28
            }
        }
        _ => 0,
    }
}

/// The full monthly grid for `section_id`: every learner who held an active
/// membership in that section at any point during `year`/`month`, paired
/// with their attendance status for each **school day** (Monday-Friday;
/// this app has no school-calendar/holiday concept, so weekday is the only
/// distinction it can make) — matching DepEd SF2's own per-day columns,
/// which are verified to be weekday-only, not every calendar day (see
/// `docs/product/M8-DECISION.md`). Unmarked days are `None`; a day the
/// learner was not yet (or no longer) an active member on is also `None` —
/// this grid does not distinguish "unmarked" from "not enrolled that day",
/// a deliberate v1 simplification (see ADR-0008). Isolation is enforced via
/// `section_membership::roster_for_section_over_range`'s
/// `school_id`/`section_id` scoping. `month` outside 1-12 returns an empty
/// report rather than erroring — validated properly one layer up in
/// `AttendanceApplicationService`.
pub fn monthly_grid_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    year: i32,
    month: u32,
) -> AppResult<MonthlyAttendanceReport> {
    let total_days = days_in_month(year, month);
    let school_days: Vec<u32> = (1..=total_days)
        .filter(|&day| day_of_week(year, month, day).is_some_and(|dow| (1..=5).contains(&dow)))
        .collect();
    if school_days.is_empty() {
        return Ok(MonthlyAttendanceReport {
            year,
            month,
            school_days,
            learners: Vec::new(),
        });
    }
    let first_day = format!("{year:04}-{month:02}-01");
    let last_day = format!("{year:04}-{month:02}-{total_days:02}");

    let roster = section_membership::roster_for_section_over_range(
        conn, school_id, section_id, &first_day, &last_day,
    )?;

    let mut learners: Vec<MonthlyLearnerAttendance> = roster
        .into_iter()
        .map(|m| MonthlyLearnerAttendance {
            learner_id: m.learner_id,
            given_name: m.given_name,
            family_name: m.family_name,
            lrn: m.lrn,
            sex: m.sex,
            days: vec![None; school_days.len()],
            present_count: 0,
            absent_count: 0,
            tardy_count: 0,
        })
        .collect();

    let mut stmt = conn.prepare(
        "SELECT learner_id, attendance_date, status \
         FROM attendance_records \
         WHERE school_id = ?1 AND section_id = ?2 \
           AND attendance_date BETWEEN ?3 AND ?4",
    )?;
    let rows = stmt.query_map((school_id, section_id, &first_day, &last_day), |row| {
        let learner_id: String = row.get(0)?;
        let attendance_date: String = row.get(1)?;
        let status: String = row.get(2)?;
        Ok((learner_id, attendance_date, status))
    })?;

    for row in rows {
        let (learner_id, attendance_date, status) = row?;
        let Some(entry) = learners.iter_mut().find(|l| l.learner_id == learner_id) else {
            continue;
        };
        let day_of_month: u32 = attendance_date[8..10].parse().unwrap_or(0);
        let Some(column) = school_days.iter().position(|&d| d == day_of_month) else {
            // A weekend mark exists in the raw data (daily attendance
            // allows marking any date) — excluded from this weekday-only
            // grid by design, silently dropped here, not an error.
            continue;
        };
        let status = AttendanceStatus::from_db_str(&status)?;
        entry.days[column] = Some(status);
        match status {
            AttendanceStatus::Present => entry.present_count += 1,
            AttendanceStatus::Absent => entry.absent_count += 1,
            AttendanceStatus::Tardy => entry.tardy_count += 1,
        }
    }

    Ok(MonthlyAttendanceReport {
        year,
        month,
        school_days,
        learners,
    })
}

/// Day of week for a Gregorian calendar date, via Sakamoto's algorithm —
/// `0` = Sunday .. `6` = Saturday. Returns `None` for an out-of-range
/// month/day rather than panicking (this app has no date library
/// dependency; this is the standard small closed-form implementation).
fn day_of_week(year: i32, month: u32, day: u32) -> Option<u32> {
    if !(1..=12).contains(&month) || day == 0 || day > days_in_month(year, month) {
        return None;
    }
    const T: [i32; 12] = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
    let y = if month < 3 { year - 1 } else { year };
    let idx = (month - 1) as usize;
    let dow = (y + y / 4 - y / 100 + y / 400 + T[idx] + day as i32).rem_euclid(7);
    Some(dow as u32)
}

/// School-wide attendance counts for a single date, one row per status.
/// Aggregate counts only -- no learner identity in the result. Scoped to
/// `school_id` (a required argument, never optional); `date` is an ISO
/// `YYYY-MM-DD` string. Uses the existing `idx_attendance_school_date`
/// index. Empty (all zero), not an error, when nothing was recorded.
///
/// The fields mirror DepEd's real three per-day categories
/// (`present` / `absent` / `tardy`) exactly as `AttendanceStatus` and the
/// `attendance_records.status` CHECK constraint define them -- there is no
/// "late"/"excused" here (see migration 5 and
/// `docs/adr/0008-section-foundation-and-attendance-semantics.md`). Any
/// status the CHECK constraint would not permit is ignored rather than
/// erroring, matching `AttendanceRecord`'s own tolerance for a somehow
/// bypassed constraint.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchoolDayTotals {
    pub present: u32,
    pub absent: u32,
    pub tardy: u32,
}

pub fn school_day_totals(
    conn: &Connection,
    school_id: &str,
    date: &str,
) -> AppResult<SchoolDayTotals> {
    let mut totals = SchoolDayTotals {
        present: 0,
        absent: 0,
        tardy: 0,
    };
    let mut stmt = conn.prepare(
        "SELECT status, COUNT(*) FROM attendance_records \
         WHERE school_id = ?1 AND attendance_date = ?2 GROUP BY status",
    )?;
    let rows = stmt.query_map((school_id, date), |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, u32>(1)?))
    })?;
    for row in rows {
        let (status, count) = row?;
        match status.as_str() {
            "present" => totals.present = count,
            "absent" => totals.absent = count,
            "tardy" => totals.tardy = count,
            _ => {}
        }
    }
    Ok(totals)
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<AttendanceRecord> {
    let status: String = row.get(5)?;
    Ok(AttendanceRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        learner_id: row.get(3)?,
        attendance_date: row.get(4)?,
        status: AttendanceStatus::from_db_str(&status)?,
        recorded_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{school, section, section_membership},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// Sets up a school, a section, and a learner enrolled in that section
    /// as of 2026-08-01, so attendance can be recorded for them from that
    /// date onward. Returns (school_id, section_id, learner_id).
    fn setup_enrolled_learner(conn: &Connection) -> (String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        let l = learner::create(conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
        section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-08-01").unwrap();
        (s.id, sec.id, l.id)
    }

    #[test]
    fn recording_attendance_for_an_unmarked_learner_creates_a_record() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);

        let recorded = record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap()
        .unwrap();

        assert_eq!(recorded.learner_id, learner_id);
        assert_eq!(recorded.school_id, school_id);
        assert_eq!(recorded.section_id, section_id);
        assert_eq!(recorded.attendance_date, "2026-08-24");
        assert_eq!(recorded.status, AttendanceStatus::Present);
    }

    #[test]
    fn recording_attendance_again_for_the_same_learner_and_date_overwrites_the_status_not_duplicates_it(
    ) {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);

        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Absent,
        )
        .unwrap();
        let corrected = record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Tardy,
        )
        .unwrap()
        .unwrap();

        assert_eq!(corrected.status, AttendanceStatus::Tardy);

        let roster = roster_for_section_date(&conn, &school_id, &section_id, "2026-08-24").unwrap();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].status, Some(AttendanceStatus::Tardy));
    }

    #[test]
    fn recording_attendance_for_a_learner_in_a_different_school_is_rejected() {
        let conn = open_test_db();
        let (_school_a, section_a, learner_a) = setup_enrolled_learner(&conn);
        let school_b = school::create(&conn, "School B").unwrap();

        let result = record(
            &conn,
            &school_b.id,
            &section_a,
            &learner_a,
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn recording_attendance_for_a_learner_not_on_the_sections_roster_is_rejected() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        let unenrolled = learner::create(&conn, &s.id, "Maria", "Santos", None, None).unwrap();

        let result = record(
            &conn,
            &s.id,
            &sec.id,
            &unenrolled.id,
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap();

        assert_eq!(
            result, None,
            "a learner not on the section's roster must not be markable"
        );
    }

    #[test]
    fn recording_attendance_for_an_unknown_learner_id_is_rejected() {
        let conn = open_test_db();
        let (school_id, section_id, _) = setup_enrolled_learner(&conn);

        let result = record(
            &conn,
            &school_id,
            &section_id,
            "does-not-exist",
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn roster_for_section_date_includes_every_active_member_marked_or_not() {
        let conn = open_test_db();
        let (school_id, section_id, marked) = setup_enrolled_learner(&conn);
        let unmarked = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &unmarked.id, "2026-08-01")
            .unwrap();
        record(
            &conn,
            &school_id,
            &section_id,
            &marked,
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap();

        let roster = roster_for_section_date(&conn, &school_id, &section_id, "2026-08-24").unwrap();

        assert_eq!(roster.len(), 2);
        let marked_entry = roster.iter().find(|e| e.learner_id == marked).unwrap();
        assert_eq!(marked_entry.status, Some(AttendanceStatus::Present));
        let unmarked_entry = roster.iter().find(|e| e.learner_id == unmarked.id).unwrap();
        assert_eq!(unmarked_entry.status, None);
        assert_eq!(unmarked_entry.recorded_at, None);
    }

    #[test]
    fn roster_for_section_date_does_not_include_another_schools_learners() {
        let conn = open_test_db();
        let (_school_a, section_a, _) = setup_enrolled_learner(&conn);
        let school_b = school::create(&conn, "School B").unwrap();

        let roster =
            roster_for_section_date(&conn, &school_b.id, &section_a, "2026-08-24").unwrap();

        assert!(roster.is_empty());
    }

    #[test]
    fn roster_for_section_date_join_independently_constrains_the_learner_to_the_same_school() {
        // Defense in depth, matching
        // `section_membership::roster_for_section*`: a hand-forged
        // `section_memberships` row pointing a foreign-school learner at this
        // section (something `enroll` refuses to create) must not leak that
        // learner's name into the attendance roster, because the query
        // constrains `l.school_id` too, not only `sm.school_id`.
        let conn = open_test_db();
        let (school_a, section_a, legit_learner) = setup_enrolled_learner(&conn);
        let school_b = school::create(&conn, "School B").unwrap();
        let foreign = learner::create(&conn, &school_b.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged-rfsd', ?1, ?2, ?3, '2026-08-01')",
            (&school_a, &section_a, &foreign.id),
        )
        .unwrap();

        let roster = roster_for_section_date(&conn, &school_a, &section_a, "2026-08-24").unwrap();

        assert_eq!(
            roster.len(),
            1,
            "only the legitimately enrolled learner appears"
        );
        assert_eq!(roster[0].learner_id, legit_learner);
        assert!(
            roster.iter().all(|e| e.learner_id != foreign.id),
            "a learner belonging to another school must never appear, even via a forged membership row"
        );
    }

    #[test]
    fn roster_for_section_date_left_join_ignores_a_foreign_school_attendance_record() {
        // Defense in depth (repo-wide tenant-isolation JOIN audit): the
        // `LEFT JOIN attendance_records` must also constrain `a.school_id`,
        // matching `learner_score::roster_for_item`'s `ls.school_id`
        // predicate. A hand-forged attendance row in another school for an
        // in-scope learner + section + date must not surface its status
        // here.
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let other = school::create(&conn, "Other School").unwrap();
        conn.execute(
            "INSERT INTO attendance_records \
                 (id, school_id, section_id, learner_id, attendance_date, status) \
             VALUES ('a-forged', ?1, ?2, ?3, ?4, 'present')",
            (&other.id, &section_id, &learner_id, "2026-08-24"),
        )
        .unwrap();

        let roster = roster_for_section_date(&conn, &school_id, &section_id, "2026-08-24").unwrap();

        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].learner_id, learner_id);
        assert_eq!(
            roster[0].status, None,
            "an attendance record belonging to another school must not show as this learner's status"
        );
    }

    #[test]
    fn roster_for_section_date_only_shows_status_for_the_requested_date() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-23",
            AttendanceStatus::Absent,
        )
        .unwrap();

        let roster = roster_for_section_date(&conn, &school_id, &section_id, "2026-08-24").unwrap();

        assert_eq!(roster[0].status, None);
    }

    #[test]
    fn bulk_mark_present_marks_every_unmarked_learner_present() {
        let conn = open_test_db();
        let (school_id, section_id, _) = setup_enrolled_learner(&conn);
        let second = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &second.id, "2026-08-01")
            .unwrap();

        let roster = bulk_mark_present(&conn, &school_id, &section_id, "2026-08-24").unwrap();

        assert_eq!(roster.len(), 2);
        assert!(roster
            .iter()
            .all(|e| e.status == Some(AttendanceStatus::Present)));
    }

    #[test]
    fn bulk_mark_present_does_not_overwrite_an_already_marked_learner() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let unmarked = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &unmarked.id, "2026-08-01")
            .unwrap();
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Absent,
        )
        .unwrap();

        let roster = bulk_mark_present(&conn, &school_id, &section_id, "2026-08-24").unwrap();

        let already_marked = roster.iter().find(|e| e.learner_id == learner_id).unwrap();
        assert_eq!(
            already_marked.status,
            Some(AttendanceStatus::Absent),
            "an existing mark must never be overwritten by the bulk action"
        );
        let newly_marked = roster.iter().find(|e| e.learner_id == unmarked.id).unwrap();
        assert_eq!(newly_marked.status, Some(AttendanceStatus::Present));
    }

    #[test]
    fn bulk_mark_present_does_not_mark_a_learner_outside_the_callers_school() {
        let conn = open_test_db();
        let (_school_a, section_a, _) = setup_enrolled_learner(&conn);
        let school_b = school::create(&conn, "School B").unwrap();

        let roster = bulk_mark_present(&conn, &school_b.id, &section_a, "2026-08-24").unwrap();

        assert!(roster.is_empty());
        // Confirm nothing was written for school A's learner either.
        let roster_a =
            roster_for_section_date(&conn, &_school_a, &section_a, "2026-08-24").unwrap();
        assert_eq!(roster_a[0].status, None);
    }

    #[test]
    fn day_of_week_matches_known_reference_dates() {
        // 2026-08-24 is a Monday; 2026-08-01 is a Saturday; 2000-02-29
        // (a leap day, exercising the leap-year branch) is a Tuesday.
        assert_eq!(day_of_week(2026, 8, 24), Some(1));
        assert_eq!(day_of_week(2026, 8, 1), Some(6));
        assert_eq!(day_of_week(2000, 2, 29), Some(2));
    }

    #[test]
    fn day_of_week_rejects_an_out_of_range_day() {
        assert_eq!(day_of_week(2026, 2, 30), None); // Feb never has 30 days
        assert_eq!(day_of_week(2026, 13, 1), None); // no month 13
    }

    #[test]
    fn monthly_grid_only_includes_weekday_columns() {
        let conn = open_test_db();
        let (school_id, section_id, _) = setup_enrolled_learner(&conn);

        // August 2026: 1st is a Saturday, 2nd a Sunday — both excluded.
        let report = monthly_grid_for_section(&conn, &school_id, &section_id, 2026, 8).unwrap();

        assert!(!report.school_days.contains(&1));
        assert!(!report.school_days.contains(&2));
        assert!(report.school_days.contains(&3)); // the following Monday
        assert_eq!(report.learners[0].days.len(), report.school_days.len());
    }

    #[test]
    fn monthly_grid_places_each_mark_in_the_correct_day_column_and_totals_it() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Present,
        )
        .unwrap(); // Mon
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-25",
            AttendanceStatus::Absent,
        )
        .unwrap(); // Tue
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-27",
            AttendanceStatus::Tardy,
        )
        .unwrap(); // Thu

        let report = monthly_grid_for_section(&conn, &school_id, &section_id, 2026, 8).unwrap();

        let learner = &report.learners[0];
        let col_24 = report.school_days.iter().position(|&d| d == 24).unwrap();
        let col_25 = report.school_days.iter().position(|&d| d == 25).unwrap();
        let col_27 = report.school_days.iter().position(|&d| d == 27).unwrap();
        assert_eq!(learner.days[col_24], Some(AttendanceStatus::Present));
        assert_eq!(learner.days[col_25], Some(AttendanceStatus::Absent));
        assert_eq!(learner.days[col_27], Some(AttendanceStatus::Tardy));
        assert_eq!(learner.present_count, 1);
        assert_eq!(learner.absent_count, 1);
        assert_eq!(learner.tardy_count, 1);
    }

    #[test]
    fn monthly_grid_ignores_a_weekend_mark_and_a_different_months_mark() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-01",
            AttendanceStatus::Present,
        )
        .unwrap(); // Saturday
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-08",
            AttendanceStatus::Absent,
        )
        .unwrap(); // also Saturday, safe weekend probe

        let report = monthly_grid_for_section(&conn, &school_id, &section_id, 2026, 8).unwrap();

        let learner = &report.learners[0];
        assert!(learner.days.iter().all(|d| d.is_none()));
        assert_eq!(learner.present_count, 0);
        assert_eq!(learner.absent_count, 0);
    }

    #[test]
    fn school_day_totals_is_zero_when_nothing_recorded() {
        let conn = open_test_db();
        let (school_id, _section_id, _learner_id) = setup_enrolled_learner(&conn);

        let totals = school_day_totals(&conn, &school_id, "2026-09-03").unwrap();

        assert_eq!(
            totals,
            SchoolDayTotals {
                present: 0,
                absent: 0,
                tardy: 0,
            }
        );
    }

    #[test]
    fn school_day_totals_counts_each_status_for_the_date() {
        let conn = open_test_db();
        let (school_id, section_id, first) = setup_enrolled_learner(&conn);

        // first learner + two more marked present, one absent, one tardy,
        // all on the same date.
        record(
            &conn,
            &school_id,
            &section_id,
            &first,
            "2026-09-03",
            AttendanceStatus::Present,
        )
        .unwrap();
        for name in ["Ana", "Ben"] {
            let l = learner::create(&conn, &school_id, name, "Present", None, None).unwrap();
            section_membership::enroll(&conn, &school_id, &section_id, &l.id, "2026-08-01")
                .unwrap();
            record(
                &conn,
                &school_id,
                &section_id,
                &l.id,
                "2026-09-03",
                AttendanceStatus::Present,
            )
            .unwrap();
        }
        let absent = learner::create(&conn, &school_id, "Cora", "Absent", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &absent.id, "2026-08-01")
            .unwrap();
        record(
            &conn,
            &school_id,
            &section_id,
            &absent.id,
            "2026-09-03",
            AttendanceStatus::Absent,
        )
        .unwrap();
        let tardy = learner::create(&conn, &school_id, "Dan", "Tardy", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &tardy.id, "2026-08-01")
            .unwrap();
        record(
            &conn,
            &school_id,
            &section_id,
            &tardy.id,
            "2026-09-03",
            AttendanceStatus::Tardy,
        )
        .unwrap();

        let totals = school_day_totals(&conn, &school_id, "2026-09-03").unwrap();

        assert_eq!(
            totals,
            SchoolDayTotals {
                present: 3,
                absent: 1,
                tardy: 1,
            }
        );
    }

    #[test]
    fn school_day_totals_is_school_scoped() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-09-03",
            AttendanceStatus::Present,
        )
        .unwrap();
        let school_b = school::create(&conn, "School B").unwrap();

        let totals = school_day_totals(&conn, &school_b.id, "2026-09-03").unwrap();

        assert_eq!(
            totals,
            SchoolDayTotals {
                present: 0,
                absent: 0,
                tardy: 0,
            }
        );
    }

    #[test]
    fn school_day_totals_is_date_scoped() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-09-03",
            AttendanceStatus::Present,
        )
        .unwrap();

        let totals = school_day_totals(&conn, &school_id, "2026-09-04").unwrap();

        assert_eq!(
            totals,
            SchoolDayTotals {
                present: 0,
                absent: 0,
                tardy: 0,
            }
        );
    }

    #[test]
    fn monthly_grid_includes_unmarked_members_and_stays_section_scoped() {
        let conn = open_test_db();
        let (school_id, section_a, _) = setup_enrolled_learner(&conn);
        let unmarked = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_a, &unmarked.id, "2026-08-01")
            .unwrap();
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let other = learner::create(&conn, &school_id, "Other", "Learner", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_b.id, &other.id, "2026-08-01")
            .unwrap();

        let report = monthly_grid_for_section(&conn, &school_id, &section_a, 2026, 8).unwrap();

        assert_eq!(report.learners.len(), 2, "only section A's two members");
    }

    #[test]
    fn upsert_from_sync_inserts_a_record_this_device_has_never_seen() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let incoming = AttendanceRecord {
            id: Uuid::now_v7().to_string(),
            school_id: school_id.clone(),
            section_id: section_id.clone(),
            learner_id: learner_id.clone(),
            attendance_date: "2026-08-24".to_string(),
            status: AttendanceStatus::Present,
            recorded_at: "2026-08-24T00:00:00.000Z".to_string(),
        };

        upsert_from_sync(&conn, &incoming).unwrap();

        let stored = conn
            .query_row(
                "SELECT status FROM attendance_records WHERE id = ?1",
                [&incoming.id],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(stored, "present");
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let original = record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Absent,
        )
        .unwrap()
        .unwrap();

        let updated = AttendanceRecord {
            status: AttendanceStatus::Tardy,
            ..original.clone()
        };
        upsert_from_sync(&conn, &updated).unwrap();

        let stored = conn
            .query_row(
                "SELECT status FROM attendance_records WHERE id = ?1",
                [&original.id],
                |row| row.get::<_, String>(0),
            )
            .unwrap();
        assert_eq!(stored, "tardy");
        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM attendance_records", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(count, 1, "must update in place, never duplicate");
    }

    #[test]
    fn find_by_id_in_school_returns_the_record_within_its_own_school() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let recorded = record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-05",
            AttendanceStatus::Present,
        )
        .unwrap()
        .unwrap();

        let found = find_by_id_in_school(&conn, &school_id, &recorded.id)
            .unwrap()
            .unwrap();

        assert_eq!(found, recorded);
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_a_different_school() {
        let conn = open_test_db();
        let (school_id, section_id, learner_id) = setup_enrolled_learner(&conn);
        let recorded = record(
            &conn,
            &school_id,
            &section_id,
            &learner_id,
            "2026-08-05",
            AttendanceStatus::Present,
        )
        .unwrap()
        .unwrap();
        let other_school = school::create(&conn, "Another School").unwrap();

        let found = find_by_id_in_school(&conn, &other_school.id, &recorded.id).unwrap();

        assert!(found.is_none());
    }
}
