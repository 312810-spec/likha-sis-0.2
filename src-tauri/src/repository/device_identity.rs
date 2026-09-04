use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppResult;

/// Returns this installation's stable device id, generating and persisting
/// one on the first call. Race-safe the same way
/// `installation::claim_bootstrap_slot` is: the `INSERT ... ON CONFLICT DO
/// NOTHING` is the real write two racing processes both attempt, and
/// SQLite's cross-process write-lock genuinely serializes it -- unlike a
/// `SELECT`-then-`INSERT` check, which can act on a stale snapshot (see
/// that function's own doc comment for why this codebase does not use
/// that pattern). Whichever process's INSERT is the one SQLite actually
/// commits, both then read back the SAME already-committed value with the
/// final `SELECT`, so two callers on two threads/processes can never end
/// up disagreeing about this device's id.
pub fn current_or_create(conn: &Connection) -> AppResult<String> {
    let candidate = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO device_identity (id, device_id) VALUES (1, ?1) \
         ON CONFLICT(id) DO NOTHING",
        [&candidate],
    )?;
    conn.query_row(
        "SELECT device_id FROM device_identity WHERE id = 1",
        [],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    #[test]
    fn a_first_call_generates_and_persists_an_id() {
        let conn = open_test_db();

        let id = current_or_create(&conn).unwrap();

        assert!(Uuid::parse_str(&id).is_ok());
        let stored: String = conn
            .query_row(
                "SELECT device_id FROM device_identity WHERE id = 1",
                [],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(stored, id);
    }

    #[test]
    fn repeated_calls_return_the_same_id_not_a_new_one_each_time() {
        let conn = open_test_db();

        let first = current_or_create(&conn).unwrap();
        let second = current_or_create(&conn).unwrap();
        let third = current_or_create(&conn).unwrap();

        assert_eq!(first, second);
        assert_eq!(second, third);
    }

    #[test]
    fn the_id_survives_a_database_reopen() {
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("likha.db");
        let key = crypto::generate_key();

        let first_id = {
            let conn = db::open(&db_path, &key).unwrap();
            current_or_create(&conn).unwrap()
        };

        let reopened = db::open(&db_path, &key).unwrap();
        let second_id = current_or_create(&reopened).unwrap();

        assert_eq!(first_id, second_id);
    }
}
