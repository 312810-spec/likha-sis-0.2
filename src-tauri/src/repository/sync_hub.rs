use rusqlite::{types::Type, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::device_credential::VerifiedDevice;
use crate::sync::{
    validate_change, ChangeOperation, EntityKind, PendingChange, SyncContractError, SyncCursor,
};

/// Bounded batch size for one push -- "Pushes are bounded batches" (ADR-0067
/// protocol contract, point 4). Matches `sync_outbox::pending_for_school`'s
/// own 100-item clamp.
pub const MAX_PUSH_BATCH: usize = 100;

/// `Serialize`/`Deserialize` here (and on `AcceptedChange` below) are for
/// the network listener's response bodies -- `PendingChange`/`SyncCursor`
/// already derive them for the same reason (the request side). Nothing
/// in this repository module depends on a wire format itself; these
/// derives only make the types transport-ready for whichever listener
/// implementation is chosen.
#[derive(Clone, Copy, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(tag = "outcome", content = "cursor", rename_all = "snake_case")]
pub enum PushOutcome {
    /// Newly applied. Carries the hub cursor position this change now
    /// occupies in `sync_hub_log`.
    Accepted(SyncCursor),
    /// This exact `change_id` was already accepted in an earlier call --
    /// the idempotent-replay case (a device retried after a network drop
    /// before it saw the first response). Carries the same cursor the
    /// original acceptance produced, never a second row.
    AlreadyApplied(SyncCursor),
    /// The submitted `base_version` did not match the entity's current
    /// hub version. Staged in `sync_conflict_review`, never silently
    /// applied and never silently dropped -- ADR-0067 protocol contract,
    /// point 6. A repeated push of the same already-staged `change_id`
    /// returns this again without staging a duplicate row.
    ConflictStaged,
}

#[derive(Clone, Debug, Eq, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AcceptedChange {
    pub cursor: SyncCursor,
    pub change_id: Uuid,
    pub device_id: Uuid,
    pub actor_user_id: Uuid,
    pub entity_kind: EntityKind,
    pub entity_id: Uuid,
    /// The hub-assigned version this change resulted in -- NOT the
    /// pushing device's `base_version` (its pre-state). Deliberately a
    /// distinct field/struct from `PendingChange` rather than
    /// overloading `base_version` with two meanings: a device that pulls
    /// this uses `version` as its new locally-known hub version for this
    /// entity, the `base_version` it will submit on its own next push.
    pub version: u64,
    pub operation: ChangeOperation,
    pub encrypted_payload: Vec<u8>,
}

/// Applies up to `MAX_PUSH_BATCH` changes for one already-authenticated
/// device (see `repository::device_credential::verify`). Each change is
/// accepted, replayed, or conflict-staged independently -- one entity's
/// conflict does not roll back another entity's acceptance in the same
/// batch, matching how `classify_conflict`'s per-change contract already
/// works in `crate::sync`.
pub fn push_batch(
    conn: &Connection,
    verified: &VerifiedDevice,
    changes: &[PendingChange],
) -> AppResult<Vec<PushOutcome>> {
    if changes.len() > MAX_PUSH_BATCH {
        return Err(AppError::Database(rusqlite::Error::InvalidParameterName(
            format!(
                "push batch of {} exceeds the {MAX_PUSH_BATCH}-change limit",
                changes.len()
            ),
        )));
    }
    changes
        .iter()
        .map(|change| push_change(conn, verified, change))
        .collect()
}

/// Applies a single change. `verified` is the source of truth for school,
/// device, and actor -- `change.device_id`/`change.actor_user_id` (client-
/// supplied wire fields) are cross-checked against it and rejected on
/// mismatch, exactly as `school_id` is never trusted from a caller
/// elsewhere in this codebase (see `auth::SessionManager::require_active_school_scope`).
pub fn push_change(
    conn: &Connection,
    verified: &VerifiedDevice,
    change: &PendingChange,
) -> AppResult<PushOutcome> {
    validate_change(change).map_err(contract_error)?;
    if change.device_id.to_string() != verified.device_id
        || change.actor_user_id.to_string() != verified.user_id
    {
        return Err(AppError::Unauthorized);
    }

    let change_id = change.change_id.to_string();
    conn.execute_batch("SAVEPOINT sync_hub_push")?;
    let outcome = (|| -> AppResult<PushOutcome> {
        if let Some(cursor) = accepted_cursor_for_change(conn, &change_id)? {
            return Ok(PushOutcome::AlreadyApplied(SyncCursor(cursor)));
        }
        if conflict_is_staged(conn, &change_id)? {
            return Ok(PushOutcome::ConflictStaged);
        }

        let entity_id = change.entity_id.to_string();
        let current = current_version(conn, &verified.school_id, change.entity_kind, &entity_id)?;

        if change.base_version == current {
            let new_version = current + 1;
            conn.execute(
                "INSERT INTO sync_hub_log
                 (change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
                  version, operation, encrypted_payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                (
                    &change_id,
                    &verified.school_id,
                    &verified.device_id,
                    &verified.user_id,
                    change.entity_kind.as_db_str(),
                    &entity_id,
                    new_version as i64,
                    change.operation.as_db_str(),
                    &change.encrypted_payload,
                ),
            )?;
            let cursor = conn.last_insert_rowid();
            Ok(PushOutcome::Accepted(SyncCursor(cursor as u64)))
        } else {
            conn.execute(
                "INSERT INTO sync_conflict_review
                 (id, change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
                  submitted_base_version, current_hub_version, operation, encrypted_payload)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
                (
                    Uuid::now_v7().to_string(),
                    &change_id,
                    &verified.school_id,
                    &verified.device_id,
                    &verified.user_id,
                    change.entity_kind.as_db_str(),
                    &entity_id,
                    change.base_version as i64,
                    current as i64,
                    change.operation.as_db_str(),
                    &change.encrypted_payload,
                ),
            )?;
            Ok(PushOutcome::ConflictStaged)
        }
    })();

    match outcome {
        Ok(outcome) => {
            conn.execute_batch("RELEASE sync_hub_push")?;
            Ok(outcome)
        }
        Err(error) => {
            let _ = conn.execute_batch("ROLLBACK TO sync_hub_push; RELEASE sync_hub_push");
            Err(error)
        }
    }
}

/// Changes accepted after `after`, oldest-first, for one school -- the
/// device-scope filtering `verified` provides. Finer-grained (e.g.
/// per-teacher record) scope is explicitly deferred, matching ADR-0067's
/// own "What this ADR does NOT decide."
pub fn pull_since(
    conn: &Connection,
    school_id: &str,
    after: SyncCursor,
    limit: u16,
) -> AppResult<Vec<AcceptedChange>> {
    let limit = limit.clamp(1, 100);
    let mut stmt = conn.prepare(
        "SELECT cursor, change_id, device_id, actor_user_id, entity_kind, entity_id,
                version, operation, encrypted_payload
         FROM sync_hub_log
         WHERE school_id = ?1 AND cursor > ?2
         ORDER BY cursor
         LIMIT ?3",
    )?;
    let rows = stmt.query_map((school_id, after.0 as i64, limit), row_to_accepted_change)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn accepted_cursor_for_change(conn: &Connection, change_id: &str) -> AppResult<Option<u64>> {
    conn.query_row(
        "SELECT cursor FROM sync_hub_log WHERE change_id = ?1",
        [change_id],
        |row| row.get::<_, i64>(0),
    )
    .optional()
    .map(|found| found.map(|cursor| cursor as u64))
    .map_err(Into::into)
}

fn conflict_is_staged(conn: &Connection, change_id: &str) -> AppResult<bool> {
    let staged: Option<String> = conn
        .query_row(
            "SELECT id FROM sync_conflict_review WHERE change_id = ?1 AND resolved_at IS NULL",
            [change_id],
            |row| row.get(0),
        )
        .optional()?;
    Ok(staged.is_some())
}

fn current_version(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
) -> AppResult<u64> {
    let version: i64 = conn.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM sync_hub_log
         WHERE school_id = ?1 AND entity_kind = ?2 AND entity_id = ?3",
        (school_id, entity_kind.as_db_str(), entity_id),
        |row| row.get(0),
    )?;
    Ok(version as u64)
}

fn row_to_accepted_change(row: &rusqlite::Row<'_>) -> rusqlite::Result<AcceptedChange> {
    let cursor: i64 = row.get(0)?;
    let change_id: String = row.get(1)?;
    let device_id: String = row.get(2)?;
    let actor_user_id: String = row.get(3)?;
    let entity_kind: String = row.get(4)?;
    let entity_id: String = row.get(5)?;
    let version: i64 = row.get(6)?;
    let operation: String = row.get(7)?;

    Ok(AcceptedChange {
        cursor: SyncCursor(cursor as u64),
        change_id: parse_uuid(change_id, 1)?,
        device_id: parse_uuid(device_id, 2)?,
        actor_user_id: parse_uuid(actor_user_id, 3)?,
        entity_kind: EntityKind::from_db_str(&entity_kind).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                4,
                Type::Text,
                format!("unknown sync entity kind: {entity_kind}").into(),
            )
        })?,
        entity_id: parse_uuid(entity_id, 5)?,
        version: version as u64,
        operation: ChangeOperation::from_db_str(&operation).ok_or_else(|| {
            rusqlite::Error::FromSqlConversionFailure(
                7,
                Type::Text,
                format!("unknown sync operation: {operation}").into(),
            )
        })?,
        encrypted_payload: row.get(8)?,
    })
}

fn parse_uuid(value: String, column: usize) -> rusqlite::Result<Uuid> {
    Uuid::parse_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(error))
    })
}

fn contract_error(error: SyncContractError) -> AppError {
    rusqlite::Error::InvalidParameterName(format!("invalid encrypted sync payload: {error:?}"))
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap()
    }

    fn setup() -> (Connection, VerifiedDevice) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let verified = VerifiedDevice {
            credential_id: "cred-1".to_string(),
            school_id: school.id,
            user_id: Uuid::now_v7().to_string(),
            device_id: Uuid::now_v7().to_string(),
        };
        (conn, verified)
    }

    fn change_for(verified: &VerifiedDevice, entity_id: Uuid, base_version: u64) -> PendingChange {
        PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::parse_str(&verified.device_id).unwrap(),
            actor_user_id: Uuid::parse_str(&verified.user_id).unwrap(),
            entity_kind: EntityKind::Learner,
            entity_id,
            base_version,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        }
    }

    #[test]
    fn a_first_push_for_a_new_entity_is_accepted_at_version_one() {
        let (conn, verified) = setup();
        let change = change_for(&verified, Uuid::now_v7(), 0);

        let outcome = push_change(&conn, &verified, &change).unwrap();

        assert_eq!(outcome, PushOutcome::Accepted(SyncCursor(1)));
    }

    #[test]
    fn a_second_push_matching_the_new_current_version_is_also_accepted() {
        let (conn, verified) = setup();
        let entity_id = Uuid::now_v7();
        let first = change_for(&verified, entity_id, 0);
        push_change(&conn, &verified, &first).unwrap();

        let second = change_for(&verified, entity_id, 1);
        let outcome = push_change(&conn, &verified, &second).unwrap();

        assert_eq!(outcome, PushOutcome::Accepted(SyncCursor(2)));
    }

    #[test]
    fn a_stale_base_version_is_staged_for_review_not_silently_applied() {
        let (conn, verified) = setup();
        let entity_id = Uuid::now_v7();
        let first = change_for(&verified, entity_id, 0);
        push_change(&conn, &verified, &first).unwrap();

        // A second device's edit, still based on version 0 -- but the
        // entity has already moved to version 1.
        let stale = change_for(&verified, entity_id, 0);
        let outcome = push_change(&conn, &verified, &stale).unwrap();

        assert_eq!(outcome, PushOutcome::ConflictStaged);
        let staged: (i64, i64) = conn
            .query_row(
                "SELECT submitted_base_version, current_hub_version FROM sync_conflict_review WHERE change_id = ?1",
                [stale.change_id.to_string()],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(staged, (0, 1));
        // The log itself must be untouched by the rejected change.
        let log_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_hub_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(log_count, 1);
    }

    #[test]
    fn replaying_the_same_change_id_after_acceptance_is_idempotent() {
        let (conn, verified) = setup();
        let change = change_for(&verified, Uuid::now_v7(), 0);
        let first = push_change(&conn, &verified, &change).unwrap();
        let PushOutcome::Accepted(original_cursor) = first else {
            panic!("expected the first push to be Accepted");
        };

        let replay = push_change(&conn, &verified, &change).unwrap();

        assert_eq!(
            replay,
            PushOutcome::AlreadyApplied(original_cursor),
            "a replay reports AlreadyApplied at the SAME cursor the original acceptance produced"
        );
        let log_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_hub_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(log_count, 1, "a replay must never insert a second row");
    }

    #[test]
    fn replaying_an_already_staged_conflicts_change_id_does_not_duplicate_it() {
        let (conn, verified) = setup();
        let entity_id = Uuid::now_v7();
        push_change(&conn, &verified, &change_for(&verified, entity_id, 0)).unwrap();
        let stale = change_for(&verified, entity_id, 0);
        push_change(&conn, &verified, &stale).unwrap();

        let replay = push_change(&conn, &verified, &stale).unwrap();

        assert_eq!(replay, PushOutcome::ConflictStaged);
        let staged_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_conflict_review", [], |row| {
                row.get(0)
            })
            .unwrap();
        assert_eq!(staged_count, 1);
    }

    #[test]
    fn a_change_claiming_a_different_device_than_the_verified_one_is_rejected() {
        let (conn, verified) = setup();
        let mut change = change_for(&verified, Uuid::now_v7(), 0);
        change.device_id = Uuid::now_v7();

        let result = push_change(&conn, &verified, &change);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn a_change_claiming_a_different_actor_than_the_verified_one_is_rejected() {
        let (conn, verified) = setup();
        let mut change = change_for(&verified, Uuid::now_v7(), 0);
        change.actor_user_id = Uuid::now_v7();

        let result = push_change(&conn, &verified, &change);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn an_invalid_payload_is_rejected_before_touching_either_table() {
        let (conn, verified) = setup();
        let mut change = change_for(&verified, Uuid::now_v7(), 0);
        change.encrypted_payload = vec![];

        let result = push_change(&conn, &verified, &change);

        assert!(result.is_err());
        let log_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_hub_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(log_count, 0);
    }

    #[test]
    fn push_batch_rejects_a_batch_larger_than_the_limit() {
        let (conn, verified) = setup();
        let changes: Vec<PendingChange> = (0..MAX_PUSH_BATCH + 1)
            .map(|_| change_for(&verified, Uuid::now_v7(), 0))
            .collect();

        let result = push_batch(&conn, &verified, &changes);

        assert!(result.is_err());
        let log_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_hub_log", [], |row| row.get(0))
            .unwrap();
        assert_eq!(log_count, 0, "an oversized batch must apply nothing");
    }

    #[test]
    fn one_conflicting_change_in_a_batch_does_not_roll_back_the_others() {
        let (conn, verified) = setup();
        let entity_id = Uuid::now_v7();
        push_change(&conn, &verified, &change_for(&verified, entity_id, 0)).unwrap();

        let batch = vec![
            change_for(&verified, entity_id, 0), // stale -> conflict-staged
            change_for(&verified, Uuid::now_v7(), 0), // unrelated -> accepted
        ];
        let outcomes = push_batch(&conn, &verified, &batch).unwrap();

        assert_eq!(outcomes[0], PushOutcome::ConflictStaged);
        assert!(matches!(outcomes[1], PushOutcome::Accepted(_)));
    }

    #[test]
    fn pull_since_returns_only_changes_after_the_given_cursor_in_order() {
        let (conn, verified) = setup();
        let a = push_change(&conn, &verified, &change_for(&verified, Uuid::now_v7(), 0)).unwrap();
        let _b = push_change(&conn, &verified, &change_for(&verified, Uuid::now_v7(), 0)).unwrap();
        let PushOutcome::Accepted(after) = a else {
            panic!("expected Accepted");
        };

        let pulled = pull_since(&conn, &verified.school_id, after, 100).unwrap();

        assert_eq!(pulled.len(), 1);
        assert_eq!(pulled[0].cursor, SyncCursor(2));
    }

    #[test]
    fn pull_since_never_returns_another_schools_changes() {
        let (conn, verified) = setup();
        push_change(&conn, &verified, &change_for(&verified, Uuid::now_v7(), 0)).unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let pulled = pull_since(&conn, &other_school.id, SyncCursor(0), 100).unwrap();

        assert!(pulled.is_empty());
    }

    #[test]
    fn pull_since_respects_the_limit() {
        let (conn, verified) = setup();
        for _ in 0..5 {
            push_change(&conn, &verified, &change_for(&verified, Uuid::now_v7(), 0)).unwrap();
        }

        let pulled = pull_since(&conn, &verified.school_id, SyncCursor(0), 2).unwrap();

        assert_eq!(pulled.len(), 2);
    }

    #[test]
    fn push_outcome_round_trips_through_json_for_all_variants() {
        for outcome in [
            PushOutcome::Accepted(SyncCursor(7)),
            PushOutcome::AlreadyApplied(SyncCursor(3)),
            PushOutcome::ConflictStaged,
        ] {
            let json = serde_json::to_string(&outcome).unwrap();
            let round_tripped: PushOutcome = serde_json::from_str(&json).unwrap();
            assert_eq!(round_tripped, outcome);
        }
    }

    #[test]
    fn accepted_change_round_trips_through_json() {
        let (conn, verified) = setup();
        let outcome =
            push_change(&conn, &verified, &change_for(&verified, Uuid::now_v7(), 0)).unwrap();
        let PushOutcome::Accepted(cursor) = outcome else {
            panic!("expected Accepted");
        };
        let pulled = pull_since(&conn, &verified.school_id, SyncCursor(0), 1).unwrap();
        assert_eq!(pulled[0].cursor, cursor);

        let json = serde_json::to_string(&pulled[0]).unwrap();
        let round_tripped: AcceptedChange = serde_json::from_str(&json).unwrap();

        assert_eq!(round_tripped, pulled[0]);
    }
}
