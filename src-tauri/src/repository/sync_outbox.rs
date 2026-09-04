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
            entity_kind_str(change.entity_kind),
            change.entity_id.to_string(),
            change.base_version,
            operation_str(change.operation),
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
    Ok(OutboxEntry {
        school_id: row.get(0)?,
        change: PendingChange {
            change_id: parse_uuid(change_id, 1)?,
            device_id: parse_uuid(device_id, 2)?,
            actor_user_id: parse_uuid(actor_user_id, 3)?,
            entity_kind: parse_entity_kind(&entity_kind, 4)?,
            entity_id: parse_uuid(entity_id, 5)?,
            base_version: row.get(6)?,
            operation: parse_operation(&operation, 7)?,
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

fn entity_kind_str(kind: EntityKind) -> &'static str {
    match kind {
        EntityKind::Learner => "learner",
        EntityKind::Section => "section",
        EntityKind::SectionMembership => "section_membership",
        EntityKind::Attendance => "attendance",
        EntityKind::SubjectAttendance => "subject_attendance",
        EntityKind::AssessmentItem => "assessment_item",
        EntityKind::LearnerScore => "learner_score",
        EntityKind::GradingPeriod => "grading_period",
        EntityKind::Subject => "subject",
        EntityKind::TeachingAssignment => "teaching_assignment",
    }
}

fn parse_entity_kind(value: &str, column: usize) -> rusqlite::Result<EntityKind> {
    match value {
        "learner" => Ok(EntityKind::Learner),
        "section" => Ok(EntityKind::Section),
        "section_membership" => Ok(EntityKind::SectionMembership),
        "attendance" => Ok(EntityKind::Attendance),
        "subject_attendance" => Ok(EntityKind::SubjectAttendance),
        "assessment_item" => Ok(EntityKind::AssessmentItem),
        "learner_score" => Ok(EntityKind::LearnerScore),
        "grading_period" => Ok(EntityKind::GradingPeriod),
        "subject" => Ok(EntityKind::Subject),
        "teaching_assignment" => Ok(EntityKind::TeachingAssignment),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            column,
            Type::Text,
            format!("unknown sync entity kind: {other}").into(),
        )),
    }
}

fn operation_str(operation: ChangeOperation) -> &'static str {
    match operation {
        ChangeOperation::Upsert => "upsert",
        ChangeOperation::Delete => "delete",
    }
}

fn parse_operation(value: &str, column: usize) -> rusqlite::Result<ChangeOperation> {
    match value {
        "upsert" => Ok(ChangeOperation::Upsert),
        "delete" => Ok(ChangeOperation::Delete),
        other => Err(rusqlite::Error::FromSqlConversionFailure(
            column,
            Type::Text,
            format!("unknown sync operation: {other}").into(),
        )),
    }
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
        assert_eq!(
            pending_for_school(&conn, &first.id, 100).unwrap().len(),
            1
        );
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
}
