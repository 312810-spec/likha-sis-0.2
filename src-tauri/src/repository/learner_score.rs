use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{assessment_item, class_record, section_membership};

/// Every state a learner's score for one assessment item can be in.
/// Absence of a `learner_scores` row is a fourth, implicit state — "not
/// yet recorded" — following `attendance_records`' exact idiom (see
/// migration 8's comment): a roster view is built with a `LEFT JOIN`
/// against the class's eligible learners, never a materialized
/// placeholder row per learner.
#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum LearnerScoreStatus {
    Scored,
    Excused,
    NotApplicable,
}

impl LearnerScoreStatus {
    fn as_db_str(self) -> &'static str {
        match self {
            LearnerScoreStatus::Scored => "scored",
            LearnerScoreStatus::Excused => "excused",
            LearnerScoreStatus::NotApplicable => "not_applicable",
        }
    }

    /// The `CHECK` constraint on `learner_scores.status` should make an
    /// unrecognized value impossible for any row this application ever
    /// wrote — see `AttendanceStatus::from_db_str`'s identical reasoning
    /// for why this is a fallible conversion, not a panic.
    fn from_db_str(s: &str) -> rusqlite::Result<LearnerScoreStatus> {
        match s {
            "scored" => Ok(LearnerScoreStatus::Scored),
            "excused" => Ok(LearnerScoreStatus::Excused),
            "not_applicable" => Ok(LearnerScoreStatus::NotApplicable),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unknown learner score status: {other}").into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LearnerScore {
    pub id: String,
    pub school_id: String,
    pub assessment_item_id: String,
    pub learner_id: String,
    pub status: LearnerScoreStatus,
    pub score: Option<f64>,
    pub recorded_by_user_id: String,
    pub recorded_at: String,
    pub updated_at: String,
}

/// One roster row for a given assessment item: a learner joined with
/// their score status for that item, or `None` if nobody has recorded it
/// yet. Same shape as `attendance::AttendanceRosterEntry`.
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LearnerScoreRosterEntry {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub status: Option<LearnerScoreStatus>,
    pub score: Option<f64>,
    pub updated_at: Option<String>,
}

/// Records (or overwrites) `learner_id`'s score for `assessment_item_id`,
/// scoped to `school_id`. Verifies, in order: the item belongs to this
/// school, the learner held an active membership in the item's class
/// record's section at some point during the class record's grading
/// period (via `section_membership::roster_for_section_over_range` — a
/// range check, not a single-date one, since a score covers the whole
/// period, not one day; a learner who transferred in mid-period is still
/// legitimately scoreable), and the status/score pairing is internally
/// consistent with a non-negative score that does not exceed the item's
/// `max_score` (the schema's `CHECK` can enforce `status`/`score`
/// null-ness but not a cross-table bound against `max_score` — SQLite
/// `CHECK` constraints cannot reference another table, so this one lives
/// here and is tested directly). Every rejection reason returns `Ok(None)`
/// without distinguishing which one, matching
/// `attendance::record`'s established convention.
#[allow(clippy::too_many_arguments)]
pub fn record(
    conn: &Connection,
    school_id: &str,
    assessment_item_id: &str,
    learner_id: &str,
    status: LearnerScoreStatus,
    score: Option<f64>,
    recorded_by_user_id: &str,
) -> AppResult<Option<LearnerScore>> {
    let Some(item) = assessment_item::find_by_id_in_school(conn, school_id, assessment_item_id)?
    else {
        return Ok(None);
    };
    let Some((section_id, starts_on, ends_on)) =
        class_record::section_and_period_range_in_school(conn, school_id, &item.class_record_id)?
    else {
        return Ok(None);
    };
    let roster = section_membership::roster_for_section_over_range(
        conn, school_id, &section_id, &starts_on, &ends_on,
    )?;
    if !roster.iter().any(|m| m.learner_id == learner_id) {
        return Ok(None);
    }
    match (status, score) {
        (LearnerScoreStatus::Scored, Some(value)) => {
            if !(0.0..=item.max_score).contains(&value) {
                return Ok(None);
            }
        }
        (LearnerScoreStatus::Scored, None) => return Ok(None),
        (_, Some(_)) => return Ok(None),
        (_, None) => {}
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO learner_scores \
             (id, school_id, assessment_item_id, learner_id, status, score, recorded_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7) \
         ON CONFLICT (assessment_item_id, learner_id) \
         DO UPDATE SET status = excluded.status, \
                        score = excluded.score, \
                        recorded_by_user_id = excluded.recorded_by_user_id, \
                        updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (
            &id,
            school_id,
            assessment_item_id,
            learner_id,
            status.as_db_str(),
            score,
            recorded_by_user_id,
        ),
    )?;

    conn.query_row(
        "SELECT id, school_id, assessment_item_id, learner_id, status, score, \
                recorded_by_user_id, recorded_at, updated_at \
         FROM learner_scores \
         WHERE assessment_item_id = ?1 AND learner_id = ?2 AND school_id = ?3",
        (assessment_item_id, learner_id, school_id),
        row_to_score,
    )
    .map(Some)
    .map_err(AppError::from)
}

/// The roster of learners eligible to be scored on `assessment_item_id`
/// (every learner with an active membership at any point in the item's
/// class record's grading-period range), paired with their score if one
/// has been recorded. Returns `Ok(None)` if `assessment_item_id` doesn't
/// resolve within `school_id`.
pub fn roster_for_item(
    conn: &Connection,
    school_id: &str,
    assessment_item_id: &str,
) -> AppResult<Option<Vec<LearnerScoreRosterEntry>>> {
    let Some(item) = assessment_item::find_by_id_in_school(conn, school_id, assessment_item_id)?
    else {
        return Ok(None);
    };
    let Some((section_id, starts_on, ends_on)) =
        class_record::section_and_period_range_in_school(conn, school_id, &item.class_record_id)?
    else {
        return Ok(None);
    };

    let mut stmt = conn.prepare(
        "SELECT DISTINCT l.id, l.given_name, l.family_name, ls.status, ls.score, ls.updated_at \
         FROM learners l \
         JOIN section_memberships sm ON sm.learner_id = l.id \
         LEFT JOIN learner_scores ls \
           ON ls.assessment_item_id = ?1 AND ls.learner_id = l.id AND ls.school_id = ?2 \
         WHERE sm.section_id = ?3 AND sm.school_id = ?2 \
           AND sm.starts_on <= ?5 AND (sm.ends_on IS NULL OR ?4 < sm.ends_on) \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map(
        (assessment_item_id, school_id, &section_id, &starts_on, &ends_on),
        |row| {
            let status: Option<String> = row.get(3)?;
            Ok(LearnerScoreRosterEntry {
                learner_id: row.get(0)?,
                given_name: row.get(1)?,
                family_name: row.get(2)?,
                status: status.as_deref().map(LearnerScoreStatus::from_db_str).transpose()?,
                score: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )?;
    let entries = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(Some(entries))
}

fn row_to_score(row: &rusqlite::Row) -> rusqlite::Result<LearnerScore> {
    let status: String = row.get(4)?;
    Ok(LearnerScore {
        id: row.get(0)?,
        school_id: row.get(1)?,
        assessment_item_id: row.get(2)?,
        learner_id: row.get(3)?,
        status: LearnerScoreStatus::from_db_str(&status)?,
        score: row.get(5)?,
        recorded_by_user_id: row.get(6)?,
        recorded_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{assessment_item, grading, learner, school, section, section_membership, subject, user},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    /// Builds a school with a class record (section+subject+grading
    /// period, SY 2026-2027, period 2026-06-08..2026-09-15), one
    /// assessment item (max_score 20) under it, a teacher user, and one
    /// learner enrolled in the section from 2026-06-08. Returns
    /// (school_id, item_id, learner_id, teacher_user_id).
    fn setup(conn: &Connection) -> (String, String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let period = grading::create(conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
            .unwrap()
            .unwrap();
        let cr = class_record::create(conn, &s.id, &sec.id, &sub.id, &period.id, K10_POLICY)
            .unwrap()
            .unwrap();
        let item = assessment_item::create(conn, &s.id, &cr.id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let l = learner::create(conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        section_membership::enroll(conn, &s.id, &sec.id, &l.id, "2026-06-08").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "A Teacher").unwrap();
        (s.id, item.id, l.id, teacher.id)
    }

    #[test]
    fn recording_a_score_for_an_unscored_learner_creates_a_record() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let recorded = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(18.0),
            &teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(recorded.status, LearnerScoreStatus::Scored);
        assert_eq!(recorded.score, Some(18.0));
        assert_eq!(recorded.recorded_by_user_id, teacher_id);
    }

    #[test]
    fn recording_again_overwrites_the_score_not_duplicates_it() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);
        record(&conn, &school_id, &item_id, &learner_id, LearnerScoreStatus::Scored, Some(15.0), &teacher_id)
            .unwrap();

        let corrected = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(19.0),
            &teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(corrected.score, Some(19.0));
        let roster = roster_for_item(&conn, &school_id, &item_id).unwrap().unwrap();
        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].score, Some(19.0));
    }

    #[test]
    fn recording_a_score_above_max_score_is_rejected() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let result = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(25.0),
            &teacher_id,
        )
        .unwrap();

        assert_eq!(result, None, "a score above the item's max_score must be rejected");
    }

    #[test]
    fn recording_a_negative_score_is_rejected() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let result = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            Some(-1.0),
            &teacher_id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn scored_status_with_no_score_value_is_rejected() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let result = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Scored,
            None,
            &teacher_id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn excused_status_with_a_score_value_is_rejected() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let result = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Excused,
            Some(10.0),
            &teacher_id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn excused_status_with_no_score_is_recorded() {
        let conn = open_test_db();
        let (school_id, item_id, learner_id, teacher_id) = setup(&conn);

        let recorded = record(
            &conn,
            &school_id,
            &item_id,
            &learner_id,
            LearnerScoreStatus::Excused,
            None,
            &teacher_id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(recorded.status, LearnerScoreStatus::Excused);
        assert_eq!(recorded.score, None);
    }

    #[test]
    fn recording_for_a_learner_not_on_the_sections_roster_is_rejected() {
        let conn = open_test_db();
        let (school_id, item_id, _learner_id, teacher_id) = setup(&conn);
        let unenrolled = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();

        let result = record(
            &conn,
            &school_id,
            &item_id,
            &unenrolled.id,
            LearnerScoreStatus::Scored,
            Some(10.0),
            &teacher_id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn recording_for_an_item_in_a_different_school_is_rejected() {
        let conn = open_test_db();
        let (_school_a, item_a, learner_a, teacher_a) = setup(&conn);
        let school_b = school::create(&conn, "School B").unwrap();

        let result = record(
            &conn,
            &school_b.id,
            &item_a,
            &learner_a,
            LearnerScoreStatus::Scored,
            Some(10.0),
            &teacher_a,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn roster_for_item_includes_every_eligible_learner_scored_or_not() {
        let conn = open_test_db();
        let (school_id, item_id, scored_learner, teacher_id) = setup(&conn);
        let unscored = learner::create(&conn, &school_id, "Maria", "Santos", None, None).unwrap();
        let sec_id: String = conn
            .query_row(
                "SELECT section_id FROM section_memberships WHERE learner_id = ?1",
                [&scored_learner],
                |r| r.get(0),
            )
            .unwrap();
        section_membership::enroll(&conn, &school_id, &sec_id, &unscored.id, "2026-06-08").unwrap();
        record(
            &conn,
            &school_id,
            &item_id,
            &scored_learner,
            LearnerScoreStatus::Scored,
            Some(20.0),
            &teacher_id,
        )
        .unwrap();

        let roster = roster_for_item(&conn, &school_id, &item_id).unwrap().unwrap();

        assert_eq!(roster.len(), 2);
        let scored_entry = roster.iter().find(|e| e.learner_id == scored_learner).unwrap();
        assert_eq!(scored_entry.score, Some(20.0));
        let unscored_entry = roster.iter().find(|e| e.learner_id == unscored.id).unwrap();
        assert_eq!(unscored_entry.status, None);
        assert_eq!(unscored_entry.score, None);
    }

    #[test]
    fn roster_for_item_returns_none_for_an_item_in_a_different_school() {
        let conn = open_test_db();
        let (_school_a, item_a, ..) = setup(&conn);
        let school_b = school::create(&conn, "School B").unwrap();

        let result = roster_for_item(&conn, &school_b.id, &item_a).unwrap();

        assert_eq!(result, None);
    }
}
