//! ADR-0069: the sync payload key ceremony. A school's sync-payload key
//! (SSPK) is a single AES-256-GCM key, distinct from every device's own
//! SQLCipher database key (`crypto::generate_key`) -- ADR-0067 requires
//! the two key types are never reused. This module only implements the
//! cryptographic primitives (key generation, per-device wrap-key
//! derivation, wrap, unwrap); `repository::device_credential` is where
//! they get wired into the actual enrollment ceremony, and no Tauri
//! command exposes any of this yet (see ADR-0069's "Not yet decided").

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes256Gcm, Nonce};
use hkdf::Hkdf;
use sha2::Sha256;

use crate::error::{AppError, AppResult};

pub const PAYLOAD_KEY_LEN: usize = 32;
pub const NONCE_LEN: usize = 12;

/// Domain-separation label for HKDF-expanding a device's sync-enrollment
/// secret into a payload-key *wrap* key. Versioned so a future v2 wrap
/// scheme can coexist during a migration without silently colliding.
const WRAP_KEY_INFO: &[u8] = b"LIKHA-sync-payload-wrap-v1";

/// A wrapped (encrypted) copy of the school's sync-payload key, as stored
/// in `sync_payload_key_wraps` -- never the plaintext key itself.
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WrappedPayloadKey {
    pub nonce: [u8; NONCE_LEN],
    pub ciphertext: Vec<u8>,
}

/// Generates a fresh school sync-payload key. Deliberately a distinctly
/// named function from `crypto::generate_key` (even though both are a
/// plain CSPRNG fill of the same length) so a reader can never mistake
/// one key type's call site for the other's.
pub fn generate_payload_key() -> [u8; PAYLOAD_KEY_LEN] {
    let mut key = [0u8; PAYLOAD_KEY_LEN];
    rand::fill(&mut key);
    key
}

/// Derives a device's payload-key wrap key from its own sync-enrollment
/// secret (the same 256-bit secret `device_credential::enroll` already
/// generates and returns exactly once). Deterministic and stateless --
/// nothing new needs to be stored to reproduce this locally on the
/// enrolling device.
pub fn derive_wrap_key(enrollment_secret: &[u8]) -> [u8; 32] {
    let hk = Hkdf::<Sha256>::new(None, enrollment_secret);
    let mut wrap_key = [0u8; 32];
    hk.expand(WRAP_KEY_INFO, &mut wrap_key)
        .expect("32 bytes is always a valid HKDF-SHA256 output length");
    wrap_key
}

/// Encrypts `payload_key` under `wrap_key` with a fresh random nonce.
pub fn wrap_payload_key(
    wrap_key: &[u8; 32],
    payload_key: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<WrappedPayloadKey> {
    let cipher = Aes256Gcm::new_from_slice(wrap_key)
        .map_err(|e| AppError::key_store(format!("could not initialize wrap cipher: {e}")))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::fill(&mut nonce_bytes);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, payload_key.as_slice())
        .map_err(|_| AppError::key_store("failed to wrap sync payload key".to_string()))?;
    Ok(WrappedPayloadKey {
        nonce: nonce_bytes,
        ciphertext,
    })
}

/// Decrypts a previously wrapped payload key. Fails closed (never
/// silently returns garbage) on a wrong wrap key, a tampered nonce, or a
/// tampered ciphertext -- AES-GCM's authentication tag makes all three
/// indistinguishable from each other, which is fine here: any of them
/// means the caller must not trust the result.
pub fn unwrap_payload_key(
    wrap_key: &[u8; 32],
    nonce: &[u8],
    ciphertext: &[u8],
) -> AppResult<[u8; PAYLOAD_KEY_LEN]> {
    let cipher = Aes256Gcm::new_from_slice(wrap_key)
        .map_err(|e| AppError::key_store(format!("could not initialize wrap cipher: {e}")))?;
    let nonce = Nonce::try_from(nonce).map_err(|_| {
        AppError::key_store("invalid nonce length for sync payload key unwrap".to_string())
    })?;
    let plaintext = cipher.decrypt(&nonce, ciphertext).map_err(|_| {
        AppError::key_store(
            "failed to unwrap sync payload key (wrong key or tampered data)".to_string(),
        )
    })?;
    <[u8; PAYLOAD_KEY_LEN]>::try_from(plaintext.as_slice()).map_err(|_| {
        AppError::key_store("unwrapped sync payload key has an unexpected length".to_string())
    })
}

/// Encrypts an arbitrary-length plaintext payload directly under the SSPK
/// (not a wrap-a-key operation like `wrap_payload_key` -- this is for the
/// actual outbox/hub-log payload bytes ADR-0069's "not yet consumed by
/// `sync_outbox`" gap refers to). Returns `nonce || ciphertext`
/// concatenated into one blob, since the storage columns this feeds
/// (`sync_outbox.encrypted_payload`, `sync_hub_log.encrypted_payload`) are
/// a single `Vec<u8>`, unlike `sync_payload_key_wraps`' separate
/// `nonce`/`wrapped_key` columns.
pub fn encrypt_payload(sspk: &[u8; PAYLOAD_KEY_LEN], plaintext: &[u8]) -> AppResult<Vec<u8>> {
    let cipher = Aes256Gcm::new_from_slice(sspk)
        .map_err(|e| AppError::key_store(format!("could not initialize payload cipher: {e}")))?;
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::fill(&mut nonce_bytes);
    let nonce = Nonce::from(nonce_bytes);
    let ciphertext = cipher
        .encrypt(&nonce, plaintext)
        .map_err(|_| AppError::key_store("failed to encrypt sync payload".to_string()))?;

    let mut blob = Vec::with_capacity(NONCE_LEN + ciphertext.len());
    blob.extend_from_slice(&nonce_bytes);
    blob.extend_from_slice(&ciphertext);
    Ok(blob)
}

/// Decrypts a blob `encrypt_payload` produced. Fails closed on a blob too
/// short to contain a nonce, a wrong key, or tampered data -- the same
/// discipline as `unwrap_payload_key`.
pub fn decrypt_payload(sspk: &[u8; PAYLOAD_KEY_LEN], blob: &[u8]) -> AppResult<Vec<u8>> {
    if blob.len() < NONCE_LEN {
        return Err(AppError::key_store(
            "encrypted sync payload is too short to contain a nonce".to_string(),
        ));
    }
    let (nonce_bytes, ciphertext) = blob.split_at(NONCE_LEN);
    let cipher = Aes256Gcm::new_from_slice(sspk)
        .map_err(|e| AppError::key_store(format!("could not initialize payload cipher: {e}")))?;
    let nonce = Nonce::try_from(nonce_bytes).map_err(|_| {
        AppError::key_store("invalid nonce length for sync payload decrypt".to_string())
    })?;
    cipher.decrypt(&nonce, ciphertext).map_err(|_| {
        AppError::key_store(
            "failed to decrypt sync payload (wrong key or tampered data)".to_string(),
        )
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_payload_key_is_not_all_zero_and_varies() {
        let a = generate_payload_key();
        let b = generate_payload_key();
        assert_ne!(a, [0u8; PAYLOAD_KEY_LEN]);
        assert_ne!(a, b);
    }

    #[test]
    fn derive_wrap_key_is_deterministic_for_the_same_secret() {
        let secret = b"a fixed 32-byte enrollment secret";
        assert_eq!(derive_wrap_key(secret), derive_wrap_key(secret));
    }

    #[test]
    fn derive_wrap_key_differs_for_different_secrets() {
        let a = derive_wrap_key(b"device A's own enrollment secret");
        let b = derive_wrap_key(b"device B's own enrollment secret");
        assert_ne!(a, b);
    }

    #[test]
    fn wrap_then_unwrap_round_trips_to_the_original_payload_key() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");
        let payload_key = generate_payload_key();

        let wrapped = wrap_payload_key(&wrap_key, &payload_key).unwrap();
        let unwrapped = unwrap_payload_key(&wrap_key, &wrapped.nonce, &wrapped.ciphertext).unwrap();

        assert_eq!(unwrapped, payload_key);
    }

    #[test]
    fn wrap_never_stores_the_plaintext_payload_key_verbatim() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");
        let payload_key = generate_payload_key();

        let wrapped = wrap_payload_key(&wrap_key, &payload_key).unwrap();

        assert_ne!(wrapped.ciphertext, payload_key.to_vec());
    }

    #[test]
    fn unwrap_rejects_the_wrong_wrap_key() {
        let wrap_key = derive_wrap_key(b"device A's own enrollment secret");
        let wrong_wrap_key = derive_wrap_key(b"device B's own enrollment secret");
        let payload_key = generate_payload_key();
        let wrapped = wrap_payload_key(&wrap_key, &payload_key).unwrap();

        let result = unwrap_payload_key(&wrong_wrap_key, &wrapped.nonce, &wrapped.ciphertext);

        assert!(result.is_err());
    }

    #[test]
    fn unwrap_rejects_a_tampered_ciphertext() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");
        let payload_key = generate_payload_key();
        let mut wrapped = wrap_payload_key(&wrap_key, &payload_key).unwrap();
        let last = wrapped.ciphertext.len() - 1;
        wrapped.ciphertext[last] ^= 0xFF;

        let result = unwrap_payload_key(&wrap_key, &wrapped.nonce, &wrapped.ciphertext);

        assert!(result.is_err());
    }

    #[test]
    fn unwrap_rejects_a_tampered_nonce() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");
        let payload_key = generate_payload_key();
        let mut wrapped = wrap_payload_key(&wrap_key, &payload_key).unwrap();
        wrapped.nonce[0] ^= 0xFF;

        let result = unwrap_payload_key(&wrap_key, &wrapped.nonce, &wrapped.ciphertext);

        assert!(result.is_err());
    }

    #[test]
    fn unwrap_rejects_an_undersized_nonce() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");

        let result = unwrap_payload_key(&wrap_key, &[0u8; 4], &[0u8; 32]);

        assert!(result.is_err());
    }

    #[test]
    fn two_wraps_of_the_same_payload_key_use_different_nonces() {
        let wrap_key = derive_wrap_key(b"this device's enrollment secret");
        let payload_key = generate_payload_key();

        let first = wrap_payload_key(&wrap_key, &payload_key).unwrap();
        let second = wrap_payload_key(&wrap_key, &payload_key).unwrap();

        assert_ne!(first.nonce, second.nonce);
        assert_ne!(first.ciphertext, second.ciphertext);
    }

    #[test]
    fn encrypt_then_decrypt_payload_round_trips_arbitrary_length_data() {
        let sspk = generate_payload_key();
        let plaintext = b"a synthetic learner upsert payload, longer than 32 bytes on purpose";

        let blob = encrypt_payload(&sspk, plaintext).unwrap();
        let recovered = decrypt_payload(&sspk, &blob).unwrap();

        assert_eq!(recovered, plaintext);
    }

    #[test]
    fn encrypt_payload_never_stores_the_plaintext_verbatim() {
        let sspk = generate_payload_key();
        let plaintext = b"plaintext learner data that must never appear as-is";

        let blob = encrypt_payload(&sspk, plaintext).unwrap();

        assert!(!blob
            .windows(plaintext.len())
            .any(|window| window == plaintext.as_slice()));
    }

    #[test]
    fn decrypt_payload_rejects_the_wrong_key() {
        let sspk = generate_payload_key();
        let wrong_sspk = generate_payload_key();
        let blob = encrypt_payload(&sspk, b"some payload").unwrap();

        assert!(decrypt_payload(&wrong_sspk, &blob).is_err());
    }

    #[test]
    fn decrypt_payload_rejects_tampered_ciphertext() {
        let sspk = generate_payload_key();
        let mut blob = encrypt_payload(&sspk, b"some payload").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xFF;

        assert!(decrypt_payload(&sspk, &blob).is_err());
    }

    #[test]
    fn decrypt_payload_rejects_a_blob_too_short_to_contain_a_nonce() {
        let sspk = generate_payload_key();

        assert!(decrypt_payload(&sspk, &[0u8; 4]).is_err());
    }

    #[test]
    fn two_encryptions_of_the_same_plaintext_use_different_nonces_and_ciphertexts() {
        let sspk = generate_payload_key();
        let plaintext = b"same plaintext both times";

        let first = encrypt_payload(&sspk, plaintext).unwrap();
        let second = encrypt_payload(&sspk, plaintext).unwrap();

        assert_ne!(first, second);
    }

    #[test]
    fn encrypt_payload_round_trips_an_empty_plaintext() {
        // Not expected in practice (sync_outbox's own CHECK constraint
        // rejects an empty encrypted_payload), but the cipher primitive
        // itself must not special-case or panic on empty input.
        let sspk = generate_payload_key();

        let blob = encrypt_payload(&sspk, b"").unwrap();
        let recovered = decrypt_payload(&sspk, &blob).unwrap();

        assert_eq!(recovered, b"");
    }
}
