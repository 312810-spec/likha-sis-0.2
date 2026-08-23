use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// Claims the singleton bootstrap slot. Unlike a `SELECT`-then-`INSERT`
/// check, this INSERT is itself the guard: it is a real write, so it
/// participates in SQLite's cross-process write-lock serialization the
/// way a read never does. A `SELECT`-based "has anyone bootstrapped yet"
/// check can return a stale answer to a second process racing the
/// first — SQLite does not invalidate an already-read snapshot just
/// because another connection committed since — but a second INSERT
/// against this table's single allowed row (`id = 1`) will hit a real
/// constraint violation once the first has committed, at the point the
/// database file itself is consulted, not a cached snapshot. That
/// failure is mapped to `AlreadyInitialized` here so the caller doesn't
/// need to know this table exists.
pub fn claim_bootstrap_slot(conn: &Connection) -> AppResult<()> {
    let result = conn.execute("INSERT INTO installation_state (id) VALUES (1)", []);
    match result {
        Ok(_) => Ok(()),
        Err(rusqlite::Error::SqliteFailure(err, _))
            if err.code == rusqlite::ErrorCode::ConstraintViolation =>
        {
            Err(AppError::AlreadyInitialized)
        }
        Err(e) => Err(e.into()),
    }
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
    fn claim_bootstrap_slot_succeeds_once() {
        let conn = open_test_db();

        assert!(claim_bootstrap_slot(&conn).is_ok());
    }

    #[test]
    fn a_second_claim_is_rejected_as_already_initialized() {
        let conn = open_test_db();
        claim_bootstrap_slot(&conn).unwrap();

        let result = claim_bootstrap_slot(&conn);

        assert!(matches!(result, Err(AppError::AlreadyInitialized)));
    }

    #[test]
    fn a_claim_that_is_rolled_back_can_be_reclaimed() {
        // Proves the guard participates correctly in transactions: a
        // claim made inside a transaction that never commits does not
        // permanently consume the slot.
        let mut conn = open_test_db();
        {
            let tx = conn.transaction().unwrap();
            claim_bootstrap_slot(&tx).unwrap();
            // tx dropped here without commit -> rolls back.
        }

        assert!(claim_bootstrap_slot(&conn).is_ok());
    }
}
