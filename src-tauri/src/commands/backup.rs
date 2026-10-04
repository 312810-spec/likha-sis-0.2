use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use zeroize::Zeroizing;

use crate::auth::{self, SessionManager};
use crate::backup::{self, BackupError};
use crate::commands::lock_db;
use crate::crypto;
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::{role, school};

fn category(error: BackupError) -> String {
    match error {
        BackupError::InvalidPassword => "backup_password_invalid",
        BackupError::InvalidArchive => "backup_invalid",
        BackupError::TooLarge => "backup_too_large",
        BackupError::DestinationExists => "backup_destination_exists",
        BackupError::Storage(_) => "backup_storage_error",
    }
    .to_owned()
}

/// Android document URIs are streamed through a private encrypted archive file.
/// Desktop paths keep the existing direct file workflow.
fn with_archive_path<T>(
    file_path: &str,
    private_dir: &Path,
    importing: bool,
    action: impl FnOnce(&Path) -> Result<T, String>,
) -> Result<T, String> {
    if !file_path.starts_with("content://") {
        return action(Path::new(file_path));
    }
    #[cfg(target_os = "android")]
    {
        let staging = tempfile::tempdir_in(private_dir).map_err(|_| "backup_storage_error".to_owned())?;
        let path = staging.path().join("portable.likhabackup");
        let path_string = path.to_str().ok_or_else(|| "backup_storage_error".to_owned())?;
        if importing {
            crate::crypto::android::execute(3, file_path, &[], path_string)
                .map_err(|_| "backup_storage_error".to_owned())?;
        }
        let result = action(&path)?;
        if !importing {
            crate::crypto::android::execute(4, file_path, &[], path_string)
                .map_err(|_| "backup_storage_error".to_owned())?;
        }
        Ok(result)
    }
    #[cfg(not(target_os = "android"))]
    {
        let _ = (private_dir, importing);
        Err("backup_storage_error".to_owned())
    }
}

/// Installation snapshot includes every tenant. Require School Head authority
/// in EVERY school, not merely the active school. Never trust a caller's role.
fn authorize_backup(conn: &Connection, sessions: &SessionManager) -> AppResult<()> {
    let (user_id, _) = sessions.require_active_session(conn)?;
    for school in school::list_all(conn)? {
        if !role::has_any_role(conn, &user_id, &school.id, &[role::SCHOOL_HEAD])? {
            return Err(AppError::Unauthorized);
        }
    }
    Ok(())
}

#[tauri::command]
pub async fn create_portable_backup(
    app: AppHandle,
    file_path: String,
    password: String,
) -> Result<(), String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Mutex<Connection>>();
        let sessions = app.state::<SessionManager>();
        let conn = lock_db(&db);
        authorize_backup(&conn, &sessions).map_err(|_| "unauthorized".to_owned())?;
        let dir = db::app_data_dir(&app).map_err(|_| "backup_storage_error".to_owned())?;
        let key_path = dir.join(db::SSPK_KEY_FILE_NAME);
        // Do not mint a replacement SSPK during backup: unreadable existing keys
        // must fail, and a non-syncing installation has no SSPK to include.
        let sspk = if key_path.exists() {
            let store =
                crypto::platform::key_store().map_err(|_| "backup_storage_error".to_owned())?;
            Some(Zeroizing::new(
                store
                    .load_or_create_key(&key_path)
                    .map_err(|_| "backup_storage_error".to_owned())?,
            ))
        } else {
            None
        };
        with_archive_path(&file_path, &dir, false, |archive| {
            backup::create(&conn, archive, &password, sspk.as_deref()).map_err(category)
        })
    })
    .await
    .map_err(|_| "backup_storage_error".to_owned())?
}

/// First-run recovery is staged into a new directory. The live connection is
/// untouched; the next full app launch selects the proven recovery directory.
#[tauri::command]
pub async fn stage_portable_recovery(
    app: AppHandle,
    file_path: String,
    password: String,
) -> Result<(), String> {
    let password = Zeroizing::new(password);
    tauri::async_runtime::spawn_blocking(move || {
        let db = app.state::<Mutex<Connection>>();
        let conn = lock_db(&db);
        if !auth::installation_needs_setup(&conn).map_err(|_| "backup_storage_error".to_owned())? {
            return Err("already_initialized".to_owned());
        }
        let base = db::base_data_dir(&app).map_err(|_| "backup_storage_error".to_owned())?;
        if base.join(db::RECOVERY_POINTER).exists() {
            return Err("already_initialized".to_owned());
        }
        let id = uuid::Uuid::now_v7();
        let destination = base.join(format!("recovery-{id}"));
        let store = crypto::platform::key_store().map_err(|_| "backup_storage_error".to_owned())?;
        with_archive_path(&file_path, &base, true, |archive| {
            backup::restore(archive, &destination, &password, store.as_ref()).map_err(category)
        })?;
        let publish = (|| -> std::io::Result<()> {
            use std::io::Write;
            let mut pointer = tempfile::NamedTempFile::new_in(&base)?;
            pointer.write_all(id.to_string().as_bytes())?;
            pointer.as_file().sync_all()?;
            pointer
                .persist_noclobber(base.join(db::RECOVERY_POINTER))
                .map_err(|e| e.error)?;
            Ok(())
        })();
        if publish.is_err() {
            let _ = std::fs::remove_dir_all(destination);
            return Err("backup_storage_error".to_owned());
        }
        Ok(())
    })
    .await
    .map_err(|_| "backup_storage_error".to_owned())?
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn full_backup_requires_school_head_authority_in_every_tenant() {
        let mut conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let sessions = SessionManager::new();
        assert!(matches!(
            authorize_backup(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
        let session = auth::bootstrap_installation(
            &mut conn,
            &sessions,
            "Synthetic School A",
            "synthetic-admin",
            "synthetic password only",
            "Synthetic Admin",
        )
        .unwrap();
        authorize_backup(&conn, &sessions).unwrap();
        let other = school::create(&conn, "Synthetic School B").unwrap();
        assert!(matches!(
            authorize_backup(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
        crate::repository::user::add_school_membership(&conn, &session.user_id, &other.id).unwrap();
        role::grant(&conn, &session.user_id, &other.id, role::TEACHER).unwrap();
        assert!(matches!(
            authorize_backup(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
        role::grant(&conn, &session.user_id, &other.id, role::SCHOOL_HEAD).unwrap();
        authorize_backup(&conn, &sessions).unwrap();
        conn.execute("DELETE FROM user_school_roles WHERE user_id=?1 AND school_id=?2 AND role='school_head'", (&session.user_id, &other.id)).unwrap();
        assert!(matches!(
            authorize_backup(&conn, &sessions),
            Err(AppError::Unauthorized)
        ));
    }
    #[test]
    fn archive_errors_have_generic_categories() {
        assert_eq!(category(BackupError::InvalidArchive), "backup_invalid");
        assert_eq!(
            category(BackupError::Storage(AppError::key_store(
                "private key detail"
            ))),
            "backup_storage_error"
        );
    }
}
