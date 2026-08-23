use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

/// A school is the top-level data-isolation scope: every other record in
/// the working database is owned by exactly one school.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct School {
    pub id: String,
    pub name: String,
    pub created_at: String,
}

pub fn create(conn: &Connection, name: &str) -> AppResult<School> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO schools (id, name) VALUES (?1, ?2)",
        (&id, name),
    )?;
    find_by_id(conn, &id).map(|s| s.expect("row just inserted must exist"))
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<School>> {
    conn.query_row(
        "SELECT id, name, created_at FROM schools WHERE id = ?1",
        [id],
        |row| {
            Ok(School {
                id: row.get(0)?,
                name: row.get(1)?,
                created_at: row.get(2)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn list_all(conn: &Connection) -> AppResult<Vec<School>> {
    let mut stmt = conn.prepare("SELECT id, name, created_at FROM schools ORDER BY name")?;
    let rows = stmt.query_map([], |row| {
        Ok(School {
            id: row.get(0)?,
            name: row.get(1)?,
            created_at: row.get(2)?,
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

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let created = create(&conn, "Mabini Elementary").unwrap();

        let found = find_by_id(&conn, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn find_by_id_returns_none_for_unknown_id() {
        let conn = open_test_db();

        assert_eq!(find_by_id(&conn, "does-not-exist").unwrap(), None);
    }

    #[test]
    fn list_all_orders_by_name() {
        let conn = open_test_db();
        create(&conn, "Zamora High School").unwrap();
        create(&conn, "Aguinaldo Elementary").unwrap();

        let names: Vec<String> = list_all(&conn)
            .unwrap()
            .into_iter()
            .map(|s| s.name)
            .collect();

        assert_eq!(names, vec!["Aguinaldo Elementary", "Zamora High School"]);
    }

    #[test]
    fn sql_metacharacters_in_input_are_stored_literally_not_executed() {
        let conn = open_test_db();
        let adversarial_name = "O'Brien'; DROP TABLE schools; --";

        let created = create(&conn, adversarial_name).unwrap();

        // If this were interpolated instead of bound as a parameter, the
        // DROP TABLE would have executed and this query would error out.
        let found = find_by_id(&conn, &created.id).unwrap();
        assert_eq!(found.map(|s| s.name), Some(adversarial_name.to_string()));
        assert_eq!(list_all(&conn).unwrap().len(), 1);
    }
}
