use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::{
    device_sync_client_credential, sync_conflict_review, sync_outbox, sync_pull_cursor,
};

/// Tauri command surface for the sync-status screen -- a read-only view
/// of THIS device's own sync state for its own school. ADR-0067's
/// "still required before production PII" list named a "sync status UI"
/// as a still-open item, distinct from the device-management screen
/// (`commands::device_sync`, enroll/revoke) and the conflict-review
/// screen (`commands::conflict_review`), both already shipped. This
/// module adds no new write path -- every field below is read from
/// state some other, already-tested module already maintains
/// (`device_sync_client_credential`, `sync_pull_cursor`, `sync_outbox`,
/// `sync_conflict_review`); it never touches `sync_client`'s push/pull
/// logic itself.
///
/// `school_id` is always session-derived (`require_active_school_scope`),
/// never a parameter, matching every other tenant-data command in this
/// codebase -- see `.claude/rules/architecture.md`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SyncStatusSummary {
    /// Whether THIS device has a stored sync client credential for the
    /// caller's own school (`device_sync_client_credential::get`) --
    /// i.e. whether it has completed device enrollment at all. A
    /// `false` here means every other field is necessarily "nothing to
    /// report yet," which the screen must say plainly rather than
    /// implying a stalled/broken sync.
    pub enrolled: bool,
    /// ISO timestamp of the last time a pull actually applied or staged
    /// a change for this school (`sync_pull_cursor::last_pull_at`), or
    /// `None` if this device has never pulled one. NOT a general
    /// connectivity health check -- see that function's own doc comment
    /// for why an all-quiet successful poll does not move this.
    pub last_pull_at: Option<String>,
    /// Count of this device's own changes still queued to push
    /// (`sync_outbox::count_pending_for_school`).
    pub pending_change_count: u64,
    /// Whether at least one still-pending outgoing change has recorded a
    /// failed push attempt (`sync_outbox::has_pending_failure_for_school`)
    /// -- the best-available "having trouble reaching the sync hub"
    /// signal this device actually tracks.
    pub has_pending_sync_trouble: bool,
    /// Count of open (unresolved) sync conflicts for this school
    /// (`sync_conflict_review::count_open_for_school`) -- the screen
    /// links to `ConflictReviewScreen` to resolve these rather than
    /// duplicating that UI here.
    pub open_conflict_count: u64,
}

/// Reads THIS device's own sync status for the caller's own school.
/// Read-only: no write path is exposed here at all.
#[tauri::command]
pub fn get_sync_status(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<SyncStatusSummary> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let enrolled = device_sync_client_credential::get(&conn, &school_id)?.is_some();
    let last_pull_at = sync_pull_cursor::last_pull_at(&conn, &school_id)?;
    let pending_change_count = sync_outbox::count_pending_for_school(&conn, &school_id)?;
    let has_pending_sync_trouble = sync_outbox::has_pending_failure_for_school(&conn, &school_id)?;
    let open_conflict_count = sync_conflict_review::count_open_for_school(&conn, &school_id)?;

    Ok(SyncStatusSummary {
        enrolled,
        last_pull_at,
        pending_change_count,
        has_pending_sync_trouble,
        open_conflict_count,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        device_sync_client_credential::store as store_client_credential, school,
    };
    use crate::sync::{ChangeOperation, EntityKind, PendingChange};
    use std::path::Path;
    use uuid::Uuid;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn change() -> PendingChange {
        PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::now_v7(),
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![7, 8, 9],
        }
    }

    /// These tests exercise the pure-`Connection` composition this
    /// command's body wraps directly -- the command function itself is
    /// trivial `State` unwrapping around already-tested repository
    /// functions, matching `commands::device_sync`'s own established
    /// test convention for command modules of this shape.
    fn read_status(conn: &Connection, school_id: &str) -> SyncStatusSummary {
        let enrolled = device_sync_client_credential::get(conn, school_id)
            .unwrap()
            .is_some();
        let last_pull_at = sync_pull_cursor::last_pull_at(conn, school_id).unwrap();
        let pending_change_count = sync_outbox::count_pending_for_school(conn, school_id).unwrap();
        let has_pending_sync_trouble =
            sync_outbox::has_pending_failure_for_school(conn, school_id).unwrap();
        let open_conflict_count =
            sync_conflict_review::count_open_for_school(conn, school_id).unwrap();
        SyncStatusSummary {
            enrolled,
            last_pull_at,
            pending_change_count,
            has_pending_sync_trouble,
            open_conflict_count,
        }
    }

    #[test]
    fn a_never_enrolled_school_reports_not_enrolled_and_nothing_else() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        let status = read_status(&conn, &school.id);

        assert_eq!(
            status,
            SyncStatusSummary {
                enrolled: false,
                last_pull_at: None,
                pending_change_count: 0,
                has_pending_sync_trouble: false,
                open_conflict_count: 0,
            }
        );
    }

    #[test]
    fn an_enrolled_school_with_pending_changes_and_failures_is_reported_honestly() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        store_client_credential(&conn, &school.id, "cred-1", "deadbeef").unwrap();
        let change = change();
        sync_outbox::enqueue(&conn, &school.id, &change).unwrap();
        sync_outbox::record_attempt(
            &conn,
            &school.id,
            &change.change_id.to_string(),
            Some(sync_outbox::AttemptErrorCode::HubUnavailable),
        )
        .unwrap();

        let status = read_status(&conn, &school.id);

        assert!(status.enrolled);
        assert_eq!(status.pending_change_count, 1);
        assert!(status.has_pending_sync_trouble);
        assert_eq!(status.open_conflict_count, 0);
        assert_eq!(status.last_pull_at, None);
    }

    #[test]
    fn status_is_school_scoped() {
        let conn = open_test_db();
        let first = school::create(&conn, "First School").unwrap();
        let second = school::create(&conn, "Second School").unwrap();
        store_client_credential(&conn, &first.id, "cred-1", "deadbeef").unwrap();
        sync_outbox::enqueue(&conn, &first.id, &change()).unwrap();

        let second_status = read_status(&conn, &second.id);

        assert!(!second_status.enrolled);
        assert_eq!(second_status.pending_change_count, 0);
    }
}
