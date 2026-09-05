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

/// Wraps `sspk` for `credential_id` only if it does not already have a
/// wrap row -- unlike `wrap_for_credential`, a pre-existing wrap is not an
/// error, it is a no-op. This is the lazy re-wrap path an authenticated
/// hub request (`hub_server::authenticate`) calls on every successful
/// `device_credential::verify`: after `rotate_for_school` clears every
/// wrap row for a school (see below), the very next authenticated
/// push/pull from each still-active device transparently re-establishes
/// that device's wrap using the device secret the request already proved
/// it holds -- no new UX ceremony, no second network round trip, and the
/// hub never needs to have retained a revoked device's secret to rotate
/// everyone else onto the new key.
///
/// Defense in depth: also refuses to wrap for a credential that is
/// `revoked_at IS NOT NULL` or does not exist, even though the one real
/// call site (`hub_server::authenticate`) already gates this behind a
/// successful `device_credential::verify` (which itself already rejects a
/// revoked credential) -- security must not rely on a single caller
/// always getting the ordering right (`.claude/rules/security-privacy.md`:
/// "enforce at the ... repository ... boundary, not by omitting a
/// button"). A revocation review found this function had no such check of
/// its own; this closes that gap rather than leaving it as pure
/// convention.
pub fn ensure_wrapped_for_credential(
    conn: &Connection,
    school_id: &str,
    credential_id: &str,
    device_secret: &[u8],
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let exists: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_payload_key_wraps WHERE credential_id = ?1)",
        [credential_id],
        |row| row.get(0),
    )?;
    if exists {
        return Ok(());
    }

    let is_active: bool = conn.query_row(
        "SELECT EXISTS(
             SELECT 1 FROM device_sync_credentials
             WHERE id = ?1 AND school_id = ?2 AND revoked_at IS NULL
         )",
        (credential_id, school_id),
        |row| row.get(0),
    )?;
    if !is_active {
        return Ok(());
    }

    wrap_for_credential(conn, school_id, credential_id, device_secret, sspk)
}

/// The raw (still-wrapped) bytes of a stored `sync_payload_key_wraps` row,
/// as served to the OWNING device over `/sync/payload-key-wrap` -- see
/// `hub_server`'s handler. The hub never unwraps this itself (it does not
/// hold the device secret needed to); it only ever hands back exactly what
/// `wrap_for_credential`/`ensure_wrapped_for_credential` stored, and the
/// requesting device unwraps it locally with its own secret via
/// `payload_key::unwrap_payload_key`. This keeps the plaintext SSPK from
/// ever crossing the network boundary a second time -- only its per-device
/// wrapped form does, exactly like the original enrollment ceremony.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StoredWrap {
    pub wrapped_key: Vec<u8>,
    pub nonce: Vec<u8>,
}

/// Fetches a credential's stored wrap row verbatim, without unwrapping it
/// -- the counterpart read `hub_server`'s new `/sync/payload-key-wrap`
/// handler needs, since the hub itself never holds a device's secret and
/// so can never call `unwrap_for_credential` on a device's behalf. `None`
/// for a credential with no wrap row yet (should not happen for a
/// credential that has completed at least one authenticated request, per
/// `ensure_wrapped_for_credential`'s lazy-establishment guarantee, but not
/// itself an error state worth distinguishing from "not found" here,
/// matching `unwrap_for_credential`'s own convention).
pub fn get_wrap_for_credential(
    conn: &Connection,
    credential_id: &str,
) -> AppResult<Option<StoredWrap>> {
    conn.query_row(
        "SELECT wrapped_key, nonce FROM sync_payload_key_wraps WHERE credential_id = ?1",
        [credential_id],
        |row| {
            Ok(StoredWrap {
                wrapped_key: row.get(0)?,
                nonce: row.get(1)?,
            })
        },
    )
    .optional()
    .map_err(Into::into)
}

/// Rotates a school's sync-payload key by discarding every existing wrap
/// row for it (ADR-0069 addendum: "key rotation on device revocation").
///
/// This function does NOT mint or persist the new plaintext SSPK itself --
/// that is the same filesystem/DPAPI-file concern `db::load_or_mint_sspk`
/// already owns for the ORIGINAL key, kept out of this pure-`Connection`
/// repository layer for the same reason `wrap_for_credential` takes its
/// `sspk` as an already-resolved parameter rather than resolving it
/// itself. Callers rotate by minting a fresh SSPK (overwriting the local
/// DPAPI-protected file) and calling this to invalidate every stored wrap
/// of the OLD key in the same breath.
///
/// Deliberately clears wraps for EVERY device in the school, not only the
/// revoked one: the hub cannot re-wrap the new key for another device
/// without that device's plaintext secret (which the hub never retains
/// past enrollment -- only its hash, per `device_credential`'s design), so
/// there is no way to selectively "skip" already-active devices here. Each
/// still-active device transparently recovers a fresh wrap the next time
/// it authenticates (see `ensure_wrapped_for_credential`); a revoked
/// device can never authenticate again, so it can never recover one --
/// meaning a device that cached the OLD SSPK locally before revocation
/// can decrypt only data encrypted under the now-retired key, never
/// anything encrypted after rotation.
pub fn rotate_for_school(conn: &Connection, school_id: &str) -> AppResult<usize> {
    let cleared = conn.execute(
        "DELETE FROM sync_payload_key_wraps WHERE school_id = ?1",
        [school_id],
    )?;
    Ok(cleared)
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

    #[test]
    fn get_wrap_for_credential_returns_the_stored_ciphertext_and_nonce_verbatim() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk).unwrap();

        let stored = get_wrap_for_credential(&conn, &credential.id)
            .unwrap()
            .expect("a wrap was just stored");

        assert_ne!(stored.wrapped_key, sspk.to_vec());
        let wrap_key = payload_key::derive_wrap_key(&device_secret);
        let unwrapped =
            payload_key::unwrap_payload_key(&wrap_key, &stored.nonce, &stored.wrapped_key).unwrap();
        assert_eq!(unwrapped, sspk);
    }

    #[test]
    fn get_wrap_for_credential_is_none_when_no_wrap_exists() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();

        assert_eq!(
            get_wrap_for_credential(&conn, &credential.id).unwrap(),
            None
        );
    }

    #[test]
    fn rotate_for_school_clears_every_wrap_row_for_that_school() {
        let (conn, school_id, user_id) = setup();
        let device_a =
            device_credential::enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let device_b =
            device_credential::enroll(&conn, &school_id, &user_id, "device-b", None).unwrap();
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(
            &conn,
            &school_id,
            &device_a.id,
            &decode_hex(&device_a.secret_hex),
            &sspk,
        )
        .unwrap();
        wrap_for_credential(
            &conn,
            &school_id,
            &device_b.id,
            &decode_hex(&device_b.secret_hex),
            &sspk,
        )
        .unwrap();

        let cleared = rotate_for_school(&conn, &school_id).unwrap();

        assert_eq!(cleared, 2);
        assert_eq!(
            unwrap_for_credential(&conn, &device_a.id, &decode_hex(&device_a.secret_hex)).unwrap(),
            None
        );
        assert_eq!(
            unwrap_for_credential(&conn, &device_b.id, &decode_hex(&device_b.secret_hex)).unwrap(),
            None
        );
    }

    #[test]
    fn rotate_for_school_does_not_touch_another_schools_wraps() {
        let (conn, school_id, user_id) = setup();
        let other_school = school::create(&conn, "Bonifacio High").unwrap();
        let device_a =
            device_credential::enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let device_other =
            device_credential::enroll(&conn, &other_school.id, &user_id, "device-other", None)
                .unwrap();
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(
            &conn,
            &school_id,
            &device_a.id,
            &decode_hex(&device_a.secret_hex),
            &sspk,
        )
        .unwrap();
        wrap_for_credential(
            &conn,
            &other_school.id,
            &device_other.id,
            &decode_hex(&device_other.secret_hex),
            &sspk,
        )
        .unwrap();

        rotate_for_school(&conn, &school_id).unwrap();

        assert!(unwrap_for_credential(
            &conn,
            &device_other.id,
            &decode_hex(&device_other.secret_hex)
        )
        .unwrap()
        .is_some());
    }

    #[test]
    fn ensure_wrapped_is_a_no_op_when_a_wrap_already_exists() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();
        wrap_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk).unwrap();

        // A second SSPK must never overwrite the existing wrap silently --
        // ensure_wrapped only fills a GAP, it never re-wraps in place.
        let other_sspk = payload_key::generate_payload_key();
        ensure_wrapped_for_credential(
            &conn,
            &school_id,
            &credential.id,
            &device_secret,
            &other_sspk,
        )
        .unwrap();

        let unwrapped = unwrap_for_credential(&conn, &credential.id, &device_secret)
            .unwrap()
            .unwrap();
        assert_eq!(unwrapped, sspk, "the original wrap must be left untouched");
    }

    #[test]
    fn ensure_wrapped_creates_a_wrap_when_none_exists() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        let sspk = payload_key::generate_payload_key();

        ensure_wrapped_for_credential(&conn, &school_id, &credential.id, &device_secret, &sspk)
            .unwrap();

        let unwrapped = unwrap_for_credential(&conn, &credential.id, &device_secret)
            .unwrap()
            .unwrap();
        assert_eq!(unwrapped, sspk);
    }

    /// Defense in depth: `ensure_wrapped_for_credential` must refuse a
    /// revoked credential on its own, not merely because its real call
    /// site (`hub_server::authenticate`) happens to check first. Exercises
    /// the repository function directly, with no `verify` call anywhere
    /// in this test.
    #[test]
    fn ensure_wrapped_is_a_no_op_for_a_revoked_credential() {
        let (conn, school_id, user_id) = setup();
        let credential =
            device_credential::enroll(&conn, &school_id, &user_id, "device-1", None).unwrap();
        let device_secret = decode_hex(&credential.secret_hex);
        device_credential::revoke(&conn, &school_id, &credential.id).unwrap();

        ensure_wrapped_for_credential(
            &conn,
            &school_id,
            &credential.id,
            &device_secret,
            &payload_key::generate_payload_key(),
        )
        .unwrap();

        assert_eq!(
            unwrap_for_credential(&conn, &credential.id, &device_secret).unwrap(),
            None,
            "a revoked credential must never gain a wrap, even called directly"
        );
    }

    #[test]
    fn ensure_wrapped_is_a_no_op_for_an_unknown_credential() {
        let (conn, school_id, _user_id) = setup();

        ensure_wrapped_for_credential(
            &conn,
            &school_id,
            "no-such-credential",
            b"irrelevant secret bytes",
            &payload_key::generate_payload_key(),
        )
        .unwrap();

        assert_eq!(
            unwrap_for_credential(&conn, "no-such-credential", b"irrelevant secret bytes").unwrap(),
            None
        );
    }

    #[test]
    fn rotation_then_ensure_wrapped_recovers_the_new_key_for_a_still_active_device() {
        let (conn, school_id, user_id) = setup();
        let device_a =
            device_credential::enroll(&conn, &school_id, &user_id, "device-a", None).unwrap();
        let secret_a = decode_hex(&device_a.secret_hex);
        let old_sspk = payload_key::generate_payload_key();
        wrap_for_credential(&conn, &school_id, &device_a.id, &secret_a, &old_sspk).unwrap();

        // Simulate a revocation-triggered rotation: the old key's wraps
        // are cleared, and a fresh SSPK is minted (device-agnostic, not
        // modeled here -- that step lives in `db::load_or_mint_sspk`).
        rotate_for_school(&conn, &school_id).unwrap();
        let new_sspk = payload_key::generate_payload_key();
        assert_ne!(new_sspk, old_sspk);

        // Device A's very next authenticated contact re-establishes a
        // wrap of the NEW key using the secret it already proved it holds.
        ensure_wrapped_for_credential(&conn, &school_id, &device_a.id, &secret_a, &new_sspk)
            .unwrap();

        let recovered = unwrap_for_credential(&conn, &device_a.id, &secret_a)
            .unwrap()
            .unwrap();
        assert_eq!(recovered, new_sspk);
    }
}
