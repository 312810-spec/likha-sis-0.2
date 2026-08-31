use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::auth;
use crate::error::{AppError, AppResult};

/// A teacher's LIKHA identity. Never carries the password hash — see
/// `verify_credentials` for the only place that touches it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub created_at: String,
}

struct UserWithCredentials {
    id: String,
    username: String,
    password_hash: String,
    display_name: String,
    created_at: String,
}

pub fn create_user(
    conn: &Connection,
    username: &str,
    password: &str,
    display_name: &str,
) -> AppResult<User> {
    let id = Uuid::now_v7().to_string();
    let hash = auth::hash_password(password)?;
    conn.execute(
        "INSERT INTO users (id, username, password_hash, display_name) VALUES (?1, ?2, ?3, ?4)",
        (&id, username, &hash, display_name),
    )?;
    find_by_id(conn, &id).map(|u| u.expect("row just inserted must exist"))
}

pub fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<User>> {
    conn.query_row(
        "SELECT id, username, display_name, created_at FROM users WHERE id = ?1",
        [id],
        |row| {
            Ok(User {
                id: row.get(0)?,
                username: row.get(1)?,
                display_name: row.get(2)?,
                created_at: row.get(3)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

fn find_with_credentials_by_username(
    conn: &Connection,
    username: &str,
) -> AppResult<Option<UserWithCredentials>> {
    conn.query_row(
        "SELECT id, username, password_hash, display_name, created_at \
         FROM users WHERE username = ?1",
        [username],
        |row| {
            Ok(UserWithCredentials {
                id: row.get(0)?,
                username: row.get(1)?,
                password_hash: row.get(2)?,
                display_name: row.get(3)?,
                created_at: row.get(4)?,
            })
        },
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Failed attempts allowed (against one account) before it locks, and how
/// long the resulting lock lasts. Standard engineering defaults (OWASP
/// Authentication Cheat Sheet's general guidance for a lockout policy),
/// not a DepEd or school-specific policy choice -- see
/// `docs/adr/0019-account-lockout.md`.
pub(crate) const MAX_FAILED_LOGIN_ATTEMPTS: i64 = 5;
const LOCKOUT_DURATION_SECS: i64 = 15 * 60;

/// Verifies a username/password pair. Returns the user's public data on
/// success. Deliberately returns the exact same `AuthenticationFailed`
/// error whether the username doesn't exist or the password is wrong, and
/// runs a real Argon2id verification either way (see
/// `auth::verify_dummy_password_for_timing_safety`) so neither the error
/// message nor response time reveals which case occurred.
///
/// A known username that is currently locked out returns `AccountLocked`
/// instead, without attempting password verification -- a deliberate,
/// disclosed exception to the above: it does reveal that the username
/// exists, but only after `MAX_FAILED_LOGIN_ATTEMPTS` wrong guesses were
/// already made against that specific username, a real cost an attacker
/// has to pay first. An unknown username never reaches this branch and
/// always returns the same `AuthenticationFailed` it always has.
pub fn verify_credentials(conn: &Connection, username: &str, password: &str) -> AppResult<User> {
    match find_with_credentials_by_username(conn, username)? {
        Some(user) => {
            if is_locked(conn, &user.id)? {
                return Err(AppError::AccountLocked);
            }
            if auth::verify_password(password, &user.password_hash) {
                reset_failed_login_attempts(conn, &user.id)?;
                Ok(User {
                    id: user.id,
                    username: user.username,
                    display_name: user.display_name,
                    created_at: user.created_at,
                })
            } else {
                record_failed_login_attempt(conn, &user.id)?;
                // If this specific attempt is the one that just crossed
                // the threshold, say so immediately rather than making
                // the teacher guess why a subsequent, correct-password
                // attempt is still being rejected.
                if is_locked(conn, &user.id)? {
                    Err(AppError::AccountLocked)
                } else {
                    Err(AppError::AuthenticationFailed)
                }
            }
        }
        None => {
            auth::verify_dummy_password_for_timing_safety(password);
            Err(AppError::AuthenticationFailed)
        }
    }
}

/// True if `user_id` is currently within an active lockout window. Done
/// entirely in SQL (comparing `locked_until` against the DB's own `now`)
/// rather than parsing the timestamp in Rust, matching this codebase's
/// established convention for ISO8601 date-range checks (see
/// `section_membership::is_active_member`).
fn is_locked(conn: &Connection, user_id: &str) -> AppResult<bool> {
    conn.query_row(
        "SELECT locked_until IS NOT NULL AND locked_until > strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         FROM users WHERE id = ?1",
        [user_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Increments the failed-attempt counter; once it reaches
/// `MAX_FAILED_LOGIN_ATTEMPTS`, sets `locked_until` `LOCKOUT_DURATION_SECS`
/// from now and resets the counter to 0, so the account starts with a
/// fresh full set of attempts once the lock expires rather than
/// immediately re-triggering on the next single failure.
fn record_failed_login_attempt(conn: &Connection, user_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE users SET failed_login_attempts = failed_login_attempts + 1 WHERE id = ?1",
        [user_id],
    )?;
    let attempts: i64 = conn.query_row(
        "SELECT failed_login_attempts FROM users WHERE id = ?1",
        [user_id],
        |row| row.get(0),
    )?;
    if attempts >= MAX_FAILED_LOGIN_ATTEMPTS {
        conn.execute(
            "UPDATE users SET locked_until = strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?2), \
             failed_login_attempts = 0 WHERE id = ?1",
            (user_id, format!("+{LOCKOUT_DURATION_SECS} seconds")),
        )?;
    }
    Ok(())
}

fn reset_failed_login_attempts(conn: &Connection, user_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE users SET failed_login_attempts = 0, locked_until = NULL WHERE id = ?1",
        [user_id],
    )?;
    Ok(())
}

/// Overwrites `user_id`'s password hash and clears any lockout currently
/// in effect on that account -- a locked-out account is very often
/// exactly why an admin-assisted reset was requested, and without this a
/// teacher would stay rejected by `is_locked` for up to
/// `LOCKOUT_DURATION_SECS` more even with the brand-new correct
/// password. Called only from `auth::admin_reset_teacher_password`,
/// after that function has already re-verified the caller's capability
/// and the target's school membership -- this function itself performs
/// no authorization, matching every other `repository::user` write.
pub fn set_password_and_clear_lockout(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    new_password_hash: &str,
) -> AppResult<bool> {
    let updated = conn.execute(
        "UPDATE users SET password_hash = ?2, failed_login_attempts = 0, locked_until = NULL \
         WHERE id = ?1 \
           AND EXISTS (SELECT 1 FROM user_school_memberships \
                       WHERE user_id = ?1 AND school_id = ?3) \
           AND NOT EXISTS (SELECT 1 FROM user_school_memberships \
                           WHERE user_id = ?1 AND school_id <> ?3)",
        (user_id, new_password_hash, school_id),
    )?;
    Ok(updated == 1)
}

pub fn add_school_membership(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO user_school_memberships (user_id, school_id) VALUES (?1, ?2)",
        (user_id, school_id),
    )?;
    Ok(())
}

pub fn is_member_of_school(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM user_school_memberships WHERE user_id = ?1 AND school_id = ?2",
        (user_id, school_id),
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// True once at least one user account exists. Used to gate the
/// unauthenticated bootstrap path: `register_user` may only skip
/// authentication for the very first account ever created — see
/// `auth::authorize_user_registration`.
pub fn any_users_exist(conn: &Connection) -> AppResult<bool> {
    let count: i64 = conn.query_row("SELECT count(*) FROM users", [], |row| row.get(0))?;
    Ok(count > 0)
}

/// True once at least one user has been granted membership in
/// `school_id`. Used to gate the unauthenticated bootstrap path:
/// `add_user_to_school` may only skip authentication for a school's very
/// first membership — see `auth::authorize_school_membership_grant`.
pub fn school_has_any_members(conn: &Connection, school_id: &str) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM user_school_memberships WHERE school_id = ?1",
        [school_id],
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// A colleague within the caller's own school -- just enough for a
/// School Head to pick a teacher when creating a Teaching Assignment
/// (Wave 2Y). `roles` may be empty (a member with no role grant yet);
/// never carries the password hash, matching `User`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SchoolMember {
    pub id: String,
    pub username: String,
    pub display_name: String,
    pub roles: Vec<String>,
}

/// Every member of `school_id`, each with the full set of roles they
/// hold there -- one query per member for the role set (never more than
/// a handful of members per school; simpler to verify correct by
/// inspection than a single aggregating join, the same tradeoff
/// `role::has_any_role` already made). Ordered by display name so the
/// UI never has to sort client-side.
pub fn list_members_in_school(conn: &Connection, school_id: &str) -> AppResult<Vec<SchoolMember>> {
    let mut stmt = conn.prepare(
        "SELECT u.id, u.username, u.display_name \
         FROM users u \
         JOIN user_school_memberships m ON m.user_id = u.id \
         WHERE m.school_id = ?1 \
         ORDER BY u.display_name COLLATE NOCASE",
    )?;
    let members = stmt
        .query_map([school_id], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let mut role_stmt = conn.prepare(
        "SELECT role FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 ORDER BY role",
    )?;
    members
        .into_iter()
        .map(|(id, username, display_name)| {
            let roles = role_stmt
                .query_map((&id, school_id), |row| row.get::<_, String>(0))?
                .collect::<Result<Vec<_>, _>>()?;
            Ok(SchoolMember {
                id,
                username,
                display_name,
                roles,
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let created = create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        let found = find_by_id(&conn, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn username_must_be_unique_case_insensitively() {
        let conn = open_test_db();
        create_user(&conn, "ana.cruz", "password1", "Ana Cruz").unwrap();

        let result = create_user(&conn, "Ana.Cruz", "password2", "Someone Else");

        assert!(result.is_err());
    }

    #[test]
    fn verify_credentials_succeeds_with_correct_password() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        let user = verify_credentials(&conn, "ana.cruz", "correct horse battery staple").unwrap();

        assert_eq!(user.username, "ana.cruz");
    }

    #[test]
    fn verify_credentials_fails_with_wrong_password() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        let result = verify_credentials(&conn, "ana.cruz", "wrong password");

        assert!(matches!(result, Err(AppError::AuthenticationFailed)));
    }

    #[test]
    fn verify_credentials_fails_for_unknown_username_with_the_same_error_as_wrong_password() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        let unknown_user_result = verify_credentials(&conn, "does.not.exist", "anything");
        let wrong_password_result = verify_credentials(&conn, "ana.cruz", "wrong password");

        assert!(matches!(
            unknown_user_result,
            Err(AppError::AuthenticationFailed)
        ));
        assert!(matches!(
            wrong_password_result,
            Err(AppError::AuthenticationFailed)
        ));
    }

    #[test]
    fn account_locks_after_the_maximum_number_of_wrong_passwords() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS - 1 {
            let result = verify_credentials(&conn, "ana.cruz", "wrong password");
            assert!(matches!(result, Err(AppError::AuthenticationFailed)));
        }
        // The attempt that reaches the threshold locks the account
        // immediately rather than waiting for a subsequent attempt to
        // reveal it, so the teacher gets clear feedback right away.
        let final_result = verify_credentials(&conn, "ana.cruz", "wrong password");
        assert!(matches!(final_result, Err(AppError::AccountLocked)));
    }

    #[test]
    fn a_locked_account_rejects_even_the_correct_password() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();
        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS {
            let _ = verify_credentials(&conn, "ana.cruz", "wrong password");
        }

        let result = verify_credentials(&conn, "ana.cruz", "correct horse battery staple");

        assert!(matches!(result, Err(AppError::AccountLocked)));
    }

    #[test]
    fn a_successful_login_resets_the_failed_attempt_counter() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();
        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS - 2 {
            let _ = verify_credentials(&conn, "ana.cruz", "wrong password");
        }

        let recovered = verify_credentials(&conn, "ana.cruz", "correct horse battery staple");
        assert!(recovered.is_ok());

        // The counter reset, so this account can withstand a fresh full
        // run of wrong attempts without immediately locking again.
        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS - 1 {
            let result = verify_credentials(&conn, "ana.cruz", "wrong password");
            assert!(matches!(result, Err(AppError::AuthenticationFailed)));
        }
    }

    #[test]
    fn an_unknown_username_never_locks_and_always_returns_authentication_failed() {
        let conn = open_test_db();

        for _ in 0..(MAX_FAILED_LOGIN_ATTEMPTS * 2) {
            let result = verify_credentials(&conn, "does.not.exist", "anything");
            assert!(matches!(result, Err(AppError::AuthenticationFailed)));
        }
    }

    #[test]
    fn a_locked_account_unlocks_after_the_lockout_window_and_a_fresh_attempt() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();
        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS {
            let _ = verify_credentials(&conn, "ana.cruz", "wrong password");
        }
        assert!(matches!(
            verify_credentials(&conn, "ana.cruz", "correct horse battery staple"),
            Err(AppError::AccountLocked)
        ));

        // Simulate the lockout window having already elapsed by moving
        // locked_until into the past directly, rather than sleeping the
        // test for real minutes.
        conn.execute(
            "UPDATE users SET locked_until = '2000-01-01T00:00:00.000Z' WHERE username = 'ana.cruz'",
            [],
        )
        .unwrap();

        let result = verify_credentials(&conn, "ana.cruz", "correct horse battery staple");

        assert!(result.is_ok());
    }

    #[test]
    fn set_password_and_clear_lockout_replaces_the_hash_so_the_new_password_verifies() {
        let conn = open_test_db();
        let user = create_user(&conn, "ana.cruz", "old password", "Ana Cruz").unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        add_school_membership(&conn, &user.id, &school.id).unwrap();
        let new_hash = auth::hash_password("new password").unwrap();

        assert!(set_password_and_clear_lockout(&conn, &user.id, &school.id, &new_hash).unwrap());

        assert!(matches!(
            verify_credentials(&conn, "ana.cruz", "old password"),
            Err(AppError::AuthenticationFailed)
        ));
        assert!(verify_credentials(&conn, "ana.cruz", "new password").is_ok());
    }

    #[test]
    fn set_password_and_clear_lockout_unlocks_an_account_that_was_locked_out() {
        let conn = open_test_db();
        let user = create_user(&conn, "ana.cruz", "old password", "Ana Cruz").unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        add_school_membership(&conn, &user.id, &school.id).unwrap();
        for _ in 0..MAX_FAILED_LOGIN_ATTEMPTS {
            let _ = verify_credentials(&conn, "ana.cruz", "wrong password");
        }
        assert!(matches!(
            verify_credentials(&conn, "ana.cruz", "old password"),
            Err(AppError::AccountLocked)
        ));
        let new_hash = auth::hash_password("new password").unwrap();

        assert!(set_password_and_clear_lockout(&conn, &user.id, &school.id, &new_hash).unwrap());

        assert!(
            verify_credentials(&conn, "ana.cruz", "new password").is_ok(),
            "a reset must clear the lockout too -- otherwise the teacher stays rejected for \
             up to 15 more minutes even with the correct new password"
        );
    }

    fn user_id_of(conn: &Connection, username: &str) -> String {
        conn.query_row(
            "SELECT id FROM users WHERE username = ?1",
            [username],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn password_hash_is_never_stored_as_plaintext_or_returned_by_find() {
        let conn = open_test_db();
        create_user(
            &conn,
            "ana.cruz",
            "correct horse battery staple",
            "Ana Cruz",
        )
        .unwrap();

        let stored_hash: String = conn
            .query_row(
                "SELECT password_hash FROM users WHERE username = 'ana.cruz'",
                [],
                |row| row.get(0),
            )
            .unwrap();

        assert_ne!(stored_hash, "correct horse battery staple");
        assert!(stored_hash.starts_with("$argon2id$"));
    }

    #[test]
    fn school_membership_round_trips() {
        let conn = open_test_db();
        let user = create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        assert!(!is_member_of_school(&conn, &user.id, &s.id).unwrap());

        add_school_membership(&conn, &user.id, &s.id).unwrap();

        assert!(is_member_of_school(&conn, &user.id, &s.id).unwrap());
    }

    #[test]
    fn any_users_exist_reflects_whether_a_user_has_been_created() {
        let conn = open_test_db();
        assert!(!any_users_exist(&conn).unwrap());

        create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();

        assert!(any_users_exist(&conn).unwrap());
    }

    #[test]
    fn school_has_any_members_reflects_membership_state_per_school() {
        let conn = open_test_db();
        let user = create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();

        assert!(!school_has_any_members(&conn, &school_a.id).unwrap());

        add_school_membership(&conn, &user.id, &school_a.id).unwrap();

        assert!(school_has_any_members(&conn, &school_a.id).unwrap());
        assert!(!school_has_any_members(&conn, &school_b.id).unwrap());
    }

    /// Property-based tests for the account-lockout invariant (ADR-0019),
    /// piloting `proptest` per the Compounding Engineering tooling pass
    /// (`docs/product/COMPOUNDING-ENGINEERING-DECISION.md` -- "Next best:
    /// Phase A + a Phase B proptest pilot scoped to `repository::user`'s
    /// lockout logic, given it's the newest security-critical invariant").
    ///
    /// The example-based tests above already prove the exact
    /// `MAX_FAILED_LOGIN_ATTEMPTS` boundary and a couple of specific
    /// attempt counts. What they don't generalize over is "for ANY
    /// number of consecutive wrong attempts, is lockout state exactly
    /// what the threshold predicts" -- a property, not a handful of
    /// examples, and exactly proptest's stated strength over
    /// example-based unit tests.
    #[test]
    fn list_members_in_school_is_empty_for_a_school_with_no_members() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();

        let members = list_members_in_school(&conn, &s.id).unwrap();

        assert!(members.is_empty());
    }

    #[test]
    fn list_members_in_school_returns_each_members_roles() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let teacher = create_user(&conn, "ana.cruz", "password12345", "Ana Cruz").unwrap();
        add_school_membership(&conn, &teacher.id, &s.id).unwrap();
        crate::repository::role::grant(&conn, &teacher.id, &s.id, crate::repository::role::TEACHER)
            .unwrap();
        let head = create_user(&conn, "bo.reyes", "password12345", "Bo Reyes").unwrap();
        add_school_membership(&conn, &head.id, &s.id).unwrap();
        crate::repository::role::grant(
            &conn,
            &head.id,
            &s.id,
            crate::repository::role::SCHOOL_HEAD,
        )
        .unwrap();

        let members = list_members_in_school(&conn, &s.id).unwrap();

        assert_eq!(members.len(), 2);
        // Ordered by display name -- "Ana Cruz" before "Bo Reyes".
        assert_eq!(members[0].display_name, "Ana Cruz");
        assert_eq!(members[0].roles, vec!["teacher".to_string()]);
        assert_eq!(members[1].display_name, "Bo Reyes");
        assert_eq!(members[1].roles, vec!["school_head".to_string()]);
    }

    #[test]
    fn list_members_in_school_never_includes_a_different_schools_members() {
        let conn = open_test_db();
        let s1 = school::create(&conn, "Rizal Elementary").unwrap();
        let s2 = school::create(&conn, "Mabini Elementary").unwrap();
        let teacher = create_user(&conn, "ana.cruz", "password12345", "Ana Cruz").unwrap();
        add_school_membership(&conn, &teacher.id, &s2.id).unwrap();

        let members = list_members_in_school(&conn, &s1.id).unwrap();

        assert!(members.is_empty());
    }

    #[test]
    fn list_members_in_school_includes_a_member_with_no_role_grant_yet() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let user = create_user(&conn, "ana.cruz", "password12345", "Ana Cruz").unwrap();
        add_school_membership(&conn, &user.id, &s.id).unwrap();

        let members = list_members_in_school(&conn, &s.id).unwrap();

        assert_eq!(members.len(), 1);
        assert!(members[0].roles.is_empty());
    }

    mod lockout_properties {
        use super::*;
        use proptest::prelude::*;

        proptest! {
            // Deliberately few cases (proptest's default is 256): every
            // case here runs real Argon2id verification (`auth::verify_password`/
            // `verify_dummy_password_for_timing_safety` are never mocked
            // or test-tuned lighter -- this app's security posture
            // requires the real, deliberately-expensive parameters even
            // in tests), so a high case count would make this pilot slow
            // without adding coverage proportional to the cost. A pilot
            // proving proptest's value on a real invariant, not a
            // production-scale fuzzing budget.
            #![proptest_config(ProptestConfig::with_cases(8))]

            /// After exactly `attempts` consecutive wrong-password
            /// attempts against one known account, the account must be
            /// locked if and only if `attempts >= MAX_FAILED_LOGIN_ATTEMPTS`.
            /// Bounded to a reasonable range (not an unbounded generator)
            /// since each case opens a fresh in-memory DB and runs real
            /// Argon2id verification -- unbounded would make the pilot
            /// slow without adding coverage beyond this range, given the
            /// lockout counter resets to 0 the moment it locks (so
            /// behavior beyond the threshold is already covered by the
            /// existing `a_locked_account_rejects_even_the_correct_password`
            /// example test).
            #[test]
            fn lock_state_matches_the_threshold_for_any_attempt_count(attempts in 0i64..=15) {
                let conn = open_test_db();
                create_user(&conn, "ana.cruz", "correct horse battery staple", "Ana Cruz").unwrap();

                for _ in 0..attempts {
                    let _ = verify_credentials(&conn, "ana.cruz", "wrong password");
                }

                let result = verify_credentials(&conn, "ana.cruz", "correct horse battery staple");
                if attempts >= MAX_FAILED_LOGIN_ATTEMPTS {
                    prop_assert!(matches!(result, Err(AppError::AccountLocked)));
                } else {
                    prop_assert!(result.is_ok());
                }
            }

            /// An unknown username must never lock, and must always
            /// return the same generic `AuthenticationFailed`, regardless
            /// of the username's actual content or how many attempts are
            /// made against it -- the property behind
            /// `verify_credentials`'s own documented guarantee that an
            /// unknown username never reaches the lockout branch at all.
            #[test]
            fn an_unknown_username_never_locks_for_any_username_or_attempt_count(
                username in "[a-z][a-z0-9._]{0,20}",
                attempts in 1i64..=10,
            ) {
                let conn = open_test_db();
                // Deliberately do NOT create this user -- proving the
                // property for a genuinely unknown username each time,
                // not a fixed one.

                for _ in 0..attempts {
                    let result = verify_credentials(&conn, &username, "anything");
                    prop_assert!(matches!(result, Err(AppError::AuthenticationFailed)));
                }
            }
        }
    }
}
