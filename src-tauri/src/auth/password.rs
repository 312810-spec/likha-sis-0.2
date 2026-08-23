use std::sync::LazyLock;

use argon2::password_hash::{
    rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString,
};
use argon2::Argon2;

use crate::error::{AppError, AppResult};

/// A fixed decoy hash used to run a real Argon2id verification even when no
/// matching user exists, so response time does not reveal whether a
/// username is registered — see `verify_dummy_password_for_timing_safety`.
static DUMMY_HASH: LazyLock<String> = LazyLock::new(|| {
    hash_password("not-a-real-password-used-only-for-timing-safety")
        .expect("hashing the fixed dummy password must succeed")
});

/// Hashes a password with Argon2id (RFC 9106 recommended default params),
/// returning a self-describing PHC string (`$argon2id$v=19$...`) with the
/// salt embedded. Never store or compare raw passwords — only this.
pub fn hash_password(password: &str) -> AppResult<String> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|e| {
            log::error!("password hashing failed: {e}");
            AppError::AuthenticationFailed
        })
}

/// Verifies `password` against a stored PHC hash string. Returns `false`
/// both for a genuine mismatch and for a malformed stored hash — either
/// way, the password does not check out.
pub fn verify_password(password: &str, stored_hash: &str) -> bool {
    match PasswordHash::new(stored_hash) {
        Ok(parsed) => Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok(),
        Err(e) => {
            log::error!("stored password hash is not a valid PHC string: {e}");
            false
        }
    }
}

/// Runs a real Argon2id verification against a fixed decoy hash and
/// discards the result. Call this exactly when no user was found, so a
/// login attempt for an unknown username takes about as long as one for a
/// known username with a wrong password — both should feel identical from
/// the outside.
pub fn verify_dummy_password_for_timing_safety(password: &str) {
    let _ = verify_password(password, &DUMMY_HASH);
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn correct_password_verifies() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(verify_password("correct horse battery staple", &hash));
    }

    #[test]
    fn incorrect_password_does_not_verify() {
        let hash = hash_password("correct horse battery staple").unwrap();
        assert!(!verify_password("wrong password", &hash));
    }

    #[test]
    fn hash_is_argon2id_and_never_equals_the_plaintext() {
        let hash = hash_password("hunter2").unwrap();
        assert!(hash.starts_with("$argon2id$"));
        assert_ne!(hash, "hunter2");
    }

    #[test]
    fn hashing_the_same_password_twice_produces_different_hashes() {
        // Proves a random salt is actually used, not a fixed one.
        let a = hash_password("same password").unwrap();
        let b = hash_password("same password").unwrap();
        assert_ne!(a, b);
    }

    #[test]
    fn dummy_verification_runs_without_panicking() {
        verify_dummy_password_for_timing_safety("anything");
    }
}
