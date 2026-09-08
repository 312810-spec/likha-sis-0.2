//! Storage for imported multi-year scholastic history rows
//! (`docs/adr/0074-xlsx-scholastic-importer.md`) — a transferee learner's
//! grades earned at a school/system outside this app's own
//! `class_records`/`learner_scores`, ingested from a DepEd `.xlsx`
//! workbook via `import::scholastic`. Feeds SF10's prior-years section.

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ScholasticHistoryRecord {
    pub id: String,
    pub school_id: String,
    pub learner_id: String,
    pub school_year: String,
    pub grade_level: String,
    pub subject_name: String,
    pub final_grade: i64,
    pub remarks: Option<String>,
    pub source_school_name: Option<String>,
    pub imported_at: String,
}

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<ScholasticHistoryRecord> {
    Ok(ScholasticHistoryRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        learner_id: row.get(2)?,
        school_year: row.get(3)?,
        grade_level: row.get(4)?,
        subject_name: row.get(5)?,
        final_grade: row.get(6)?,
        remarks: row.get(7)?,
        source_school_name: row.get(8)?,
        imported_at: row.get(9)?,
    })
}

const SELECT_COLUMNS: &str = "id, school_id, learner_id, school_year, grade_level, \
     subject_name, final_grade, remarks, source_school_name, imported_at";

/// Inserts one imported row. `learner_id` must already resolve to an
/// existing learner in `school_id` — this function does not create
/// learners (the importer's own preview/commit step matches each
/// workbook row to an existing learner by LRN first; a row with no
/// match is never silently turned into a new enrollment here).
#[allow(clippy::too_many_arguments)]
pub fn insert(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    school_year: &str,
    grade_level: &str,
    subject_name: &str,
    final_grade: i64,
    remarks: Option<&str>,
    source_school_name: Option<&str>,
    imported_by_user_id: Option<&str>,
) -> AppResult<ScholasticHistoryRecord> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO scholastic_history_records \
            (id, school_id, learner_id, school_year, grade_level, subject_name, \
             final_grade, remarks, source_school_name, imported_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (
            &id,
            school_id,
            learner_id,
            school_year,
            grade_level,
            subject_name,
            final_grade,
            remarks,
            source_school_name,
            imported_by_user_id,
        ),
    )?;
    conn.query_row(
        &format!("SELECT {SELECT_COLUMNS} FROM scholastic_history_records WHERE id = ?1"),
        (&id,),
        row_to_record,
    )
    .map_err(Into::into)
}

/// Whether `learner_id` already has a history row for
/// `school_year`/`subject_name` — the importer's duplicate-review step
/// uses this before offering to skip/overwrite (never a silent
/// overwrite: the migration's own `UNIQUE` constraint would reject a
/// second `insert` for the same trio regardless).
pub fn exists(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    school_year: &str,
    subject_name: &str,
) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM scholastic_history_records \
         WHERE school_id = ?1 AND learner_id = ?2 AND school_year = ?3 AND subject_name = ?4",
        (school_id, learner_id, school_year, subject_name),
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// A learner's full imported scholastic history, oldest school year
/// first — the shape SF10's prior-years section needs.
pub fn list_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<ScholasticHistoryRecord>> {
    let mut stmt = conn.prepare(&format!(
        "SELECT {SELECT_COLUMNS} FROM scholastic_history_records \
         WHERE school_id = ?1 AND learner_id = ?2 \
         ORDER BY school_year ASC, subject_name ASC"
    ))?;
    let rows = stmt.query_map((school_id, learner_id), row_to_record)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Ana', 'Delacruz')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn insert_and_list_round_trip() {
        let conn = setup();
        insert(
            &conn,
            "s1",
            "l1",
            "2024-2025",
            "4",
            "Mathematics",
            88,
            Some("Synthetic remark"),
            Some("Synthetic Prior School"),
            None,
        )
        .unwrap();

        let history = list_for_learner(&conn, "s1", "l1").unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].final_grade, 88);
    }

    #[test]
    fn exists_reflects_a_previously_imported_row() {
        let conn = setup();
        assert!(!exists(&conn, "s1", "l1", "2024-2025", "Mathematics").unwrap());
        insert(
            &conn,
            "s1",
            "l1",
            "2024-2025",
            "4",
            "Mathematics",
            88,
            None,
            None,
            None,
        )
        .unwrap();
        assert!(exists(&conn, "s1", "l1", "2024-2025", "Mathematics").unwrap());
    }

    #[test]
    fn a_second_insert_for_the_same_subject_and_year_is_rejected_by_the_schema() {
        let conn = setup();
        insert(
            &conn,
            "s1",
            "l1",
            "2024-2025",
            "4",
            "Mathematics",
            88,
            None,
            None,
            None,
        )
        .unwrap();
        let dup = insert(
            &conn,
            "s1",
            "l1",
            "2024-2025",
            "4",
            "Mathematics",
            90,
            None,
            None,
            None,
        );
        assert!(dup.is_err());
    }
}
