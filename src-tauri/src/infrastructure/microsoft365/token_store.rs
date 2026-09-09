//! ADR-0088: DPAPI-protected storage for the Official School Repository's
//! Microsoft 365 OAuth refresh token. Never written to SQLite (per
//! `.claude/rules/security-privacy.md`) -- its own file in the app data
//! directory, protected exactly like `crypto::dpapi::DpapiKeyStore`
//! protects the database encryption key, reusing the same Win32 calls
//! via `crypto::{protect_bytes, unprotect_bytes}`.
//!
//! Unlike the database key (generated once, never regenerated), a
//! refresh token ROTATES: Microsoft may return a new refresh token on
//! every refresh exchange (see `oauth::refresh_access_token`'s own doc
//! comment), so this store supports overwrite, not `load_or_create`'s
//! "never regenerate" semantics.
//!
//! Gated `#[cfg(windows)]`/`#[cfg(not(windows))]` exactly like every
//! existing `db::mod.rs` key accessor (`load_encryption_key`,
//! `load_or_mint_sspk`) -- fails closed with a clear error on a
//! non-Windows host rather than falling back to an unprotected store.
//! This means the Windows half's own round-trip tests only compile and
//! run on Windows, matching `crypto::dpapi`'s already-established
//! pattern -- NOT independently re-verified in this Linux dev sandbox
//! (disclosed in `docs/VERIFICATION-DEBT.md`, not claimed as covered).

use std::path::Path;

use crate::error::AppResult;

pub const TOKEN_FILE_NAME: &str = "ms365-refresh-token.bin";

#[cfg(windows)]
mod windows_impl {
    use super::*;
    use crate::crypto::{protect_bytes, unprotect_bytes};
    use crate::error::AppError;

    /// Reads the currently stored refresh token, if any. Returns `Ok(None)`
    /// only when no file exists yet (never connected, or already
    /// disconnected) -- an existing file that fails to decrypt is a hard
    /// error, never silently treated as "not connected," matching
    /// `DpapiKeyStore::load_or_create_key`'s own fail-closed discipline.
    pub fn load(token_file: &Path) -> AppResult<Option<String>> {
        if !token_file.exists() {
            return Ok(None);
        }
        let protected = std::fs::read(token_file)?;
        let unprotected = unprotect_bytes(&protected).map_err(|_| {
            AppError::key_store(
                "the stored Microsoft 365 refresh token could not be decrypted; refusing to \
                 treat this as \"not connected\" -- reconnect explicitly instead",
            )
        })?;
        let token = String::from_utf8(unprotected)
            .map_err(|_| AppError::key_store("stored refresh token was not valid UTF-8"))?;
        Ok(Some(token))
    }

    /// Overwrites `token_file` with `token`, atomically (temp file in the
    /// same directory + rename -- same technique as
    /// `dpapi::rotate_key_file`, so a crash mid-write can never leave a
    /// half-written token file). Used both for the initial connect and
    /// every later token-rotation.
    pub fn store(token_file: &Path, token: &str) -> AppResult<()> {
        let parent = token_file.parent().ok_or_else(|| {
            AppError::key_store("token file path has no parent directory".to_string())
        })?;
        let temp_file = parent.join(format!(".{}.ms365-token-tmp", random_suffix()));

        let protected = protect_bytes(token.as_bytes())?;
        std::fs::write(&temp_file, &protected)?;
        let rename_result = std::fs::rename(&temp_file, token_file);
        if rename_result.is_err() {
            let _ = std::fs::remove_file(&temp_file);
        }
        rename_result.map_err(AppError::from)
    }

    /// Deletes the stored token, if any (disconnect). Never errors when
    /// there was nothing to delete.
    pub fn clear(token_file: &Path) -> AppResult<()> {
        match std::fs::remove_file(token_file) {
            Ok(()) => Ok(()),
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(()),
            Err(e) => Err(e.into()),
        }
    }

    fn random_suffix() -> String {
        let mut bytes = [0u8; 8];
        rand::fill(&mut bytes);
        bytes.iter().map(|b| format!("{b:02x}")).collect()
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        #[test]
        fn load_returns_none_when_no_file_exists_yet() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);

            assert_eq!(load(&file).unwrap(), None);
        }

        #[test]
        fn store_then_load_round_trips_the_exact_token() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);

            store(&file, "a-refresh-token-value").unwrap();

            assert_eq!(
                load(&file).unwrap().as_deref(),
                Some("a-refresh-token-value")
            );
        }

        #[test]
        fn store_never_writes_the_plaintext_token_to_disk() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);

            store(&file, "super-secret-refresh-token-marker").unwrap();

            let raw = std::fs::read(&file).unwrap();
            assert!(
                !raw.windows(b"super-secret-refresh-token-marker".len())
                    .any(|w| w == b"super-secret-refresh-token-marker"),
                "the raw file must never contain the plaintext token bytes"
            );
        }

        #[test]
        fn store_overwrites_an_existing_token_rather_than_failing() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);
            store(&file, "old-token").unwrap();

            store(&file, "rotated-token").unwrap();

            assert_eq!(load(&file).unwrap().as_deref(), Some("rotated-token"));
        }

        #[test]
        fn store_never_leaves_a_temp_file_behind() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);

            store(&file, "token").unwrap();

            let leftover: Vec<_> = std::fs::read_dir(dir.path())
                .unwrap()
                .filter_map(|e| e.ok())
                .filter(|e| e.path() != file)
                .collect();
            assert!(
                leftover.is_empty(),
                "found leftover temp file(s): {leftover:?}"
            );
        }

        #[test]
        fn clear_removes_an_existing_token_and_load_then_sees_none() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);
            store(&file, "token").unwrap();

            clear(&file).unwrap();

            assert_eq!(load(&file).unwrap(), None);
        }

        #[test]
        fn clear_is_a_no_op_when_nothing_was_ever_stored() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);

            assert!(clear(&file).is_ok());
        }

        #[test]
        fn load_fails_closed_on_a_corrupted_token_file_rather_than_reporting_not_connected() {
            let dir = tempfile::tempdir().unwrap();
            let file = dir.path().join(TOKEN_FILE_NAME);
            std::fs::write(&file, b"not a real DPAPI blob").unwrap();

            let result = load(&file);

            assert!(
                result.is_err(),
                "a corrupted token file must be a hard error, never silently \"not connected\""
            );
        }
    }
}

#[cfg(windows)]
pub use windows_impl::{clear, load, store};

/// See `db::open_app_db`'s non-Windows counterpart -- same fail-closed
/// reasoning: LIKHA-SIS ships on Windows only today (CLAUDE.md), and
/// there is no non-DPAPI secret store implemented for any other
/// platform.
#[cfg(not(windows))]
pub fn load(_token_file: &Path) -> AppResult<Option<String>> {
    Err(crate::error::AppError::key_store(
        "no secret store is implemented for this platform; LIKHA-SIS currently ships on \
         Windows only",
    ))
}

#[cfg(not(windows))]
pub fn store(_token_file: &Path, _token: &str) -> AppResult<()> {
    Err(crate::error::AppError::key_store(
        "no secret store is implemented for this platform; LIKHA-SIS currently ships on \
         Windows only",
    ))
}

#[cfg(not(windows))]
pub fn clear(_token_file: &Path) -> AppResult<()> {
    Err(crate::error::AppError::key_store(
        "no secret store is implemented for this platform; LIKHA-SIS currently ships on \
         Windows only",
    ))
}
