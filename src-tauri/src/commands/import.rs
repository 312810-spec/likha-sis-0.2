use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::db;
use crate::error::AppResult;
use crate::import::scholastic::{
    self, ScholasticCommitPlan, ScholasticImportPreview, ScholasticImportSummary,
};
use crate::import::sf1::{Sf1ImportPreview, Sf1ImportSummary, Sf1RowCommitPlan};
use crate::import::{commit, fingerprint, preview};
use crate::repository::device_credential;
use crate::repository::sf1_import_history::{self, Sf1ImportHistoryEntry};
use crate::repository::user;

/// Parses and previews an SF1 workbook against this school's existing
/// learners — read-only, writes nothing. Same `ManageLearners` gate as
/// `create_learner`/`find_learner_candidates`: previewing an import is
/// part of the same "manage learner records" capability, not a separate
/// one. `school_id` is session-derived only, exactly like every other
/// gated command — the workbook's own school-name/metadata cells (if
/// any) are never read for scoping, only ever surfaced as a warning by
/// a future UI layer.
#[tauri::command]
pub fn preview_sf1_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    file_path: String,
) -> AppResult<Sf1ImportPreview> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    preview::build_preview(&conn, &school_id, &PathBuf::from(file_path))
}

/// Commits a reviewed, already-decided batch as one atomic transaction.
/// Callers must only pass plans already cleared for writing (see
/// `Sf1RowCommitPlan`'s doc comment) — this command does not re-run
/// validation or duplicate matching, only `import::commit`'s
/// transactional write. Same `ManageLearners` gate, checked before any
/// row is written; `school_id` is session-derived, never accepted from
/// the caller, so imported row content can never redirect a write to a
/// different school.
///
/// `file_path` (Wave 2E) is expected to be the same file the caller
/// already previewed, but that is not independently enforced — the
/// frontend simply re-sends the path it already has. What this command
/// DOES guarantee: it re-reads `file_path` itself to compute the
/// filename/fingerprint recorded on the new `sf1_import_history` row,
/// rather than accepting a client-computed filename/hash value directly.
/// This closes the "attacker supplies an arbitrary fingerprint string"
/// class of concern, but not the weaker "the file at `file_path` no
/// longer matches the `plans` being committed" case — that association
/// is inherently advisory, matching `import::fingerprint`'s own
/// non-authoritative nature (see its doc comment; nothing downstream
/// gates on this value). A file that has moved or been deleted between
/// preview and commit still commits the learner data normally; only the
/// history row's provenance falls back to a fixed placeholder in that
/// case (never fails the commit over it — see below).
#[tauri::command]
pub fn commit_sf1_import(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    starts_on: String,
    plans: Vec<Sf1RowCommitPlan>,
    file_path: String,
) -> AppResult<Sf1ImportSummary> {
    let mut conn = lock_db(&db);
    let (school_id, user_id) =
        auth::authorize_capability_with_actor(&conn, &sessions, Capability::ManageLearners)?;
    let actor_username = user::find_by_id(&conn, &user_id)?
        .map(|u| u.username)
        .unwrap_or_else(|| "unknown".to_string());
    let sspk = if device_credential::has_active_for_school(&conn, &school_id)? {
        Some(db::load_or_mint_sspk(&app)?)
    } else {
        None
    };

    let path = PathBuf::from(&file_path);
    let (source_filename, source_fingerprint) = match fingerprint::compute(&path) {
        Ok(fp) => (fingerprint::safe_filename(&path), fp),
        Err(_) => ("unknown-file".to_string(), "unavailable".to_string()),
    };

    commit::commit_import(
        &mut conn,
        &school_id,
        &section_id,
        &starts_on,
        &plans,
        Some(&user_id),
        &actor_username,
        &source_filename,
        &source_fingerprint,
        sspk.as_ref(),
    )
}

/// The most recent SF1 import history for the caller's school, newest
/// first — a review screen, not a raw-data export. Same `ManageLearners`
/// gate as every other SF1 import command; `school_id` is session-
/// derived, so a teacher can never list another school's import history
/// merely by supplying a different ID (there is no ID parameter to
/// supply). Contains only the counts/provenance already recorded on each
/// `sf1_import_history` row — no learner names, no LRNs, no raw SF1
/// content.
#[tauri::command]
pub fn list_sf1_import_history(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    limit: u32,
) -> AppResult<Vec<Sf1ImportHistoryEntry>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    sf1_import_history::list_for_school(&conn, &school_id, limit)
}

/// Parses and previews a multi-year scholastic-history `.xlsx` workbook
/// against this school's existing learners — read-only, writes nothing.
/// Same `ManageLearners` gate and same session-derived-`school_id`
/// discipline as the SF1 import commands above (ADR-0074).
#[tauri::command]
pub fn preview_scholastic_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    file_path: String,
) -> AppResult<ScholasticImportPreview> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    scholastic::build_preview(&conn, &school_id, &PathBuf::from(file_path))
}

/// Commits an already-reviewed batch of scholastic-history rows as one
/// atomic transaction. Same `ManageLearners` gate; `school_id` is
/// session-derived, never accepted from the caller.
#[tauri::command]
pub fn commit_scholastic_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    plans: Vec<ScholasticCommitPlan>,
) -> AppResult<ScholasticImportSummary> {
    let mut conn = lock_db(&db);
    let (school_id, user_id) =
        auth::authorize_capability_with_actor(&conn, &sessions, Capability::ManageLearners)?;
    scholastic::commit_scholastic_import(&mut conn, &school_id, &plans, Some(&user_id))
}
