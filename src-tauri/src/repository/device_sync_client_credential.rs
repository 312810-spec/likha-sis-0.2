//! ADR-0067 client-side sync loop: this device's own retained copy of
//! the credential it authenticates outbound `/sync/push`/`/sync/pull`
//! requests with. Distinct from `repository::device_credential`, which
//! is the HUB's verification-side table (stores a `secret_hash`, never a
//! usable secret) -- see migration 34's own doc comment for why this
//! separate table exists.

use rusqlite::{Connection, OptionalExtension};

use crate::error::AppResult;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredClientCredential {
    pub school_id: String,
    pub credential_id: String,
    pub device_secret_hex: String,
}

/// Stores (or replaces) this device's active credential for `school_id`.
/// A device re-enrolling for the same school overwrites its previous
/// stored secret -- the hub side already revokes the old credential on
/// re-enrollment (`device_credential::enroll`'s `revoke_active_for_device`),
/// so retaining a stale local secret would only ever fail auth, never
/// grant stale access.
pub fn store(
    conn: &Connection,
    school_id: &str,
    credential_id: &str,
    device_secret_hex: &str,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO device_sync_client_credential (school_id, credential_id, device_secret_hex)
         VALUES (?1, ?2, ?3)
         ON CONFLICT(school_id) DO UPDATE SET
             credential_id = excluded.credential_id,
             device_secret_hex = excluded.device_secret_hex,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')",
        (school_id, credential_id, device_secret_hex),
    )?;
    Ok(())
}

/// This device's stored credential for one school, if any.
pub fn get(conn: &Connection, school_id: &str) -> AppResult<Option<StoredClientCredential>> {
    conn.query_row(
        "SELECT school_id, credential_id, device_secret_hex
         FROM device_sync_client_credential WHERE school_id = ?1",
        [school_id],
        |row| {
            Ok(StoredClientCredential {
                school_id: row.get(0)?,
                credential_id: row.get(1)?,
                device_secret_hex: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Any one stored credential this installation holds -- used by the
/// sync loop to discover which school/credential to sync as, without
/// the caller having to already know the school id. Oldest first, so
/// behavior is deterministic across calls rather than depending on
/// SQLite's unspecified row order.
pub fn get_any(conn: &Connection) -> AppResult<Option<StoredClientCredential>> {
    conn.query_row(
        "SELECT school_id, credential_id, device_secret_hex
         FROM device_sync_client_credential ORDER BY school_id LIMIT 1",
        [],
        |row| {
            Ok(StoredClientCredential {
                school_id: row.get(0)?,
                credential_id: row.get(1)?,
                device_secret_hex: row.get(2)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    #[test]
    fn get_is_none_before_any_store() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        assert_eq!(get(&conn, &school.id).unwrap(), None);
        assert_eq!(get_any(&conn).unwrap(), None);
    }

    #[test]
    fn store_then_get_round_trips() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        store(&conn, &school.id, "cred-1", "aabbcc").unwrap();

        let stored = get(&conn, &school.id).unwrap().unwrap();
        assert_eq!(stored.credential_id, "cred-1");
        assert_eq!(stored.device_secret_hex, "aabbcc");
        assert_eq!(get_any(&conn).unwrap().unwrap().credential_id, "cred-1");
    }

    #[test]
    fn re_storing_for_the_same_school_replaces_the_previous_credential() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        store(&conn, &school.id, "cred-1", "aabbcc").unwrap();

        store(&conn, &school.id, "cred-2", "ddeeff").unwrap();

        let stored = get(&conn, &school.id).unwrap().unwrap();
        assert_eq!(stored.credential_id, "cred-2");
        assert_eq!(stored.device_secret_hex, "ddeeff");
    }
}
