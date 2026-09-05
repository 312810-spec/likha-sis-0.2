//! ADR-0067 conflict-review queue -- the pull-side counterpart to the
//! push-side staging `repository::sync_hub::push_change` already does.
//!
//! Reuses the same `sync_conflict_review` table (migration 29) rather
//! than inventing a second one: both directions produce the identical
//! fact a human must review ("a change this device cannot safely apply
//! on its own"), regardless of whether it was discovered while pushing
//! (a stale `base_version`) or while pulling (this device already has an
//! unsynced local edit to the same entity -- see `sync_client::pull_once`).
//! "Learner identity, enrollment, attendance, and grading records never
//! use silent last-write-wins" (ADR-0067 protocol contract, point 6)
//! applies on the pull side exactly as much as the push side.

use rusqlite::Connection;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::sync_hub::AcceptedChange;

/// Stages a pulled hub change this device could not safely apply because
/// it already has an unsynced local edit to the same entity.
/// `locally_known_version` is this device's own last-known version for
/// the entity (what it would otherwise have proposed as `base_version`
/// on its own next push); `change.version` is the version this pulled
/// change actually carries at the hub. Idempotent on `change_id`, same
/// as the push-side staging this shares a table with -- a repeated pull
/// of the same already-staged change (e.g. after a retry) never
/// duplicates the row.
pub fn stage_pull_conflict(
    conn: &Connection,
    school_id: &str,
    locally_known_version: u64,
    change: &AcceptedChange,
) -> AppResult<()> {
    conn.execute(
        "INSERT INTO sync_conflict_review
         (id, change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
          submitted_base_version, current_hub_version, operation, encrypted_payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)
         ON CONFLICT(change_id) DO NOTHING",
        (
            Uuid::now_v7().to_string(),
            change.change_id.to_string(),
            school_id,
            change.device_id.to_string(),
            change.actor_user_id.to_string(),
            change.entity_kind.as_db_str(),
            change.entity_id.to_string(),
            locally_known_version as i64,
            change.version as i64,
            change.operation.as_db_str(),
            &change.encrypted_payload,
        ),
    )?;
    Ok(())
}

/// Count of not-yet-resolved conflicts staged for one school -- for
/// tests and a future review-queue UI's own badge count.
pub fn count_open_for_school(conn: &Connection, school_id: &str) -> AppResult<u64> {
    conn.query_row(
        "SELECT COUNT(*) FROM sync_conflict_review WHERE school_id = ?1 AND resolved_at IS NULL",
        [school_id],
        |row| row.get::<_, i64>(0),
    )
    .map(|count| count as u64)
    .map_err(Into::into)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::sync::{ChangeOperation, EntityKind, SyncCursor};
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    fn change() -> AcceptedChange {
        AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::now_v7(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        }
    }

    #[test]
    fn staging_a_conflict_is_counted_as_open() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        stage_pull_conflict(&conn, &school.id, 1, &change()).unwrap();

        assert_eq!(count_open_for_school(&conn, &school.id).unwrap(), 1);
    }

    #[test]
    fn staging_the_same_change_id_twice_does_not_duplicate() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();

        stage_pull_conflict(&conn, &school.id, 1, &change).unwrap();
        stage_pull_conflict(&conn, &school.id, 1, &change).unwrap();

        assert_eq!(count_open_for_school(&conn, &school.id).unwrap(), 1);
    }
}
