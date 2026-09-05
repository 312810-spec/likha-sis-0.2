use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

/// `Deserialize` exists for `commands::section`'s ADR-0067/0069 sync
/// wiring, which round-trips a `Section` through JSON as the (encrypted)
/// outbox payload -- see `repository::learner::Learner`'s identical doc
/// comment for why this is not needed by the Tauri IPC boundary itself.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Section {
    pub id: String,
    pub school_id: String,
    pub school_year: String,
    pub grade_level: String,
    pub name: String,
    pub created_at: String,
}

pub fn create(
    conn: &Connection,
    school_id: &str,
    school_year: &str,
    grade_level: &str,
    name: &str,
) -> AppResult<Section> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO sections (id, school_id, school_year, grade_level, name) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, school_year, grade_level, name),
    )?;
    find_by_id_in_school(conn, school_id, &id).map(|s| s.expect("row just inserted must exist"))
}

/// The school-scoped lookup safe to expose as a command: a caller can only
/// ever resolve a section within the school they explicitly ask about.
/// Returns `None` both when no section has this id and when it belongs to a
/// different school — the two are indistinguishable on purpose, matching
/// `learner::find_by_id_in_school`.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
) -> AppResult<Option<Section>> {
    conn.query_row(
        "SELECT id, school_id, school_year, grade_level, name, created_at \
         FROM sections WHERE id = ?1 AND school_id = ?2",
        (section_id, school_id),
        row_to_section,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Applies a decrypted sync payload for this entity kind (ADR-0067/0069's
/// pull-side materialization) -- same contract as
/// `repository::learner::upsert_from_sync`: `section` is already
/// decrypted and authenticated, `sync_client::apply_decrypted_change` is
/// responsible for having rejected a tampered payload before ever
/// calling this. Deliberate `INSERT ... ON CONFLICT(id) DO UPDATE`, not a
/// separate insert-or-update branch, for the same reason as the learner
/// case: a section this device has never seen locally and one it has a
/// stale copy of are the same write here, by design. Sections have no
/// update path today (see `create`'s own module -- no `update` function
/// exists), so in practice every pulled change is a first-seen insert,
/// but this still upserts rather than insert-only so a future `update`
/// pushed from another device round-trips correctly without a second
/// materializer needing to be written later.
pub fn upsert_from_sync(conn: &Connection, section: &Section) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sections (id, school_id, school_year, grade_level, name, created_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(id) DO UPDATE SET
             school_id = excluded.school_id,
             school_year = excluded.school_year,
             grade_level = excluded.grade_level,
             name = excluded.name",
        (
            &section.id,
            &section.school_id,
            &section.school_year,
            &section.grade_level,
            &section.name,
            &section.created_at,
        ),
    )?;
    Ok(())
}

/// Returns only the sections belonging to `school_id`. Callers must never
/// fetch all sections and filter client-side — isolation is enforced here,
/// at the query, not by hiding rows in the UI.
pub fn list_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<Section>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, school_year, grade_level, name, created_at \
         FROM sections WHERE school_id = ?1 ORDER BY school_year DESC, grade_level, name",
    )?;
    let rows = stmt.query_map([school_id], row_to_section)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_section(row: &rusqlite::Row) -> rusqlite::Result<Section> {
    Ok(Section {
        id: row.get(0)?,
        school_id: row.get(1)?,
        school_year: row.get(2)?,
        grade_level: row.get(3)?,
        name: row.get(4)?,
        created_at: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let created = create(&conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        let found = find_by_id_in_school(&conn, &s.id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_unknown_school() {
        let conn = open_test_db();

        let result = create(&conn, "missing-school", "2025-2026", "7", "Mabini");

        assert!(result.is_err());
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_a_section_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let section = create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();

        let found = find_by_id_in_school(&conn, &school_b.id, &section.id).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn list_by_school_only_returns_that_schools_sections() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        create(&conn, &school_a.id, "2025-2026", "7", "Mabini").unwrap();
        create(&conn, &school_b.id, "2025-2026", "7", "Rizal").unwrap();

        let sections = list_by_school(&conn, &school_a.id).unwrap();

        assert_eq!(sections.len(), 1);
        assert_eq!(sections[0].name, "Mabini");
    }

    #[test]
    fn upsert_from_sync_inserts_a_section_this_device_has_never_seen() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let incoming = Section {
            id: Uuid::now_v7().to_string(),
            school_id: s.id.clone(),
            school_year: "2025-2026".to_string(),
            grade_level: "7".to_string(),
            name: "Mabini".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &incoming.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.name, "Mabini");
        assert_eq!(found.grade_level, "7");
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let original = create(&conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        let updated = Section {
            name: "Mabini-Renamed".to_string(),
            grade_level: "8".to_string(),
            ..original.clone()
        };

        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.name, "Mabini-Renamed");
        assert_eq!(found.grade_level, "8");
        let count: i64 = conn
            .query_row("SELECT count(*) FROM sections", [], |row| row.get(0))
            .unwrap();
        assert_eq!(count, 1, "an update must never insert a second row");
    }

    #[test]
    fn create_rejects_duplicate_name_within_the_same_school_year_and_grade() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "2025-2026", "7", "Mabini").unwrap();

        let result = create(&conn, &s.id, "2025-2026", "7", "Mabini");

        assert!(result.is_err());
    }
}
