use rusqlite::{Connection, OptionalExtension};
use sha2::{Digest, Sha256};
use uuid::Uuid;

use crate::error::AppResult;

/// 256-bit random secret -- deliberately much larger than a memorable
/// password, since this credential is never typed by a human and does
/// not need Argon2id's deliberate slowness: brute-forcing a 256-bit
/// random value is infeasible regardless of hash speed, so a plain
/// SHA-256 digest (verified in constant time) is the standard choice for
/// a high-entropy bearer secret, matching how an API key is normally
/// stored, not how a chosen password is.
pub const SECRET_LEN: usize = 32;

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct EnrolledCredential {
    pub id: String,
    /// Hex-encoded plaintext secret. Returned exactly once, at
    /// enrollment -- it is never stored and cannot be recovered later,
    /// only reissued via a fresh `enroll` call.
    pub secret_hex: String,
}

/// `(school_id, user_id, device_id, secret_hash, revoked_at)`, as read
/// back from one `device_sync_credentials` row.
type CredentialRow = (String, String, String, Vec<u8>, Option<String>);

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VerifiedDevice {
    pub credential_id: String,
    pub school_id: String,
    pub user_id: String,
    pub device_id: String,
}

/// Issues a new per-device sync credential bound to `(school_id, user_id,
/// device_id)`. Any still-active credential already enrolled for this
/// exact device is revoked first, so re-enrollment cannot silently
/// accumulate live secrets for the same device -- the write-based
/// counterpart to migration 26's `idx_device_sync_credentials_one_active_per_device`
/// partial unique index.
///
/// Callers MUST go through this module's own trusted-boundary gate
/// (`auth::enroll_device_sync_credential`, which re-verifies the
/// requesting user's password) -- this function itself performs no
/// authentication and trusts `user_id`/`school_id` as already-verified
/// repository arguments, exactly like every other repository function in
/// this codebase.
pub fn enroll(
    conn: &Connection,
    school_id: &str,
    user_id: &str,
    device_id: &str,
    device_label: Option<&str>,
) -> AppResult<EnrolledCredential> {
    revoke_active_for_device(conn, school_id, device_id)?;

    let id = Uuid::now_v7().to_string();
    let secret = generate_secret();
    let secret_hash = hash_secret(&secret);

    conn.execute(
        "INSERT INTO device_sync_credentials
         (id, school_id, user_id, device_id, device_label, secret_hash)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            school_id,
            user_id,
            device_id,
            device_label,
            &secret_hash[..],
        ),
    )?;

    Ok(EnrolledCredential {
        id,
        secret_hex: hex_encode(&secret),
    })
}

/// Verifies a presented `(credential_id, secret)` pair, in constant time
/// against the stored digest. An unknown id, a revoked credential, and a
/// mismatched secret all return `Ok(None)` -- collapsed into one
/// identical outcome so a caller cannot use response shape to probe
/// which credential ids exist versus which are merely revoked, the same
/// enumeration-safety reasoning `auth::admin_reset_teacher_password`
/// already applies. Updates `last_used_at` only on success.
pub fn verify(
    conn: &Connection,
    credential_id: &str,
    secret_hex: &str,
) -> AppResult<Option<VerifiedDevice>> {
    let presented_secret = match hex_decode(secret_hex) {
        Some(bytes) => bytes,
        None => return Ok(None),
    };

    let row: Option<CredentialRow> = conn
        .query_row(
            "SELECT school_id, user_id, device_id, secret_hash, revoked_at
             FROM device_sync_credentials WHERE id = ?1",
            [credential_id],
            |row| {
                Ok((
                    row.get(0)?,
                    row.get(1)?,
                    row.get(2)?,
                    row.get(3)?,
                    row.get(4)?,
                ))
            },
        )
        .optional()?;

    let (school_id, user_id, device_id, stored_hash, revoked_at) = match row {
        Some(row) => row,
        None => return Ok(None),
    };
    if revoked_at.is_some() {
        return Ok(None);
    }
    if !constant_time_eq(&hash_secret(&presented_secret), &stored_hash) {
        return Ok(None);
    }

    conn.execute(
        "UPDATE device_sync_credentials
         SET last_used_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        [credential_id],
    )?;

    Ok(Some(VerifiedDevice {
        credential_id: credential_id.to_string(),
        school_id,
        user_id,
        device_id,
    }))
}

/// Revokes one credential within its school boundary. A repeated or
/// unknown-id revocation is harmless and reports `false`, matching
/// `repository::session::revoke`'s idempotent shape.
pub fn revoke(conn: &Connection, school_id: &str, credential_id: &str) -> AppResult<bool> {
    Ok(conn.execute(
        "UPDATE device_sync_credentials
         SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1 AND school_id = ?2 AND revoked_at IS NULL",
        (credential_id, school_id),
    )? == 1)
}

/// Returns `(school_id, user_id)` for a credential id, regardless of
/// revocation state. Exists only to support an authorization check --
/// "is the caller allowed to revoke this credential" -- never to bypass
/// `verify`'s enumeration-safety collapse for the sync protocol itself.
pub fn owner(conn: &Connection, credential_id: &str) -> AppResult<Option<(String, String)>> {
    conn.query_row(
        "SELECT school_id, user_id FROM device_sync_credentials WHERE id = ?1",
        [credential_id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )
    .optional()
    .map_err(Into::into)
}

fn revoke_active_for_device(conn: &Connection, school_id: &str, device_id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE device_sync_credentials
         SET revoked_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE school_id = ?1 AND device_id = ?2 AND revoked_at IS NULL",
        (school_id, device_id),
    )?;
    Ok(())
}

fn generate_secret() -> [u8; SECRET_LEN] {
    let mut secret = [0u8; SECRET_LEN];
    rand::fill(&mut secret);
    secret
}

fn hash_secret(secret: &[u8]) -> [u8; 32] {
    let mut hasher = Sha256::new();
    hasher.update(secret);
    hasher.finalize().into()
}

fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

fn hex_decode(value: &str) -> Option<Vec<u8>> {
    if !value.len().is_multiple_of(2) {
        return None;
    }
    (0..value.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&value[i..i + 2], 16).ok())
        .collect()
}

/// Constant-time byte comparison -- deliberately not `==`, which can
/// short-circuit on the first differing byte and leak timing
/// information about how much of a guessed secret is correct so far.
fn constant_time_eq(a: &[u8], b: &[u8]) -> bool {
    if a.len() != b.len() {
        return false;
    }
    let mut diff = 0u8;
    for (x, y) in a.iter().zip(b.iter()) {
        diff |= x ^ y;
    }
    diff == 0
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school, repository::user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    fn setup() -> (Connection, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let user = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        (conn, school.id, user.id)
    }

    #[test]
    fn enroll_then_verify_round_trips() {
        let (conn, school_id, user_id) = setup();

        let credential = enroll(
            &conn,
            &school_id,
            &user_id,
            "device-1",
            Some("Ana's laptop"),
        )
        .unwrap();

        let verified = verify(&conn, &credential.id, &credential.secret_hex)
            .unwrap()
            .expect("a freshly enrolled credential must verify");
        assert_eq!(verified.credential_id, credential.id);
        assert_eq!(verified.school_id, school_id);
        assert_eq!(verified.user_id, user_id);
        assert_eq!(verified.device_id, "device-1");
    }

    #[test]
    fn the_plaintext_secret_is_never_stored() {
        let (conn, school_id, user_id) = setup();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        let stored_hash: Vec<u8> = conn
            .query_row(
                "SELECT secret_hash FROM device_sync_credentials WHERE id = ?1",
                [&credential.id],
                |row| row.get(0),
            )
            .unwrap();

        assert_ne!(
            hex_encode(&stored_hash),
            credential.secret_hex,
            "the stored column must be a digest, not the secret itself"
        );
    }

    #[test]
    fn verify_rejects_a_wrong_secret() {
        let (conn, school_id, user_id) = setup();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        let wrong_secret = "00".repeat(SECRET_LEN);
        assert_eq!(verify(&conn, &credential.id, &wrong_secret).unwrap(), None);
    }

    #[test]
    fn verify_rejects_an_unknown_credential_id() {
        let (conn, ..) = setup();

        assert_eq!(
            verify(&conn, "does-not-exist", &"aa".repeat(SECRET_LEN)).unwrap(),
            None
        );
    }

    #[test]
    fn verify_rejects_a_revoked_credential() {
        let (conn, school_id, user_id) = setup();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        assert!(revoke(&conn, &school_id, &credential.id).unwrap());

        assert_eq!(
            verify(&conn, &credential.id, &credential.secret_hex).unwrap(),
            None,
            "a revoked credential must never verify, even with the correct secret"
        );
    }

    #[test]
    fn re_enrolling_the_same_device_revokes_the_previous_credential() {
        let (conn, school_id, user_id) = setup();
        let first = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        let second = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        assert_ne!(first.id, second.id);
        assert_eq!(
            verify(&conn, &first.id, &first.secret_hex).unwrap(),
            None,
            "the superseded credential must no longer verify"
        );
        assert!(verify(&conn, &second.id, &second.secret_hex)
            .unwrap()
            .is_some());
    }

    #[test]
    fn revoke_is_school_scoped_and_idempotent() {
        let (conn, school_id, user_id) = setup();
        let other_school = school::create(&conn, "Other School").unwrap();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        assert!(
            !revoke(&conn, &other_school.id, &credential.id).unwrap(),
            "revoking through a different school's boundary must not succeed"
        );
        assert!(verify(&conn, &credential.id, &credential.secret_hex)
            .unwrap()
            .is_some());

        assert!(revoke(&conn, &school_id, &credential.id).unwrap());
        assert!(
            !revoke(&conn, &school_id, &credential.id).unwrap(),
            "a second revocation of the same credential reports false, not an error"
        );
    }

    #[test]
    fn two_different_devices_can_each_hold_an_active_credential() {
        let (conn, school_id, user_id) = setup();
        let a = enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let b = enroll(&conn, &school_id, &user_id, "device-b", None).unwrap();

        assert!(verify(&conn, &a.id, &a.secret_hex).unwrap().is_some());
        assert!(verify(&conn, &b.id, &b.secret_hex).unwrap().is_some());
    }

    #[test]
    fn verify_rejects_a_malformed_secret_without_erroring() {
        let (conn, school_id, user_id) = setup();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        assert_eq!(verify(&conn, &credential.id, "not-hex-zz").unwrap(), None);
    }

    #[test]
    fn owner_resolves_even_after_revocation() {
        let (conn, school_id, user_id) = setup();
        let credential = enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        revoke(&conn, &school_id, &credential.id).unwrap();

        assert_eq!(
            owner(&conn, &credential.id).unwrap(),
            Some((school_id, user_id))
        );
    }

    #[test]
    fn owner_is_none_for_an_unknown_credential_id() {
        let (conn, ..) = setup();

        assert_eq!(owner(&conn, "does-not-exist").unwrap(), None);
    }

    #[test]
    fn constant_time_eq_matches_ordinary_equality_semantics() {
        assert!(constant_time_eq(b"abc", b"abc"));
        assert!(!constant_time_eq(b"abc", b"abd"));
        assert!(!constant_time_eq(b"abc", b"ab"));
    }
}
