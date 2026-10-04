mod migrations;

use std::path::Path;

use rusqlite::Connection;
use tauri::AppHandle;
use tauri::Manager;
use zeroize::Zeroize;

use crate::crypto::KeyStore;
use crate::crypto::{self, KEY_LEN};
use crate::error::AppResult;

pub const DB_FILE_NAME: &str = "likha-sis.db";
pub const KEY_FILE_NAME: &str = "likha-sis.key";
/// ADR-0069's school sync-payload key (SSPK), persisted the same way as
/// the SQLCipher key (`KEY_FILE_NAME`) but in a SEPARATE DPAPI-protected
/// file -- the two key types must never share a file or a value. See
/// `load_or_mint_sspk`.
pub const SSPK_KEY_FILE_NAME: &str = "likha-sis-sspk.key";

/// Opens (creating if needed) a SQLite database at `path`, keyed with
/// `key` (SQLCipher encryption-at-rest — see ADR-0003), applies pragmas
/// required for correctness, and brings the schema to the latest
/// migration. Pure function of a filesystem path and key — no Tauri
/// dependency — so it can be exercised directly in tests.
pub fn open(path: &Path, key: &[u8; KEY_LEN]) -> AppResult<Connection> {
    let mut conn = Connection::open(path)?;

    // Must be the very first statement on the connection: SQLCipher only
    // recognizes PRAGMA key before any other page of the file is touched.
    // The literal is spliced directly (see key_to_sqlcipher_literal's
    // safety note) — SQLite blob-literal syntax cannot be bound as a
    // parameter. Both intermediate strings hold raw key hex, so they are
    // wiped immediately after the statement runs rather than left for the
    // allocator to reuse verbatim.
    let mut literal = crypto::key_to_sqlcipher_literal(key);
    let mut pragma_sql = format!("PRAGMA key = \"{literal}\";");
    let key_result = conn.execute_batch(&pragma_sql);
    pragma_sql.zeroize();
    literal.zeroize();
    key_result?;

    // Pins the exact cipher/KDF/page-size bundle SQLCipher 4 defaults to,
    // so a future SQLCipher major-version upgrade in this dependency can't
    // silently change the on-disk format and break opening databases this
    // version created. Irrelevant to key derivation here (we use a raw key,
    // not a passphrase) but still governs the cipher/HMAC/page settings.
    conn.execute_batch("PRAGMA cipher_compatibility = 4;")?;

    // Required every connection: SQLite defaults foreign key enforcement to
    // OFF for backward compatibility.
    conn.pragma_update(None, "foreign_keys", "ON")?;
    // Write-ahead logging: better crash resilience and checkpointing, and
    // lets external tools (e.g. a "open db while app is running" inspector)
    // read concurrently. All in-process writes are already serialized by
    // the caller's Mutex<Connection>, so WAL isn't needed for that; it's a
    // no-op on the in-memory databases used by some tests either way.
    // `journal_mode` always returns the resulting mode as a row, so it
    // needs the `_and_check` variant.
    conn.pragma_update_and_check(None, "journal_mode", "WAL", |_row| Ok(()))?;
    // Wait instead of immediately failing with SQLITE_BUSY under contention.
    conn.pragma_update(None, "busy_timeout", 5000)?;

    migrations::migrations().to_latest(&mut conn)?;

    Ok(conn)
}

pub(crate) fn base_data_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;
    Ok(dir)
}

pub(crate) const RECOVERY_POINTER: &str = "active-recovery";

/// A recovery pointer is published only after the recovered database and
/// device-protected keys have been validated. Never accept an arbitrary path.
pub(crate) fn selected_data_dir(base: &Path) -> AppResult<std::path::PathBuf> {
    let pointer = base.join(RECOVERY_POINTER);
    if !pointer.exists() {
        return Ok(base.to_path_buf());
    }
    if std::fs::metadata(&pointer)?.len() > 36 {
        return Err(crate::error::AppError::key_store(
            "invalid recovery pointer",
        ));
    }
    let id = std::fs::read_to_string(pointer)?;
    let id = uuid::Uuid::parse_str(&id)
        .map_err(|_| crate::error::AppError::key_store("invalid recovery pointer"))?;
    let dir = base.join(format!("recovery-{id}"));
    if !dir.join(DB_FILE_NAME).is_file() || !protected_key_exists(&dir.join(KEY_FILE_NAME)) {
        return Err(crate::error::AppError::key_store(
            "recovery installation is incomplete",
        ));
    }
    Ok(dir)
}

pub(crate) fn app_data_dir(app: &AppHandle) -> AppResult<std::path::PathBuf> {
    selected_data_dir(&base_data_dir(app)?)
}

/// Opens using a platform adapter. A key failure must not replace the existing database.
pub(crate) fn open_with_key_store(dir: &Path, store: &dyn KeyStore) -> AppResult<Connection> {
    let key_path = dir.join(KEY_FILE_NAME);
    if dir.join(DB_FILE_NAME).exists() && !protected_key_exists(&key_path) {
        return Err(crate::error::AppError::key_store("existing database encryption key is missing"));
    }
    let mut key = store.load_or_create_key(&key_path)?;
    let result = open(&dir.join(DB_FILE_NAME), &key);
    key.zeroize();
    result
}

fn protected_key_exists(path: &Path) -> bool {
    path.exists() || path.with_file_name(format!("{}.bak", path.file_name().unwrap_or_default().to_string_lossy())).exists()
}

pub fn open_app_db(app: &AppHandle) -> AppResult<Connection> {
    let store = crypto::platform::key_store()?;
    open_with_key_store(&app_data_dir(app)?, store.as_ref())
}

pub fn load_or_mint_sspk(app: &AppHandle) -> AppResult<[u8; KEY_LEN]> {
    let store = crypto::platform::key_store()?;
    store.load_or_create_key(&app_data_dir(app)?.join(SSPK_KEY_FILE_NAME))
}

pub fn rotate_sspk(app: &AppHandle) -> AppResult<[u8; KEY_LEN]> {
    let store = crypto::platform::key_store()?;
    store.rotate_key(&app_data_dir(app)?.join(SSPK_KEY_FILE_NAME))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn recovery_selection_rejects_paths_and_incomplete_installations() {
        let dir = tempfile::tempdir().unwrap();
        assert_eq!(selected_data_dir(dir.path()).unwrap(), dir.path());
        let pointer = dir.path().join(RECOVERY_POINTER);
        std::fs::write(&pointer, "../some-other-installation").unwrap();
        assert!(selected_data_dir(dir.path()).is_err());
        let id = uuid::Uuid::now_v7();
        std::fs::write(&pointer, id.to_string()).unwrap();
        assert!(selected_data_dir(dir.path()).is_err());
        let recovered = dir.path().join(format!("recovery-{id}"));
        std::fs::create_dir(&recovered).unwrap();
        std::fs::write(recovered.join(DB_FILE_NAME), b"fixture").unwrap();
        assert!(selected_data_dir(dir.path()).is_err());
        std::fs::write(recovered.join(KEY_FILE_NAME), b"fixture").unwrap();
        assert_eq!(selected_data_dir(dir.path()).unwrap(), recovered);
    }

    struct TestKeyStore {
        fail: bool,
    }
    impl KeyStore for TestKeyStore {
        fn load_or_create_key(&self, _path: &Path) -> AppResult<[u8; KEY_LEN]> {
            if self.fail {
                Err(crate::error::AppError::key_store("injected unwrap failure"))
            } else {
                std::fs::write(_path, b"synthetic protected key")?;
                Ok([0x27; KEY_LEN])
            }
        }
        fn rotate_key(&self, path: &Path) -> AppResult<[u8; KEY_LEN]> {
            self.load_or_create_key(path)
        }
    }

    #[test]
    fn platform_adapter_reopens_persisted_encrypted_records() {
        let dir = tempfile::tempdir().unwrap();
        let store = TestKeyStore { fail: false };
        let conn = open_with_key_store(dir.path(), &store).unwrap();
        crate::repository::school::create(&conn, "Synthetic School").unwrap();
        drop(conn);
        let reopened = open_with_key_store(dir.path(), &store).unwrap();
        let count: i64 = reopened
            .query_row("SELECT COUNT(*) FROM schools", [], |r| r.get(0))
            .unwrap();
        assert_eq!(count, 1);
    }

    #[test]
    fn failed_key_unwrap_never_changes_or_creates_database() {
        let dir = tempfile::tempdir().unwrap();
        let failure = TestKeyStore { fail: true };
        assert!(open_with_key_store(dir.path(), &failure).is_err());
        assert!(!dir.path().join(DB_FILE_NAME).exists());
        drop(open_with_key_store(dir.path(), &TestKeyStore { fail: false }).unwrap());
        let before = std::fs::read(dir.path().join(DB_FILE_NAME)).unwrap();
        assert!(open_with_key_store(dir.path(), &failure).is_err());
        assert_eq!(
            std::fs::read(dir.path().join(DB_FILE_NAME)).unwrap(),
            before
        );
    }

    #[test]
    fn missing_key_does_not_mint_over_existing_database() {
        let dir = tempfile::tempdir().unwrap();
        let file = dir.path().join(DB_FILE_NAME);
        std::fs::write(&file, b"existing encrypted database").unwrap();
        assert!(open_with_key_store(dir.path(), &TestKeyStore { fail: false }).is_err());
        assert!(!dir.path().join(KEY_FILE_NAME).exists());
        assert_eq!(std::fs::read(file).unwrap(), b"existing encrypted database");
    }

    #[test]
    fn open_creates_expected_schema() {
        let conn =
            open(Path::new(":memory:"), &crypto::generate_key()).expect("open should succeed");

        let mut stmt = conn
            .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
            .unwrap();
        let tables: Vec<String> = stmt
            .query_map([], |row| row.get(0))
            .unwrap()
            .map(|r| r.unwrap())
            .collect();

        assert!(tables.contains(&"schools".to_string()));
        assert!(tables.contains(&"learners".to_string()));
    }

    #[test]
    fn foreign_keys_are_enforced() {
        let conn =
            open(Path::new(":memory:"), &crypto::generate_key()).expect("open should succeed");

        let result = conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 'missing-school', 'Ana', 'Cruz')",
            [],
        );

        assert!(result.is_err(), "insert with dangling school_id must fail");
    }

    #[test]
    fn persists_across_reopen_of_the_same_file() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("restart-test.db");
        let key = crypto::generate_key();

        {
            let conn = open(&path, &key).expect("first open should succeed");
            conn.execute(
                "INSERT INTO schools (id, name) VALUES ('s1', 'Mabini Elementary')",
                [],
            )
            .unwrap();
        } // conn dropped here, simulating app shutdown

        let conn = open(&path, &key).expect("reopen with the same key should succeed");
        let name: String = conn
            .query_row("SELECT name FROM schools WHERE id = 's1'", [], |row| {
                row.get(0)
            })
            .expect("row inserted before restart should still exist");

        assert_eq!(name, "Mabini Elementary");
    }

    #[test]
    fn the_database_file_is_not_readable_without_the_key() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("encrypted.db");
        let key = crypto::generate_key();

        {
            let conn = open(&path, &key).unwrap();
            conn.execute(
                "INSERT INTO schools (id, name) VALUES ('s1', 'Secret School')",
                [],
            )
            .unwrap();
        }

        // Opening the same file with no key at all: reading the schema must fail.
        let unkeyed = Connection::open(&path).unwrap();
        let result: rusqlite::Result<i64> =
            unkeyed.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0));
        assert!(
            result.is_err(),
            "unkeyed connection must not read an encrypted database"
        );

        // Opening with the WRONG key must also fail, not just "no key".
        let wrong_key = crypto::generate_key();
        let wrongly_keyed = open(&path, &wrong_key);
        let opened_ok = wrongly_keyed.is_ok();
        if opened_ok {
            // open() itself only fails if the migration runner's queries fail;
            // assert directly that a real read fails under the wrong key too.
            let conn = wrongly_keyed.unwrap();
            let result: rusqlite::Result<i64> =
                conn.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0));
            assert!(
                result.is_err(),
                "wrong key must not be able to read the database"
            );
        }
    }

    /// Wave 2D: proves the encryption guarantee extends to WAL/SHM
    /// sidecar files, not just the main `.db` file. `journal_mode = WAL`
    /// (set by `open` above) means SQLite writes new/changed pages to a
    /// separate `-wal` file before they're checkpointed into the main
    /// file — if SQLCipher only encrypted the main file, a learner's
    /// name could sit in cleartext in that sidecar file for the entire
    /// session. Deliberately does NOT call `PRAGMA wal_checkpoint`, so
    /// the marker row is still sitting in the WAL file (not yet folded
    /// into the main file) when this test reads the raw bytes back.
    #[test]
    fn wal_and_shm_sidecar_files_never_contain_plaintext_learner_data() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("wal-test.db");
        let key = crypto::generate_key();
        // A long, distinctive marker unlikely to appear by coincidence in
        // any binary page structure, cipher metadata, or SQL keyword.
        let marker = "ZZWAVE2D_SYNTHETIC_LEARNER_MARKER_Dela_Cruz_Ana_Test_ZZ";

        {
            let conn = open(&path, &key).unwrap();
            conn.execute("INSERT INTO schools (id, name) VALUES ('s1', ?1)", [marker])
                .unwrap();
            // Connection drops here without an explicit checkpoint --
            // WAL mode's normal behavior leaves the new page in `-wal`
            // until SQLite decides to checkpoint it, which is exactly
            // the window this test needs to inspect.
        }

        let wal_path = path.with_extension("db-wal");
        let shm_path = path.with_extension("db-shm");

        let db_bytes = std::fs::read(&path).unwrap();
        assert!(
            !contains_bytes(&db_bytes, marker.as_bytes()),
            "main .db file must never contain the marker in plaintext"
        );

        if wal_path.exists() {
            let wal_bytes = std::fs::read(&wal_path).unwrap();
            assert!(
                !wal_bytes.is_empty(),
                "WAL file should actually have content for this test to be meaningful"
            );
            assert!(
                !contains_bytes(&wal_bytes, marker.as_bytes()),
                "WAL sidecar file must never contain the marker in plaintext"
            );
        }

        if shm_path.exists() {
            let shm_bytes = std::fs::read(&shm_path).unwrap();
            assert!(
                !contains_bytes(&shm_bytes, marker.as_bytes()),
                "SHM sidecar file must never contain the marker in plaintext"
            );
        }
    }

    fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }
}
