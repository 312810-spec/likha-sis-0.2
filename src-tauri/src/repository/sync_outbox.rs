use rusqlite::{types::Type, Connection};

use crate::{
    error::AppResult,
    sync::{validate_change, ChangeOperation, EntityKind, PendingChange, SyncContractError},
};

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum EnqueueOutcome {
    Enqueued,
    AlreadyQueued,
}

#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum AttemptErrorCode {
    Offline,
    Timeout,
    Unauthorized,
    HubUnavailable,
    ProtocolRejected,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutboxEntry {
    pub school_id: String,
    pub change: PendingChange,
    pub attempt_count: u32,
    pub last_error_code: Option<String>,
}

/// Adds a pre-encrypted change to the local queue. Call this with the same
/// `Connection`/transaction used for the domain mutation so commit or rollback
/// covers both writes. The school is a trusted repository argument and is not
/// part of the provider payload.
pub fn enqueue(
    conn: &Connection,
    school_id: &str,
    change: &PendingChange,
) -> AppResult<EnqueueOutcome> {
    validate_change(change).map_err(contract_error_as_sqlite)?;
    let rows = conn.execute(
        "INSERT INTO sync_outbox
         (change_id, school_id, device_id, actor_user_id, entity_kind, entity_id,
          base_version, operation, encrypted_payload)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
         ON CONFLICT(change_id) DO NOTHING",
        (
            change.change_id.to_string(),
            school_id,
            change.device_id.to_string(),
            change.actor_user_id.to_string(),
            change.entity_kind.as_db_str(),
            change.entity_id.to_string(),
            change.base_version as i64,
            change.operation.as_db_str(),
            &change.encrypted_payload,
        ),
    )?;
    Ok(if rows == 1 {
        EnqueueOutcome::Enqueued
    } else {
        EnqueueOutcome::AlreadyQueued
    })
}

/// Oldest-first bounded batch for one trusted school scope.
pub fn pending_for_school(
    conn: &Connection,
    school_id: &str,
    limit: u16,
) -> AppResult<Vec<OutboxEntry>> {
    let limit = limit.clamp(1, 100);
    let mut stmt = conn.prepare(
        "SELECT school_id, change_id, device_id, actor_user_id, entity_kind,
                entity_id, base_version, operation, encrypted_payload,
                attempt_count, last_error_code
         FROM sync_outbox
         WHERE school_id = ?1
         ORDER BY created_at, change_id
         LIMIT ?2",
    )?;
    let rows = stmt.query_map((school_id, limit), row_to_entry)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Count of changes still queued (not yet acknowledged by the hub) for
/// one school -- the sync-status screen's "N changes waiting to sync"
/// figure. Not bounded by `pending_for_school`'s 100-row page limit;
/// this is a true `COUNT(*)`.
pub fn count_pending_for_school(conn: &Connection, school_id: &str) -> AppResult<u64> {
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM sync_outbox WHERE school_id = ?1",
        [school_id],
        |row| row.get(0),
    )?;
    Ok(count as u64)
}

/// True if at least one still-pending change for this school recorded a
/// failed attempt (`last_error_code IS NOT NULL`) -- the sync-status
/// screen's best-available "having trouble reaching the sync hub"
/// signal. This is a real, already-recorded fact (`record_attempt`),
/// not an invented health check: a change that has never been attempted,
/// or that failed once and then succeeded (which acknowledges and
/// deletes the row), does not trip this.
pub fn has_pending_failure_for_school(conn: &Connection, school_id: &str) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM sync_outbox WHERE school_id = ?1 AND last_error_code IS NOT NULL)",
        [school_id],
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// Removes an acknowledged change only within its school boundary. A repeated
/// acknowledgement is harmless and reports `false`.
pub fn acknowledge(conn: &Connection, school_id: &str, change_id: &str) -> AppResult<bool> {
    Ok(conn.execute(
        "DELETE FROM sync_outbox WHERE change_id = ?1 AND school_id = ?2",
        (change_id, school_id),
    )? == 1)
}

pub fn record_attempt(
    conn: &Connection,
    school_id: &str,
    change_id: &str,
    error_code: Option<AttemptErrorCode>,
) -> AppResult<bool> {
    let error_code = error_code.map(attempt_error_str);
    Ok(conn.execute(
        "UPDATE sync_outbox
         SET attempt_count = attempt_count + 1,
             last_attempt_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'),
             last_error_code = ?1
         WHERE change_id = ?2 AND school_id = ?3",
        (error_code, change_id, school_id),
    )? == 1)
}

/// Corrects a still-pending outbox row's `base_version` after a teacher
/// resolves a pull-side conflict by keeping this device's own local edit
/// (`ConflictResolution::KeptLocal` in `sync_conflict_review`). That
/// resolution clears the conflict-review row but, on its own, leaves this
/// device's pending push for the same entity still carrying whatever
/// `base_version` it was originally enqueued with -- which is now stale,
/// since the hub-side version has since advanced to `new_base_version`
/// (the `current_hub_version` recorded when the conflict was staged). Left
/// uncorrected, the NEXT push attempt for this entity would still submit
/// the old `base_version`, and `sync_hub::push_change` would treat it as
/// stale and re-stage the very conflict this resolution was meant to
/// close.
///
/// Scoped to `school_id` + `entity_kind` + `entity_id` rather than
/// `change_id`, because the outbox row this must correct is this DEVICE's
/// own still-pending push for the entity -- an entirely different
/// `change_id` from the pulled change that was staged as a conflict (see
/// `sync_conflict_review::stage_pull_conflict`'s own doc comment: the
/// conflict row never touches the domain table or this device's own
/// queued push). A no-op (returns `0`) when there is no matching pending
/// row -- e.g. this device's own push already went through, or it never
/// had one queued for this entity -- which is a normal, harmless case,
/// not an error.
pub fn correct_base_version_for_entity(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
    new_base_version: u64,
) -> AppResult<u64> {
    let updated = conn.execute(
        "UPDATE sync_outbox
         SET base_version = ?1
         WHERE school_id = ?2 AND entity_kind = ?3 AND entity_id = ?4",
        (
            new_base_version as i64,
            school_id,
            entity_kind.as_db_str(),
            entity_id,
        ),
    )?;
    Ok(updated as u64)
}

fn attempt_error_str(error: AttemptErrorCode) -> &'static str {
    match error {
        AttemptErrorCode::Offline => "offline",
        AttemptErrorCode::Timeout => "timeout",
        AttemptErrorCode::Unauthorized => "unauthorized",
        AttemptErrorCode::HubUnavailable => "hub_unavailable",
        AttemptErrorCode::ProtocolRejected => "protocol_rejected",
    }
}

fn row_to_entry(row: &rusqlite::Row<'_>) -> rusqlite::Result<OutboxEntry> {
    let change_id: String = row.get(1)?;
    let device_id: String = row.get(2)?;
    let actor_user_id: String = row.get(3)?;
    let entity_kind: String = row.get(4)?;
    let entity_id: String = row.get(5)?;
    let operation: String = row.get(7)?;
    let base_version: i64 = row.get(6)?;
    Ok(OutboxEntry {
        school_id: row.get(0)?,
        change: PendingChange {
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
            base_version: u64::try_from(base_version).map_err(|error| {
                rusqlite::Error::FromSqlConversionFailure(6, Type::Integer, Box::new(error))
            })?,
            operation: ChangeOperation::from_db_str(&operation).ok_or_else(|| {
                rusqlite::Error::FromSqlConversionFailure(
                    7,
                    Type::Text,
                    format!("unknown sync operation: {operation}").into(),
                )
            })?,
            encrypted_payload: row.get(8)?,
        },
        attempt_count: row.get(9)?,
        last_error_code: row.get(10)?,
    })
}

fn parse_uuid(value: String, column: usize) -> rusqlite::Result<uuid::Uuid> {
    uuid::Uuid::parse_str(&value).map_err(|error| {
        rusqlite::Error::FromSqlConversionFailure(column, Type::Text, Box::new(error))
    })
}

fn contract_error_as_sqlite(error: SyncContractError) -> crate::error::AppError {
    rusqlite::Error::InvalidParameterName(format!("invalid encrypted sync payload: {error:?}"))
        .into()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{crypto, db, repository::school};
    use rusqlite::TransactionBehavior;
    use std::path::Path;
    use uuid::Uuid;

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

    #[test]
    fn enqueue_is_idempotent_and_round_trips_ciphertext() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();

        assert_eq!(
            enqueue(&conn, &school.id, &change).unwrap(),
            EnqueueOutcome::Enqueued
        );
        assert_eq!(
            enqueue(&conn, &school.id, &change).unwrap(),
            EnqueueOutcome::AlreadyQueued
        );

        let entries = pending_for_school(&conn, &school.id, 20).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].change, change);
    }

    #[test]
    fn queue_is_school_scoped_for_reads_attempts_and_acknowledgements() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let first = school::create(&conn, "First School").unwrap();
        let second = school::create(&conn, "Second School").unwrap();
        let change = change();
        enqueue(&conn, &first.id, &change).unwrap();

        assert!(pending_for_school(&conn, &second.id, 100)
            .unwrap()
            .is_empty());
        assert!(!record_attempt(
            &conn,
            &second.id,
            &change.change_id.to_string(),
            Some(AttemptErrorCode::Offline)
        )
        .unwrap());
        assert!(!acknowledge(&conn, &second.id, &change.change_id.to_string()).unwrap());
        assert_eq!(pending_for_school(&conn, &first.id, 100).unwrap().len(), 1);
    }

    #[test]
    fn count_pending_for_school_counts_only_that_schools_queued_changes() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let first = school::create(&conn, "First School").unwrap();
        let second = school::create(&conn, "Second School").unwrap();
        enqueue(&conn, &first.id, &change()).unwrap();
        enqueue(&conn, &first.id, &change()).unwrap();
        enqueue(&conn, &second.id, &change()).unwrap();

        assert_eq!(count_pending_for_school(&conn, &first.id).unwrap(), 2);
        assert_eq!(count_pending_for_school(&conn, &second.id).unwrap(), 1);
    }

    #[test]
    fn count_pending_for_school_drops_to_zero_once_acknowledged() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();
        enqueue(&conn, &school.id, &change).unwrap();

        acknowledge(&conn, &school.id, &change.change_id.to_string()).unwrap();

        assert_eq!(count_pending_for_school(&conn, &school.id).unwrap(), 0);
    }

    #[test]
    fn has_pending_failure_for_school_is_false_until_an_attempt_records_an_error() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();
        enqueue(&conn, &school.id, &change).unwrap();

        assert!(!has_pending_failure_for_school(&conn, &school.id).unwrap());

        record_attempt(
            &conn,
            &school.id,
            &change.change_id.to_string(),
            Some(AttemptErrorCode::HubUnavailable),
        )
        .unwrap();

        assert!(has_pending_failure_for_school(&conn, &school.id).unwrap());
    }

    #[test]
    fn has_pending_failure_for_school_is_false_once_the_failing_change_is_acknowledged() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();
        enqueue(&conn, &school.id, &change).unwrap();
        record_attempt(
            &conn,
            &school.id,
            &change.change_id.to_string(),
            Some(AttemptErrorCode::Timeout),
        )
        .unwrap();

        acknowledge(&conn, &school.id, &change.change_id.to_string()).unwrap();

        assert!(!has_pending_failure_for_school(&conn, &school.id).unwrap());
    }

    #[test]
    fn outbox_write_rolls_back_with_the_domain_transaction() {
        let mut conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();
        {
            let tx = conn
                .transaction_with_behavior(TransactionBehavior::Immediate)
                .unwrap();
            tx.execute(
                "INSERT INTO learners (id, school_id, given_name, family_name) VALUES (?1, ?2, 'Synthetic', 'Learner')",
                (change.entity_id.to_string(), &school.id),
            )
            .unwrap();
            enqueue(&tx, &school.id, &change).unwrap();
            tx.rollback().unwrap();
        }

        let learner_count: i64 = conn
            .query_row("SELECT count(*) FROM learners", [], |row| row.get(0))
            .unwrap();
        assert_eq!(learner_count, 0);
        assert!(pending_for_school(&conn, &school.id, 100)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn correct_base_version_for_entity_updates_the_matching_pending_row() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();
        enqueue(&conn, &school.id, &change).unwrap();

        let updated = correct_base_version_for_entity(
            &conn,
            &school.id,
            change.entity_kind,
            &change.entity_id.to_string(),
            7,
        )
        .unwrap();

        assert_eq!(updated, 1);
        let entries = pending_for_school(&conn, &school.id, 20).unwrap();
        assert_eq!(entries.len(), 1);
        assert_eq!(entries[0].change.base_version, 7);
    }

    #[test]
    fn correct_base_version_for_entity_is_a_harmless_no_op_when_nothing_is_pending() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let school = school::create(&conn, "Rizal Elementary").unwrap();

        let updated = correct_base_version_for_entity(
            &conn,
            &school.id,
            EntityKind::Learner,
            &Uuid::now_v7().to_string(),
            7,
        )
        .unwrap();

        assert_eq!(updated, 0);
    }

    #[test]
    fn correct_base_version_for_entity_is_school_scoped() {
        let conn = db::open(Path::new(":memory:"), &crypto::generate_key()).unwrap();
        let first = school::create(&conn, "First School").unwrap();
        let second = school::create(&conn, "Second School").unwrap();
        let change = change();
        enqueue(&conn, &first.id, &change).unwrap();

        let updated = correct_base_version_for_entity(
            &conn,
            &second.id,
            change.entity_kind,
            &change.entity_id.to_string(),
            7,
        )
        .unwrap();

        assert_eq!(updated, 0);
        let entries = pending_for_school(&conn, &first.id, 20).unwrap();
        assert_eq!(entries[0].change.base_version, 0);
    }
}
