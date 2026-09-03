use rusqlite::Connection;

use crate::error::AppResult;

/// The confirmed starting role set for WAVE 1A RBAC Foundation -- see
/// `docs/product/PRODUCT-CONTRACT.md`'s RBAC section and
/// `docs/product/M8-DECISION.md`'s follow-up, where this exact
/// three-role model was already asked and answered with the user.
/// Explicitly **not** the final LIKHA role universe (Adviser, LIS
/// Coordinator, ICT Coordinator, Master Teacher/Department Head are
/// expected later) -- adding a role means widening migration 16's CHECK
/// constraint in a new migration, never changing these constants' type
/// or any function signature below.
pub const TEACHER: &str = "teacher";
pub const REGISTRAR: &str = "registrar";
pub const SCHOOL_HEAD: &str = "school_head";

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

/// Every role `user_id` holds within `school_id`, sorted for a stable
/// result. Empty (not an error) when the user has no roles there. A
/// fresh lookup, never cached -- same reasoning as `has_any_role`.
pub fn list_roles(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT role FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 ORDER BY role",
    )?;
    let rows = stmt.query_map((user_id, school_id), |row| row.get::<_, String>(0))?;
    let mut roles = Vec::new();
    for role in rows {
        roles.push(role?);
    }
    Ok(roles)
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
    fn list_roles_returns_empty_for_a_user_with_no_roles() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        assert_eq!(
            list_roles(&conn, &user_id, &school_id).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn list_roles_returns_every_granted_role_sorted() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);

        grant(&conn, &user_id, &school_id, TEACHER).unwrap();
        grant(&conn, &user_id, &school_id, SCHOOL_HEAD).unwrap();

        assert_eq!(
            list_roles(&conn, &user_id, &school_id).unwrap(),
            vec!["school_head", "teacher"]
        );
    }

    #[test]
    fn list_roles_is_school_scoped() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        user::add_school_membership(&conn, &user_id, &other_school.id).unwrap();
        grant(&conn, &user_id, &school_id, TEACHER).unwrap();

        assert_eq!(
            list_roles(&conn, &user_id, &other_school.id).unwrap(),
            Vec::<String>::new()
        );
    }

    #[test]
    fn list_roles_does_not_leak_a_different_users_roles_in_the_same_school() {
        let conn = open_test_db();
        let (user_id, school_id) = seed_member(&conn);
        let other_user = user::create_user(&conn, "ben.cruz", "password", "Ben Cruz").unwrap();
        user::add_school_membership(&conn, &other_user.id, &school_id).unwrap();
        grant(&conn, &other_user.id, &school_id, SCHOOL_HEAD).unwrap();

        // `user_id` holds no role; `other_user` in the same school holds
        // one -- `list_roles` must be scoped to the requested user, not
        // the school.
        assert_eq!(
            list_roles(&conn, &user_id, &school_id).unwrap(),
            Vec::<String>::new()
        );
    }
}
