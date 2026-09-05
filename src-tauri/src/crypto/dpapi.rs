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

    fn rotate_key(&self, key_file: &Path) -> AppResult<[u8; KEY_LEN]> {
        rotate_key_file(key_file).map_err(Into::into)
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

/// Overwrites `key_file` with a genuinely new key, atomically: the fresh
/// key is protected and written to a sibling temp file first, then
/// `rename`d over `key_file`. On the same filesystem (guaranteed here --
/// the temp file is a sibling in `key_file`'s own parent directory, never
/// a system temp dir on a possibly different volume), `rename` is a
/// single filesystem operation that either fully completes or fully
/// fails -- there is no window where `key_file` is missing or
/// half-written, unlike writing directly into it in place. Does not
/// require (or even read) an existing `key_file` -- rotation always
/// succeeds by writing a fresh key, whether or not one was there before.
fn rotate_key_file(key_file: &Path) -> std::io::Result<[u8; KEY_LEN]> {
    use std::io::Write;

    let parent = key_file.parent().ok_or_else(|| {
        std::io::Error::new(
            std::io::ErrorKind::InvalidInput,
            "key file path has no parent directory",
        )
    })?;
    // A random suffix (rather than a fixed ".tmp" name) means two
    // concurrent rotations of the same key file never collide on the
    // temp file itself -- each writes its own, and only the LAST rename
    // to complete wins, which is an acceptable outcome for a rotation
    // (the file always ends up holding one fully-valid key either way,
    // never a mix of two).
    let temp_file = parent.join(format!(".{}.rotate-tmp", generate_key_suffix()));

    let key = generate_key();
    let protected = protect(&key)
        .map_err(|e| std::io::Error::other(format!("could not protect rotated key: {e}")))?;

    let mut file = std::fs::OpenOptions::new()
        .write(true)
        .create_new(true)
        .open(&temp_file)?;
    file.write_all(&protected)?;
    file.sync_all()?;
    drop(file);

    let rename_result = std::fs::rename(&temp_file, key_file);
    if rename_result.is_err() {
        let _ = std::fs::remove_file(&temp_file);
    }
    rename_result?;

    Ok(key)
}

/// A short random hex suffix for `rotate_key_file`'s temp filename --
/// reuses this module's own DPAPI-independent CSPRNG source
/// (`generate_key`) rather than adding a new randomness dependency just
/// for a filename.
fn generate_key_suffix() -> String {
    let bytes = generate_key();
    bytes[..8].iter().map(|b| format!("{b:02x}")).collect()
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

    #[test]
    fn rotate_key_replaces_an_existing_key_with_a_genuinely_different_one() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("sspk.key");
        let store = DpapiKeyStore;
        let original = store.load_or_create_key(&key_file).unwrap();

        let rotated = store.rotate_key(&key_file).unwrap();

        assert_ne!(
            rotated, original,
            "rotation must produce a different key, not the same value"
        );
        let reread = store.load_or_create_key(&key_file).unwrap();
        assert_eq!(
            reread, rotated,
            "a later load must see the ROTATED key, not the original"
        );
    }

    #[test]
    fn rotate_key_succeeds_even_when_no_key_file_exists_yet() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("sspk.key");
        let store = DpapiKeyStore;

        let rotated = store.rotate_key(&key_file).unwrap();

        let reread = store.load_or_create_key(&key_file).unwrap();
        assert_eq!(reread, rotated);
    }

    #[test]
    fn rotate_key_never_leaves_a_temp_file_behind() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("sspk.key");
        let store = DpapiKeyStore;

        store.rotate_key(&key_file).unwrap();

        let leftover: Vec<_> = std::fs::read_dir(dir.path())
            .unwrap()
            .filter_map(|e| e.ok())
            .filter(|e| e.path() != key_file)
            .collect();
        assert!(
            leftover.is_empty(),
            "rotate_key must clean up its temp file on success, found: {leftover:?}"
        );
    }

    #[test]
    fn rotate_key_produces_a_file_that_still_round_trips_through_unprotect() {
        let dir = tempfile::tempdir().unwrap();
        let key_file = dir.path().join("sspk.key");
        let store = DpapiKeyStore;

        let rotated = store.rotate_key(&key_file).unwrap();

        let protected = std::fs::read(&key_file).unwrap();
        let recovered = unprotect(&protected).unwrap();
        assert_eq!(recovered.as_slice(), &rotated[..]);
    }
}
