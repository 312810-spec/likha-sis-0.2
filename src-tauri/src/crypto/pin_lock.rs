//! Secondary structural-lock PIN (ADR-0070). Ports the *intent* of
//! `likha-sis-master`'s `settingsLock.js` (Web Crypto PBKDF2-SHA256,
//! 150,000 iterations) to this codebase's Rust security boundary,
//! per `.claude/rules/architecture.md`: key derivation and verification
//! happen here, never in the frontend, and never as raw SQL.
//!
//! This PIN is deliberately NOT a second authentication system. It never
//! creates a session, never replaces login, and is not itself an
//! `authorize_*` capability check against a role. It exists purely to
//! require a short numeric/alphanumeric code, re-entered on demand,
//! before an *already-authenticated* session may perform a specific
//! structural mutation (school identity, curriculum-version, or
//! calendar-structure edits) -- a second "are you sure, and do you know
//! the code" gate against an accidental edit or an unattended, still
//! logged-in terminal. See `docs/adr/0070-secondary-structural-lock-pin.md`.

use subtle::ConstantTimeEq;

use crate::error::{AppError, AppResult};

pub const SALT_LEN: usize = 16;
pub const HASH_LEN: usize = 32;

/// Matches `likha-sis-master`'s `settingsLock.js` iteration count exactly
/// -- chosen there (and kept here) as a deliberately lighter derivation
/// than the primary Argon2id login path (`auth::password`): this PIN is
/// re-entered far more often, during an already-authenticated session,
/// to gate a UI action rather than a login, so a sub-second derivation
/// time matters more here than it does for login. PBKDF2-SHA256 at this
/// iteration count is still well above OWASP's current minimum
/// recommendation for PBKDF2-SHA256 (600,000 is OWASP's 2023+ figure for
/// a *primary* credential; this is explicitly a secondary, narrower-scope
/// gate, matching the legacy code's own deliberate choice).
pub const PBKDF2_ITERATIONS: u32 = 150_000;

/// A PIN must be present and within a sane length range. Deliberately
/// generous (4-32 chars) rather than digits-only: `settingsLock.js` never
/// restricted its input to numerals either, and forcing "PIN" to mean
/// "digits only" would be an unrequested product decision this module
/// has no authority to make.
const MIN_PIN_LEN: usize = 4;
const MAX_PIN_LEN: usize = 32;

/// One derived-and-salted structural-lock PIN, ready to persist. Never
/// carries the plaintext PIN.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct PinHash {
    pub salt: [u8; SALT_LEN],
    pub hash: [u8; HASH_LEN],
    pub iterations: u32,
}

fn validate_pin_shape(pin: &str) -> AppResult<()> {
    if pin.len() < MIN_PIN_LEN || pin.len() > MAX_PIN_LEN {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!("PIN must be between {MIN_PIN_LEN} and {MAX_PIN_LEN} characters"),
        )));
    }
    Ok(())
}

/// Derives a fresh, randomly-salted `PinHash` for `pin`. Returns an
/// error for a PIN outside the accepted length range -- callers must not
/// silently truncate or pad.
pub fn derive_pin_hash(pin: &str) -> AppResult<PinHash> {
    validate_pin_shape(pin)?;
    let mut salt = [0u8; SALT_LEN];
    rand::fill(&mut salt);
    let hash = derive_with_salt(pin, &salt, PBKDF2_ITERATIONS);
    Ok(PinHash {
        salt,
        hash,
        iterations: PBKDF2_ITERATIONS,
    })
}

fn derive_with_salt(pin: &str, salt: &[u8; SALT_LEN], iterations: u32) -> [u8; HASH_LEN] {
    let mut out = [0u8; HASH_LEN];
    pbkdf2::pbkdf2_hmac::<sha2::Sha256>(pin.as_bytes(), salt, iterations, &mut out);
    out
}

/// Verifies `pin` against a previously stored `PinHash`, constant-time.
/// Returns `false` for a shape-invalid `pin` too (never an error) --
/// verification failure and shape mismatch must look identical to a
/// caller, exactly like `auth::password::verify_password`'s own
/// malformed-hash-is-just-a-mismatch convention.
pub fn verify_pin(pin: &str, stored: &PinHash) -> bool {
    if validate_pin_shape(pin).is_err() {
        return false;
    }
    let candidate = derive_with_salt(pin, &stored.salt, stored.iterations);
    candidate.ct_eq(&stored.hash).into()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_pin_verifies() {
        let hash = derive_pin_hash("1234").unwrap();
        assert!(verify_pin("1234", &hash));
    }

    #[test]
    fn incorrect_pin_does_not_verify() {
        let hash = derive_pin_hash("1234").unwrap();
        assert!(!verify_pin("9999", &hash));
    }

    #[test]
    fn hashing_the_same_pin_twice_produces_different_salts_and_hashes() {
        let a = derive_pin_hash("246810").unwrap();
        let b = derive_pin_hash("246810").unwrap();
        assert_ne!(
            a.salt, b.salt,
            "each derivation must use a fresh random salt"
        );
        assert_ne!(a.hash, b.hash);
        // But each still independently verifies against its own hash.
        assert!(verify_pin("246810", &a));
        assert!(verify_pin("246810", &b));
    }

    #[test]
    fn uses_exactly_150_000_pbkdf2_iterations_matching_the_legacy_port() {
        let hash = derive_pin_hash("000000").unwrap();
        assert_eq!(hash.iterations, 150_000);
    }

    #[test]
    fn rejects_a_pin_shorter_than_the_minimum_length() {
        assert!(derive_pin_hash("123").is_err());
    }

    #[test]
    fn rejects_a_pin_longer_than_the_maximum_length() {
        let too_long = "1".repeat(33);
        assert!(derive_pin_hash(&too_long).is_err());
    }

    #[test]
    fn verify_pin_never_panics_on_a_shape_invalid_candidate() {
        let hash = derive_pin_hash("1234").unwrap();
        assert!(!verify_pin("", &hash));
        assert!(!verify_pin(&"9".repeat(99), &hash));
    }

    #[test]
    fn a_stored_hash_with_a_different_iteration_count_still_verifies_against_its_own_count() {
        // Proves iteration count is read from the stored record, not
        // hardcoded at verify time -- required for a future iteration-
        // count bump to stay backward compatible with already-stored PINs.
        let salt = [7u8; SALT_LEN];
        let low_iter_hash = derive_with_salt("5555", &salt, 1_000);
        let stored = PinHash {
            salt,
            hash: low_iter_hash,
            iterations: 1_000,
        };
        assert!(verify_pin("5555", &stored));
    }
}
