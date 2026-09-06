use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Subject {
    pub id: String,
    pub school_id: String,
    pub name: String,
    pub created_at: String,
}

pub fn create(conn: &Connection, school_id: &str, name: &str) -> AppResult<Subject> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO subjects (id, school_id, name) VALUES (?1, ?2, ?3)",
        (&id, school_id, name),
    )?;
    find_by_id_in_school(conn, school_id, &id).map(|s| s.expect("row just inserted must exist"))
}

/// ADR-0067/0069 sync wiring: applies a pulled/decrypted `Subject`
/// exactly like `section::upsert_from_sync` — `subject` is already
/// decrypted and authenticated, `sync_client::apply_decrypted_change` is
/// responsible for having rejected a tampered payload before ever
/// calling this. Deliberate `INSERT ... ON CONFLICT(id) DO UPDATE`, not a
/// separate insert-or-update branch, for the same reason as the section
/// case: a subject this device has never seen locally and one it has a
/// stale copy of are the same write here, by design. `subjects` has no
/// `update` command today (only `create`), so in practice every pulled
/// change is a first-seen insert, but this still upserts rather than
/// insert-only so a future `update`/`rename` pushed from another device
/// round-trips correctly without a second materializer needing to be
/// written later. This bypasses `create`'s own `UNIQUE (school_id, name)`
/// conflict path entirely, writing keyed only on the row's own stable
/// `id` — matching how `learner_score::upsert_from_sync` never
/// re-validates its originating device's own business-rule checks
/// either (that validation already happened on the originating device).
pub fn upsert_from_sync(conn: &Connection, subject: &Subject) -> AppResult<()> {
    conn.execute(
        "INSERT INTO subjects (id, school_id, name, created_at)
         VALUES (?1, ?2, ?3, ?4)
         ON CONFLICT(id) DO UPDATE SET
             school_id = excluded.school_id,
             name = excluded.name",
        (
            &subject.id,
            &subject.school_id,
            &subject.name,
            &subject.created_at,
        ),
    )?;
    Ok(())
}

/// The school-scoped lookup safe to expose as a command — see
/// `section::find_by_id_in_school` for the "None means not-found-or-
/// foreign, indistinguishably" convention this follows.
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    subject_id: &str,
) -> AppResult<Option<Subject>> {
    conn.query_row(
        "SELECT id, school_id, name, created_at FROM subjects WHERE id = ?1 AND school_id = ?2",
        (subject_id, school_id),
        row_to_subject,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Returns only `school_id`'s own subjects — isolation enforced in the
/// query, matching `section::list_by_school`.
pub fn list_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<Subject>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, name, created_at FROM subjects WHERE school_id = ?1 ORDER BY name",
    )?;
    let rows = stmt.query_map([school_id], row_to_subject)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_subject(row: &rusqlite::Row) -> rusqlite::Result<Subject> {
    Ok(Subject {
        id: row.get(0)?,
        school_id: row.get(1)?,
        name: row.get(2)?,
        created_at: row.get(3)?,
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

        let created = create(&conn, &s.id, "Mathematics").unwrap();
        let found = find_by_id_in_school(&conn, &s.id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_unknown_school() {
        let conn = open_test_db();

        let result = create(&conn, "missing-school", "Mathematics");

        assert!(result.is_err());
    }

    #[test]
    fn create_rejects_a_duplicate_name_within_the_same_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        create(&conn, &s.id, "Mathematics").unwrap();

        let result = create(&conn, &s.id, "Mathematics");

        assert!(result.is_err());
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_a_subject_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let subject = create(&conn, &school_a.id, "Mathematics").unwrap();

        let found = find_by_id_in_school(&conn, &school_b.id, &subject.id).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn list_by_school_only_returns_that_schools_subjects() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        create(&conn, &school_a.id, "Mathematics").unwrap();
        create(&conn, &school_b.id, "Science").unwrap();

        let subjects = list_by_school(&conn, &school_a.id).unwrap();

        assert_eq!(subjects.len(), 1);
        assert_eq!(subjects[0].name, "Mathematics");
    }

    #[test]
    fn upsert_from_sync_inserts_a_subject_this_device_has_never_seen() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let incoming = Subject {
            id: Uuid::now_v7().to_string(),
            school_id: s.id.clone(),
            name: "Mathematics".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &incoming.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.name, "Mathematics");
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let original = create(&conn, &s.id, "Mathematics").unwrap();

        let updated = Subject {
            name: "Mathematics 7".to_string(),
            ..original.clone()
        };
        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.name, "Mathematics 7");
        let all = list_by_school(&conn, &s.id).unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }
}
