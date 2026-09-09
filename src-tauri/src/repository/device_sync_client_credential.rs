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
    /// This device's configured hub address for `school_id`, if it has
    /// ever set one (`set_hub_base_url`) -- `None` means "use
    /// `sync_client::DEFAULT_HUB_BASE_URL`", never an empty string. See
    /// migration M64's own doc comment for why this lives on this row
    /// rather than a separate table.
    pub hub_base_url: Option<String>,
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
        "SELECT school_id, credential_id, device_secret_hex, hub_base_url
         FROM device_sync_client_credential WHERE school_id = ?1",
        [school_id],
        |row| {
            Ok(StoredClientCredential {
                school_id: row.get(0)?,
                credential_id: row.get(1)?,
                device_secret_hex: row.get(2)?,
                hub_base_url: row.get(3)?,
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
        "SELECT school_id, credential_id, device_secret_hex, hub_base_url
         FROM device_sync_client_credential ORDER BY school_id LIMIT 1",
        [],
        |row| {
            Ok(StoredClientCredential {
                school_id: row.get(0)?,
                credential_id: row.get(1)?,
                device_secret_hex: row.get(2)?,
                hub_base_url: row.get(3)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Sets (or clears, with `None`) this device's configured hub address for
/// `school_id`. A no-op (never an error) if this device has no stored
/// credential for that school yet -- there is nothing to attach the
/// setting to; `enroll_device_sync_credential` must run first, matching
/// this table's own existing `store`-before-anything-else shape. `Some`
/// is trimmed and rejected if empty, matching the
/// trim/non-empty/max-length validation this codebase's
/// `application/*-service.ts` layer normally does before a repository
/// call -- checked here too since this is a Rust-side setter with no TS
/// service in front of it for THIS one validation (the format/scheme
/// check itself stays in the command layer, see
/// `commands::device_sync::set_sync_hub_base_url`).
pub fn set_hub_base_url(
    conn: &Connection,
    school_id: &str,
    hub_base_url: Option<&str>,
) -> AppResult<()> {
    conn.execute(
        "UPDATE device_sync_client_credential
         SET hub_base_url = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE school_id = ?1",
        (school_id, hub_base_url),
    )?;
    Ok(())
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

    #[test]
    fn hub_base_url_is_none_until_explicitly_set() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        store(&conn, &school.id, "cred-1", "aabbcc").unwrap();

        assert_eq!(get(&conn, &school.id).unwrap().unwrap().hub_base_url, None);
    }

    #[test]
    fn set_hub_base_url_then_get_round_trips() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        store(&conn, &school.id, "cred-1", "aabbcc").unwrap();

        set_hub_base_url(&conn, &school.id, Some("https://192.168.1.10:7878")).unwrap();

        assert_eq!(
            get(&conn, &school.id).unwrap().unwrap().hub_base_url,
            Some("https://192.168.1.10:7878".to_string())
        );
        assert_eq!(
            get_any(&conn).unwrap().unwrap().hub_base_url,
            Some("https://192.168.1.10:7878".to_string())
        );
    }

    #[test]
    fn set_hub_base_url_with_none_clears_a_previously_configured_address() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        store(&conn, &school.id, "cred-1", "aabbcc").unwrap();
        set_hub_base_url(&conn, &school.id, Some("https://192.168.1.10:7878")).unwrap();

        set_hub_base_url(&conn, &school.id, None).unwrap();

        assert_eq!(get(&conn, &school.id).unwrap().unwrap().hub_base_url, None);
    }

    #[test]
    fn set_hub_base_url_is_a_no_op_for_a_school_with_no_stored_credential() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        // No `store` call first -- nothing to attach the setting to.
        set_hub_base_url(&conn, &school.id, Some("https://192.168.1.10:7878")).unwrap();

        assert_eq!(get(&conn, &school.id).unwrap(), None);
    }

    #[test]
    fn set_hub_base_url_never_leaks_across_schools() {
        let conn = open_test_db();
        let first = school::create(&conn, "First School").unwrap();
        let second = school::create(&conn, "Second School").unwrap();
        store(&conn, &first.id, "cred-1", "aabbcc").unwrap();
        store(&conn, &second.id, "cred-2", "ddeeff").unwrap();

        set_hub_base_url(&conn, &first.id, Some("https://192.168.1.10:7878")).unwrap();

        assert_eq!(get(&conn, &second.id).unwrap().unwrap().hub_base_url, None);
    }
}
