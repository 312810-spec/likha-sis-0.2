//! Multi-silo automated at-risk detection (DO 006, s. 2026 Child
//! Protection module — `docs/adr/0072-child-protection-authorization.md`).
//!
//! **Computed on read, deliberately not a background job or a stored
//! flag** — the task's own explicit requirement. Every call here re-reads
//! the underlying academic/health/attendance tables fresh, so a flag can
//! never go stale the way a cached/materialized one could.
//!
//! Reuses, never duplicates:
//! - Academic: `repository::grading_computation::compute_term_grade` (the
//!   same DO 015 Annex D engine every other grade-facing feature uses).
//! - Health: `repository::nutrition::find_for_learner` (Batch 2's SF8
//!   engine) — this module adds no nutrition query of its own.
//! - Attendance: a new rate aggregate over `attendance_records`, because
//!   no existing repository function already computes a per-learner
//!   attendance-rate percentage (only day-level totals and a monthly grid
//!   exist today).

use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;
use crate::repository::{class_record, grading_computation, nutrition, section_membership};

pub const ACADEMIC_SUBJECT_GRADE_FLOOR: f64 = 70.0;
pub const ACADEMIC_GENERAL_AVERAGE_FLOOR: f64 = 75.0;
pub const ATTENDANCE_RATE_FLOOR_PERCENT: f64 = 80.0;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum AtRiskSilo {
    Academic,
    Health,
    Attendance,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AtRiskFlag {
    pub learner_id: String,
    pub silo: AtRiskSilo,
    /// A fixed, human-readable reason string — never includes a raw
    /// database identifier, matching this codebase's established
    /// generic-message discipline for anything that could reach a UI.
    pub reason: String,
}

/// Academic silo: flags a learner if any subject's term grade in
/// `section_id` falls below [`ACADEMIC_SUBJECT_GRADE_FLOOR`], or their
/// General Average across those subjects falls below
/// [`ACADEMIC_GENERAL_AVERAGE_FLOOR`]. A subject with no computable term
/// grade yet (see `compute_term_grade`'s own "never fabricate" contract)
/// is simply excluded from both checks for that learner — this module
/// never treats "not yet gradable" as "failing."
fn academic_flags_for_learner(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
) -> AppResult<Vec<AtRiskFlag>> {
    let records = class_record::list_by_section_in_school(conn, school_id, section_id)?;
    let mut flags = Vec::new();
    let mut grades = Vec::new();

    for record in &records {
        if let Some(computed) =
            grading_computation::compute_term_grade(conn, school_id, &record.id, learner_id)?
        {
            let grade = computed.term_grade as f64;
            grades.push(grade);
            if grade < ACADEMIC_SUBJECT_GRADE_FLOOR {
                flags.push(AtRiskFlag {
                    learner_id: learner_id.to_string(),
                    silo: AtRiskSilo::Academic,
                    reason: format!(
                        "{} term grade below {:.0}",
                        record.subject_name, ACADEMIC_SUBJECT_GRADE_FLOOR
                    ),
                });
            }
        }
    }

    if !grades.is_empty() {
        let average = grades.iter().sum::<f64>() / grades.len() as f64;
        if average < ACADEMIC_GENERAL_AVERAGE_FLOOR {
            flags.push(AtRiskFlag {
                learner_id: learner_id.to_string(),
                silo: AtRiskSilo::Academic,
                reason: format!(
                    "General Average below {:.0}",
                    ACADEMIC_GENERAL_AVERAGE_FLOOR
                ),
            });
        }
    }

    Ok(flags)
}

/// Health silo: flags a learner whose most recent nutrition record for
/// `school_year` (checking EOSY first, falling back to BOSY) shows
/// Wasted, Severely Wasted, or Obese. Delegates entirely to
/// `repository::nutrition::find_for_learner` — no SQL of its own against
/// `nutrition_records`.
fn health_flag_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    school_year: &str,
) -> AppResult<Option<AtRiskFlag>> {
    use crate::repository::nutrition::Period;

    for period in [Period::Eosy, Period::Bosy] {
        if let Some(record) =
            nutrition::find_for_learner(conn, school_id, learner_id, school_year, period)?
        {
            let label = match record.nutritional_status.as_deref() {
                Some("SEVERELY_WASTED") => Some("Severely Wasted"),
                Some("WASTED") => Some("Wasted"),
                Some("OBESE") => Some("Obese"),
                _ => None,
            };
            if let Some(label) = label {
                return Ok(Some(AtRiskFlag {
                    learner_id: learner_id.to_string(),
                    silo: AtRiskSilo::Health,
                    reason: format!("Nutritional status: {label}"),
                }));
            }
            // A found-but-not-at-risk record for the more recent period
            // is authoritative; don't fall back to an older BOSY record.
            return Ok(None);
        }
    }
    Ok(None)
}

/// Attendance silo: flags a learner whose recorded attendance rate for
/// `section_id` (present-or-tardy days over every recorded day) falls
/// below [`ATTENDANCE_RATE_FLOOR_PERCENT`]. A learner with zero recorded
/// attendance days is never flagged — there is no rate to compute yet,
/// matching this module's "never fabricate from absent data" discipline.
fn attendance_flag_for_learner(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
) -> AppResult<Option<AtRiskFlag>> {
    let (present_or_tardy, total): (i64, i64) = conn.query_row(
        "SELECT \
            SUM(CASE WHEN status IN ('present', 'tardy') THEN 1 ELSE 0 END), \
            COUNT(*) \
         FROM attendance_records \
         WHERE school_id = ?1 AND section_id = ?2 AND learner_id = ?3",
        (school_id, section_id, learner_id),
        |row| {
            Ok((
                row.get::<_, Option<i64>>(0)?.unwrap_or(0),
                row.get::<_, i64>(1)?,
            ))
        },
    )?;

    if total == 0 {
        return Ok(None);
    }
    let rate = present_or_tardy as f64 / total as f64 * 100.0;
    if rate < ATTENDANCE_RATE_FLOOR_PERCENT {
        return Ok(Some(AtRiskFlag {
            learner_id: learner_id.to_string(),
            silo: AtRiskSilo::Attendance,
            reason: format!("Attendance rate {rate:.1}% below {ATTENDANCE_RATE_FLOOR_PERCENT:.0}%"),
        }));
    }
    Ok(None)
}

/// Computes every at-risk flag across all three silos for every learner
/// currently in `section_id`, as of `as_of_date`. Read-only; nothing is
/// written or cached. The caller must already be authorized for this
/// section — matching every other section-scoped read in this codebase,
/// this function performs no authorization of its own.
pub fn compute_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    school_year: &str,
    as_of_date: &str,
) -> AppResult<Vec<AtRiskFlag>> {
    let roster = section_membership::roster_for_section(conn, school_id, section_id, as_of_date)?;
    let mut flags = Vec::new();
    for member in roster {
        flags.extend(academic_flags_for_learner(
            conn,
            school_id,
            section_id,
            &member.learner_id,
        )?);
        if let Some(flag) =
            health_flag_for_learner(conn, school_id, &member.learner_id, school_year)?
        {
            flags.push(flag);
        }
        if let Some(flag) =
            attendance_flag_for_learner(conn, school_id, section_id, &member.learner_id)?
        {
            flags.push(flag);
        }
    }
    Ok(flags)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn setup() -> Connection {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name, lrn, sex) \
             VALUES ('l1', 's1', 'Ana', 'Delacruz', '100000000001', 'F')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
             VALUES ('sec1', 's1', '2026-2027', '5', 'Section A')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('sm1', 's1', 'sec1', 'l1', '2026-06-01')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn attendance_flag_fires_below_the_floor() {
        let conn = setup();
        // 3 present out of 5 recorded days = 60% < 80% floor.
        for (i, status) in ["present", "present", "present", "absent", "absent"]
            .iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
                 VALUES (?1, 's1', 'sec1', 'l1', ?2, ?3)",
                (format!("a{i}"), format!("2026-06-{:02}", i + 1), status),
            )
            .unwrap();
        }

        let flag = attendance_flag_for_learner(&conn, "s1", "sec1", "l1")
            .unwrap()
            .expect("should be flagged");
        assert_eq!(flag.silo, AtRiskSilo::Attendance);
    }

    #[test]
    fn attendance_flag_does_not_fire_with_no_recorded_days() {
        let conn = setup();
        let flag = attendance_flag_for_learner(&conn, "s1", "sec1", "l1").unwrap();
        assert!(flag.is_none());
    }

    #[test]
    fn attendance_flag_does_not_fire_at_or_above_the_floor() {
        let conn = setup();
        // 4 present out of 5 = 80%, exactly at the floor -- not below it.
        for (i, status) in ["present", "present", "present", "present", "absent"]
            .iter()
            .enumerate()
        {
            conn.execute(
                "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
                 VALUES (?1, 's1', 'sec1', 'l1', ?2, ?3)",
                (format!("a{i}"), format!("2026-06-{:02}", i + 1), status),
            )
            .unwrap();
        }

        let flag = attendance_flag_for_learner(&conn, "s1", "sec1", "l1").unwrap();
        assert!(flag.is_none());
    }

    #[test]
    fn health_flag_fires_for_a_wasted_classification() {
        let conn = setup();
        conn.execute(
            "INSERT INTO nutrition_records \
                (id, school_id, learner_id, school_year, period, grade_level, sex, \
                 birth_date, measurement_date, height_m, weight_kg, age_in_months, bmi, \
                 nutritional_status) \
             VALUES ('n1', 's1', 'l1', '2026-2027', 'BOSY', '5', 'F', \
                     '2016-06-15', '2026-06-20', 1.20, 15.0, 120, 10.4, 'WASTED')",
            [],
        )
        .unwrap();

        let flag = health_flag_for_learner(&conn, "s1", "l1", "2026-2027")
            .unwrap()
            .expect("should be flagged");
        assert_eq!(flag.silo, AtRiskSilo::Health);
    }

    #[test]
    fn health_flag_does_not_fire_for_a_normal_classification() {
        let conn = setup();
        conn.execute(
            "INSERT INTO nutrition_records \
                (id, school_id, learner_id, school_year, period, grade_level, sex, \
                 birth_date, measurement_date, height_m, weight_kg, age_in_months, bmi, \
                 nutritional_status) \
             VALUES ('n1', 's1', 'l1', '2026-2027', 'BOSY', '5', 'F', \
                     '2016-06-15', '2026-06-20', 1.30, 28.0, 120, 16.5, 'NORMAL')",
            [],
        )
        .unwrap();

        let flag = health_flag_for_learner(&conn, "s1", "l1", "2026-2027").unwrap();
        assert!(flag.is_none());
    }

    #[test]
    fn compute_for_section_combines_all_three_silos() {
        let conn = setup();
        conn.execute(
            "INSERT INTO nutrition_records \
                (id, school_id, learner_id, school_year, period, grade_level, sex, \
                 birth_date, measurement_date, height_m, weight_kg, age_in_months, bmi, \
                 nutritional_status) \
             VALUES ('n1', 's1', 'l1', '2026-2027', 'EOSY', '5', 'F', \
                     '2016-06-15', '2027-03-20', 1.20, 15.0, 129, 10.4, 'SEVERELY_WASTED')",
            [],
        )
        .unwrap();
        for (i, status) in ["absent", "absent", "present"].iter().enumerate() {
            conn.execute(
                "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
                 VALUES (?1, 's1', 'sec1', 'l1', ?2, ?3)",
                (format!("a{i}"), format!("2026-06-{:02}", i + 1), status),
            )
            .unwrap();
        }

        let flags = compute_for_section(&conn, "s1", "sec1", "2026-2027", "2026-09-01").unwrap();
        assert!(flags.iter().any(|f| f.silo == AtRiskSilo::Health));
        assert!(flags.iter().any(|f| f.silo == AtRiskSilo::Attendance));
        // No class records set up in this fixture -- no academic flag
        // possible, and none should be fabricated.
        assert!(!flags.iter().any(|f| f.silo == AtRiskSilo::Academic));
    }
}
