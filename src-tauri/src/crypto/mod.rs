#[cfg(windows)]
mod dpapi;

use std::path::Path;

#[cfg(windows)]
pub use dpapi::DpapiKeyStore;

use crate::error::AppResult;

pub const KEY_LEN: usize = 32;

/// Loads or creates the database encryption key.
///
/// Implementations MUST fail loudly (return `Err`) rather than silently
/// minting a new key when a protected key file already exists but cannot
/// be decrypted. Silently generating a replacement key would make the app
/// open (or create) a *different* database than the one the existing key
/// protects, orphaning all previously encrypted data without any warning.
pub trait KeyStore {
    fn load_or_create_key(&self, key_file: &Path) -> AppResult<[u8; KEY_LEN]>;
}

/// Generates a fresh cryptographically random key using the OS CSPRNG.
pub fn generate_key() -> [u8; KEY_LEN] {
    let mut key = [0u8; KEY_LEN];
    rand::fill(&mut key);
    key
}

/// Renders a key as the `x'<hex>'` blob-literal syntax SQLCipher's `PRAGMA
/// key` expects for a raw (non-passphrase) key. This must be spliced into
/// the PRAGMA statement text directly, not bound as a parameter — SQLite's
/// blob-literal syntax is only recognized by the SQL parser itself. This is
/// safe here specifically because the input is always our own hex encoding
/// of raw bytes (`[0-9a-f]` only), never externally supplied text.
pub fn key_to_sqlcipher_literal(key: &[u8; KEY_LEN]) -> String {
    let mut hex = String::with_capacity(KEY_LEN * 2 + 3);
    hex.push_str("x'");
    for byte in key {
        hex.push_str(&format!("{byte:02x}"));
    }
    hex.push('\'');
    hex
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn generate_key_is_not_all_zero_and_varies() {
        let a = generate_key();
        let b = generate_key();
        assert_ne!(a, [0u8; KEY_LEN]);
        assert_ne!(a, b);
    }

    #[test]
    fn key_to_sqlcipher_literal_is_well_formed() {
        let key = [0xABu8; KEY_LEN];
        let literal = key_to_sqlcipher_literal(&key);
        assert_eq!(literal, format!("x'{}'", "ab".repeat(KEY_LEN)));
    }
}
