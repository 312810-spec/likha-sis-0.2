//! The Official School Repository's opportunistic upload queue (ADR-0088,
//! migration M62). Queues an already-generated export/backup artifact for
//! later upload to the school's Microsoft 365 tenant -- never a raw
//! caller-chosen path, and never the live database file.
//!
//! `enqueue`'s path guard is the SECOND, authoritative layer behind the
//! TypeScript `UploadableArtifactKind` closed union
//! (`src/domain/document-repository.ts`): even if a caller somehow
//! constructed a queue request pointing at the live encrypted database or
//! its DPAPI key file, this function rejects it independently of what the
//! client sent (`.claude/rules/architecture.md` -- "security must never
//! rely on a client choosing correctly"). See ADR-0088 Decision 4.

use std::path::Path;

use rusqlite::Connection;
use serde::Serialize;

use crate::error::{AppError, AppResult};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum UploadArtifactKind {
    Sf1Export,
    Sf9Export,
    Sf10Export,
    DisasterRecoveryBackup,
}

impl UploadArtifactKind {
    /// Mirrors the TypeScript `UploadableArtifactKind` string values
    /// exactly -- these cross the Tauri IPC boundary as plain strings.
    pub fn as_db_str(self) -> &'static str {
        match self {
            UploadArtifactKind::Sf1Export => "sf1-export",
            UploadArtifactKind::Sf9Export => "sf9-export",
            UploadArtifactKind::Sf10Export => "sf10-export",
            UploadArtifactKind::DisasterRecoveryBackup => "disaster-recovery-backup",
        }
    }

    pub fn from_db_str(value: &str) -> Option<Self> {
        match value {
            "sf1-export" => Some(UploadArtifactKind::Sf1Export),
            "sf9-export" => Some(UploadArtifactKind::Sf9Export),
            "sf10-export" => Some(UploadArtifactKind::Sf10Export),
            "disaster-recovery-backup" => Some(UploadArtifactKind::DisasterRecoveryBackup),
            _ => None,
        }
    }
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AttemptErrorCode {
    Offline,
    Timeout,
    Unauthorized,
    ProviderRejected,
    /// No school configuration currently exists to deliver this upload to
    /// -- either the Microsoft 365 connection itself isn't configured/
    /// connected yet, or (today, always -- see ADR-0088's "Not yet built")
    /// no destination SharePoint site/library has been selected for this
    /// school. This is an honest, disclosed status, never a silent
    /// success.
    NotConfigured,
}

impl AttemptErrorCode {
    fn as_db_str(self) -> &'static str {
        match self {
            AttemptErrorCode::Offline => "offline",
            AttemptErrorCode::Timeout => "timeout",
            AttemptErrorCode::Unauthorized => "unauthorized",
            AttemptErrorCode::ProviderRejected => "provider-rejected",
            AttemptErrorCode::NotConfigured => "not-configured",
        }
    }
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct QueuedUpload {
    pub id: String,
    pub kind: String,
    pub file_name: String,
    pub status: String,
    pub attempt_count: u32,
    pub last_error_code: Option<String>,
    pub queued_at: String,
}

/// Queues `local_file_path` for later upload. Rejects (without ever
/// touching the database) a candidate that, after canonicalization,
/// resolves to `forbidden_db_file` or `forbidden_key_file` -- the live
/// encrypted SQLite database and its DPAPI key file must never become an
/// upload target, regardless of what `kind`/`file_name` a caller claims.
/// A candidate that does not yet exist on disk falls back to a raw path
/// comparison (canonicalization requires the path to exist), which is
/// still safe: it only ever WIDENS what gets rejected, never narrows it.
#[allow(clippy::too_many_arguments)]
pub fn enqueue(
    conn: &Connection,
    school_id: &str,
    kind: UploadArtifactKind,
    file_name: &str,
    local_file_path: &Path,
    sha256: &str,
    forbidden_db_file: &Path,
    forbidden_key_file: &Path,
) -> AppResult<QueuedUpload> {
    if resolves_to(local_file_path, forbidden_db_file)
        || resolves_to(local_file_path, forbidden_key_file)
    {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            "refusing to queue the live database or key file for upload".to_string(),
        )));
    }

    let id = uuid::Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO microsoft365_upload_queue
            (id, school_id, kind, file_name, local_file_path, sha256)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        (
            &id,
            school_id,
            kind.as_db_str(),
            file_name,
            local_file_path.to_string_lossy().to_string(),
            sha256,
        ),
    )?;

    conn.query_row(
        "SELECT id, kind, file_name, status, attempt_count, last_error_code, queued_at
         FROM microsoft365_upload_queue WHERE id = ?1",
        [&id],
        row_to_queued_upload,
    )
    .map_err(Into::into)
}

fn resolves_to(candidate: &Path, forbidden: &Path) -> bool {
    let candidate_resolved = candidate
        .canonicalize()
        .unwrap_or_else(|_| candidate.to_path_buf());
    let forbidden_resolved = forbidden
        .canonicalize()
        .unwrap_or_else(|_| forbidden.to_path_buf());
    candidate_resolved == forbidden_resolved
}

/// Most-recently-queued-first, for the Settings/queue screen.
pub fn list_for_school(conn: &Connection, school_id: &str) -> AppResult<Vec<QueuedUpload>> {
    let mut stmt = conn.prepare(
        "SELECT id, kind, file_name, status, attempt_count, last_error_code, queued_at
         FROM microsoft365_upload_queue
         WHERE school_id = ?1
         ORDER BY queued_at DESC, id DESC",
    )?;
    let rows = stmt.query_map([school_id], row_to_queued_upload)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Oldest-first bounded batch of items still eligible for an upload
/// attempt (`queued` or previously `failed`) -- the shape the opportunistic
/// drain loop works through, mirroring `sync_outbox::pending_for_school`'s
/// own oldest-first convention.
pub fn pending_for_school(
    conn: &Connection,
    school_id: &str,
    limit: u16,
) -> AppResult<Vec<QueuedUpload>> {
    let limit = limit.clamp(1, 100);
    let mut stmt = conn.prepare(
        "SELECT id, kind, file_name, status, attempt_count, last_error_code, queued_at
         FROM microsoft365_upload_queue
         WHERE school_id = ?1 AND status IN ('queued', 'failed')
         ORDER BY queued_at, id
         LIMIT ?2",
    )?;
    let rows = stmt.query_map((school_id, limit), row_to_queued_upload)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

pub fn mark_uploading(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE microsoft365_upload_queue
         SET status = 'uploading', updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn mark_uploaded(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute(
        "UPDATE microsoft365_upload_queue
         SET status = 'uploaded', last_error_code = NULL,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        [id],
    )?;
    Ok(())
}

pub fn record_attempt_failure(
    conn: &Connection,
    id: &str,
    error_code: AttemptErrorCode,
) -> AppResult<()> {
    conn.execute(
        "UPDATE microsoft365_upload_queue
         SET status = 'failed', attempt_count = attempt_count + 1, last_error_code = ?2,
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
         WHERE id = ?1",
        (id, error_code.as_db_str()),
    )?;
    Ok(())
}

fn row_to_queued_upload(row: &rusqlite::Row<'_>) -> rusqlite::Result<QueuedUpload> {
    Ok(QueuedUpload {
        id: row.get(0)?,
        kind: row.get(1)?,
        file_name: row.get(2)?,
        status: row.get(3)?,
        attempt_count: row.get(4)?,
        last_error_code: row.get(5)?,
        queued_at: row.get(6)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn conn_with_school() -> (Connection, String) {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        (conn, school.id)
    }

    fn no_forbidden_paths() -> (std::path::PathBuf, std::path::PathBuf) {
        (
            Path::new("/nonexistent/likha-sis.db").to_path_buf(),
            Path::new("/nonexistent/likha-sis.key").to_path_buf(),
        )
    }

    #[test]
    fn enqueue_then_list_round_trips_a_queued_upload() {
        let (conn, school_id) = conn_with_school();
        let (db_file, key_file) = no_forbidden_paths();

        let queued = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf1Export,
            "SF1-2026.xlsx",
            Path::new("/exports/SF1-2026.xlsx"),
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();

        assert_eq!(queued.kind, "sf1-export");
        assert_eq!(queued.status, "queued");
        assert_eq!(queued.attempt_count, 0);

        let listed = list_for_school(&conn, &school_id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, queued.id);
    }

    #[test]
    fn enqueue_rejects_a_path_that_resolves_to_the_live_database_file() {
        let (conn, school_id) = conn_with_school();
        let dir = tempfile::tempdir().unwrap();
        let db_file = dir.path().join("likha-sis.db");
        let key_file = dir.path().join("likha-sis.key");
        std::fs::write(&db_file, b"pretend sqlcipher bytes").unwrap();

        let result = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::DisasterRecoveryBackup,
            "backup.db",
            &db_file,
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        );

        assert!(result.is_err());
        assert!(list_for_school(&conn, &school_id).unwrap().is_empty());
    }

    #[test]
    fn enqueue_rejects_a_path_that_resolves_to_the_key_file() {
        let (conn, school_id) = conn_with_school();
        let dir = tempfile::tempdir().unwrap();
        let db_file = dir.path().join("likha-sis.db");
        let key_file = dir.path().join("likha-sis.key");
        std::fs::write(&key_file, b"pretend dpapi blob").unwrap();

        let result = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf9Export,
            "likha-sis.key",
            &key_file,
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        );

        assert!(result.is_err());
        assert!(list_for_school(&conn, &school_id).unwrap().is_empty());
    }

    #[test]
    fn enqueue_still_rejects_the_database_path_even_when_no_file_exists_yet_on_disk() {
        // Canonicalization requires the path to exist; a fresh install's
        // database file might not have been created at the moment of this
        // check in some ordering. The raw-path fallback must still catch
        // an exact match.
        let (conn, school_id) = conn_with_school();
        let db_file = Path::new("/nonexistent/likha-sis.db");
        let key_file = Path::new("/nonexistent/likha-sis.key");

        let result = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf10Export,
            "likha-sis.db",
            db_file,
            "a".repeat(64).as_str(),
            db_file,
            key_file,
        );

        assert!(result.is_err());
    }

    #[test]
    fn list_for_school_is_most_recently_queued_first() {
        let (conn, school_id) = conn_with_school();
        let (db_file, key_file) = no_forbidden_paths();
        let first = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf1Export,
            "first.xlsx",
            Path::new("/exports/first.xlsx"),
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();
        let second = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf1Export,
            "second.xlsx",
            Path::new("/exports/second.xlsx"),
            "b".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();

        let listed = list_for_school(&conn, &school_id).unwrap();
        assert_eq!(listed[0].id, second.id);
        assert_eq!(listed[1].id, first.id);
    }

    #[test]
    fn mark_uploaded_clears_the_pending_state() {
        let (conn, school_id) = conn_with_school();
        let (db_file, key_file) = no_forbidden_paths();
        let queued = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf1Export,
            "f.xlsx",
            Path::new("/exports/f.xlsx"),
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();

        mark_uploading(&conn, &queued.id).unwrap();
        mark_uploaded(&conn, &queued.id).unwrap();

        let listed = list_for_school(&conn, &school_id).unwrap();
        assert_eq!(listed[0].status, "uploaded");
        assert!(pending_for_school(&conn, &school_id, 10)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn record_attempt_failure_increments_the_attempt_count_and_stores_the_code() {
        let (conn, school_id) = conn_with_school();
        let (db_file, key_file) = no_forbidden_paths();
        let queued = enqueue(
            &conn,
            &school_id,
            UploadArtifactKind::Sf1Export,
            "f.xlsx",
            Path::new("/exports/f.xlsx"),
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();

        record_attempt_failure(&conn, &queued.id, AttemptErrorCode::Offline).unwrap();

        let listed = list_for_school(&conn, &school_id).unwrap();
        assert_eq!(listed[0].status, "failed");
        assert_eq!(listed[0].attempt_count, 1);
        assert_eq!(listed[0].last_error_code.as_deref(), Some("offline"));

        // A failed item is still eligible for a future opportunistic
        // retry.
        assert_eq!(pending_for_school(&conn, &school_id, 10).unwrap().len(), 1);
    }

    #[test]
    fn queue_is_school_scoped() {
        let (conn, first_school_id) = conn_with_school();
        let second_school = school::create(&conn, "Second School").unwrap();
        let (db_file, key_file) = no_forbidden_paths();
        enqueue(
            &conn,
            &first_school_id,
            UploadArtifactKind::Sf1Export,
            "f.xlsx",
            Path::new("/exports/f.xlsx"),
            "a".repeat(64).as_str(),
            &db_file,
            &key_file,
        )
        .unwrap();

        assert!(list_for_school(&conn, &second_school.id)
            .unwrap()
            .is_empty());
        assert!(pending_for_school(&conn, &second_school.id, 10)
            .unwrap()
            .is_empty());
    }
}
