use rusqlite::Connection;
use serde::Serialize;

use crate::error::AppResult;
use crate::repository::sync_version_cache;
use crate::sync::EntityKind;

/// Conservative, read-only sync evidence for one entity in one trusted school scope.
///
/// This is deliberately an infrastructure/repository primitive, not a UI contract.
/// It composes facts already persisted by the sync subsystem:
/// - an unresolved conflict means a teacher decision is required;
/// - a queued outbox row means this device still has a change waiting to push;
/// - a positive `sync_version_cache` entry means this device has observed an accepted
///   hub version for the entity through a successful push/replay or pull.
///
/// Precedence matters. A conflict can coexist with a still-pending local change, so
/// `NeedsReview` must win over `WaitingToSync`. A pending change must win over a
/// previously-known hub version because the local entity has changed again since that
/// earlier acknowledgment.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum EntitySyncState {
    NeedsReview,
    WaitingToSync,
    Synced,
    NotYetSynced,
}

pub fn status_for_entity(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
) -> AppResult<EntitySyncState> {
    let has_open_conflict: bool = conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM sync_conflict_review \
             WHERE school_id = ?1 \
               AND entity_kind = ?2 \
               AND entity_id = ?3 \
               AND resolved_at IS NULL\
         )",
        (school_id, entity_kind.as_db_str(), entity_id),
        |row| row.get(0),
    )?;
    if has_open_conflict {
        return Ok(EntitySyncState::NeedsReview);
    }

    let has_pending_change: bool = conn.query_row(
        "SELECT EXISTS(\
             SELECT 1 FROM sync_outbox \
             WHERE school_id = ?1 \
               AND entity_kind = ?2 \
               AND entity_id = ?3\
         )",
        (school_id, entity_kind.as_db_str(), entity_id),
        |row| row.get(0),
    )?;
    if has_pending_change {
        return Ok(EntitySyncState::WaitingToSync);
    }

    let known_version = sync_version_cache::known_version(conn, school_id, entity_kind, entity_id)?;
    if known_version > 0 {
        return Ok(EntitySyncState::Synced);
    }

    Ok(EntitySyncState::NotYetSynced)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{school, sync_conflict_review, sync_outbox, sync_version_cache};
    use crate::sync::{ChangeOperation, PendingChange, SyncCursor};
    use std::path::Path;
    use uuid::Uuid;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn pending_change(entity_id: Uuid) -> PendingChange {
        PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::LearnerScore,
            entity_id,
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![7, 8, 9],
        }
    }

    fn accepted_change(entity_id: Uuid) -> crate::repository::sync_hub::AcceptedChange {
        crate::repository::sync_hub::AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::LearnerScore,
            entity_id,
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        }
    }

    #[test]
    fn never_seen_entity_is_not_yet_synced() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();

        assert_eq!(
            status_for_entity(
                &conn,
                &school.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::NotYetSynced
        );
    }

    #[test]
    fn known_hub_version_without_pending_or_conflict_is_synced() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();
        sync_version_cache::record_known_version(
            &conn,
            &school.id,
            EntityKind::LearnerScore,
            &entity_id.to_string(),
            3,
        )
        .unwrap();

        assert_eq!(
            status_for_entity(
                &conn,
                &school.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::Synced
        );
    }

    #[test]
    fn pending_change_overrides_an_older_known_hub_version() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();
        sync_version_cache::record_known_version(
            &conn,
            &school.id,
            EntityKind::LearnerScore,
            &entity_id.to_string(),
            2,
        )
        .unwrap();
        let change = pending_change(entity_id);
        sync_outbox::enqueue(&conn, &school.id, &change).unwrap();

        assert_eq!(
            status_for_entity(
                &conn,
                &school.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::WaitingToSync
        );
    }

    #[test]
    fn open_conflict_overrides_pending_change() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();
        let change = pending_change(entity_id);
        sync_outbox::enqueue(&conn, &school.id, &change).unwrap();
        sync_conflict_review::stage_pull_conflict(
            &conn,
            &school.id,
            1,
            &accepted_change(entity_id),
        )
        .unwrap();

        assert_eq!(
            status_for_entity(
                &conn,
                &school.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::NeedsReview
        );
    }

    #[test]
    fn evidence_is_scoped_to_the_trusted_school() {
        let conn = open_test_db();
        let first = school::create(&conn, "Synthetic School A").unwrap();
        let second = school::create(&conn, "Synthetic School B").unwrap();
        let entity_id = Uuid::now_v7();
        sync_version_cache::record_known_version(
            &conn,
            &first.id,
            EntityKind::LearnerScore,
            &entity_id.to_string(),
            4,
        )
        .unwrap();

        assert_eq!(
            status_for_entity(
                &conn,
                &second.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::NotYetSynced
        );
    }

    #[test]
    fn acknowledging_an_older_change_does_not_hide_a_newer_pending_edit() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();
        let first = pending_change(entity_id);
        let second = pending_change(entity_id);
        sync_outbox::enqueue(&conn, &school.id, &first).unwrap();
        sync_outbox::enqueue(&conn, &school.id, &second).unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &school.id,
            EntityKind::LearnerScore,
            &entity_id.to_string(),
            1,
        )
        .unwrap();
        assert!(sync_outbox::acknowledge(&conn, &school.id, &first.change_id.to_string()).unwrap());

        assert_eq!(
            status_for_entity(
                &conn,
                &school.id,
                EntityKind::LearnerScore,
                &entity_id.to_string(),
            )
            .unwrap(),
            EntitySyncState::WaitingToSync
        );
    }

    #[test]
    fn failed_push_attempts_never_turn_pending_changes_into_synced_evidence() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School").unwrap();
        let entity_id = Uuid::now_v7();
        let change = pending_change(entity_id);
        sync_outbox::enqueue(&conn, &school.id, &change).unwrap();
        for error in [
            sync_outbox::AttemptErrorCode::Offline,
            sync_outbox::AttemptErrorCode::Timeout,
            sync_outbox::AttemptErrorCode::Unauthorized,
            sync_outbox::AttemptErrorCode::HubUnavailable,
            sync_outbox::AttemptErrorCode::ProtocolRejected,
        ] {
            assert!(sync_outbox::record_attempt(
                &conn,
                &school.id,
                &change.change_id.to_string(),
                Some(error),
            )
            .unwrap());
            assert_eq!(
                status_for_entity(
                    &conn,
                    &school.id,
                    EntityKind::LearnerScore,
                    &entity_id.to_string(),
                )
                .unwrap(),
                EntitySyncState::WaitingToSync
            );
        }
    }

    #[test]
    fn pending_and_conflict_evidence_do_not_leak_across_school_kind_or_entity() {
        let conn = open_test_db();
        let school = school::create(&conn, "Synthetic School A").unwrap();
        let other_school = school::create(&conn, "Synthetic School B").unwrap();
        let entity_id = Uuid::now_v7();
        sync_outbox::enqueue(&conn, &school.id, &pending_change(entity_id)).unwrap();
        for with_conflict in [false, true] {
            if with_conflict {
                sync_conflict_review::stage_pull_conflict(
                    &conn,
                    &school.id,
                    0,
                    &accepted_change(entity_id),
                )
                .unwrap();
            }
            for (scope, kind, id) in [
                (&other_school.id, EntityKind::LearnerScore, entity_id),
                (&school.id, EntityKind::Attendance, entity_id),
                (&school.id, EntityKind::LearnerScore, Uuid::now_v7()),
            ] {
                assert_eq!(
                    status_for_entity(&conn, scope, kind, &id.to_string()).unwrap(),
                    EntitySyncState::NotYetSynced
                );
            }
        }
    }
}
