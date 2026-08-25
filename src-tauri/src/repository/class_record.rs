use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{grading, section, section_membership, subject};

/// The workspace a teacher opens to record scores for one section, one
/// subject, one grading period. Carries no `school_year` of its own on
/// purpose — see `create`'s doc comment for why. `weight_policy_id` is
/// `None` only for a class record created before migration 11 (M15) —
/// every record created since is required to pin one explicitly (see
/// `create`'s doc comment); `resolved_weight_policy_id_in_school` is the
/// COALESCE-to-default lookup grading computation actually uses.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClassRecord {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub subject_id: String,
    pub grading_period_id: String,
    pub weight_policy_id: Option<String>,
    pub created_at: String,
}

/// Everything a gradebook screen needs to render its header without a
/// separate round trip for the section/subject/grading-period/weight-
/// policy names. `weight_policy_id`/`weight_policy_name` are always
/// resolved (never `None`/empty) — a class record predating migration 11
/// shows the current default policy's name here, exactly the policy
/// `grading_computation::compute_term_grade` actually uses for it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct ClassRecordDetail {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub section_name: String,
    pub subject_id: String,
    pub subject_name: String,
    pub grading_period_id: String,
    pub grading_period_label: String,
    pub school_year: String,
    pub weight_policy_id: String,
    pub weight_policy_name: String,
    pub created_at: String,
    /// How many assessment items exist for this class record at all --
    /// distinguishes "nothing set up yet" from "set up but not yet
    /// scored," which `recorded_count`/`total_eligible` alone cannot (both
    /// are legitimately 0 in either case). Lets a Class Records list show
    /// a teacher which workspace still needs setup versus which one is
    /// simply not yet fully scored.
    pub item_count: i64,
    /// How many `learner_scores` rows exist across every item in this
    /// class record, of any status (scored/excused/not-applicable) --
    /// same convention as `AssessmentItemDetail::recorded_count`.
    pub recorded_count: i64,
    /// How many roster entries are eligible to be scored under this class
    /// record's section+grading-period range, per item (every item shares
    /// the same eligible-learner count -- see
    /// `assessment_item::list_by_class_record`'s identical field). Multiply
    /// by `item_count` for the theoretical maximum `recorded_count` could
    /// reach once every item is fully scored.
    pub total_eligible: i64,
}

/// Creates a class record joining `section_id`, `subject_id`, and
/// `grading_period_id`, all verified to belong to `school_id` first, and
/// pinning `weight_policy_id` — which DepEd weighting group applies to
/// this subject. Explicit, not inferred: `Subject` carries no DepEd
/// weight-group classification, and guessing one from a free-text subject
/// name would be exactly the kind of inference this project's
/// `deped-compliance` rule warns against (see
/// `docs/adr/0015-expand-grading-policy-coverage.md`). Also rejects the
/// section/grading-period combination if they don't share the same
/// `school_year` — a class record stores no `school_year` field of its
/// own precisely so there is only ever one place that value can come
/// from, not two that could silently drift apart (see
/// `docs/adr/0011-gradebook-class-record-foundation.md`).
///
/// Returns `Ok(None)` for every rejection reason (unknown/foreign
/// section, subject, grading period, or weight policy id; school-year
/// mismatch) — matching `section_membership::enroll`'s established
/// convention of collapsing distinct-but-related failure reasons into one
/// indistinguishable `None`, rather than a caller-visible enum. The
/// `UNIQUE (section_id, subject_id, grading_period_id)` constraint (no
/// duplicate class record for the same combination) is enforced by the
/// schema itself and surfaces as an `Err`, not a `None` — see migration 7.
pub fn create(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    subject_id: &str,
    grading_period_id: &str,
    weight_policy_id: &str,
) -> AppResult<Option<ClassRecord>> {
    let Some(section) = section::find_by_id_in_school(conn, school_id, section_id)? else {
        return Ok(None);
    };
    if subject::find_by_id_in_school(conn, school_id, subject_id)?.is_none() {
        return Ok(None);
    }
    let Some(period) = grading::find_by_id_in_school(conn, school_id, grading_period_id)? else {
        return Ok(None);
    };
    if section.school_year != period.school_year {
        return Ok(None);
    }
    let policy_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM grading_weight_policies WHERE id = ?1)",
        [weight_policy_id],
        |row| row.get(0),
    )?;
    if !policy_exists {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO class_records \
             (id, school_id, section_id, subject_id, grading_period_id, weight_policy_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&id, school_id, section_id, subject_id, grading_period_id, weight_policy_id),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// The school-scoped lookup safe to expose as a command — same convention
/// as `section::find_by_id_in_school`.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<ClassRecord>> {
    conn.query_row(
        "SELECT id, school_id, section_id, subject_id, grading_period_id, weight_policy_id, created_at \
         FROM class_records WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_class_record,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Returns only `school_id`'s own class records, joined with the
/// section/subject/grading-period names a gradebook list screen needs to
/// display — isolation enforced in the query, matching
/// `section::list_by_school`.
pub fn list_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<ClassRecordDetail>> {
    let mut stmt = conn.prepare(&format!(
        "{DETAIL_SELECT_LIST} ORDER BY sec.school_year DESC, pp.sequence, sec.name, sub.name"
    ))?;
    let rows = stmt.query_map([school_id], row_to_class_record_detail)?;
    let details = rows.collect::<Result<Vec<_>, _>>()?;
    details
        .into_iter()
        .map(|d| with_total_eligible(conn, school_id, d))
        .collect()
}

/// A class record's `section_id` and its grading period's date range —
/// the two pieces of context `learner_score::record`/`roster_for_item`
/// need to determine which learners are eligible to be scored (anyone
/// with an active section membership at any point in that range, via
/// `section_membership::roster_for_section_over_range`). Returns
/// `Ok(None)` if `class_record_id` doesn't resolve in `school_id`.
pub fn section_and_period_range_in_school(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<(String, String, String)>> {
    conn.query_row(
        "SELECT cr.section_id, gp.starts_on, gp.ends_on \
         FROM class_records cr \
         JOIN grading_periods gp ON gp.id = cr.grading_period_id \
         WHERE cr.id = ?1 AND cr.school_id = ?2",
        (class_record_id, school_id),
        |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The single-record counterpart to `list_by_school` — the joined
/// section/subject/grading-period names for one class record, scoped to
/// `school_id`. Used by `export::report_card` to build a report card's
/// header without a separate round trip per joined field.
pub fn find_detail_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<ClassRecordDetail>> {
    let detail = conn
        .query_row(
            &format!("{DETAIL_SELECT_LIST} AND cr.id = ?2"),
            (school_id, id),
            row_to_class_record_detail,
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e.into()),
        })?;
    detail.map(|d| with_total_eligible(conn, school_id, d)).transpose()
}

/// `class_record_id`'s weight policy, resolved: its own pinned
/// `weight_policy_id` if it has one (every record created since migration
/// 11 always does — see `create`), or the current default policy if it
/// predates that migration and was left `NULL`. This is the id
/// `grading_computation::compute_term_grade` actually applies — never the
/// raw, possibly-`NULL` column value. Returns `Ok(None)` only if
/// `class_record_id` doesn't resolve in `school_id`.
pub fn resolved_weight_policy_id_in_school(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT COALESCE(cr.weight_policy_id, dwp.id) \
         FROM class_records cr \
         JOIN grading_weight_policies dwp ON dwp.is_default = 1 \
         WHERE cr.id = ?1 AND cr.school_id = ?2",
        (class_record_id, school_id),
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Shared by `list_by_school` and `find_detail_by_id_in_school` — the
/// only difference between the two is an extra `AND cr.id = ?2`, appended
/// by the latter. `?1` is always `school_id`. Weight-policy name/id are
/// resolved via `LEFT JOIN ... COALESCE`, matching
/// `resolved_weight_policy_id_in_school`'s own logic, so a legacy
/// (pre-migration-11) class record shows the current default policy here
/// too, not a blank.
const DETAIL_SELECT_LIST: &str = "SELECT cr.id, cr.school_id, cr.section_id, sec.name, \
     cr.subject_id, sub.name, cr.grading_period_id, pp.label, \
     sec.school_year, COALESCE(cr.weight_policy_id, dwp.id), COALESCE(wp.name, dwp.name), \
     cr.created_at, \
     (SELECT COUNT(*) FROM assessment_items ai WHERE ai.class_record_id = cr.id), \
     (SELECT COUNT(*) FROM learner_scores ls \
      JOIN assessment_items ai2 ON ai2.id = ls.assessment_item_id \
      WHERE ai2.class_record_id = cr.id) \
     FROM class_records cr \
     JOIN sections sec ON sec.id = cr.section_id \
     JOIN subjects sub ON sub.id = cr.subject_id \
     JOIN grading_periods gp ON gp.id = cr.grading_period_id \
     JOIN grading_policy_periods pp ON pp.id = gp.policy_period_id \
     LEFT JOIN grading_weight_policies wp ON wp.id = cr.weight_policy_id \
     JOIN grading_weight_policies dwp ON dwp.is_default = 1 \
     WHERE cr.school_id = ?1";

fn row_to_class_record_detail(row: &rusqlite::Row) -> rusqlite::Result<ClassRecordDetail> {
    Ok(ClassRecordDetail {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        section_name: row.get(3)?,
        subject_id: row.get(4)?,
        subject_name: row.get(5)?,
        grading_period_id: row.get(6)?,
        grading_period_label: row.get(7)?,
        school_year: row.get(8)?,
        weight_policy_id: row.get(9)?,
        weight_policy_name: row.get(10)?,
        created_at: row.get(11)?,
        item_count: row.get(12)?,
        recorded_count: row.get(13)?,
        // Filled in by `with_total_eligible` afterward -- unlike
        // `item_count`/`recorded_count`, this needs the section's roster
        // over the grading period's date range, which is not a plain
        // aggregate over this row's own joined tables.
        total_eligible: 0,
    })
}

/// Fills in `total_eligible` for one already-fetched detail row. Split out
/// from the main SQL (unlike `item_count`/`recorded_count`, which are
/// cheap correlated subqueries) because eligibility depends on
/// `section_membership::roster_for_section_over_range`, the same
/// roster-resolution rule `assessment_item::list_by_class_record` already
/// uses -- reused here rather than re-deriving it, so a class record's
/// list-view total always agrees with its workspace-view total.
fn with_total_eligible(
    conn: &Connection,
    school_id: &str,
    mut detail: ClassRecordDetail,
) -> AppResult<ClassRecordDetail> {
    if let Some((section_id, starts_on, ends_on)) =
        section_and_period_range_in_school(conn, school_id, &detail.id)?
    {
        detail.total_eligible = section_membership::roster_for_section_over_range(
            conn,
            school_id,
            &section_id,
            &starts_on,
            &ends_on,
        )?
        .len() as i64;
    }
    Ok(detail)
}

/// `class_record_id`'s school year, scoped to `school_id` — the one piece
/// of context `grading_computation::compute_term_grade` needs to choose
/// between the Adjusted Transmutation Table and the Zero-Based Grading
/// System (DepEd Order No. 015, s. 2026, Annex D paragraph 13: the switch
/// takes effect SY 2027-2028). Reads through the grading period rather
/// than the section — `create` already verifies both agree, so either
/// source is equally correct, but the grading period is the more directly
/// relevant one for a grading computation.
pub fn school_year_in_school(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Option<String>> {
    conn.query_row(
        "SELECT gp.school_year \
         FROM class_records cr \
         JOIN grading_periods gp ON gp.id = cr.grading_period_id \
         WHERE cr.id = ?1 AND cr.school_id = ?2",
        (class_record_id, school_id),
        |row| row.get(0),
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

fn row_to_class_record(row: &rusqlite::Row) -> rusqlite::Result<ClassRecord> {
    Ok(ClassRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        subject_id: row.get(3)?,
        grading_period_id: row.get(4)?,
        weight_policy_id: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{assessment_item, learner, learner_score, school, section_membership, user},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";
    const EPP_TLE_MAPEH_POLICY: &str = "00000000-0000-7000-8000-000000000043";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";

    /// Sets up a school with a section (SY 2026-2027), a subject, and a
    /// grading period (also SY 2026-2027) — the happy-path fixture most
    /// tests build on.
    fn setup(conn: &Connection) -> (String, String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let period = grading::create(conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
            .unwrap()
            .unwrap();
        (s.id, sec.id, sub.id, period.id)
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);

        let created = create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY)
            .unwrap()
            .unwrap();
        let found = find_by_id_in_school(&conn, &school_id, &created.id).unwrap();

        assert_eq!(found, Some(created.clone()));
        assert_eq!(created.weight_policy_id, Some(K10_POLICY.to_string()));
    }

    #[test]
    fn create_rejects_a_section_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, _section_id, subject_id, period_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2026-2027", "7", "Bonifacio").unwrap();

        let result =
            create(&conn, &school_id, &other_section.id, &subject_id, &period_id, K10_POLICY)
                .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_subject_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, section_id, _subject_id, period_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_subject = subject::create(&conn, &other_school.id, "Science").unwrap();

        let result =
            create(&conn, &school_id, &section_id, &other_subject.id, &period_id, K10_POLICY)
                .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_grading_period_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, _period_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_period =
            grading::create(&conn, &other_school.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
                .unwrap()
                .unwrap();

        let result =
            create(&conn, &school_id, &section_id, &subject_id, &other_period.id, K10_POLICY)
                .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_section_and_grading_period_with_mismatched_school_years() {
        let conn = open_test_db();
        let (school_id, _section_id, subject_id, period_id) = setup(&conn);
        let other_year_section =
            section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();

        let result = create(
            &conn,
            &school_id,
            &other_year_section.id,
            &subject_id,
            &period_id,
            K10_POLICY,
        )
        .unwrap();

        assert_eq!(
            result, None,
            "a section for one school year must not be pairable with a grading period from another"
        );
    }

    #[test]
    fn create_rejects_an_unknown_weight_policy_id() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);

        let result =
            create(&conn, &school_id, &section_id, &subject_id, &period_id, "does-not-exist")
                .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_accepts_the_epp_tle_mapeh_policy_explicitly() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);

        let created = create(
            &conn,
            &school_id,
            &section_id,
            &subject_id,
            &period_id,
            EPP_TLE_MAPEH_POLICY,
        )
        .unwrap()
        .unwrap();

        assert_eq!(created.weight_policy_id, Some(EPP_TLE_MAPEH_POLICY.to_string()));
    }

    #[test]
    fn create_rejects_a_duplicate_combination() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY).unwrap();

        let result = create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY);

        assert!(result.is_err());
    }

    #[test]
    fn find_detail_by_id_in_school_returns_the_joined_names_including_the_chosen_policy() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        let created = create(
            &conn,
            &school_id,
            &section_id,
            &subject_id,
            &period_id,
            EPP_TLE_MAPEH_POLICY,
        )
        .unwrap()
        .unwrap();

        let detail = find_detail_by_id_in_school(&conn, &school_id, &created.id).unwrap().unwrap();

        assert_eq!(detail.section_name, "Mabini");
        assert_eq!(detail.subject_name, "Mathematics");
        assert_eq!(detail.grading_period_label, "1st Term");
        assert_eq!(detail.school_year, "2026-2027");
        assert_eq!(detail.weight_policy_id, EPP_TLE_MAPEH_POLICY);
        assert_eq!(detail.weight_policy_name, "DepEd EPP/TLE & MAPEH Weighting (DO 015, s. 2026)");
    }

    #[test]
    fn find_detail_by_id_in_school_returns_none_for_a_different_school() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        let created = create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY)
            .unwrap()
            .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let detail = find_detail_by_id_in_school(&conn, &other_school.id, &created.id).unwrap();

        assert_eq!(detail, None);
    }

    #[test]
    fn list_by_school_only_returns_that_schools_class_records_with_joined_names() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY).unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let records = list_by_school(&conn, &school_id).unwrap();
        let other_records = list_by_school(&conn, &other_school.id).unwrap();

        assert_eq!(records.len(), 1);
        assert_eq!(records[0].section_name, "Mabini");
        assert_eq!(records[0].subject_name, "Mathematics");
        assert_eq!(records[0].grading_period_label, "1st Term");
        assert_eq!(records[0].school_year, "2026-2027");
        assert_eq!(records[0].weight_policy_id, K10_POLICY);
        assert!(other_records.is_empty());
    }

    #[test]
    fn list_and_find_detail_report_item_recorded_and_eligible_counts() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        let created = create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY)
            .unwrap()
            .unwrap();
        let learner_a =
            learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let learner_b =
            learner::create(&conn, &school_id, "Bo", "Reyes", None, None).unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &learner_a.id, "2026-06-08")
            .unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &learner_b.id, "2026-06-08")
            .unwrap();
        let teacher = user::create_user(&conn, "teacher.a", "password", "A Teacher").unwrap();

        // A fresh class record: two items exist, but only one learner's
        // score has actually been recorded on one of them.
        let item1 =
            assessment_item::create(&conn, &school_id, &created.id, WRITTEN_WORKS, "WW1", 20.0)
                .unwrap()
                .unwrap();
        assessment_item::create(&conn, &school_id, &created.id, WRITTEN_WORKS, "WW2", 20.0)
            .unwrap()
            .unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &item1.id,
            &learner_a.id,
            learner_score::LearnerScoreStatus::Scored,
            Some(18.0),
            &teacher.id,
        )
        .unwrap();

        let detail = find_detail_by_id_in_school(&conn, &school_id, &created.id).unwrap().unwrap();
        assert_eq!(detail.item_count, 2, "two assessment items exist");
        assert_eq!(detail.recorded_count, 1, "only one learner_scores row exists so far");
        assert_eq!(detail.total_eligible, 2, "two learners enrolled in the section");

        let listed = list_by_school(&conn, &school_id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].item_count, 2);
        assert_eq!(listed[0].recorded_count, 1);
        assert_eq!(listed[0].total_eligible, 2);
    }

    #[test]
    fn list_and_find_detail_report_zero_counts_for_a_class_record_with_no_items_yet() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        let created = create(&conn, &school_id, &section_id, &subject_id, &period_id, K10_POLICY)
            .unwrap()
            .unwrap();

        let detail = find_detail_by_id_in_school(&conn, &school_id, &created.id).unwrap().unwrap();

        assert_eq!(detail.item_count, 0);
        assert_eq!(detail.recorded_count, 0);
        assert_eq!(detail.total_eligible, 0, "no learners enrolled in this section yet");
    }

    #[test]
    fn resolved_weight_policy_id_in_school_returns_the_pinned_policy() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        let created = create(
            &conn,
            &school_id,
            &section_id,
            &subject_id,
            &period_id,
            EPP_TLE_MAPEH_POLICY,
        )
        .unwrap()
        .unwrap();

        let resolved = resolved_weight_policy_id_in_school(&conn, &school_id, &created.id).unwrap();

        assert_eq!(resolved, Some(EPP_TLE_MAPEH_POLICY.to_string()));
    }

    #[test]
    fn resolved_weight_policy_id_in_school_falls_back_to_the_default_for_a_legacy_null_row() {
        let conn = open_test_db();
        let (school_id, section_id, subject_id, period_id) = setup(&conn);
        // Simulate a pre-migration-11 class record: insert directly, bypassing
        // `create`'s now-mandatory weight_policy_id parameter.
        conn.execute(
            "INSERT INTO class_records (id, school_id, section_id, subject_id, grading_period_id) \
             VALUES ('legacy-cr', ?1, ?2, ?3, ?4)",
            (&school_id, &section_id, &subject_id, &period_id),
        )
        .unwrap();

        let resolved =
            resolved_weight_policy_id_in_school(&conn, &school_id, "legacy-cr").unwrap();
        let detail = find_detail_by_id_in_school(&conn, &school_id, "legacy-cr").unwrap().unwrap();

        assert_eq!(resolved, Some(K10_POLICY.to_string()), "must fall back to the current default policy");
        assert_eq!(detail.weight_policy_id, K10_POLICY);
        assert_eq!(detail.weight_policy_name, "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)");
    }
}
