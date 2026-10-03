//! Portable installation recovery, used by the native backup commands.
//!
//! SQLCipher export captures committed WAL records into a separately encrypted
//! snapshot. Argon2id + AES-GCM protect its key, optional hub payload key, and
//! bytes. Restore only creates a new directory, rekeys for the new device, and
//! disables automatic client synchronization. The source device must be retired
//! before using the recovery copy as the replacement installation.
use std::io::{Read, Write};
use std::path::Path;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use argon2::{Algorithm, Argon2, Params, Version};
use rusqlite::Connection;
use zeroize::Zeroizing;

use crate::crypto::{self, KeyStore, KEY_LEN};
use crate::db::{self, DB_FILE_NAME, KEY_FILE_NAME, SSPK_KEY_FILE_NAME};
use crate::error::AppError;

const MAGIC: &[u8; 8] = b"LIKHAB01";
const HEADER_LEN: usize = 8 + 16 + 12;
const MAX_DATABASE_BYTES: usize = 256 * 1024 * 1024;
const MAX_ARCHIVE_BYTES: usize = MAX_DATABASE_BYTES + HEADER_LEN + 65 + 16;
const MIN_PASSWORD_CHARS: usize = 12;

#[derive(Debug)]
pub enum BackupError {
    InvalidPassword,
    InvalidArchive,
    TooLarge,
    DestinationExists,
    Storage(AppError),
}

impl std::fmt::Display for BackupError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::InvalidPassword => "use a recovery password of 12 to 1024 characters",
            Self::InvalidArchive => "wrong recovery password or damaged/unsupported backup",
            Self::TooLarge => "backup exceeds the 256 MiB database limit",
            Self::DestinationExists => "recovery destination already exists",
            Self::Storage(_) => "backup storage operation failed",
        })
    }
}
impl std::error::Error for BackupError {}
impl From<AppError> for BackupError {
    fn from(e: AppError) -> Self {
        Self::Storage(e)
    }
}
impl From<rusqlite::Error> for BackupError {
    fn from(e: rusqlite::Error) -> Self {
        Self::Storage(e.into())
    }
}
impl From<std::io::Error> for BackupError {
    fn from(e: std::io::Error) -> Self {
        Self::Storage(e.into())
    }
}
type Result<T> = std::result::Result<T, BackupError>;

fn derive_key(password: &str, salt: &[u8]) -> Result<Zeroizing<[u8; KEY_LEN]>> {
    if !(MIN_PASSWORD_CHARS..=1024).contains(&password.chars().count()) {
        return Err(BackupError::InvalidPassword);
    }
    // Fixed, versioned parameters: archive bytes cannot request an expensive KDF.
    let params =
        Params::new(64 * 1024, 3, 1, Some(KEY_LEN)).map_err(|_| BackupError::InvalidArchive)?;
    let mut key = Zeroizing::new([0; KEY_LEN]);
    Argon2::new(Algorithm::Argon2id, Version::V0x13, params)
        .hash_password_into(password.as_bytes(), salt, key.as_mut())
        .map_err(|_| BackupError::InvalidArchive)?;
    Ok(key)
}

fn read_bounded(path: &Path, limit: usize) -> Result<Vec<u8>> {
    let file = std::fs::File::open(path)?;
    if file.metadata()?.len() > limit as u64 {
        return Err(BackupError::TooLarge);
    }
    let mut bytes = Vec::new();
    file.take(limit as u64 + 1).read_to_end(&mut bytes)?;
    if bytes.len() > limit {
        return Err(BackupError::TooLarge);
    }
    Ok(bytes)
}

fn check_database(conn: &Connection) -> Result<()> {
    let integrity: String = conn.query_row("PRAGMA integrity_check", [], |row| row.get(0))?;
    if integrity != "ok" || conn.prepare("PRAGMA foreign_key_check")?.exists([])? {
        return Err(BackupError::InvalidArchive);
    }
    Ok(())
}

/// Caller holds its database lock for the entire snapshot. Never replaces a
/// backup file; save to a new name. `sspk` must be the existing hub key, never a
/// newly minted fallback. An authorized installation-wide caller is required:
/// the snapshot includes all schools/accounts, not just the active advisory.
pub fn create(
    conn: &Connection,
    destination: &Path,
    password: &str,
    sspk: Option<&[u8; KEY_LEN]>,
) -> Result<()> {
    if destination.exists() {
        return Err(BackupError::DestinationExists);
    }
    let mut header = [0; HEADER_LEN];
    header[..8].copy_from_slice(MAGIC);
    rand::fill(&mut header[8..]);
    let password_key = derive_key(password, &header[8..24])?;
    let pages: i64 = conn.query_row("PRAGMA page_count", [], |r| r.get(0))?;
    // SQLCipher returns its page-size pragma as text, unlike stock SQLite.
    let page_size: String = conn.query_row("PRAGMA cipher_page_size", [], |r| r.get(0))?;
    let page_size: i64 = page_size.parse().map_err(|_| BackupError::InvalidArchive)?;
    if pages.saturating_mul(page_size) > MAX_DATABASE_BYTES as i64 {
        return Err(BackupError::TooLarge);
    }
    let snapshot_key = Zeroizing::new(crypto::generate_key());
    let parent = destination.parent().unwrap_or(Path::new("."));
    let temp = tempfile::tempdir_in(parent)?;
    let snapshot = temp.path().join(DB_FILE_NAME);
    let literal = Zeroizing::new(crypto::key_to_sqlcipher_literal(&snapshot_key));
    // Path is bound, not interpolated. Raw key literal contains only generated hex.
    let attach = Zeroizing::new(format!(
        "ATTACH DATABASE ?1 AS recovery_snapshot KEY \"{}\"",
        *literal
    ));
    conn.execute(
        &attach,
        [snapshot.to_str().ok_or(BackupError::InvalidArchive)?],
    )?;
    let export_result = (|| -> Result<()> {
        let tx = conn.unchecked_transaction()?;
        let schema_version: i64 = tx.query_row("PRAGMA main.user_version", [], |r| r.get(0))?;
        tx.query_row("SELECT sqlcipher_export('recovery_snapshot')", [], |_| {
            Ok(())
        })?;
        // sqlcipher_export does not copy user_version; migrations need it.
        tx.pragma_update(Some("recovery_snapshot"), "user_version", schema_version)?;
        tx.commit()?;
        Ok(())
    })();
    let detach_result = conn.execute_batch("DETACH DATABASE recovery_snapshot");
    export_result?;
    detach_result?;
    let database = read_bounded(&snapshot, MAX_DATABASE_BYTES)?;
    let mut payload = Zeroizing::new(Vec::with_capacity(65 + database.len()));
    payload.extend_from_slice(snapshot_key.as_ref());
    payload.push(u8::from(sspk.is_some()));
    payload.extend_from_slice(sspk.unwrap_or(&[0; KEY_LEN]));
    payload.extend_from_slice(&database);
    let cipher = Aes256Gcm::new_from_slice(password_key.as_ref())
        .map_err(|_| BackupError::InvalidArchive)?;
    let nonce = Nonce::try_from(&header[24..]).map_err(|_| BackupError::InvalidArchive)?;
    let ciphertext = cipher
        .encrypt(
            &nonce,
            Payload {
                msg: &payload,
                aad: &header,
            },
        )
        .map_err(|_| BackupError::InvalidArchive)?;
    let mut output = tempfile::NamedTempFile::new_in(parent)?;
    output.write_all(&header)?;
    output.write_all(&ciphertext)?;
    output.as_file().sync_all()?;
    output.persist_noclobber(destination).map_err(|e| {
        if e.error.kind() == std::io::ErrorKind::AlreadyExists {
            BackupError::DestinationExists
        } else {
            e.error.into()
        }
    })?;
    Ok(())
}

/// Restore into a NEW directory. An existing installation is never modified.
/// Failure removes the directory this call created; its contents are encrypted
/// even during staging. Caller must not open this directory before success.
/// Automatic client synchronization requires explicit re-enrollment afterwards.
pub fn restore(
    archive: &Path,
    destination: &Path,
    password: &str,
    store: &dyn KeyStore,
) -> Result<()> {
    let archive = read_bounded(archive, MAX_ARCHIVE_BYTES)?;
    if archive.len() < HEADER_LEN + 65 + 16 || &archive[..8] != MAGIC {
        return Err(BackupError::InvalidArchive);
    }
    let header = &archive[..HEADER_LEN];
    let password_key = derive_key(password, &header[8..24])?;
    let cipher = Aes256Gcm::new_from_slice(password_key.as_ref())
        .map_err(|_| BackupError::InvalidArchive)?;
    let nonce = Nonce::try_from(&header[24..]).map_err(|_| BackupError::InvalidArchive)?;
    let payload = Zeroizing::new(
        cipher
            .decrypt(
                &nonce,
                Payload {
                    msg: &archive[HEADER_LEN..],
                    aad: header,
                },
            )
            .map_err(|_| BackupError::InvalidArchive)?,
    );
    if payload.len() <= 65 || payload[32] > 1 {
        return Err(BackupError::InvalidArchive);
    }
    let snapshot_key = Zeroizing::new(
        <[u8; KEY_LEN]>::try_from(&payload[..32]).map_err(|_| BackupError::InvalidArchive)?,
    );
    // Exclusive reservation prevents racing recovery requests from overwriting.
    std::fs::create_dir(destination).map_err(|e| {
        if e.kind() == std::io::ErrorKind::AlreadyExists {
            BackupError::DestinationExists
        } else {
            e.into()
        }
    })?;
    let result = (|| -> Result<()> {
        let path = destination.join(DB_FILE_NAME);
        let mut file = std::fs::OpenOptions::new()
            .write(true)
            .create_new(true)
            .open(&path)?;
        file.write_all(&payload[65..])?;
        file.sync_all()?;
        drop(file);
        let conn = db::open(&path, &snapshot_key)?;
        check_database(&conn)?;
        // Preserve teacher edits/review/outbox, but do not clone a running
        // client's bearer identity onto a replacement device automatically.
        conn.execute("DELETE FROM device_sync_client_credential", [])?;
        let device_key = Zeroizing::new(crypto::generate_key());
        let literal = Zeroizing::new(crypto::key_to_sqlcipher_literal(&device_key));
        let rekey = Zeroizing::new(format!("PRAGMA rekey = \"{}\";", *literal));
        conn.execute_batch(&rekey)?;
        check_database(&conn)?;
        conn.execute_batch("PRAGMA wal_checkpoint(TRUNCATE);")?;
        drop(conn);
        store.store_recovery_key(&destination.join(KEY_FILE_NAME), &device_key)?;
        if payload[32] == 1 {
            let sspk = Zeroizing::new(
                <[u8; KEY_LEN]>::try_from(&payload[33..65])
                    .map_err(|_| BackupError::InvalidArchive)?,
            );
            store.store_recovery_key(&destination.join(SSPK_KEY_FILE_NAME), &sspk)?;
        }
        // Prove the protected key can actually reopen before reporting success.
        let key = Zeroizing::new(store.load_or_create_key(&destination.join(KEY_FILE_NAME))?);
        check_database(&db::open(&path, &key)?)?;
        Ok(())
    })();
    if result.is_err() {
        let _ = std::fs::remove_dir_all(destination);
    }
    result
}

#[cfg(test)]
mod tests {
    use super::*;

    // Simulates a DIFFERENT device's key protection without native DPAPI in Linux tests.
    struct TestStore {
        mask: u8,
        fail: bool,
    }
    impl KeyStore for TestStore {
        fn load_or_create_key(&self, path: &Path) -> crate::error::AppResult<[u8; KEY_LEN]> {
            let mut bytes = std::fs::read(path)?;
            for b in &mut bytes {
                *b ^= self.mask;
            }
            bytes
                .try_into()
                .map_err(|_| AppError::key_store("invalid test key"))
        }
        fn rotate_key(&self, _: &Path) -> crate::error::AppResult<[u8; KEY_LEN]> {
            unreachable!("recovery must not rotate existing keys")
        }
        fn store_recovery_key(
            &self,
            path: &Path,
            key: &[u8; KEY_LEN],
        ) -> crate::error::AppResult<()> {
            if self.fail {
                return Err(AppError::key_store("injected protection failure"));
            }
            let mut file = std::fs::OpenOptions::new()
                .create_new(true)
                .write(true)
                .open(path)?;
            file.write_all(&key.map(|b| b ^ self.mask))?;
            file.sync_all()?;
            Ok(())
        }
    }
    const PASSWORD: &str = "synthetic recovery phrase only";

    #[test]
    fn live_wal_records_recover_under_new_device_key_with_pending_work() {
        let dir = tempfile::tempdir().unwrap();
        let original_key = crypto::generate_key();
        let conn = db::open(&dir.path().join("source.db"), &original_key).unwrap();
        conn.execute_batch("PRAGMA wal_autocheckpoint=0;").unwrap();
        let school = crate::repository::school::create(&conn, "Synthetic WAL School").unwrap();
        conn.execute("INSERT INTO device_sync_client_credential (school_id, credential_id, device_secret_hex) VALUES (?1, 'synthetic', 'secret')", [&school.id]).unwrap();
        conn.execute_batch("CREATE TABLE recovery_fixture (value TEXT NOT NULL); INSERT INTO recovery_fixture VALUES ('unsynced teacher work');").unwrap();
        let schema: i64 = conn
            .query_row("PRAGMA user_version", [], |r| r.get(0))
            .unwrap();
        let sspk = crypto::generate_key();
        let pending_payload =
            crypto::payload_key::encrypt_payload(&sspk, b"synthetic pending score").unwrap();
        conn.execute("INSERT INTO sync_outbox (change_id, school_id, device_id, actor_user_id, entity_kind, entity_id, base_version, operation, encrypted_payload) VALUES ('pending-change', ?1, 'synthetic-device', 'synthetic-teacher', 'learner_score', 'synthetic-score', 0, 'upsert', ?2)", (&school.id, &pending_payload)).unwrap();
        let archive = dir.path().join("recovery.likhabak");
        create(&conn, &archive, PASSWORD, Some(&sspk)).unwrap();
        let bytes = std::fs::read(&archive).unwrap();
        assert!(!bytes
            .windows(b"Synthetic WAL School".len())
            .any(|w| w == b"Synthetic WAL School"));
        assert!(!bytes.windows(KEY_LEN).any(|w| w == sspk));
        let destination = dir.path().join("replacement");
        let store = TestStore {
            mask: 173,
            fail: false,
        };
        restore(&archive, &destination, PASSWORD, &store).unwrap();
        let new_key = store
            .load_or_create_key(&destination.join(KEY_FILE_NAME))
            .unwrap();
        assert_ne!(new_key, original_key);
        let recovered = db::open(&destination.join(DB_FILE_NAME), &new_key).unwrap();
        assert_eq!(
            crate::repository::school::find_by_id(&recovered, &school.id)
                .unwrap()
                .unwrap()
                .name,
            "Synthetic WAL School"
        );
        assert_eq!(
            recovered
                .query_row::<String, _, _>("SELECT value FROM recovery_fixture", [], |r| r.get(0))
                .unwrap(),
            "unsynced teacher work"
        );
        assert_eq!(
            recovered
                .query_row::<i64, _, _>("PRAGMA user_version", [], |r| r.get(0))
                .unwrap(),
            schema
        );
        assert_eq!(
            recovered
                .query_row::<i64, _, _>(
                    "SELECT count(*) FROM device_sync_client_credential",
                    [],
                    |r| r.get(0)
                )
                .unwrap(),
            0
        );
        assert_eq!(
            store
                .load_or_create_key(&destination.join(SSPK_KEY_FILE_NAME))
                .unwrap(),
            sspk
        );
        let retained: Vec<u8> = recovered
            .query_row(
                "SELECT encrypted_payload FROM sync_outbox WHERE change_id='pending-change'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(
            crypto::payload_key::decrypt_payload(&sspk, &retained).unwrap(),
            b"synthetic pending score"
        );
        assert!(db::open(&destination.join(DB_FILE_NAME), &original_key).is_err());
        assert_eq!(
            conn.query_row::<i64, _, _>(
                "SELECT count(*) FROM device_sync_client_credential",
                [],
                |r| r.get(0)
            )
            .unwrap(),
            1
        );
    }

    #[test]
    fn wrong_password_tampering_and_truncation_never_create_a_destination() {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let archive = dir.path().join("backup");
        create(&conn, &archive, PASSWORD, None).unwrap();
        let original = std::fs::read(&archive).unwrap();
        let target = dir.path().join("target");
        let store = TestStore {
            mask: 42,
            fail: false,
        };
        assert!(restore(&archive, &target, "different recovery password", &store).is_err());
        assert!(!target.exists());
        for position in [0, 8, 24, HEADER_LEN, original.len() - 1] {
            let mut changed = original.clone();
            changed[position] ^= 1;
            std::fs::write(&archive, changed).unwrap();
            assert!(restore(&archive, &target, PASSWORD, &store).is_err());
            assert!(!target.exists());
        }
        std::fs::write(&archive, &original[..original.len() - 1]).unwrap();
        assert!(restore(&archive, &target, PASSWORD, &store).is_err());
        assert!(!target.exists());
    }

    #[test]
    fn existing_files_and_installations_are_preserved_and_failed_key_protection_rolls_back() {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let archive = dir.path().join("backup");
        std::fs::write(&archive, b"keep existing archive").unwrap();
        assert!(matches!(
            create(&conn, &archive, PASSWORD, None),
            Err(BackupError::DestinationExists)
        ));
        assert_eq!(std::fs::read(&archive).unwrap(), b"keep existing archive");
        std::fs::remove_file(&archive).unwrap();
        create(&conn, &archive, PASSWORD, None).unwrap();
        let target = dir.path().join("target");
        let store = TestStore {
            mask: 11,
            fail: true,
        };
        assert!(restore(&archive, &target, PASSWORD, &store).is_err());
        assert!(!target.exists());
        std::fs::create_dir(&target).unwrap();
        std::fs::write(target.join(DB_FILE_NAME), b"existing teacher records").unwrap();
        assert!(matches!(
            restore(&archive, &target, PASSWORD, &store),
            Err(BackupError::DestinationExists)
        ));
        assert_eq!(
            std::fs::read(target.join(DB_FILE_NAME)).unwrap(),
            b"existing teacher records"
        );
    }

    #[test]
    fn short_passwords_and_oversize_files_are_rejected_early() {
        let dir = tempfile::tempdir().unwrap();
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let archive = dir.path().join("backup");
        assert!(matches!(
            create(&conn, &archive, "short", None),
            Err(BackupError::InvalidPassword)
        ));
        assert!(!archive.exists());
        let file = std::fs::File::create(&archive).unwrap();
        file.set_len(MAX_ARCHIVE_BYTES as u64 + 1).unwrap();
        assert!(matches!(
            restore(
                &archive,
                &dir.path().join("target"),
                PASSWORD,
                &TestStore {
                    mask: 0,
                    fail: false
                }
            ),
            Err(BackupError::TooLarge)
        ));
    }
}
