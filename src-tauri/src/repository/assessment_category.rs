use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;

/// A named, versioned assessment-category structure with its own source
/// citation — see migration 8's comment and
/// `docs/adr/0012-assessment-items-and-scores.md` for why this is
/// reference data rather than a hardcoded enum: DepEd Order No. 8, s.
/// 2015 (Written Work/Performance Task/Quarterly Assessment) has been
/// repealed by DepEd Order No. 015, s. 2026, which renames the third
/// category to "Examinations."
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentCategorySet {
    pub id: String,
    pub name: String,
    pub source_citation: String,
    pub is_default: bool,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AssessmentCategory {
    pub id: String,
    pub set_id: String,
    pub sequence: i64,
    pub name: String,
}

/// Reference data, not school-scoped — every school sees the same set of
/// DepEd-sourced category sets. Ordered by `is_default DESC` so the
/// current default set is always first — same convention as
/// `grading::list_policies`.
pub fn list_category_sets(conn: &Connection) -> AppResult<Vec<AssessmentCategorySet>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, source_citation, is_default, created_at \
         FROM assessment_category_sets ORDER BY is_default DESC, name",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(AssessmentCategorySet {
            id: row.get(0)?,
            name: row.get(1)?,
            source_citation: row.get(2)?,
            is_default: row.get::<_, i64>(3)? != 0,
            created_at: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The categories a teacher can create an assessment item directly under —
/// i.e. leaf categories only. Since migration 10 (M13), "Examinations" is a
/// *parent* category grouping Summative Test 1/2 and Term Examination (its
/// internal DepEd-mandated 30/30/40 weighting requires items to be
/// attributed to one of those three, not pooled directly under
/// "Examinations" itself — see `assessment_item::create`'s matching
/// rejection of parent categories). A category with children is therefore
/// excluded here rather than offered as a selectable-but-rejected option.
pub fn list_categories_for_set(
    conn: &Connection,
    set_id: &str,
) -> AppResult<Vec<AssessmentCategory>> {
    let mut stmt = conn.prepare(
        "SELECT id, set_id, sequence, name \
         FROM assessment_categories \
         WHERE set_id = ?1 \
           AND id NOT IN (SELECT DISTINCT parent_category_id FROM assessment_categories \
                           WHERE parent_category_id IS NOT NULL) \
         ORDER BY sequence",
    )?;
    let rows = stmt.query_map([set_id], |row| {
        Ok(AssessmentCategory {
            id: row.get(0)?,
            set_id: row.get(1)?,
            sequence: row.get(2)?,
            name: row.get(3)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    const DO_015_SET: &str = "00000000-0000-7000-8000-000000000031";
    const DO_8_SET: &str = "00000000-0000-7000-8000-000000000032";

    #[test]
    fn list_category_sets_returns_the_two_seeded_sets_with_default_first() {
        let conn = open_test_db();

        let sets = list_category_sets(&conn).unwrap();

        assert_eq!(sets.len(), 2);
        assert!(sets[0].is_default);
        assert_eq!(sets[0].name, "DepEd Classroom Assessment (DO 015, s. 2026)");
    }

    #[test]
    fn list_categories_for_set_returns_leaf_categories_only_in_sequence_order() {
        let conn = open_test_db();

        let categories = list_categories_for_set(&conn, DO_015_SET).unwrap();

        // "Examinations" is excluded (migration 10, M13): it is now a
        // parent grouping its three named sub-assessments, and an item
        // cannot be created directly under it — see
        // `assessment_item::create_rejects_a_parent_category_that_has_children`.
        let names: Vec<&str> = categories.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            vec![
                "Written Works",
                "Performance Tasks",
                "Summative Test 1",
                "Summative Test 2",
                "Term Examination"
            ]
        );
    }

    #[test]
    fn list_categories_for_set_returns_the_legacy_categories_for_the_do_8_set() {
        let conn = open_test_db();

        let categories = list_categories_for_set(&conn, DO_8_SET).unwrap();

        let names: Vec<&str> = categories.iter().map(|c| c.name.as_str()).collect();
        assert_eq!(
            names,
            vec!["Written Work", "Performance Task", "Quarterly Assessment"]
        );
    }
}
