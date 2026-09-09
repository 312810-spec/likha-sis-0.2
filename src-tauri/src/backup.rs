//! Batch 14 sub-item 3: disaster-recovery backup mechanism (ADR-0087).
//!
//! Produces encrypted, independently-verifiable copies of the working
//! SQLCipher database using SQLCipher's own documented export mechanism
//! (`ATTACH DATABASE ... KEY ...` + `sqlcipher_export()`), never a raw
//! file copy and never a plaintext dump. Each backup copy is exactly as
//! protected as the live database -- same SQLCipher cipher/KDF settings,
//! same key -- so a backup file leaked or stolen carries the identical
//! confidentiality guarantee as the live `likha-sis.db` file (ADR-0003).
//!
//! Pure function of a `Connection` + key + destination paths -- no Tauri
//! dependency -- so the full create-then-restore round trip is provable
//! by `cargo test` alone, matching this codebase's `db`/`crypto` module
//! convention of keeping infrastructure logic Tauri-free and directly
//! testable.

use std::path::Path;

use rusqlite::{params, Connection};
use zeroize::Zeroize;

use crate::crypto::{self, KEY_LEN};
use crate::error::AppResult;

/// A stable, never-reused ATTACH alias for the destination database
/// during export. Only ever alive for the duration of one
/// attach/export/detach sequence on a connection this module already
/// holds exclusively (the caller's locked `Connection`), so a fixed name
/// can never collide with a concurrent backup on the same connection.
const ATTACH_ALIAS: &str = "likha_backup_target";

/// The two independently-created encrypted copies a disaster-recovery
/// backup produces. Deliberately two separate physical files -- see this
/// module's own doc comment -- rather than one file plus a checksum, so a
/// single corrupted/lost file (a failing USB drive, one cloud-sync
/// conflict) does not take down the only backup.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct BackupCopies {
    pub primary_path: std::path::PathBuf,
    pub secondary_path: std::path::PathBuf,
}

/// Creates two independent encrypted copies of the database `conn` is
/// connected to, at `primary_path` and `secondary_path`, both keyed with
/// `key` (the SAME key the live database uses -- a backup is not a
/// re-keying operation). Each copy is created by its own complete
/// attach/export/detach sequence -- a failure creating the second copy
/// never corrupts or half-writes the first, and neither copy is derived
/// from the other (both are exported directly from the live `conn`), so
/// they are genuinely independent artifacts, not one copy plus a
/// duplicate.
///
/// If a file already exists at either destination path, it is deleted
/// first -- these paths are always this module's own generated backup
/// filenames (see `commands::backup::create_disaster_recovery_backup`'s
/// timestamped naming), never a caller-supplied arbitrary path that might
/// collide with unrelated data, so overwriting a stale prior backup at
/// the same generated name is the intended, safe behavior.
pub fn create_two_copy_backup(
    conn: &Connection,
    key: &[u8; KEY_LEN],
    primary_path: &Path,
    secondary_path: &Path,
) -> AppResult<BackupCopies> {
    create_encrypted_copy(conn, key, primary_path)?;
    create_encrypted_copy(conn, key, secondary_path)?;
    Ok(BackupCopies {
        primary_path: primary_path.to_path_buf(),
        secondary_path: secondary_path.to_path_buf(),
    })
}

/// One attach/export/detach cycle producing a single encrypted copy at
/// `dest_path`. Uses SQLCipher's own `sqlcipher_export()` -- the
/// documented mechanism for copying an entire encrypted database's
/// schema and content into a second encrypted database -- rather than a
/// raw filesystem copy, which would risk capturing a torn/inconsistent
/// snapshot of the live WAL-mode file (see `db::open`'s WAL doc comment)
/// and would not let the destination be independently keyed/verified.
fn create_encrypted_copy(
    conn: &Connection,
    key: &[u8; KEY_LEN],
    dest_path: &Path,
) -> AppResult<()> {
    if dest_path.exists() {
        std::fs::remove_file(dest_path)?;
    }

    let dest_str = dest_path.to_str().ok_or_else(|| {
        crate::error::AppError::Io(std::io::Error::other(
            "backup destination path is not valid UTF-8",
        ))
    })?;

    // See `db::open`'s identical reasoning: SQLCipher's blob-literal KEY
    // syntax is only recognized by the SQL parser itself and cannot be a
    // bound parameter, so it is spliced directly here -- safe because
    // `key_to_sqlcipher_literal`'s output is always our own hex encoding
    // of raw bytes ([0-9a-f] only), never externally supplied text. The
    // destination PATH, by contrast, is bound as a normal parameter
    // (`?1`) since ATTACH's filename position accepts one.
    // Matches `db::open`'s `PRAGMA cipher_compatibility = 4` for the main
    // database, but set as a session-wide DEFAULT (`cipher_default_*`)
    // before the ATTACH runs -- `PRAGMA cipher_compatibility` only
    // configures the database that is already open/attached, whereas a
    // brand-new database created by `ATTACH ... KEY ...` establishes its
    // on-disk KDF/page-size parameters from the process's CURRENT
    // `cipher_default_*` settings at the moment it is created. Verified
    // the hard way while building this module: an earlier version set
    // `PRAGMA <alias>.cipher_compatibility = 4` immediately AFTER attach
    // instead, and every backup file -- though genuinely encrypted --
    // failed to reopen with the correct key ("file is not a database"),
    // because by then the new file's real on-disk parameters had already
    // been fixed to SQLCipher's own compiled-in defaults, not
    // compatibility 4. Setting the default first, before ATTACH, is the
    // fix; must run once per connection before its first ATTACH, so it
    // is safe (and cheap) to reissue on every call.
    conn.execute_batch("PRAGMA cipher_default_compatibility = 4;")?;

    let mut literal = crypto::key_to_sqlcipher_literal(key);
    // The double quotes around `{literal}` are load-bearing, not
    // stylistic -- matches `db::open`'s identical `PRAGMA key =
    // "{literal}"` form exactly. An UNQUOTED `x'...'` is SQLite's raw
    // BLOB literal syntax; SQLCipher's key-parsing code specifically
    // detects a TEXT value shaped like `x'HEX'` (which is what a
    // double-quoted value becomes here, since SQLite treats double
    // quotes as a string when they don't resolve to a known identifier)
    // to mean "raw hex key bytes, skip PBKDF2". Passing the UNQUOTED
    // blob form instead silently takes a different SQLCipher code path
    // that produces a working-but-different actual key -- verified the
    // hard way: an earlier version of this line used the unquoted form,
    // and every backup encrypted without error but then failed an HMAC
    // check on reopen with the identical key bytes via the normal
    // (quoted) `db::open` path.
    let attach_sql = format!("ATTACH DATABASE ?1 AS {ATTACH_ALIAS} KEY \"{literal}\";");
    let attach_result = conn.execute(&attach_sql, params![dest_str]);
    literal.zeroize();
    attach_result?;

    // `sqlcipher_export` is a scalar function; invoking it via a SELECT
    // is SQLCipher's own documented way to run it. Its return value's
    // exact shape (an integer table count on some SQLCipher builds, NULL
    // on others) is not a stable contract this code can rely on -- what
    // matters is only whether the statement executes without a SQL
    // error, so the row is read as `Option<i64>` rather than a bare
    // `i64` that would spuriously fail on a NULL/no-op success.
    let export_result: rusqlite::Result<Option<i64>> = conn.query_row(
        &format!("SELECT sqlcipher_export('{ATTACH_ALIAS}');"),
        [],
        |row| row.get(0),
    );

    // `sqlcipher_export` copies every table's schema and rows, but
    // `PRAGMA user_version` is page-1 HEADER metadata, not table data --
    // it is NOT copied by the export. `rusqlite_migration` (this
    // codebase's migration runner, see `db::migrations`) stores the
    // applied-migration count in exactly that pragma, so without this
    // copy every backup file would silently look like an un-migrated,
    // schema-version-0 database to any future `db::open` call against
    // it (which would then try to re-run migration 1's `CREATE TABLE`
    // statements against tables that already exist, and fail loudly --
    // exactly the failure this line exists to prevent, found by this
    // module's own round-trip test).
    let carry_user_version = export_result.is_ok().then(|| -> rusqlite::Result<()> {
        let user_version: i64 =
            conn.query_row("PRAGMA main.user_version;", [], |row| row.get(0))?;
        conn.execute_batch(&format!(
            "PRAGMA {ATTACH_ALIAS}.user_version = {user_version};"
        ))
    });

    // Always attempt to detach, even if export failed, so a failed
    // backup attempt never leaves the connection with a lingering
    // attached database that would break a later command (or a later
    // backup attempt reusing the same alias) on this same connection.
    let detach_result = conn.execute(&format!("DETACH DATABASE {ATTACH_ALIAS};"), []);

    export_result?;
    if let Some(result) = carry_user_version {
        result?;
    }
    detach_result?;
    Ok(())
}

/// Opens a backup file at `path` with `key` and confirms it is a valid,
/// readable SQLCipher database whose schema matches what this codebase's
/// migrations produce -- i.e. that it would actually work as a restore
/// target, not merely that the file exists. Returns the number of rows
/// in `schools` as a simple, cheap "this is really our schema, not junk"
/// signal, matching `db::open`'s own tests' use of that table for the
/// same purpose. Deliberately does NOT run migrations against the backup
/// file (unlike `db::open`) -- a restore target should already be at
/// exactly the schema version it was backed up at; running migrations
/// here would silently "fix" a backup that ought to fail loudly if it
/// were ever somehow behind.
pub fn verify_backup_copy(path: &Path, key: &[u8; KEY_LEN]) -> AppResult<i64> {
    let conn = Connection::open(path)?;
    let mut literal = crypto::key_to_sqlcipher_literal(key);
    let mut pragma_sql = format!("PRAGMA key = \"{literal}\";");
    let key_result = conn.execute_batch(&pragma_sql);
    pragma_sql.zeroize();
    literal.zeroize();
    key_result?;
    conn.execute_batch("PRAGMA cipher_compatibility = 4;")?;

    let integrity: String = conn.query_row("PRAGMA integrity_check;", [], |row| row.get(0))?;
    if integrity != "ok" {
        return Err(crate::error::AppError::Io(std::io::Error::other(format!(
            "backup integrity check failed: {integrity}"
        ))));
    }

    let count: i64 = conn.query_row("SELECT COUNT(*) FROM schools;", [], |row| row.get(0))?;
    Ok(count)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_source_with_marker(dir: &std::path::Path, marker: &str) -> (Connection, [u8; KEY_LEN]) {
        let key = crypto::generate_key();
        let conn = crate::db::open(&dir.join("source.db"), &key).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', ?1)",
            params![marker],
        )
        .unwrap();
        (conn, key)
    }

    // -----------------------------------------------------------------
    // Failing-first (TDD): these describe the required behavior before
    // `create_two_copy_backup`/`verify_backup_copy` existed. They now
    // pass against the implementation above.
    // -----------------------------------------------------------------

    #[test]
    fn creates_two_distinct_backup_files_that_both_exist() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "Mabini Elementary");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");

        let copies = create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        assert_eq!(copies.primary_path, primary);
        assert_eq!(copies.secondary_path, secondary);
        assert!(primary.exists());
        assert!(secondary.exists());
        assert_ne!(primary, secondary);
        assert!(std::fs::metadata(&primary).unwrap().len() > 0);
        assert!(std::fs::metadata(&secondary).unwrap().len() > 0);
    }

    #[test]
    fn both_backup_copies_round_trip_the_real_data_independently() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "Rizal Elementary");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        // "Restores successfully into a fresh database" for this
        // single-file architecture means: open the backup file on its
        // own, independent of the live database, with the same key, and
        // the data is really there.
        let restored_primary = crate::db::open(&primary, &key).unwrap();
        let name: String = restored_primary
            .query_row("SELECT name FROM schools WHERE id = 's1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "Rizal Elementary");

        let restored_secondary = crate::db::open(&secondary, &key).unwrap();
        let name2: String = restored_secondary
            .query_row("SELECT name FROM schools WHERE id = 's1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name2, "Rizal Elementary");
    }

    #[test]
    fn a_backup_copy_is_independently_verifiable_via_verify_backup_copy() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "Aguinaldo High School");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        assert_eq!(verify_backup_copy(&primary, &key).unwrap(), 1);
        assert_eq!(verify_backup_copy(&secondary, &key).unwrap(), 1);
    }

    #[test]
    fn deleting_one_backup_copy_never_affects_the_others_verifiability() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "Independent Copies School");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        std::fs::remove_file(&primary).unwrap();

        // The secondary copy must still verify -- it was never derived
        // from the primary, only from the same live source connection.
        assert_eq!(verify_backup_copy(&secondary, &key).unwrap(), 1);
    }

    #[test]
    fn a_backup_copy_is_unreadable_with_no_key_or_the_wrong_key() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "Secret School");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        let unkeyed = Connection::open(&primary).unwrap();
        let result: rusqlite::Result<i64> =
            unkeyed.query_row("SELECT count(*) FROM sqlite_master", [], |row| row.get(0));
        assert!(
            result.is_err(),
            "an unkeyed connection must not read a backup copy"
        );

        let wrong_key = crypto::generate_key();
        let wrong_key_result = verify_backup_copy(&primary, &wrong_key);
        assert!(
            wrong_key_result.is_err(),
            "the wrong key must not be able to read/verify a backup copy"
        );
    }

    /// The core encryption-at-rest guarantee this backup mechanism must
    /// never weaken (ADR-0003, ADR-0087): the backup file on disk must
    /// never contain the plaintext marker, mirroring `db`'s own
    /// `wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`
    /// test for the live database.
    #[test]
    fn backup_files_on_disk_never_contain_plaintext_data() {
        let dir = tempfile::tempdir().unwrap();
        let marker = "ZZBACKUP_SYNTHETIC_LEARNER_MARKER_Dela_Cruz_Ana_Test_ZZ";
        let (conn, key) = open_source_with_marker(dir.path(), marker);
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        for path in [&primary, &secondary] {
            let bytes = std::fs::read(path).unwrap();
            assert!(
                !contains_bytes(&bytes, marker.as_bytes()),
                "backup file {path:?} must never contain the marker in plaintext"
            );
        }
    }

    /// Re-running a backup at the same generated filenames (e.g. two
    /// backups taken the same second, or a retry after a partial
    /// failure) must overwrite cleanly rather than fail because the
    /// destination file already exists.
    #[test]
    fn creating_a_backup_at_an_already_existing_path_overwrites_it_cleanly() {
        let dir = tempfile::tempdir().unwrap();
        let (conn, key) = open_source_with_marker(dir.path(), "First School Name");
        let primary = dir.path().join("backup-a.db");
        let secondary = dir.path().join("backup-b.db");
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        conn.execute(
            "UPDATE schools SET name = ?1 WHERE id = 's1'",
            params!["Updated School Name"],
        )
        .unwrap();
        create_two_copy_backup(&conn, &key, &primary, &secondary).unwrap();

        let restored = crate::db::open(&primary, &key).unwrap();
        let name: String = restored
            .query_row("SELECT name FROM schools WHERE id = 's1'", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(name, "Updated School Name");
    }

    fn contains_bytes(haystack: &[u8], needle: &[u8]) -> bool {
        haystack
            .windows(needle.len())
            .any(|window| window == needle)
    }
}
