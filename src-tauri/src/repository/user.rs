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

/// Verifies a username/password pair. Returns the user's public data on
/// success. Deliberately returns the exact same `AuthenticationFailed`
/// error whether the username doesn't exist or the password is wrong, and
/// runs a real Argon2id verification either way (see
/// `auth::verify_dummy_password_for_timing_safety`) so neither the error
/// message nor response time reveals which case occurred.
pub fn verify_credentials(conn: &Connection, username: &str, password: &str) -> AppResult<User> {
    match find_with_credentials_by_username(conn, username)? {
        Some(user) if auth::verify_password(password, &user.password_hash) => Ok(User {
            id: user.id,
            username: user.username,
            display_name: user.display_name,
            created_at: user.created_at,
        }),
        Some(_) => Err(AppError::AuthenticationFailed),
        None => {
            auth::verify_dummy_password_for_timing_safety(password);
            Err(AppError::AuthenticationFailed)
        }
    }
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
}
