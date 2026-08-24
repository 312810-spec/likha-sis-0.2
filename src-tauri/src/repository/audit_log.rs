use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;

/// Authentication-related events only — see migration 15's own comment
/// for why this is deliberately scoped narrower than a general
/// data-mutation audit trail.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum AuditEventType {
    LoginSuccess,
    LoginFailed,
    AccountLocked,
    Logout,
}

impl AuditEventType {
    fn as_db_str(self) -> &'static str {
        match self {
            AuditEventType::LoginSuccess => "login_success",
            AuditEventType::LoginFailed => "login_failed",
            AuditEventType::AccountLocked => "account_locked",
            AuditEventType::Logout => "logout",
        }
    }

    fn from_db_str(s: &str) -> rusqlite::Result<AuditEventType> {
        match s {
            "login_success" => Ok(AuditEventType::LoginSuccess),
            "login_failed" => Ok(AuditEventType::LoginFailed),
            "account_locked" => Ok(AuditEventType::AccountLocked),
            "logout" => Ok(AuditEventType::Logout),
            other => Err(rusqlite::Error::FromSqlConversionFailure(
                0,
                rusqlite::types::Type::Text,
                format!("unknown audit event type: {other}").into(),
            )),
        }
    }
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AuditLogEntry {
    pub id: String,
    pub school_id: String,
    pub user_id: Option<String>,
    pub username: String,
    pub event_type: AuditEventType,
    pub created_at: String,
}

/// Records one authentication event, scoped to `school_id` (always
/// known — the login screen requires a school to be selected even for a
/// doomed attempt). `user_id` is `None` for a failed attempt against a
/// username that doesn't resolve to a real user at all; `username` is
/// always the attempted/actual username, independent of whether it
/// resolved. Never returns the row it wrote — this is fire-and-forget
/// from the caller's point of view, matching how a log write should
/// never become a reason a real login/logout itself fails.
pub fn record(
    conn: &Connection,
    school_id: &str,
    user_id: Option<&str>,
    username: &str,
    event_type: AuditEventType,
) -> AppResult<()> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO audit_log (id, school_id, user_id, username, event_type) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, user_id, username, event_type.as_db_str()),
    )?;
    Ok(())
}

/// The most recent events for `school_id`, newest first, capped at
/// `limit` — this is a review/troubleshooting screen, not an unbounded
/// export; a teacher does not need the entire history rendered at once.
pub fn list_for_school(
    conn: &Connection,
    school_id: &str,
    limit: u32,
) -> AppResult<Vec<AuditLogEntry>> {
    // `created_at`'s millisecond precision is not fine enough to
    // guarantee a strict order among rows written in quick succession
    // (e.g. several audit events in the same test, or a fast machine) —
    // `id` is a UUIDv7, itself time-ordered, so it breaks ties
    // deterministically in the same direction rather than leaving
    // same-millisecond rows in an arbitrary SQLite-chosen order.
    let mut stmt = conn.prepare(
        "SELECT id, school_id, user_id, username, event_type, created_at \
         FROM audit_log WHERE school_id = ?1 \
         ORDER BY created_at DESC, id DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map((school_id, limit), |row| {
        let event_type: String = row.get(4)?;
        Ok(AuditLogEntry {
            id: row.get(0)?,
            school_id: row.get(1)?,
            user_id: row.get(2)?,
            username: row.get(3)?,
            event_type: AuditEventType::from_db_str(&event_type)?,
            created_at: row.get(5)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
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
    fn record_then_list_round_trips() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        record(&conn, &s.id, Some(&u.id), "ana.cruz", AuditEventType::LoginSuccess).unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].username, "ana.cruz");
        assert_eq!(entries[0].user_id, Some(u.id));
        assert_eq!(entries[0].event_type, AuditEventType::LoginSuccess);
    }

    #[test]
    fn record_accepts_no_known_user_for_a_failed_login() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        record(&conn, &s.id, None, "does.not.exist", AuditEventType::LoginFailed).unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries[0].user_id, None);
        assert_eq!(entries[0].event_type, AuditEventType::LoginFailed);
    }

    #[test]
    fn list_for_school_orders_newest_first() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        record(&conn, &s.id, None, "first", AuditEventType::LoginFailed).unwrap();
        record(&conn, &s.id, None, "second", AuditEventType::LoginFailed).unwrap();
        record(&conn, &s.id, None, "third", AuditEventType::LoginFailed).unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();

        assert_eq!(
            entries.iter().map(|e| e.username.as_str()).collect::<Vec<_>>(),
            vec!["third", "second", "first"]
        );
    }

    #[test]
    fn list_for_school_respects_the_limit() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        for i in 0..5 {
            record(&conn, &s.id, None, &format!("user{i}"), AuditEventType::LoginFailed).unwrap();
        }

        let entries = list_for_school(&conn, &s.id, 2).unwrap();

        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn list_for_school_never_includes_another_schools_events() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        record(&conn, &school_a.id, None, "ana.cruz", AuditEventType::LoginSuccess).unwrap();
        record(&conn, &school_b.id, None, "ben.reyes", AuditEventType::LoginSuccess).unwrap();

        let entries = list_for_school(&conn, &school_a.id, 10).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].username, "ana.cruz");
    }
}
