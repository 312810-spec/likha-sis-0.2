use std::path::Path;

use windows::core::PCWSTR;
use windows::Win32::Foundation::LocalFree;
use windows::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPTPROTECT_UI_FORBIDDEN, CRYPT_INTEGER_BLOB,
};
use zeroize::Zeroize;

use super::{generate_key, KeyStore, KEY_LEN};
use crate::error::{AppError, AppResult};

/// Protects the database encryption key at rest using the Windows Data
/// Protection API (DPAPI), scoped to the current Windows user account.
///
/// This is a defense against a lost/stolen device or another OS user
/// profile on a shared machine reading the raw key file directly — it does
/// NOT defend against malicious code already running as the same logged-in
/// Windows user (a known DPAPI limitation, not something this app can fix
/// without a much heavier hardware-backed key store; acceptable for a v1
/// baseline, revisit if the threat model changes).
pub struct DpapiKeyStore;

impl KeyStore for DpapiKeyStore {
    fn load_or_create_key(&self, key_file: &Path) -> AppResult<[u8; KEY_LEN]> {
        match create_new_key_file(key_file) {
            Ok(key) => Ok(key),
            Err(e) if e.kind() == std::io::ErrorKind::AlreadyExists => load_key(key_file),
            Err(e) => Err(e.into()),
        }
    }
}

fn load_key(key_file: &Path) -> AppResult<[u8; KEY_LEN]> {
    let protected = std::fs::read(key_file)?;
    let mut unprotected = unprotect(&protected).map_err(|e| {
        AppError::key_store(format!(
            "existing key file could not be decrypted ({e}); refusing to generate a \
             replacement key, which would silently orphan the existing encrypted database"
        ))
    })?;
    let result = <[u8; KEY_LEN]>::try_from(unprotected.as_slice())
        .map_err(|_| AppError::key_store("decrypted key has an unexpected length".to_string()));
    unprotected.zeroize();
    result
}

/// Creates `key_file` atomically (`create_new`, so two racing app instances
/// can never both "win" and clobber each other's key) and writes a freshly
/// generated, DPAPI-protected key into it. Returns `io::ErrorKind::AlreadyExists`
/// if another process already created the file first — the caller should
/// then load that existing key instead of treating this as a failure.
fn create_new_key_file(key_file: &Path) -> std::io::Result<[u8; KEY_LEN]> {
    use std::io::Write;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(key_file)?;

    let key = generate_key();
    let protected = protect(&key)
        .map_err(|e| std::io::Error::other(format!("could not protect new key: {e}")))?;
    file.write_all(&protected)?;
    Ok(key)
}

fn protect(data: &[u8]) -> windows::core::Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        CryptProtectData(
            &input,
            PCWSTR::null(),
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )?;

        Ok(copy_and_free(output))
    }
}

fn unprotect(data: &[u8]) -> windows::core::Result<Vec<u8>> {
    unsafe {
        let input = CRYPT_INTEGER_BLOB {
            cbData: data.len() as u32,
            pbData: data.as_ptr() as *mut u8,
        };
        let mut output = CRYPT_INTEGER_BLOB::default();

        CryptUnprotectData(
            &input,
            None,
            None,
            None,
            None,
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut output,
        )?;

        Ok(copy_and_free(output))
    }
}

/// Copies the bytes out of a blob DPAPI allocated for us, then frees that
/// allocation with `LocalFree` as the Win32 docs for `CryptProtectData`/
/// `CryptUnprotectData` require. Guards against a null/empty blob rather
/// than trusting the Win32 success-implies-non-null contract blindly.
unsafe fn copy_and_free(blob: CRYPT_INTEGER_BLOB) -> Vec<u8> {
    let bytes = if blob.pbData.is_null() || blob.cbData == 0 {
        Vec::new()
    } else {
        std::slice::from_raw_parts(blob.pbData, blob.cbData as usize).to_vec()
    };
    if !blob.pbData.is_null() {
        // LocalFree returns NULL on success and the original (non-null)
        // handle back on failure — it does not return a Result here.
        let leftover = LocalFree(Some(windows::Win32::Foundation::HLOCAL(
            blob.pbData as *mut _,
        )));
        if !leftover.0.is_null() {
            log::error!("LocalFree failed while releasing a DPAPI buffer");
        }
    }
    bytes
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn protect_then_unprotect_round_trips() {
        let secret = b"a 32 byte test key material!!!!";
        let protected = protect(secret).unwrap();

        assert_ne!(protected, secret, "protected form must not equal plaintext");

        let recovered = unprotect(&protected).unwrap();
        assert_eq!(recovered, secret);
    }

    #[test]
    fn unprotect_rejects_tampered_data() {
        let secret = b"a 32 byte test key material!!!!";
        let mut protected = protect(secret).unwrap();
        let last = protected.len() - 1;
        protected[last] ^= 0xFF;

        assert!(unprotect(&protected).is_err());
    }

    #[test]
    fn load_or_create_key_persists_and_reloads_the_same_key() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("likha-sis.key");
        let store = DpapiKeyStore;

        let first = store.load_or_create_key(&key_file).unwrap();
        let second = store.load_or_create_key(&key_file).unwrap();

        assert_eq!(first, second);
    }

    #[test]
    fn load_or_create_key_fails_closed_on_corrupted_key_file() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("likha-sis.key");
        std::fs::write(&key_file, b"not a real DPAPI blob").unwrap();
        let store = DpapiKeyStore;

        let result = store.load_or_create_key(&key_file);

        assert!(
            result.is_err(),
            "corrupted key file must error, never silently mint a new key"
        );
    }
}
