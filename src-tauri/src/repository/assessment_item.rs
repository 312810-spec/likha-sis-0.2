use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{class_record, section_membership};

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentItem {
    pub id: String,
    pub school_id: String,
    pub class_record_id: String,
    pub category_id: String,
    pub name: String,
    pub max_score: f64,
    pub created_at: String,
}

/// An assessment item joined with its category's name, for a class-record
/// workspace screen that needs to group items by category without a
/// separate round trip per item. `recorded_count`/`total_eligible` let a
/// teacher see each item's completion (e.g. "12/30 recorded") without
/// opening it — `total_eligible` is the class record's own eligible-
/// learner roster size (the same for every item in one class record,
/// computed once per `list_by_class_record` call, not per item).
#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentItemDetail {
    pub id: String,
    pub school_id: String,
    pub class_record_id: String,
    pub category_id: String,
    pub category_name: String,
    pub name: String,
    pub max_score: f64,
    pub created_at: String,
    pub recorded_count: i64,
    pub total_eligible: i64,
}

/// Creates an assessment item under `class_record_id`, verified to belong
/// to `school_id`, categorized under `category_id` (fixed reference data,
/// existence-checked but not school-scoped — same convention as
/// `grading::create`'s `policy_period_id` check). Returns `Ok(None)` if
/// either reference doesn't resolve, or if `category_id` is a *parent*
/// category (e.g. "Examinations", which since M13 exists only to group its
/// Summative Test 1/2 and Term Examination children — see migration 10):
/// an item must be created under a leaf category, never a parent, or grade
/// computation would have no defined way to attribute it to one of the
/// parent's differently-weighted children. `max_score > 0` is enforced by
/// the schema's `CHECK` and surfaces as an `Err`, not a `None`.
pub fn create(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
    category_id: &str,
    name: &str,
    max_score: f64,
) -> AppResult<Option<AssessmentItem>> {
    if class_record::find_by_id_in_school(conn, school_id, class_record_id)?.is_none() {
        return Ok(None);
    }
    if !is_leaf_category(conn, category_id)? {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO assessment_items \
             (id, school_id, class_record_id, category_id, name, max_score) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (&id, school_id, class_record_id, category_id, name, max_score),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// True if `category_id` exists and is a leaf (no children) -- the same
/// check `create` and `update` both need before accepting it as an
/// item's category, since an item under a parent category (e.g.
/// "Examinations") would have no defined way to attribute it to one of
/// the parent's differently-weighted children.
fn is_leaf_category(conn: &Connection, category_id: &str) -> AppResult<bool> {
    let category_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM assessment_categories WHERE id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    if !category_exists {
        return Ok(false);
    }
    let has_children: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM assessment_categories WHERE parent_category_id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    Ok(!has_children)
}

/// True if any learner has a recorded score (or exception) for this item
/// -- the bright line between "safe to fully edit/delete" and "protect
/// the math already computed from it." Deliberately not scoped to
/// `school_id` itself (the caller already resolved the item within its
/// own school before calling this).
fn has_any_scores(conn: &Connection, assessment_item_id: &str) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM learner_scores WHERE assessment_item_id = ?1)",
        [assessment_item_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Renames an assessment item. `name` is purely descriptive — verified
/// (2026-08-25, UX-04) to never be read by `grading_computation`, never
/// used as an identity/matching key anywhere in export or sync code, and
/// not subject to any uniqueness constraint — so unlike `category_id`/
/// `max_score`, it can always be changed safely, whether or not the item
/// already has recorded scores. Returns `Ok(None)` if the item doesn't
/// resolve in `school_id`.
pub fn rename(
    conn: &Connection,
    school_id: &str,
    id: &str,
    name: &str,
) -> AppResult<Option<AssessmentItem>> {
    if find_by_id_in_school(conn, school_id, id)?.is_none() {
        return Ok(None);
    }
    conn.execute(
        "UPDATE assessment_items SET name = ?1 WHERE id = ?2 AND school_id = ?3",
        (name, id, school_id),
    )?;
    find_by_id_in_school(conn, school_id, id)
}

/// Fully edits an assessment item (name, category, max score) — only
/// permitted while it has **no** recorded scores yet. A different
/// category would silently change which DepEd weight bucket every future
/// score counts toward; a different `max_score` changes the denominator
/// of `PS = raw/max × 100` for every score already on record. Neither is
/// a safe silent edit once real scores exist — see `rename` for the one
/// field (`name`) that always is. Returns `Ok(None)` if the item doesn't
/// resolve in `school_id`, if it already has any recorded score, or if
/// `category_id` doesn't resolve to a real leaf category.
pub fn update(
    conn: &Connection,
    school_id: &str,
    id: &str,
    name: &str,
    category_id: &str,
    max_score: f64,
) -> AppResult<Option<AssessmentItem>> {
    if find_by_id_in_school(conn, school_id, id)?.is_none() {
        return Ok(None);
    }
    if has_any_scores(conn, id)? {
        return Ok(None);
    }
    if !is_leaf_category(conn, category_id)? {
        return Ok(None);
    }
    conn.execute(
        "UPDATE assessment_items SET name = ?1, category_id = ?2, max_score = ?3 \
         WHERE id = ?4 AND school_id = ?5",
        (name, category_id, max_score, id, school_id),
    )?;
    find_by_id_in_school(conn, school_id, id)
}

/// Deletes an assessment item — only permitted while it has **no**
/// recorded scores yet, for the same reason `update` blocks a meaning-
/// changing edit: deleting a scored item would silently discard grade-
/// affecting data with no recovery path. Returns `Ok(false)` if the item
/// doesn't resolve in `school_id` or already has a recorded score;
/// `Ok(true)` once actually deleted.
pub fn delete(conn: &Connection, school_id: &str, id: &str) -> AppResult<bool> {
    if find_by_id_in_school(conn, school_id, id)?.is_none() {
        return Ok(false);
    }
    if has_any_scores(conn, id)? {
        return Ok(false);
    }
    let affected = conn.execute(
        "DELETE FROM assessment_items WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
    )?;
    Ok(affected > 0)
}

/// The school-scoped lookup safe to expose as a command — same convention
/// as `class_record::find_by_id_in_school`.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<AssessmentItem>> {
    conn.query_row(
        "SELECT id, school_id, class_record_id, category_id, name, max_score, created_at \
         FROM assessment_items WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_item,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every assessment item under `class_record_id`, scoped to `school_id`
/// directly in the query (not merely implied by `class_record_id`
/// belonging to that school) — matching
/// `section_membership::roster_for_section`'s isolation convention.
pub fn list_by_class_record(
    conn: &Connection,
    school_id: &str,
    class_record_id: &str,
) -> AppResult<Vec<AssessmentItemDetail>> {
    // The eligible-learner count is the same for every item in this one
    // class record (it depends on the record's section+grading-period
    // range, not on any individual item) -- computed once here rather
    // than once per row.
    let total_eligible: i64 =
        match class_record::section_and_period_range_in_school(conn, school_id, class_record_id)? {
            Some((section_id, starts_on, ends_on)) => section_membership::roster_for_section_over_range(
                conn,
                school_id,
                &section_id,
                &starts_on,
                &ends_on,
            )?
            .len() as i64,
            None => 0,
        };

    let mut stmt = conn.prepare(
        "SELECT ai.id, ai.school_id, ai.class_record_id, ai.category_id, ac.name, \
                ai.name, ai.max_score, ai.created_at, \
                (SELECT COUNT(*) FROM learner_scores ls WHERE ls.assessment_item_id = ai.id) \
         FROM assessment_items ai \
         JOIN assessment_categories ac ON ac.id = ai.category_id \
         WHERE ai.class_record_id = ?1 AND ai.school_id = ?2 \
         ORDER BY ac.sequence, ai.created_at",
    )?;
    let rows = stmt.query_map((class_record_id, school_id), |row| {
        Ok(AssessmentItemDetail {
            id: row.get(0)?,
            school_id: row.get(1)?,
            class_record_id: row.get(2)?,
            category_id: row.get(3)?,
            category_name: row.get(4)?,
            name: row.get(5)?,
            max_score: row.get(6)?,
            created_at: row.get(7)?,
            recorded_count: row.get(8)?,
            total_eligible,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_item(row: &rusqlite::Row) -> rusqlite::Result<AssessmentItem> {
    Ok(AssessmentItem {
        id: row.get(0)?,
        school_id: row.get(1)?,
        class_record_id: row.get(2)?,
        category_id: row.get(3)?,
        name: row.get(4)?,
        max_score: row.get(5)?,
        created_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{grading, learner, learner_score, school, section, section_membership, subject},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    fn setup(conn: &Connection) -> (String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let period = grading::create(conn, &s.id, "2026-2027", TERM_1, "2026-06-08", "2026-09-15")
            .unwrap()
            .unwrap();
        let cr = class_record::create(conn, &s.id, &sec.id, &sub.id, &period.id, K10_POLICY)
            .unwrap()
            .unwrap();
        (s.id, cr.id)
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);

        let created = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let found = find_by_id_in_school(&conn, &school_id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_a_class_record_from_a_different_school() {
        let conn = open_test_db();
        let (_school_id, class_record_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = create(&conn, &other_school.id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_parent_category_that_has_children() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        const EXAMINATIONS: &str = "00000000-0000-7000-8000-000000000313";

        let result = create(&conn, &school_id, &class_record_id, EXAMINATIONS, "Q1 Exams", 100.0)
            .unwrap();

        assert_eq!(
            result, None,
            "Examinations has Summative Test 1/2 and Term Examination children (migration 10); \
             an item must be created under one of those, not the parent"
        );
    }

    #[test]
    fn create_accepts_a_leaf_child_category() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        const ST1: &str = "00000000-0000-7000-8000-000000003131";

        let created = create(&conn, &school_id, &class_record_id, ST1, "Q1 ST1", 40.0)
            .unwrap()
            .unwrap();

        assert_eq!(created.category_id, ST1);
    }

    #[test]
    fn create_rejects_an_unknown_category_id() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);

        let result = create(&conn, &school_id, &class_record_id, "does-not-exist", "Quiz 1", 20.0)
            .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_non_positive_max_score() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);

        let result = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 0.0);

        assert!(result.is_err());
    }

    #[test]
    fn list_by_class_record_only_returns_that_class_records_items_with_the_category_name() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0).unwrap();

        let items = list_by_class_record(&conn, &school_id, &class_record_id).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].name, "Quiz 1");
        assert_eq!(items[0].category_name, "Written Works");
    }

    #[test]
    fn list_by_class_record_reports_recorded_and_total_eligible_counts() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

        // Two eligible learners enrolled in the class record's section;
        // only one has a score recorded so far.
        let l1 = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let l2 = learner::create(&conn, &school_id, "Bo", "Reyes", None, None).unwrap();
        let (section_id, _starts, _ends) =
            class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)
                .unwrap()
                .unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &l1.id, "2026-06-08").unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &l2.id, "2026-06-08").unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &item.id,
            &l1.id,
            learner_score::LearnerScoreStatus::Scored,
            Some(18.0),
            "teacher-1",
        )
        .unwrap();

        let items = list_by_class_record(&conn, &school_id, &class_record_id).unwrap();

        assert_eq!(items.len(), 1);
        assert_eq!(items[0].recorded_count, 1);
        assert_eq!(items[0].total_eligible, 2);
    }

    const EXAMINATIONS: &str = "00000000-0000-7000-8000-000000000313";

    #[test]
    fn rename_changes_the_name_even_when_the_item_already_has_a_recorded_score() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let learner = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let (section_id, _starts, _ends) =
            class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)
                .unwrap()
                .unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &learner.id, "2026-06-08")
            .unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &item.id,
            &learner.id,
            learner_score::LearnerScoreStatus::Scored,
            Some(18.0),
            "teacher-1",
        )
        .unwrap();

        let renamed = rename(&conn, &school_id, &item.id, "Quiz 1 (Retake)").unwrap().unwrap();

        assert_eq!(renamed.name, "Quiz 1 (Retake)");
        assert_eq!(renamed.category_id, WRITTEN_WORKS, "renaming must not touch the category");
        assert_eq!(renamed.max_score, 20.0, "renaming must not touch the max score");
    }

    #[test]
    fn rename_rejects_an_item_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = rename(&conn, &other_school.id, &item.id, "Hijacked").unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn update_fully_edits_an_unscored_item() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

        const ST1: &str = "00000000-0000-7000-8000-000000003131";
        let updated = update(&conn, &school_id, &item.id, "Quiz 1 (fixed)", ST1, 25.0)
            .unwrap()
            .unwrap();

        assert_eq!(updated.name, "Quiz 1 (fixed)");
        assert_eq!(updated.category_id, ST1);
        assert_eq!(updated.max_score, 25.0);
    }

    #[test]
    fn update_rejects_a_category_or_max_score_change_once_the_item_has_a_recorded_score() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let learner = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let (section_id, _starts, _ends) =
            class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)
                .unwrap()
                .unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &learner.id, "2026-06-08")
            .unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &item.id,
            &learner.id,
            learner_score::LearnerScoreStatus::Scored,
            Some(18.0),
            "teacher-1",
        )
        .unwrap();

        let max_score_change = update(&conn, &school_id, &item.id, "Quiz 1", WRITTEN_WORKS, 30.0).unwrap();
        assert_eq!(
            max_score_change, None,
            "changing max_score after a score exists would silently change that score's meaning"
        );

        const ST1: &str = "00000000-0000-7000-8000-000000003131";
        let category_change = update(&conn, &school_id, &item.id, "Quiz 1", ST1, 20.0).unwrap();
        assert_eq!(
            category_change, None,
            "changing category after a score exists would move it into a different weight bucket"
        );
    }

    #[test]
    fn update_rejects_a_parent_category() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

        let result = update(&conn, &school_id, &item.id, "Quiz 1", EXAMINATIONS, 20.0).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn delete_removes_an_unscored_item() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();

        let deleted = delete(&conn, &school_id, &item.id).unwrap();

        assert!(deleted);
        assert_eq!(find_by_id_in_school(&conn, &school_id, &item.id).unwrap(), None);
    }

    #[test]
    fn delete_refuses_an_item_that_already_has_a_recorded_score() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let learner = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let (section_id, _starts, _ends) =
            class_record::section_and_period_range_in_school(&conn, &school_id, &class_record_id)
                .unwrap()
                .unwrap();
        section_membership::enroll(&conn, &school_id, &section_id, &learner.id, "2026-06-08")
            .unwrap();
        learner_score::record(
            &conn,
            &school_id,
            &item.id,
            &learner.id,
            learner_score::LearnerScoreStatus::Scored,
            Some(18.0),
            "teacher-1",
        )
        .unwrap();

        let deleted = delete(&conn, &school_id, &item.id).unwrap();

        assert!(!deleted, "a scored item must not be deletable -- it would discard grade data");
        assert!(find_by_id_in_school(&conn, &school_id, &item.id).unwrap().is_some());
    }

    #[test]
    fn delete_rejects_an_item_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, class_record_id) = setup(&conn);
        let item = create(&conn, &school_id, &class_record_id, WRITTEN_WORKS, "Quiz 1", 20.0)
            .unwrap()
            .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let deleted = delete(&conn, &other_school.id, &item.id).unwrap();

        assert!(!deleted);
        assert!(find_by_id_in_school(&conn, &school_id, &item.id).unwrap().is_some());
    }
}
