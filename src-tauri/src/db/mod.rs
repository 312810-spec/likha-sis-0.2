mod migrations;

use std::path::Path;

use rusqlite::Connection;
use tauri::AppHandle;
#[cfg(windows)]
use tauri::Manager;
use zeroize::Zeroize;

use crate::crypto::{self, KEY_LEN};
#[cfg(windows)]
use crate::crypto::{DpapiKeyStore, KeyStore};
use crate::error::AppResult;

pub const DB_FILE_NAME: &str = "likha-sis.db";
pub const KEY_FILE_NAME: &str = "likha-sis.key";

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

/// Resolves the per-user application data directory, loads (or creates) the
/// encryption key from the Windows-protected key file there, and opens the
/// working database. Creates the app data directory if it does not exist.
#[cfg(windows)]
pub fn open_app_db(app: &AppHandle) -> AppResult<Connection> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| std::io::Error::other(e.to_string()))?;
    std::fs::create_dir_all(&dir)?;

    let mut key = DpapiKeyStore.load_or_create_key(&dir.join(KEY_FILE_NAME))?;
    let result = open(&dir.join(DB_FILE_NAME), &key);
    key.zeroize();
    result
}

/// Windows is currently LIKHA's only shipping desktop target (see
/// CLAUDE.md); the key store is DPAPI-backed and Windows-only (see
/// `crate::crypto::dpapi`). Fails closed rather than falling back to an
/// unprotected key store on any other host, matching this module's
/// existing invariant that a key-protection failure must never be silently
/// downgraded.
#[cfg(not(windows))]
pub fn open_app_db(_app: &AppHandle) -> AppResult<Connection> {
    Err(crate::error::AppError::key_store(
        "no encryption key store is implemented for this platform; \
         LIKHA-SIS currently ships on Windows only",
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
