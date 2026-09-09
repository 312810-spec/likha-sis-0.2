//! Tauri commands for the Official School Repository's Microsoft 365
//! connection (ADR-0088, Batch 18 checkpoint 3). This is the thin adapter
//! layer `TauriDocumentRepositoryProvider` (`src/infrastructure/tauri/`)
//! calls into -- the actual OAuth/token logic lives in
//! `infrastructure::microsoft365`, never here or in TypeScript, so a
//! refresh token never crosses the Tauri IPC boundary as a plain value.
//! The opportunistic upload queue commands (checkpoint 4) live in the
//! sibling `commands::document_repository_upload_queue` module, which
//! reuses `token_file_path` from here.

use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, Manager, State};

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::infrastructure::microsoft365::{oauth, redirect_listener, token_store};
use crate::repository::microsoft365_config::{self, AppRegistration};

/// How long `connect()` waits for the browser to complete sign-in and
/// redirect back before giving up. Generous -- this includes however long
/// a teacher/School Head takes to actually type their Microsoft
/// credentials and complete any MFA challenge in the opened browser tab.
const REDIRECT_WAIT_TIMEOUT: Duration = Duration::from_secs(180);

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionStatusDto {
    pub configured: bool,
    pub connected: bool,
    pub tenant_id: Option<String>,
    pub client_id: Option<String>,
    pub last_verified_at: Option<String>,
    pub last_error: Option<String>,
}

impl From<Option<AppRegistration>> for ConnectionStatusDto {
    fn from(registration: Option<AppRegistration>) -> Self {
        match registration {
            None => ConnectionStatusDto {
                configured: false,
                connected: false,
                tenant_id: None,
                client_id: None,
                last_verified_at: None,
                last_error: None,
            },
            Some(r) => ConnectionStatusDto {
                configured: true,
                connected: r.connected,
                tenant_id: Some(r.tenant_id),
                client_id: Some(r.client_id),
                last_verified_at: r.last_verified_at,
                last_error: r.last_error,
            },
        }
    }
}

/// Any authenticated member of the school may read connection status --
/// matches `DocumentRepositoryProviderPort::getConnectionStatus`'s own
/// doc comment.
#[tauri::command]
pub fn get_document_repository_connection_status(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<ConnectionStatusDto> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    Ok(microsoft365_config::get(&conn, &school_id)?.into())
}

/// Saves/replaces this school's Azure AD app registration. School-Head-only.
/// Basic non-empty/no-whitespace shape validation already happened in
/// `DocumentRepositoryApplicationService` (TypeScript); this command does
/// not re-derive it, matching the established division of labor
/// documented in `.claude/rules/architecture.md` (`*-service.ts` validates
/// before calling a port).
#[tauri::command]
pub fn configure_document_repository(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    tenant_id: String,
    client_id: String,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageDocumentRepositoryConnection,
    )?;
    microsoft365_config::upsert_registration(&conn, &school_id, &tenant_id, &client_id)
}

/// Starts the authorization-code-with-PKCE flow: opens the system browser
/// to Microsoft's consent page and blocks until the loopback redirect
/// completes or times out. School-Head-only. See `perform_connect` for
/// the actual flow, kept separate so its logic is unit-testable without a
/// real `AppHandle`/browser (only `open_browser` needs one).
#[tauri::command]
pub fn connect_document_repository(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageDocumentRepositoryConnection,
    )?;
    let registration = microsoft365_config::get(&conn, &school_id)?.ok_or_else(|| {
        AppError::key_store(
            "configure this school's Microsoft 365 tenant/client ID before connecting",
        )
    })?;
    // Release the DB lock before the OAuth round trip (browser sign-in can
    // take minutes) so no other command is blocked waiting on this Mutex
    // in the meantime.
    drop(conn);

    let token_file = token_file_path(&app).map_err(AppError::key_store)?;
    let result = perform_connect(&registration, &token_file, |url| open_browser(&app, url));

    let conn = lock_db(&db);
    match &result {
        Ok(()) => microsoft365_config::mark_connected(&conn, &school_id)?,
        Err(message) => microsoft365_config::record_connection_error(&conn, &school_id, message)?,
    }
    result.map_err(AppError::key_store)
}

/// The full connect flow, parameterized over `open_browser` so it can be
/// exercised in a test with a fake browser launcher while still driving a
/// REAL loopback listener and REAL (mocked-HTTP) token exchange. Returns
/// a teacher-safe error message on any failure -- never a raw OAuth error
/// payload (the caller wraps it via `AppError::key_store`).
fn perform_connect(
    registration: &AppRegistration,
    token_file: &Path,
    open_browser: impl FnOnce(&str) -> Result<(), String>,
) -> Result<(), String> {
    let listener = redirect_listener::bind_loopback_listener().map_err(|e| e.to_string())?;
    let redirect_uri = redirect_listener::redirect_uri_for(&listener).map_err(|e| e.to_string())?;
    let pkce = oauth::generate_pkce_pair();
    let state = oauth::generate_state();
    let auth_url = oauth::build_authorization_url(
        &registration.tenant_id,
        &registration.client_id,
        &redirect_uri,
        &pkce,
        &state,
    );

    open_browser(&auth_url)?;

    let redirect = redirect_listener::wait_for_redirect(&listener, REDIRECT_WAIT_TIMEOUT)?;
    if let Some(error) = redirect.error {
        return Err(format!("Microsoft sign-in was not completed: {error}"));
    }
    let Some(code) = redirect.code else {
        return Err("Microsoft sign-in did not return an authorization code.".to_string());
    };
    if redirect.state.as_deref() != Some(state.as_str()) {
        return Err(
            "The sign-in response could not be verified; please try connecting again.".to_string(),
        );
    }

    let http = oauth::ReqwestTokenHttpClient::default();
    let token = oauth::exchange_code_for_tokens(
        &http,
        &registration.tenant_id,
        &registration.client_id,
        &redirect_uri,
        &code,
        &pkce.verifier,
    )
    .map_err(|e| e.to_string())?;
    let Some(refresh_token) = token.refresh_token else {
        return Err(
            "Microsoft did not return a refresh token; check that the app registration \
             requests offline_access, then reconnect."
                .to_string(),
        );
    };

    token_store::store(token_file, &refresh_token).map_err(|e| e.to_string())
}

fn open_browser(app: &AppHandle, url: &str) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(url, None::<&str>)
        .map_err(|e| e.to_string())
}

/// Resolves this installation's DPAPI-protected refresh-token file path,
/// creating the app data directory if needed. `pub(crate)` so the
/// opportunistic upload queue's drain command
/// (`commands::document_repository_upload_queue`) can reuse the exact
/// same path this module's own connect/disconnect commands use.
pub(crate) fn token_file_path(app: &AppHandle) -> Result<PathBuf, String> {
    let dir = app.path().app_data_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    Ok(dir.join(token_store::TOKEN_FILE_NAME))
}

/// Deletes the stored refresh token and marks the connection disconnected.
/// Keeps the saved tenant/client ID (`microsoft365_config::mark_disconnected`'s
/// own contract) so `connect()` can be retried without re-entering it.
/// School-Head-only.
#[tauri::command]
pub fn disconnect_document_repository(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<()> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(
        &conn,
        &sessions,
        Capability::ManageDocumentRepositoryConnection,
    )?;
    let token_file = token_file_path(&app).map_err(AppError::key_store)?;
    token_store::clear(&token_file)?;
    microsoft365_config::mark_disconnected(&conn, &school_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn registration() -> AppRegistration {
        AppRegistration {
            school_id: "s1".to_string(),
            tenant_id: "tenant".to_string(),
            client_id: "client".to_string(),
            connected: false,
            last_verified_at: None,
            last_error: None,
        }
    }

    #[test]
    fn perform_connect_surfaces_a_teacher_safe_message_when_the_browser_cannot_be_opened() {
        let dir = tempfile::tempdir().unwrap();
        let token_file = dir.path().join(token_store::TOKEN_FILE_NAME);

        let result = perform_connect(&registration(), &token_file, |_url| {
            Err("no default browser configured".to_string())
        });

        assert_eq!(result, Err("no default browser configured".to_string()));
    }

    #[test]
    fn connection_status_dto_reports_unconfigured_when_no_registration_exists() {
        let dto: ConnectionStatusDto = None.into();
        assert!(!dto.configured);
        assert!(!dto.connected);
        assert_eq!(dto.tenant_id, None);
    }

    #[test]
    fn connection_status_dto_carries_through_an_existing_registration() {
        let mut r = registration();
        r.connected = true;
        r.last_verified_at = Some("2026-09-09T00:00:00.000Z".to_string());
        let dto: ConnectionStatusDto = Some(r).into();
        assert!(dto.configured);
        assert!(dto.connected);
        assert_eq!(dto.tenant_id.as_deref(), Some("tenant"));
    }
}
