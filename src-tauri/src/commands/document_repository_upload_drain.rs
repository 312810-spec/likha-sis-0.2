//! The Official School Repository's OPPORTUNISTIC upload drain (ADR-0088,
//! Batch 18 checkpoint 4). Sibling of `commands::document_repository`
//! (checkpoint 3, the connection lifecycle -- reused here for
//! `token_file_path`) and `commands::document_repository_upload_queue`
//! (also checkpoint 3, the queue/list data plumbing this drains).

use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::AppHandle;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::document_repository::token_file_path;
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::infrastructure::microsoft365::{oauth, token_store};
use crate::repository::microsoft365_config::{self, AppRegistration};
use crate::repository::microsoft365_upload_queue::{self, AttemptErrorCode, QueuedUpload};

/// Opportunistically attempts every still-pending (`queued`/`failed`)
/// upload for this school: refreshes the stored access token if the
/// connection is configured and connected, then records an honest outcome
/// per item. The actual Microsoft Graph `driveItem` upload call is
/// deliberately NOT implemented yet (ADR-0088's disclosed "Not yet
/// built" -- no destination SharePoint site/library has been selected for
/// any school in this environment to validate that call against), so a
/// successful token refresh still records `NotConfigured` rather than a
/// fabricated `uploaded` status: this function's real, delivered value
/// today is the connectivity/token-refresh probe and leaving every item
/// ready for the next slice to actually deliver. Callable by any
/// authenticated school member, matching `queueUpload`.
#[tauri::command]
pub fn drain_document_repository_upload_queue(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<QueuedUpload>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let pending = microsoft365_upload_queue::pending_for_school(&conn, &school_id, 20)?;
    if pending.is_empty() {
        return microsoft365_upload_queue::list_for_school(&conn, &school_id);
    }

    let registration = microsoft365_config::get(&conn, &school_id)?;
    let Some(registration) = registration.filter(|r| r.connected) else {
        for item in &pending {
            microsoft365_upload_queue::mark_uploading(&conn, &item.id)?;
            microsoft365_upload_queue::record_attempt_failure(
                &conn,
                &item.id,
                AttemptErrorCode::NotConfigured,
            )?;
        }
        return microsoft365_upload_queue::list_for_school(&conn, &school_id);
    };

    let token_file = token_file_path(&app).map_err(AppError::key_store)?;
    let refresh_outcome = attempt_token_refresh(&registration, &token_file);

    let per_item_code = match &refresh_outcome {
        Ok(()) => {
            microsoft365_config::mark_connected(&conn, &school_id)?;
            // Token is valid, but there is nowhere authorized to deliver
            // to yet -- see this command's own doc comment.
            AttemptErrorCode::NotConfigured
        }
        Err((code, message)) => {
            if matches!(code, AttemptErrorCode::Unauthorized) {
                microsoft365_config::record_connection_error(&conn, &school_id, message)?;
            }
            *code
        }
    };

    for item in &pending {
        microsoft365_upload_queue::mark_uploading(&conn, &item.id)?;
        microsoft365_upload_queue::record_attempt_failure(&conn, &item.id, per_item_code)?;
    }

    microsoft365_upload_queue::list_for_school(&conn, &school_id)
}

/// Ensures a fresh access token by exchanging the stored refresh token
/// (rotating and re-persisting it if Microsoft issues a new one, per
/// `oauth::refresh_access_token`'s own doc comment). Returns a
/// `(teacher-safe-error-code, message)` pair on any failure rather than
/// panicking or silently proceeding.
fn attempt_token_refresh(
    registration: &AppRegistration,
    token_file: &Path,
) -> Result<(), (AttemptErrorCode, String)> {
    let stored = token_store::load(token_file)
        .map_err(|e| (AttemptErrorCode::Unauthorized, e.to_string()))?;
    let Some(refresh_token) = stored else {
        return Err((
            AttemptErrorCode::Unauthorized,
            "no Microsoft 365 connection is stored; reconnect from Settings.".to_string(),
        ));
    };

    let http = oauth::ReqwestTokenHttpClient::default();
    match oauth::refresh_access_token(
        &http,
        &registration.tenant_id,
        &registration.client_id,
        &refresh_token,
    ) {
        Ok(token) => {
            if let Some(new_refresh_token) = &token.refresh_token {
                token_store::store(token_file, new_refresh_token)
                    .map_err(|e| (AttemptErrorCode::Unauthorized, e.to_string()))?;
            }
            Ok(())
        }
        Err(oauth::OAuthError::Network(msg)) => Err((AttemptErrorCode::Offline, msg)),
        Err(oauth::OAuthError::Protocol { code }) => Err((
            AttemptErrorCode::Unauthorized,
            format!("Microsoft 365 connection needs to be reconnected ({code})."),
        )),
        Err(oauth::OAuthError::UnexpectedResponse(msg)) => Err((AttemptErrorCode::Timeout, msg)),
    }
}
