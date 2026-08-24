use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::class_record;

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
/// separate round trip per item.
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
    let category_exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM assessment_categories WHERE id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    if !category_exists {
        return Ok(None);
    }
    let has_children: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM assessment_categories WHERE parent_category_id = ?1)",
        [category_id],
        |row| row.get(0),
    )?;
    if has_children {
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
    let mut stmt = conn.prepare(
        "SELECT ai.id, ai.school_id, ai.class_record_id, ai.category_id, ac.name, \
                ai.name, ai.max_score, ai.created_at \
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
        repository::{grading, school, section, subject},
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
}
