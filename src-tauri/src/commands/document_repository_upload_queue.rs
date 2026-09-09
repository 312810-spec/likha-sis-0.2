//! Tauri commands for the Official School Repository's upload queue
//! data plumbing (ADR-0088, Batch 18 checkpoint 3): queueing an
//! already-generated export/backup artifact and listing this school's
//! queue. The OPPORTUNISTIC drain/token-refresh mechanism (checkpoint 4)
//! lives in the sibling `commands::document_repository_upload_drain`
//! module.

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager, State};

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::db;
use crate::error::AppError;
use crate::error::AppResult;
use crate::repository::microsoft365_upload_queue::{self, QueuedUpload, UploadArtifactKind};

/// Queues an already-generated export/backup artifact. Any authenticated
/// school member may call this (not gated by
/// `ManageDocumentRepositoryConnection` -- see that capability's own doc
/// comment). `db::DB_FILE_NAME`/`KEY_FILE_NAME` in this installation's app
/// data directory are passed to `microsoft365_upload_queue::enqueue` as
/// the forbidden paths -- the authoritative, independent guard against
/// ever queueing the live database or its key file (ADR-0088 Decision 4).
#[tauri::command]
pub fn queue_document_repository_upload(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    kind: String,
    file_name: String,
    file_path: String,
    sha256: String,
) -> AppResult<QueuedUpload> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let parsed_kind = UploadArtifactKind::from_db_str(&kind).ok_or_else(|| {
        AppError::Database(rusqlite::Error::InvalidParameterName(format!(
            "unrecognized upload artifact kind '{kind}'"
        )))
    })?;

    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| AppError::key_store(e.to_string()))?;
    let forbidden_db_file = data_dir.join(db::DB_FILE_NAME);
    let forbidden_key_file = data_dir.join(db::KEY_FILE_NAME);

    microsoft365_upload_queue::enqueue(
        &conn,
        &school_id,
        parsed_kind,
        &file_name,
        Path::new(&file_path),
        &sha256,
        &forbidden_db_file,
        &forbidden_key_file,
    )
}

/// Lists this school's upload queue, most recently queued first.
#[tauri::command]
pub fn list_document_repository_queued_uploads(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<QueuedUpload>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    microsoft365_upload_queue::list_for_school(&conn, &school_id)
}
