//! Persistence for the Official School Repository's per-school Microsoft
//! 365 app registration and connection status (ADR-0088, migration M62).
//! Never stores a token -- the refresh token lives only in the
//! DPAPI-protected `infrastructure::microsoft365::token_store` file, never
//! SQLite (`.claude/rules/security-privacy.md`). This table is purely
//! "which tenant/app is this school configured against, and did the OAuth
//! round trip last succeed."

use rusqlite::{Connection, OptionalExtension};
use serde::Serialize;

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AppRegistration {
    pub school_id: String,
    pub tenant_id: String,
    pub client_id: String,
    pub connected: bool,
    pub last_verified_at: Option<String>,
    pub last_error: Option<String>,
}

/// Reads this school's app registration, if one has ever been saved.
/// `None` means the feature is completely unconfigured for this school --
/// callers must treat that as "invisible," not an error (ADR-0088).
pub fn get(conn: &Connection, school_id: &str) -> crate::error::AppResult<Option<AppRegistration>> {
    conn.query_row(
        "SELECT school_id, tenant_id, client_id, connected, last_verified_at, last_error
         FROM microsoft365_app_registrations WHERE school_id = ?1",
        [school_id],
        row_to_registration,
    )
    .optional()
    .map_err(Into::into)
}

/// Saves (or replaces) this school's app registration. A new/changed
/// tenant or client ID always invalidates any prior connection -- the
/// stored refresh token (if any) was issued for the OLD registration and
/// must not be presented as still-valid for a different one, so this
/// always resets `connected` to false and clears any stale error. It does
/// NOT touch the DPAPI-protected token file itself; the command layer is
/// responsible for calling `token_store::clear` alongside this when the
/// registration actually changes (a fresh `connect()` will simply
/// overwrite the old token either way).
pub fn upsert_registration(
    conn: &Connection,
    school_id: &str,
    tenant_id: &str,
    client_id: &str,
) -> crate::error::AppResult<()> {
    conn.execute(
        "INSERT INTO microsoft365_app_registrations
            (school_id, tenant_id, client_id, connected, last_verified_at, last_error, updated_at)
         VALUES (?1, ?2, ?3, 0, NULL, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
         ON CONFLICT(school_id) DO UPDATE SET
            tenant_id = excluded.tenant_id,
            client_id = excluded.client_id,
            connected = 0,
            last_verified_at = NULL,
            last_error = NULL,
            updated_at = excluded.updated_at",
        (school_id, tenant_id, client_id),
    )?;
    Ok(())
}

/// Marks the connection healthy after a real OAuth round trip (initial
/// connect, or a later token refresh) actually succeeded. `last_verified_at`
/// is stamped by SQLite itself (`strftime('now')`), the same single
/// source of truth every other timestamped write in this schema uses
/// (e.g. `sync_outbox::record_attempt`), rather than a caller-supplied
/// clock value.
pub fn mark_connected(conn: &Connection, school_id: &str) -> crate::error::AppResult<()> {
    let updated = conn.execute(
        "UPDATE microsoft365_app_registrations
         SET connected = 1, last_verified_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE school_id = ?1",
        [school_id],
    )?;
    if updated == 0 {
        return Err(crate::error::AppError::key_store(
            "cannot mark connected: no app registration exists for this school",
        ));
    }
    Ok(())
}

/// Explicit disconnect: clears the connected flag and any stale error, but
/// deliberately keeps the tenant/client ID so `connect()` can be retried
/// without re-entering them (matches
/// `DocumentRepositoryProviderPort::disconnect`'s own doc comment).
pub fn mark_disconnected(conn: &Connection, school_id: &str) -> crate::error::AppResult<()> {
    conn.execute(
        "UPDATE microsoft365_app_registrations
         SET connected = 0, last_error = NULL, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE school_id = ?1",
        [school_id],
    )?;
    Ok(())
}

/// Records a failed connection/refresh attempt: a teacher-safe message
/// only (the command layer is responsible for never passing through a raw
/// OAuth error payload), and marks the connection unhealthy -- a failed
/// round trip never leaves the account looking connected.
pub fn record_connection_error(
    conn: &Connection,
    school_id: &str,
    message: &str,
) -> crate::error::AppResult<()> {
    conn.execute(
        "UPDATE microsoft365_app_registrations
         SET connected = 0, last_error = ?2, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE school_id = ?1",
        (school_id, message),
    )?;
    Ok(())
}

fn row_to_registration(row: &rusqlite::Row<'_>) -> rusqlite::Result<AppRegistration> {
    Ok(AppRegistration {
        school_id: row.get(0)?,
        tenant_id: row.get(1)?,
        client_id: row.get(2)?,
        connected: row.get::<_, i64>(3)? != 0,
        last_verified_at: row.get(4)?,
        last_error: row.get(5)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn conn_with_school() -> (Connection, String) {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        (conn, school.id)
    }

    #[test]
    fn get_returns_none_when_never_configured() {
        let (conn, school_id) = conn_with_school();
        assert_eq!(get(&conn, &school_id).unwrap(), None);
    }

    #[test]
    fn upsert_then_get_round_trips_the_registration_as_not_yet_connected() {
        let (conn, school_id) = conn_with_school();

        upsert_registration(&conn, &school_id, "tenant-1", "client-1").unwrap();

        let registration = get(&conn, &school_id).unwrap().unwrap();
        assert_eq!(registration.tenant_id, "tenant-1");
        assert_eq!(registration.client_id, "client-1");
        assert!(!registration.connected);
        assert_eq!(registration.last_verified_at, None);
    }

    #[test]
    fn mark_connected_flips_the_connected_flag_and_records_when() {
        let (conn, school_id) = conn_with_school();
        upsert_registration(&conn, &school_id, "tenant-1", "client-1").unwrap();

        mark_connected(&conn, &school_id).unwrap();

        let registration = get(&conn, &school_id).unwrap().unwrap();
        assert!(registration.connected);
        assert!(registration.last_verified_at.is_some());
        assert_eq!(registration.last_error, None);
    }

    #[test]
    fn record_connection_error_clears_connected_and_stores_the_teacher_safe_message() {
        let (conn, school_id) = conn_with_school();
        upsert_registration(&conn, &school_id, "tenant-1", "client-1").unwrap();
        mark_connected(&conn, &school_id).unwrap();

        record_connection_error(&conn, &school_id, "Microsoft sign-in was cancelled.").unwrap();

        let registration = get(&conn, &school_id).unwrap().unwrap();
        assert!(!registration.connected);
        assert_eq!(
            registration.last_error.as_deref(),
            Some("Microsoft sign-in was cancelled.")
        );
    }

    #[test]
    fn mark_disconnected_clears_connected_but_keeps_tenant_and_client_id() {
        let (conn, school_id) = conn_with_school();
        upsert_registration(&conn, &school_id, "tenant-1", "client-1").unwrap();
        mark_connected(&conn, &school_id).unwrap();

        mark_disconnected(&conn, &school_id).unwrap();

        let registration = get(&conn, &school_id).unwrap().unwrap();
        assert!(!registration.connected);
        assert_eq!(registration.tenant_id, "tenant-1");
        assert_eq!(registration.client_id, "client-1");
    }

    #[test]
    fn upsert_registration_on_an_existing_row_resets_connected_state() {
        let (conn, school_id) = conn_with_school();
        upsert_registration(&conn, &school_id, "tenant-1", "client-1").unwrap();
        mark_connected(&conn, &school_id).unwrap();

        upsert_registration(&conn, &school_id, "tenant-2", "client-2").unwrap();

        let registration = get(&conn, &school_id).unwrap().unwrap();
        assert_eq!(registration.tenant_id, "tenant-2");
        assert!(!registration.connected);
        assert_eq!(registration.last_verified_at, None);
    }

    #[test]
    fn registrations_are_school_scoped() {
        let (conn, first_school_id) = conn_with_school();
        let second_school = school::create(&conn, "Second School").unwrap();
        upsert_registration(&conn, &first_school_id, "tenant-1", "client-1").unwrap();

        assert_eq!(get(&conn, &second_school.id).unwrap(), None);
    }
}
