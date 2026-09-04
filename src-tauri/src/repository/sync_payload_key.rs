//! ADR-0069: storage for wrapped copies of the school sync-payload key
//! (SSPK). This module never touches the filesystem and never generates
//! or holds the plaintext SSPK itself beyond the lifetime of one call --
//! resolving *where the plaintext SSPK comes from* (the local
//! DPAPI-protected key file, exactly like the SQLCipher key -- see
//! `crypto::KeyStore`) is the caller's job, not this repository layer's,
//! matching this project's existing "repository is a pure function of
//! `Connection`" convention. Not yet wired to any Tauri command -- see
//! ADR-0069's "Not yet decided" section.

use rusqlite::{Connection, OptionalExtension};
use uuid::Uuid;

use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::error::AppResult;

/// Wraps `sspk` (the school's already-resolved plaintext sync-payload
/// key) under a wrap key derived from `device_secret` (the same secret
/// `device_credential::enroll` just issued for `credential_id`), and
/// stores the wrapped copy.
///
/// Callers MUST invoke this in the same trusted-boundary flow as
/// `device_credential::enroll` (see `auth::enroll_device_sync_credential`),
/// immediately after a credential is issued, so every active credential
/// ends up with exactly one wrap -- the migration's `UNIQUE(credential_id)`
/// constraint will reject a second wrap for the same credential.
pub fn wrap_for_credential(
    conn: &Connection,
    school_id: &str,
    credential_id: &str,
    device_secret: &[u8],
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let wrap_key = payload_key::derive_wrap_key(device_secret);
    let wrapped = payload_key::wrap_payload_key(&wrap_key, sspk)?;

    conn.execute(
        "INSERT INTO sync_payload_key_wraps (id, school_id, credential_id, wrapped_key, nonce)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            Uuid::now_v7().to_string(),
            school_id,
            credential_id,
            &wrapped.ciphertext,
            &wrapped.nonce[..],
        ),
    )?;
    Ok(())
}

/// Fetches and unwraps the SSPK for a credential, given the same secret
/// that credential was issued with. Trusts its caller to have already
/// confirmed the credential is active and the secret is correct (e.g.
/// via `device_credential::verify`) -- this function does not re-check
/// either. Returns `Ok(None)` if this credential has no wrap row, which
/// should never happen for a credential issued through the enrollment
/// flow once it is wired to call `wrap_for_credential`, but is not
/// itself an error state worth distinguishing from "not found" here.
pub fn unwrap_for_credential(
    conn: &Connection,
    credential_id: &str,
    device_secret: &[u8],
) -> AppResult<Option<[u8; PAYLOAD_KEY_LEN]>> {
    let row: Option<(Vec<u8>, Vec<u8>)> = conn
        .query_row(
            "SELECT wrapped_key, nonce FROM sync_payload_key_wraps WHERE credential_id = ?1",
            [credential_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;

    let (wrapped_key, nonce) = match row {
        Some(row) => row,
        None => return Ok(None),
    };

    let wrap_key = payload_key::derive_wrap_key(device_secret);
    let sspk = payload_key::unwrap_payload_key(&wrap_key, &nonce, &wrapped_key)?;
    Ok(Some(sspk))
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::device_credential, repository::school, repository::user};
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

    fn decode_hex(hex: &str) -> Vec<u8> {
        (0..hex.len())
            .step_by(2)
            .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).unwrap())
            .collect()
    }

    #[test]
    fn wrap_then_unwrap_round_trips_to_the_original_sspk() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();

        wrap_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk).unwrap();
        let unwrapped = unwrap_for_credential(&conn, &credential.id, &device_secret)
            .unwrap()
            .expect("a wrap was just stored for this credential");

        assert_eq!(unwrapped, sspk);
    }

    #[test]
    fn the_stored_wrap_never_contains_the_plaintext_sspk() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();

        wrap_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk).unwrap();

        let stored: Vec<u8> = conn
            .query_row(
                "SELECT wrapped_key FROM sync_payload_key_wraps WHERE credential_id = ?1",
                [&credential.id],
                |row| row.get(0),
            )
            .unwrap();
        assert_ne!(stored, sspk.to_vec());
    }

    #[test]
    fn unwrap_returns_none_for_a_credential_with_no_wrap() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);

        assert_eq!(
            unwrap_for_credential(&conn, &credential.id, &device_secret).unwrap(),
            None
        );
    }

    #[test]
    fn unwrap_fails_closed_with_another_devices_secret() {
        let (conn, school_id, user_id) = setup();
        let device_a =
            device_credential::enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let device_b =
            device_credential::enroll(&conn, &school_id, &user_id, "device-b", None).unwrap();
        let secret_a = decode_hex(&device_a.secret_hex);
        let secret_b = decode_hex(&device_b.secret_hex);
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(&conn, &school_id, &device_a.id, &secret_a, &sspk).unwrap();

        let result = unwrap_for_credential(&conn, &device_a.id, &secret_b);

        assert!(
            result.is_err(),
            "device B's secret must never unwrap a copy wrapped for device A"
        );
    }

    #[test]
    fn two_devices_independently_recover_the_same_school_sspk() {
        let (conn, school_id, user_id) = setup();
        let device_a =
            device_credential::enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let device_b =
            device_credential::enroll(&conn, &school_id, &user_id, "device-b", None).unwrap();
        let secret_a = decode_hex(&device_a.secret_hex);
        let secret_b = decode_hex(&device_b.secret_hex);
        let sspk = payload_key::generate_payload_key();

        wrap_for_credential(&conn, &school_id, &device_a.id, &secret_a, &sspk).unwrap();
        wrap_for_credential(&conn, &school_id, &device_b.id, &secret_b, &sspk).unwrap();

        let recovered_a = unwrap_for_credential(&conn, &device_a.id, &secret_a)
            .unwrap()
            .unwrap();
        let recovered_b = unwrap_for_credential(&conn, &device_b.id, &secret_b)
            .unwrap()
            .unwrap();
        assert_eq!(recovered_a, sspk);
        assert_eq!(recovered_b, sspk);
    }

    #[test]
    fn wrapping_a_second_sspk_for_an_already_wrapped_credential_is_rejected() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk).unwrap();

        let second = wrap_for_credential(
            &conn,
            &school_id,
            &credential.id,
            &device_secret,
            &payload_key::generate_payload_key(),
        );

        assert!(
            second.is_err(),
            "at most one wrap per credential -- matches the migration's UNIQUE constraint"
        );
    }
}
