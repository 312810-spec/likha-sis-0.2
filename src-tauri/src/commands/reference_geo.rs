//! PSGC reference-geography commands — Wave 2G. See
//! `docs/adr/0047-psgc-reference-data-foundation.md`.
//!
//! `import_psgc_snapshot` is the only write path; it is gated behind
//! `ManageLearners` even though `reference_geo_units`/`reference_geo_snapshots`
//! are global, not school-scoped tables. This is a deliberate exception
//! to this project's usual "capability implies a school-scoped effect"
//! pattern: PSGC data exists to support learner address workflows (its
//! whole motivation), so the same Registrar/School-Head roles that may
//! manage learners are the ones trusted to refresh it — the AUTHORIZATION
//! check still means something (only a credentialed admin, not anyone,
//! can trigger an import) even though the write's EFFECT is visible to
//! every school on this installation, not just the caller's own.
//!
//! Reads only require a live session (`require_active_school_scope`), no
//! specific capability — any authenticated user may look up PSGC
//! reference data, matching how it will be consumed (address entry is a
//! routine part of many workflows, not an admin-only action).

use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::import::psgc::{self, EXPECTED_SOURCE_NAME};
use crate::repository::reference_geo::{self, GeoSnapshot, GeoUnit, SnapshotImportOutcome};
use crate::repository::user;

const MAX_SNAPSHOT_FILE_BYTES: u64 = 64 * 1024 * 1024;

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PsgcImportResult {
    pub snapshot_id: String,
    pub unit_count: usize,
    pub already_imported: bool,
}

/// Imports a PSGC snapshot file from a local path the caller already
/// picked via a file dialog (mirrors `preview_sf1_import`'s
/// caller-picked-path pattern). Never touches the network — this is a
/// local file import, not a live PSA fetch (see the ADR for why: PSA's
/// own API could not be verified as reachable/stable from this
/// environment). Bounded read (`MAX_SNAPSHOT_FILE_BYTES`) before parsing,
/// so a huge/hostile file cannot exhaust memory before validation even
/// begins. Attributes the import to the acting user (same
/// `authorize_capability_with_actor` + `user::find_by_id` pattern
/// `commit_sf1_import` already uses) — Wave 2G independent review noted
/// this table otherwise had no actor provenance at all, unlike
/// `sf1_import_history`.
#[tauri::command]
pub fn import_psgc_snapshot(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    file_path: String,
) -> AppResult<PsgcImportResult> {
    let mut conn = lock_db(&db);
    let (_school_id, user_id) =
        auth::authorize_capability_with_actor(&conn, &sessions, Capability::ManageLearners)?;
    let actor_username = user::find_by_id(&conn, &user_id)?
        .map(|u| u.username)
        .unwrap_or_else(|| "unknown".to_string());

    let path = PathBuf::from(file_path);
    let metadata = std::fs::metadata(&path)?;
    if metadata.len() > MAX_SNAPSHOT_FILE_BYTES {
        return Err(AppError::Import(format!(
            "the snapshot file is too large ({} bytes, limit {MAX_SNAPSHOT_FILE_BYTES})",
            metadata.len()
        )));
    }
    let bytes = std::fs::read(&path)?;

    let snapshot = psgc::parse_and_validate(&bytes)?;
    let outcome =
        reference_geo::record_snapshot(&mut conn, &snapshot, Some(&user_id), &actor_username)?;

    Ok(match outcome {
        SnapshotImportOutcome::Imported {
            snapshot_id,
            unit_count,
        } => PsgcImportResult {
            snapshot_id,
            unit_count,
            already_imported: false,
        },
        SnapshotImportOutcome::AlreadyImported {
            snapshot_id,
            unit_count,
        } => PsgcImportResult {
            snapshot_id,
            unit_count,
            already_imported: true,
        },
    })
}

/// The current PSGC snapshot's metadata, or `None` if no snapshot has
/// ever been imported on this installation. Local-only read — works
/// identically offline.
#[tauri::command]
pub fn get_current_psgc_snapshot(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Option<GeoSnapshot>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;
    reference_geo::current_snapshot(&conn, EXPECTED_SOURCE_NAME)
}

/// Lists units of the current PSGC snapshot, optionally filtered by
/// level and/or parent code. Returns an empty list (not an error) when
/// no snapshot has been imported yet — an admin has simply not run the
/// import step, which is a normal, expected installation state, not a
/// failure.
#[tauri::command]
pub fn list_psgc_units(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    level: Option<String>,
    parent_code: Option<String>,
) -> AppResult<Vec<GeoUnit>> {
    let conn = lock_db(&db);
    sessions.require_active_school_scope(&conn)?;

    let Some(current) = reference_geo::current_snapshot(&conn, EXPECTED_SOURCE_NAME)? else {
        return Ok(Vec::new());
    };
    reference_geo::list_units(&conn, &current.id, level.as_deref(), parent_code.as_deref())
}
