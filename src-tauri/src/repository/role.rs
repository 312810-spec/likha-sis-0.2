use rusqlite::Connection;

use crate::error::{AppError, AppResult};

/// The confirmed starting role set for WAVE 1A RBAC Foundation -- see
/// `docs/product/PRODUCT-CONTRACT.md`'s RBAC section and
/// `docs/product/M8-DECISION.md`'s follow-up, where this exact
/// three-role model was already asked and answered with the user. These
/// three remain the only roles with any actual authorization wiring
/// (`auth::Capability::allowed_roles`) -- see the extended set below for
/// the roles migration 25 made grantable but deliberately left
/// unwired.
pub const TEACHER: &str = "teacher";
pub const REGISTRAR: &str = "registrar";
pub const SCHOOL_HEAD: &str = "school_head";

/// The project owner's confirmed full role taxonomy (2026-09-02),
/// widened into the CHECK constraint by migration 25 -- see
/// `docs/adr/0065-eight-role-taxonomy-foundation.md`. **Foundation
/// only**: each of these is grantable through
/// `commands::user::{grant_school_role,revoke_school_role}` today, but
/// none has any `Capability` variant or command gate wired to it yet --
/// most map to forms/tools (IPCRF, Department Grade Sheets, Certificate
/// of Observation/COT, EBEIS/LIS exports, Form 48 DTR, Inventory
/// Tagging, SF8 clinic logs) that do not exist as features in this app
/// yet. Wiring a role's actual authorization is each role's own future
/// slice, once the feature it gates exists -- do not invent a
/// `Capability` for one of these from assumption.
pub const MASTER_TEACHER: &str = "master_teacher";
pub const CLASS_ADVISER: &str = "class_adviser";
pub const SUBJECT_TEACHER: &str = "subject_teacher";
pub const ICT_COORDINATOR: &str = "ict_coordinator";
pub const ADMIN_OFFICER: &str = "admin_officer";
pub const PROPERTY_CUSTODIAN: &str = "property_custodian";
pub const HEALTH_OFFICER: &str = "health_officer";

/// Every role `commands::user::{grant_school_role,revoke_school_role}`
/// will accept -- the single source of truth for that boundary, so a
/// future role addition never needs its own copy of this list
/// maintained separately in `commands::user`. `TEACHER` is deliberately
/// excluded: it is the automatic default `add_user_to_school` grants at
/// membership time, so a second path to grant it would be redundant,
/// not a new capability.
pub fn is_grantable(role: &str) -> bool {
    role == REGISTRAR
        || role == SCHOOL_HEAD
        || role == MASTER_TEACHER
        || role == CLASS_ADVISER
        || role == SUBJECT_TEACHER
        || role == ICT_COORDINATOR
        || role == ADMIN_OFFICER
        || role == PROPERTY_CUSTODIAN
        || role == HEALTH_OFFICER
}

/// Grants `role` to `user_id` within `school_id`. A user may hold more
/// than one role in the same school at once (e.g. Teacher + a future
/// Adviser role) -- `user_school_roles`'s primary key is
/// `(user_id, school_id, role)`, not `(user_id, school_id)`, precisely so
/// a second grant for a different role is a new row, never a conflicting
/// update. Granting an already-held role is a harmless no-op. Returns an
/// error if `user_id`/`school_id` has no membership row, or if `role`
/// isn't one of the recognized constants above -- deliberately
/// `ON CONFLICT ... DO NOTHING` rather than `INSERT OR IGNORE`: an
/// independent security review caught that `OR IGNORE` silently swallows
/// a `CHECK` constraint violation too (not just the intended primary-key
/// conflict), which would have made an unrecognized role a silent no-op
/// instead of the error this function's own contract and tests require;
/// `ON CONFLICT` only suppresses the named conflict target, so a `CHECK`
/// failure still propagates. Verified independently against real SQLite
/// before applying this fix, not merely on the reviewer's say-so.
pub fn grant(conn: &Connection, user_id: &str, school_id: &str, role: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO user_school_roles (user_id, school_id, role) VALUES (?1, ?2, ?3) \
         ON CONFLICT (user_id, school_id, role) DO NOTHING",
        (user_id, school_id, role),
    )?;
    Ok(())
}

/// True if `user_id` holds ANY of `roles` within `school_id`. Always a
/// fresh database lookup, never cached -- see
/// `auth::authorize_capability`'s doc comment for why a capability check
/// must re-verify on every call rather than trusting anything held in
/// the in-memory `Session`, the same reasoning `require_active_session`'s
/// independent revocation lookup already applies to session validity
/// itself. Deliberately one query per candidate role (never more than
/// three in this milestone) rather than a dynamically-built `IN (...)`
/// clause -- simpler to verify correct by inspection, and the
/// performance difference is immaterial for a local, in-process SQLite
/// lookup.
pub fn has_any_role(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    roles: &[&str],
) -> AppResult<bool> {
    for role in roles {
        let exists: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM user_school_roles \
             WHERE user_id = ?1 AND school_id = ?2 AND role = ?3)",
            (user_id, school_id, role),
            |row| row.get(0),
        )?;
        if exists {
            return Ok(true);
        }
    }
    Ok(false)
}

/// How many users hold `role` within `school_id`. Used by `revoke` to
/// guard against removing the last `SCHOOL_HEAD` in a school -- without
/// at least one, nobody could ever exercise `ManageRoles`/
/// `ManageSchoolMembership`/etc. again, an unrecoverable lockout this app
/// has no other path out of (no super-admin, no support-desk override —
/// see `docs/adr/0003-encryption-at-rest.md`'s "fails closed, no backdoor"
/// posture, which this mirrors at the RBAC layer).
pub fn count_role_holders(conn: &Connection, school_id: &str, role: &str) -> AppResult<i64> {
    conn.query_row(
        "SELECT COUNT(*) FROM user_school_roles WHERE school_id = ?1 AND role = ?2",
        (school_id, role),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Revokes `role` from `user_id` within `school_id`. A no-op (not an
/// error) if the role wasn't held. **Refuses to remove the last
/// `SCHOOL_HEAD` in a school** — see `count_role_holders`'s doc comment;
/// every other role has no such guard, since losing the last Registrar
/// or Teacher is recoverable (a School Head can always re-grant it),
/// unlike losing the last School Head.
pub fn revoke(conn: &Connection, user_id: &str, school_id: &str, role: &str) -> AppResult<()> {
    if role == SCHOOL_HEAD
        && has_any_role(conn, user_id, school_id, &[SCHOOL_HEAD])?
        && count_role_holders(conn, school_id, SCHOOL_HEAD)? <= 1
    {
        return Err(AppError::CannotRemoveLastSchoolHead);
    }
    conn.execute(
        "DELETE FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 AND role = ?3",
        (user_id, school_id, role),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school, repository::user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn seed_member(conn: &Connection) -> (String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let u = user::create_user(conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        user::add_school_membership(conn, &u.id, &s.id).unwrap();
        (u.id, s.id)
    }

    #[test]
    fn has_any_role_is_false_before_any_grant() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        assert!(!has_any_role(&conn, &user_id, &school_id, &[REGISTRAR, SCHOOL_HEAD]).unwrap());
    }

    #[test]
    fn grant_then_has_any_role_finds_the_granted_role() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        grant(&conn, &user_id, &school_id, REGISTRAR).unwrap();

        assert!(has_any_role(&conn, &user_id, &school_id, &[REGISTRAR, SCHOOL_HEAD]).unwrap());
        assert!(!has_any_role(&conn, &user_id, &school_id, &[TEACHER]).unwrap());
    }

    #[test]
    fn a_user_can_hold_multiple_roles_in_the_same_school_at_once() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        grant(&conn, &user_id, &school_id, TEACHER).unwrap();
        grant(&conn, &user_id, &school_id, REGISTRAR).unwrap();

        assert!(has_any_role(&conn, &user_id, &school_id, &[TEACHER]).unwrap());
        assert!(has_any_role(&conn, &user_id, &school_id, &[REGISTRAR]).unwrap());
    }

    #[test]
    fn granting_an_already_held_role_is_a_harmless_no_op() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        grant(&conn, &user_id, &school_id, TEACHER).unwrap();
        grant(&conn, &user_id, &school_id, TEACHER).unwrap();

        let count: i64 = conn
            .query_row("SELECT COUNT(*) FROM user_school_roles", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn a_role_in_one_school_does_not_apply_to_another_school() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        user::add_school_membership(&conn, &user_id, &other_school.id).unwrap();
        grant(&conn, &user_id, &school_id, REGISTRAR).unwrap();

        assert!(!has_any_role(&conn, &user_id, &other_school.id, &[REGISTRAR]).unwrap());
    }

    #[test]
    fn grant_rejects_an_unrecognized_role() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        let result = grant(&conn, &user_id, &school_id, "principal");

        assert!(result.is_err());
    }

    #[test]
    fn grant_accepts_every_role_in_the_extended_taxonomy() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        for role in [
            MASTER_TEACHER,
            CLASS_ADVISER,
            SUBJECT_TEACHER,
            ICT_COORDINATOR,
            ADMIN_OFFICER,
            PROPERTY_CUSTODIAN,
            HEALTH_OFFICER,
        ] {
            grant(&conn, &user_id, &school_id, role).unwrap();
            assert!(
                has_any_role(&conn, &user_id, &school_id, &[role]).unwrap(),
                "{role} should be grantable"
            );
        }
    }

    #[test]
    fn revoke_removes_a_held_role() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        grant(&conn, &user_id, &school_id, REGISTRAR).unwrap();

        revoke(&conn, &user_id, &school_id, REGISTRAR).unwrap();

        assert!(!has_any_role(&conn, &user_id, &school_id, &[REGISTRAR]).unwrap());
    }

    #[test]
    fn revoke_of_an_unheld_role_is_a_harmless_no_op() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        let result = revoke(&conn, &user_id, &school_id, REGISTRAR);

        assert!(result.is_ok());
    }

    #[test]
    fn revoke_refuses_to_remove_the_last_school_head() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        grant(&conn, &user_id, &school_id, SCHOOL_HEAD).unwrap();

        let result = revoke(&conn, &user_id, &school_id, SCHOOL_HEAD);

        assert!(matches!(result, Err(AppError::CannotRemoveLastSchoolHead)));
        assert!(has_any_role(&conn, &user_id, &school_id, &[SCHOOL_HEAD]).unwrap());
    }

    #[test]
    fn revoke_allows_removing_a_school_head_when_another_remains() {
        let conn = open_test_db();
        let (user1, school_id) = seed_member(&conn);
        let user2 = user::create_user(&conn, "second.head", "password12345", "Second Head")
            .unwrap()
            .id;
        user::add_school_membership(&conn, &user2, &school_id).unwrap();
        grant(&conn, &user1, &school_id, SCHOOL_HEAD).unwrap();
        grant(&conn, &user2, &school_id, SCHOOL_HEAD).unwrap();

        revoke(&conn, &user1, &school_id, SCHOOL_HEAD).unwrap();

        assert!(!has_any_role(&conn, &user1, &school_id, &[SCHOOL_HEAD]).unwrap());
        assert!(has_any_role(&conn, &user2, &school_id, &[SCHOOL_HEAD]).unwrap());
    }

    #[test]
    fn count_role_holders_counts_only_the_named_role_in_the_named_school() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        grant(&conn, &user_id, &school_id, SCHOOL_HEAD).unwrap();
        grant(&conn, &user_id, &school_id, TEACHER).unwrap();

        assert_eq!(
            count_role_holders(&conn, &school_id, SCHOOL_HEAD).unwrap(),
            1
        );
        assert_eq!(count_role_holders(&conn, &school_id, REGISTRAR).unwrap(), 0);
    }
}
