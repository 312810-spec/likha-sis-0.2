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
    /// A School Head reset another member's password via
    /// `auth::admin_reset_teacher_password` (Wave 3I). The only event
    /// type so far where the acting user and the event's subject
    /// (`user_id`/`username`) are genuinely different people — see
    /// migration 24 and `AuditLogEntry::actor_user_id`.
    PasswordResetByAdmin,
    /// A device was issued a per-device sync credential via
    /// `auth::enroll_device_sync_credential` (ADR-0067). Self-caused --
    /// the enrolling user is the same as `user_id`/`username` -- so this
    /// is recorded with plain `record`, not `record_admin_action`.
    DeviceEnrolled,
    /// A device's sync credential was revoked via
    /// `repository::device_credential::revoke` (ADR-0067).
    DeviceRevoked,
}

impl AuditEventType {
    fn as_db_str(self) -> &'static str {
        match self {
            AuditEventType::LoginSuccess => "login_success",
            AuditEventType::LoginFailed => "login_failed",
            AuditEventType::AccountLocked => "account_locked",
            AuditEventType::Logout => "logout",
            AuditEventType::PasswordResetByAdmin => "password_reset_by_admin",
            AuditEventType::DeviceEnrolled => "device_enrolled",
            AuditEventType::DeviceRevoked => "device_revoked",
        }
    }

    fn from_db_str(s: &str) -> rusqlite::Result<AuditEventType> {
        match s {
            "login_success" => Ok(AuditEventType::LoginSuccess),
            "login_failed" => Ok(AuditEventType::LoginFailed),
            "account_locked" => Ok(AuditEventType::AccountLocked),
            "logout" => Ok(AuditEventType::Logout),
            "password_reset_by_admin" => Ok(AuditEventType::PasswordResetByAdmin),
            "device_enrolled" => Ok(AuditEventType::DeviceEnrolled),
            "device_revoked" => Ok(AuditEventType::DeviceRevoked),
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
    /// Who performed the action, when that differs from `user_id` (the
    /// event's subject) — `None` for every event type except
    /// `PasswordResetByAdmin` (migration 24, Wave 3I). Every event
    /// before this one is self-caused, so backfilling this for old rows
    /// would be fabricating attribution that was never recorded.
    pub actor_user_id: Option<String>,
    /// `actor_user_id`'s username, resolved via join at read time for
    /// display -- never stored redundantly, matching how `username`
    /// itself is always the value valid at the time of the event, not
    /// a live lookup.
    pub actor_username: Option<String>,
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

/// Records an event caused by someone OTHER than its subject -- so far
/// only `admin_reset_teacher_password` (Wave 3I): `actor_user_id` is the
/// School Head who performed the reset, `target_user_id`/
/// `target_username` are the account whose password was reset. Kept as
/// its own function rather than widening `record`'s signature: every
/// existing caller (`login`, `logout`) is self-caused and would only
/// ever pass `None` for an actor, so a separate, explicitly-named
/// function is clearer than a rarely-used extra parameter on the one
/// already-proven, heavily-called path.
pub fn record_admin_action(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    target_user_id: &str,
    target_username: &str,
    event_type: AuditEventType,
) -> AppResult<()> {
    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO audit_log (id, school_id, user_id, username, actor_user_id, event_type) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            school_id,
            target_user_id,
            target_username,
            actor_user_id,
            event_type.as_db_str(),
        ),
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
        "SELECT al.id, al.school_id, al.user_id, al.username, al.actor_user_id, \
                actor.username, al.event_type, al.created_at \
         FROM audit_log al \
         LEFT JOIN users actor ON actor.id = al.actor_user_id \
         WHERE al.school_id = ?1 \
         ORDER BY al.created_at DESC, al.id DESC LIMIT ?2",
    )?;
    let rows = stmt.query_map((school_id, limit), |row| {
        let event_type: String = row.get(6)?;
        Ok(AuditLogEntry {
            id: row.get(0)?,
            school_id: row.get(1)?,
            user_id: row.get(2)?,
            username: row.get(3)?,
            actor_user_id: row.get(4)?,
            actor_username: row.get(5)?,
            event_type: AuditEventType::from_db_str(&event_type)?,
            created_at: row.get(7)?,
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

        record(
            &conn,
            &s.id,
            Some(&u.id),
            "ana.cruz",
            AuditEventType::LoginSuccess,
        )
        .unwrap();

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

        record(
            &conn,
            &s.id,
            None,
            "does.not.exist",
            AuditEventType::LoginFailed,
        )
        .unwrap();

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
            entries
                .iter()
                .map(|e| e.username.as_str())
                .collect::<Vec<_>>(),
            vec!["third", "second", "first"]
        );
    }

    #[test]
    fn list_for_school_respects_the_limit() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        for i in 0..5 {
            record(
                &conn,
                &s.id,
                None,
                &format!("user{i}"),
                AuditEventType::LoginFailed,
            )
            .unwrap();
        }

        let entries = list_for_school(&conn, &s.id, 2).unwrap();

        assert_eq!(entries.len(), 2);
    }

    #[test]
    fn list_for_school_never_includes_another_schools_events() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        record(
            &conn,
            &school_a.id,
            None,
            "ana.cruz",
            AuditEventType::LoginSuccess,
        )
        .unwrap();
        record(
            &conn,
            &school_b.id,
            None,
            "ben.reyes",
            AuditEventType::LoginSuccess,
        )
        .unwrap();

        let entries = list_for_school(&conn, &school_a.id, 10).unwrap();

        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].username, "ana.cruz");
    }

    #[test]
    fn a_plain_login_event_has_no_actor_attribution() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let u = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        record(
            &conn,
            &s.id,
            Some(&u.id),
            "ana.cruz",
            AuditEventType::LoginSuccess,
        )
        .unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries[0].actor_user_id, None);
        assert_eq!(entries[0].actor_username, None);
    }

    #[test]
    fn record_admin_action_attributes_the_event_to_the_acting_user_distinct_from_its_subject() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let head =
            user::create_user(&conn, "corazon.santos", "password", "Corazon Santos").unwrap();
        let teacher = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        record_admin_action(
            &conn,
            &s.id,
            &head.id,
            &teacher.id,
            "ana.cruz",
            AuditEventType::PasswordResetByAdmin,
        )
        .unwrap();

        let entries = list_for_school(&conn, &s.id, 10).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].event_type, AuditEventType::PasswordResetByAdmin);
        assert_eq!(
            entries[0].user_id,
            Some(teacher.id),
            "user_id/username stay the event's subject -- the account whose password changed"
        );
        assert_eq!(entries[0].username, "ana.cruz");
        assert_eq!(
            entries[0].actor_user_id,
            Some(head.id),
            "actor_user_id is who performed the reset, not who it was done to"
        );
        assert_eq!(
            entries[0].actor_username,
            Some("corazon.santos".to_string())
        );
    }
}
