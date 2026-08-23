use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Learner {
    pub id: String,
    pub school_id: String,
    pub given_name: String,
    pub family_name: String,
    pub created_at: String,
}

pub fn create(
    conn: &Connection,
    school_id: &str,
    given_name: &str,
    family_name: &str,
) -> AppResult<Learner> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO learners (id, school_id, given_name, family_name) VALUES (?1, ?2, ?3, ?4)",
        (&id, school_id, given_name, family_name),
    )?;
    find_by_id(conn, &id).map(|l| l.expect("row just inserted must exist"))
}

/// Not school-scoped and intentionally module-private: this exists only to
/// read back a row this module just wrote (see `create`). Do not expose it
/// as a Tauri command or call it with a caller-supplied id — that would let
/// one school read another school's learner by guessing/enumerating ids.
fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<Learner>> {
    conn.query_row(
        "SELECT id, school_id, given_name, family_name, created_at FROM learners WHERE id = ?1",
        [id],
        row_to_learner,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Returns only the learners belonging to `school_id`. Callers must never
/// fetch all learners and filter client-side — isolation is enforced here,
/// at the query, not by hiding rows in the UI.
pub fn list_by_school(conn: &Connection, school_id: &str) -> AppResult<Vec<Learner>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, given_name, family_name, created_at \
         FROM learners WHERE school_id = ?1 ORDER BY family_name, given_name",
    )?;
    let rows = stmt.query_map([school_id], row_to_learner)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The school-scoped counterpart to the private `find_by_id`: safe to
/// expose as a command, because a caller can only ever look up a learner
/// within the school they explicitly ask about — never any school's
/// records by id alone. Returns `None` both when no learner has this id
/// and when it belongs to a different school; the two are
/// indistinguishable on purpose (see `update`'s doc comment).
pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Option<Learner>> {
    conn.query_row(
        "SELECT id, school_id, given_name, family_name, created_at \
         FROM learners WHERE id = ?1 AND school_id = ?2",
        (learner_id, school_id),
        row_to_learner,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Updates a learner's name, scoped to `school_id` in the same statement
/// as the lookup — not as a separate check-then-update. This is what
/// makes it impossible for a caller who somehow obtained another school's
/// learner id (e.g. by guessing a UUID) to modify that record: the
/// `WHERE` clause itself excludes it, so the statement simply matches
/// zero rows rather than ever touching them. Returns `None` for "no such
/// learner in this school," never distinguishing "doesn't exist" from
/// "exists in a different school."
pub fn update(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    given_name: &str,
    family_name: &str,
) -> AppResult<Option<Learner>> {
    let rows_affected = conn.execute(
        "UPDATE learners SET given_name = ?1, family_name = ?2 \
         WHERE id = ?3 AND school_id = ?4",
        (given_name, family_name, learner_id, school_id),
    )?;
    if rows_affected == 0 {
        return Ok(None);
    }
    find_by_id_in_school(conn, school_id, learner_id)
}

fn row_to_learner(row: &rusqlite::Row) -> rusqlite::Result<Learner> {
    Ok(Learner {
        id: row.get(0)?,
        school_id: row.get(1)?,
        given_name: row.get(2)?,
        family_name: row.get(3)?,
        created_at: row.get(4)?,
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

        let created = create(&conn, &s.id, "Juan", "Dela Cruz").unwrap();
        let found = find_by_id(&conn, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_unknown_school() {
        let conn = open_test_db();

        let result = create(&conn, "missing-school", "Juan", "Dela Cruz");

        assert!(result.is_err());
    }

    #[test]
    fn find_by_id_in_school_returns_the_learner_for_the_correct_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let created = create(&conn, &s.id, "Juan", "Dela Cruz").unwrap();

        let found = find_by_id_in_school(&conn, &s.id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_a_learner_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let learner = create(&conn, &school_a.id, "Juan", "Dela Cruz").unwrap();

        let found = find_by_id_in_school(&conn, &school_b.id, &learner.id).unwrap();

        assert_eq!(found, None);
    }

    #[test]
    fn find_by_id_in_school_returns_none_for_an_unknown_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        assert_eq!(
            find_by_id_in_school(&conn, &s.id, "does-not-exist").unwrap(),
            None
        );
    }

    #[test]
    fn update_changes_the_name_within_the_correct_school() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let created = create(&conn, &s.id, "Juan", "Dela Cruz").unwrap();

        let updated = update(&conn, &s.id, &created.id, "Juana", "Dela Cruz").unwrap();

        assert_eq!(
            updated,
            Some(Learner {
                given_name: "Juana".to_string(),
                ..created
            })
        );
    }

    #[test]
    fn update_does_not_affect_a_learner_in_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        let learner = create(&conn, &school_a.id, "Juan", "Dela Cruz").unwrap();

        let result = update(&conn, &school_b.id, &learner.id, "Someone", "Else").unwrap();

        assert_eq!(result, None);
        // The original learner, in its real school, is untouched.
        let unchanged = find_by_id_in_school(&conn, &school_a.id, &learner.id).unwrap();
        assert_eq!(unchanged, Some(learner));
    }

    #[test]
    fn update_returns_none_for_an_unknown_learner_id() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let result = update(&conn, &s.id, "does-not-exist", "Someone", "Else").unwrap();

        assert_eq!(result, None);
    }
}
