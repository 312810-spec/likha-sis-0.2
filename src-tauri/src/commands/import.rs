use std::path::PathBuf;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::import::sf1::{Sf1ImportPreview, Sf1ImportSummary, Sf1RowCommitPlan};
use crate::import::{commit, preview};

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
#[tauri::command]
pub fn commit_sf1_import(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    starts_on: String,
    plans: Vec<Sf1RowCommitPlan>,
) -> AppResult<Sf1ImportSummary> {
    let mut conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    commit::commit_import(&mut conn, &school_id, &section_id, &starts_on, &plans)
}
