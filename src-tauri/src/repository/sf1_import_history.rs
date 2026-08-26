//! SF1 import history — Wave 2E. One row per successfully committed
//! `commit_sf1_import` batch; see migration 19's own comment in
//! `db::migrations` for why there is deliberately no `status` column and
//! no learner PII in this table. Mirrors `repository::audit_log`'s
//! conventions (school-scoped `record`/`list_for_school`, UUIDv7
//! `id` as a deterministic same-millisecond tie-break) rather than
//! inventing a new pattern.

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::import::sf1::Sf1ImportSummary;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Sf1ImportHistoryEntry {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub user_id: Option<String>,
    pub username: String,
    pub source_filename: String,
    pub source_fingerprint: String,
    pub rows_committed: usize,
    pub new_learners_created: usize,
    pub existing_learners_enrolled: usize,
    pub created_at: String,
}

/// Records one completed import batch. Callers (`import::commit`) must
/// call this inside the same transaction that wrote the batch's
/// learner/enrollment rows — see this module's doc comment for why that
/// matters. Never returns the row it wrote, matching `audit_log::record`.
#[allow(clippy::too_many_arguments)]
pub fn record(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    user_id: Option<&str>,
    username: &str,
    source_filename: &str,
    source_fingerprint: &str,
    summary: &Sf1ImportSummary,
) -> AppResult<()> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO sf1_import_history \
         (id, school_id, section_id, user_id, username, source_filename, \
          source_fingerprint, rows_committed, new_learners_created, existing_learners_enrolled) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        (
            &id,
            school_id,
            section_id,
            user_id,
            username,
            source_filename,
            source_fingerprint,
            summary.rows_committed as i64,
            summary.new_learners_created as i64,
            summary.existing_learners_enrolled as i64,
        ),
    )?;
    Ok(())
}

fn row_to_entry(row: &rusqlite::Row) -> rusqlite::Result<Sf1ImportHistoryEntry> {
    Ok(Sf1ImportHistoryEntry {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        user_id: row.get(3)?,
        username: row.get(4)?,
        source_filename: row.get(5)?,
        source_fingerprint: row.get(6)?,
        rows_committed: row.get::<_, i64>(7)? as usize,
        new_learners_created: row.get::<_, i64>(8)? as usize,
        existing_learners_enrolled: row.get::<_, i64>(9)? as usize,
        created_at: row.get(10)?,
    })
}

const SELECT_COLUMNS: &str = "id, school_id, section_id, user_id, username, source_filename, \
     source_fingerprint, rows_committed, new_learners_created, existing_learners_enrolled, created_at";

/// The most recent import history entries for `school_id`, newest first,
/// capped at `limit` — a review screen, not an unbounded export.
pub fn list_for_school(
    conn: &Connection,
    school_id: &str,
    limit: u32,
) -> AppResult<Vec<Sf1ImportHistoryEntry>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM sf1_import_history WHERE school_id = ?1 \
         ORDER BY created_at DESC, id DESC LIMIT ?2"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt.query_map((school_id, limit), row_to_entry)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The most recent prior import of the same file *content* into this
/// school, if any — the advisory "you may have imported this before"
/// signal. Deliberately never blocks anything; see
/// `import::fingerprint`'s doc comment.
pub fn find_most_recent_by_fingerprint(
    conn: &Connection,
    school_id: &str,
    source_fingerprint: &str,
) -> AppResult<Option<Sf1ImportHistoryEntry>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM sf1_import_history \
         WHERE school_id = ?1 AND source_fingerprint = ?2 \
         ORDER BY created_at DESC, id DESC LIMIT 1"
    );
    let mut stmt = conn.prepare(&sql)?;
    stmt.query_row((school_id, source_fingerprint), row_to_entry)
        .map(Some)
        .or_else(|e| {
            if matches!(e, rusqlite::Error::QueryReturnedNoRows) {
                Ok(None)
            } else {
                Err(e.into())
            }
        })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school, repository::section, repository::user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn summary(committed: usize, created: usize, enrolled: usize) -> Sf1ImportSummary {
        Sf1ImportSummary {
            rows_committed: committed,
            new_learners_created: created,
            existing_learners_enrolled: enrolled,
        }
    }

    #[test]
    fn record_then_list_round_trips() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        record(
            &conn,
            &s.id,
            &sec.id,
            Some(&u.id),
            "ana.cruz",
            "sf1_grade1.xlsx",
            "deadbeef",
            &summary(2, 2, 0),
        )
        .unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].username, "ana.cruz");
        assert_eq!(entries[0].source_filename, "sf1_grade1.xlsx");
        assert_eq!(entries[0].rows_committed, 2);
        assert_eq!(entries[0].new_learners_created, 2);
    }

    #[test]
    fn list_for_school_orders_newest_first_and_respects_the_limit() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        for i in 0..3 {
            record(
                &conn,
                &s.id,
                &sec.id,
                None,
                &format!("teacher{i}"),
                "sf1.xlsx",
                "hash",
                &summary(1, 1, 0),
            )
            .unwrap();
        }

        let entries = list_for_school(&conn, &s.id, 2).unwrap();

        assert_eq!(entries.len(), 2);
        assert_eq!(
            entries
                .iter()
                .map(|e| e.username.as_str())
                .collect::<Vec<_>>(),
            vec!["teacher2", "teacher1"]
        );
    }

    #[test]
    fn list_for_school_never_includes_another_schools_history() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let sec_a = section::create(&conn, &school_a.id, "2026-2027", "Grade 1", "A").unwrap();
        let sec_b = section::create(&conn, &school_b.id, "2026-2027", "Grade 1", "B").unwrap();
        record(
            &conn,
            &school_a.id,
            &sec_a.id,
            None,
            "ana",
            "sf1.xlsx",
            "hash-a",
            &summary(1, 1, 0),
        )
        .unwrap();
        record(
            &conn,
            &school_b.id,
            &sec_b.id,
            None,
            "ben",
            "sf1.xlsx",
            "hash-b",
            &summary(1, 1, 0),
        )
        .unwrap();

        let entries = list_for_school(&conn, &school_a.id, 10).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].username, "ana");
    }

    #[test]
    fn find_most_recent_by_fingerprint_finds_a_prior_import_of_identical_content() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "Grade 1", "Sampaguita").unwrap();
        record(
            &conn,
            &s.id,
            &sec.id,
            None,
            "ana",
            "sf1.xlsx",
            "same-content-hash",
            &summary(3, 3, 0),
        )
        .unwrap();

        let found = find_most_recent_by_fingerprint(&conn, &s.id, "same-content-hash").unwrap();

        assert!(found.is_some());
        assert_eq!(found.unwrap().rows_committed, 3);
    }

    #[test]
    fn find_most_recent_by_fingerprint_is_none_for_content_never_imported() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let found = find_most_recent_by_fingerprint(&conn, &s.id, "never-seen-hash").unwrap();

        assert!(found.is_none());
    }

    #[test]
    fn find_most_recent_by_fingerprint_never_matches_another_schools_import() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let sec_b = section::create(&conn, &school_b.id, "2026-2027", "Grade 1", "B").unwrap();
        record(
            &conn,
            &school_b.id,
            &sec_b.id,
            None,
            "ben",
            "sf1.xlsx",
            "shared-hash",
            &summary(1, 1, 0),
        )
        .unwrap();

        let found = find_most_recent_by_fingerprint(&conn, &school_a.id, "shared-hash").unwrap();

        assert!(found.is_none());
    }
}
