use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppResult;

/// Inserts a persisted, auditable session row expiring `duration_modifier`
/// from now (an SQLite date modifier, e.g. `"+8 hours"`). This table does
/// NOT gate authorization by itself — `auth::SessionManager`'s in-memory
/// state does that, and is always empty at process start regardless of
/// what rows exist here. This table exists for durability/audit only —
/// see ADR-0004.
pub fn insert(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    duration_modifier: &str,
) -> AppResult<String> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO sessions (id, user_id, school_id, expires_at) \
         VALUES (?1, ?2, ?3, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?4))",
        (&id, user_id, school_id, duration_modifier),
    )?;
    Ok(id)
}

pub fn revoke(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE sessions SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

/// Revokes every still-active persisted session for `user_id` across
/// all school scopes. Authorization re-checks persisted revocation on
/// every protected command, so this also invalidates sessions held by
/// other running application instances.
pub fn revoke_all_for_user(conn: &Connection, user_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE sessions \
         SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE user_id = ?1 AND revoked_at IS NULL",
        [user_id],
    )?;
    Ok(())
}

/// True if the session row has been revoked (or does not exist at all —
/// fail closed rather than treat an unknown session id as valid).
/// `auth::SessionManager::require_active_school_scope` checks this on
/// every protected call, independent of its own in-memory copy, so a
/// future revocation path that updates this table without also clearing
/// the in-memory session (unlike today's only path, `auth::logout`) still
/// cannot leave a revoked session usable.
pub fn is_revoked(conn: &Connection, id: &str) -> AppResult<bool> {
    use rusqlite::OptionalExtension;

    let row: Option<Option<String>> = conn
        .query_row(
            "SELECT revoked_at FROM sessions WHERE id = ?1",
            [id],
            |row| row.get(0),
        )
        .optional()?;

    match row {
        // No such session row at all: fail closed, treat as revoked.
        None => Ok(true),
        Some(revoked_at) => Ok(revoked_at.is_some()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{
        db,
        repository::{school, user},
    };
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn insert_then_revoke_round_trips() {
        let conn = open_test_db();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let id = insert(&conn, &u.id, &s.id, "+8 hours").unwrap();

        let revoked_at: Option<String> = conn
            .query_row(
                "SELECT revoked_at FROM sessions WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .unwrap();
        assert_eq!(revoked_at, None);

        revoke(&conn, &id).unwrap();

        let revoked_at: Option<String> = conn
            .query_row(
                "SELECT revoked_at FROM sessions WHERE id = ?1",
                [&id],
                |row| row.get(0),
            )
            .unwrap();
        assert!(revoked_at.is_some());
    }

    #[test]
    fn is_revoked_reflects_row_state() {
        let conn = open_test_db();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let id = insert(&conn, &u.id, &s.id, "+8 hours").unwrap();

        assert!(!is_revoked(&conn, &id).unwrap());

        revoke(&conn, &id).unwrap();

        assert!(is_revoked(&conn, &id).unwrap());
    }

    #[test]
    fn is_revoked_fails_closed_for_an_unknown_session_id() {
        let conn = open_test_db();

        assert!(is_revoked(&conn, "does-not-exist").unwrap());
    }

    #[test]
    fn revoke_all_for_user_revokes_only_that_users_active_sessions() {
        let conn = open_test_db();
        let target = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let other = user::create_user(&conn, "ben.santos", "password", "Ben Santos").unwrap();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let target_a = insert(&conn, &target.id, &s.id, "+8 hours").unwrap();
        let target_b = insert(&conn, &target.id, &s.id, "+8 hours").unwrap();
        let other_session = insert(&conn, &other.id, &s.id, "+8 hours").unwrap();

        revoke_all_for_user(&conn, &target.id).unwrap();

        assert!(is_revoked(&conn, &target_a).unwrap());
        assert!(is_revoked(&conn, &target_b).unwrap());
        assert!(!is_revoked(&conn, &other_session).unwrap());
    }
}
