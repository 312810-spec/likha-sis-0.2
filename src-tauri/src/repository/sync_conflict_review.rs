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

use rusqlite::{Connection, OptionalExtension};
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::sync_hub::AcceptedChange;
use crate::sync::{ChangeOperation, EntityKind};

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

/// A staged conflict row exactly as `commands::conflict_review`'s
/// review screen needs it: it holds the INCOMING pulled change's still-
/// encrypted payload (decrypting it is the command layer's job, since it
/// needs the SSPK, which this repository module has no business
/// resolving) plus every piece of metadata a teacher needs to tell two
/// versions apart -- which device the incoming edit came from, when, and
/// what versions were in conflict. It does NOT hold the LOCAL version's
/// field values: this device's own unsynced edit was never touched when
/// the conflict was staged (see `sync_client::pull_once`), so it is still
/// sitting, live, in the ordinary domain table under `entity_id` -- the
/// command layer reads it from there instead of duplicating it here.
#[derive(Debug, Clone)]
pub struct ConflictReviewRow {
    pub id: String,
    pub change_id: String,
    pub device_id: String,
    pub actor_user_id: String,
    pub entity_kind: EntityKind,
    pub entity_id: String,
    pub submitted_base_version: u64,
    pub current_hub_version: u64,
    pub operation: ChangeOperation,
    pub encrypted_payload: Vec<u8>,
    pub created_at: String,
}

fn row_to_conflict_review(row: &rusqlite::Row) -> rusqlite::Result<ConflictReviewRow> {
    let entity_kind_str: String = row.get(4)?;
    let entity_kind = EntityKind::from_db_str(&entity_kind_str).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            4,
            rusqlite::types::Type::Text,
            format!("unknown entity_kind: {entity_kind_str}").into(),
        )
    })?;
    let operation_str: String = row.get(8)?;
    let operation = ChangeOperation::from_db_str(&operation_str).ok_or_else(|| {
        rusqlite::Error::FromSqlConversionFailure(
            8,
            rusqlite::types::Type::Text,
            format!("unknown operation: {operation_str}").into(),
        )
    })?;
    Ok(ConflictReviewRow {
        id: row.get(0)?,
        change_id: row.get(1)?,
        device_id: row.get(2)?,
        actor_user_id: row.get(3)?,
        entity_kind,
        entity_id: row.get(5)?,
        submitted_base_version: row.get::<_, i64>(6)? as u64,
        current_hub_version: row.get::<_, i64>(7)? as u64,
        operation,
        encrypted_payload: row.get(9)?,
        created_at: row.get(10)?,
    })
}

/// Every not-yet-resolved conflict staged for one school, oldest first --
/// so a teacher works through the queue in the order these edits actually
/// happened, rather than newest-first hiding an older one. Tenant scope
/// is enforced in the `WHERE` clause itself, not by filtering a caller-
/// supplied list, matching this codebase's established convention.
pub fn list_open_for_school(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Vec<ConflictReviewRow>> {
    let mut stmt = conn.prepare(
        "SELECT id, change_id, device_id, actor_user_id, entity_kind, entity_id, \
                submitted_base_version, current_hub_version, operation, encrypted_payload, created_at \
         FROM sync_conflict_review \
         WHERE school_id = ?1 AND resolved_at IS NULL \
         ORDER BY created_at ASC",
    )?;
    let rows = stmt.query_map([school_id], row_to_conflict_review)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// How a teacher resolved one staged conflict -- see migration 35's own
/// doc comment for why this is recorded, not just a timestamp.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ConflictResolution {
    /// This device's own unsynced local edit is kept; the incoming hub
    /// version is discarded (never applied to the domain table).
    KeptLocal,
    /// The incoming hub version is applied to the domain table (by the
    /// command layer, which already had to decrypt it to show the
    /// teacher a preview), overwriting this device's local edit.
    UsedIncoming,
}

impl ConflictResolution {
    fn as_db_str(self) -> &'static str {
        match self {
            ConflictResolution::KeptLocal => "kept_local",
            ConflictResolution::UsedIncoming => "used_incoming",
        }
    }
}

/// One not-yet-resolved conflict, looked up by id and scoped to
/// `school_id` in the same statement as the lookup -- matching
/// `learner::find_by_id_in_school`'s "impossible to reach another
/// school's row via a guessed id" shape. `None` for "no such open
/// conflict in this school," never distinguishing "doesn't exist,"
/// "already resolved," and "belongs to a different school."
pub fn find_open_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<ConflictReviewRow>> {
    conn.query_row(
        "SELECT id, change_id, device_id, actor_user_id, entity_kind, entity_id, \
                submitted_base_version, current_hub_version, operation, encrypted_payload, created_at \
         FROM sync_conflict_review \
         WHERE id = ?1 AND school_id = ?2 AND resolved_at IS NULL",
        (id, school_id),
        row_to_conflict_review,
    )
    .optional()
    .map_err(Into::into)
}

/// Marks one staged conflict resolved, recording HOW it was resolved.
/// Scoped to `school_id` and to still-open rows in the same `UPDATE`
/// statement -- a caller can never resolve another school's conflict, or
/// re-resolve one already closed (the statement simply matches zero
/// rows). Returns whether a row was actually updated, so the command
/// layer can tell "already resolved / wrong school / unknown id" apart
/// from a genuine success without a separate lookup.
pub fn mark_resolved(
    conn: &Connection,
    school_id: &str,
    id: &str,
    resolution: ConflictResolution,
) -> AppResult<bool> {
    let updated = conn.execute(
        "UPDATE sync_conflict_review \
         SET resolved_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), resolution = ?1 \
         WHERE id = ?2 AND school_id = ?3 AND resolved_at IS NULL",
        (resolution.as_db_str(), id, school_id),
    )?;
    Ok(updated == 1)
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

    #[test]
    fn list_open_for_school_returns_a_staged_conflict_with_its_metadata_intact() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let change = change();

        stage_pull_conflict(&conn, &school.id, 1, &change).unwrap();

        let rows = list_open_for_school(&conn, &school.id).unwrap();
        assert_eq!(rows.len(), 1);
        assert_eq!(rows[0].change_id, change.change_id.to_string());
        assert_eq!(rows[0].entity_kind, EntityKind::Learner);
        assert_eq!(rows[0].entity_id, change.entity_id.to_string());
        assert_eq!(rows[0].submitted_base_version, 1);
        assert_eq!(rows[0].current_hub_version, 2);
        assert_eq!(rows[0].encrypted_payload, vec![1, 2, 3]);
    }

    #[test]
    fn list_open_for_school_never_returns_another_schools_conflict() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        stage_pull_conflict(&conn, &school_a.id, 1, &change()).unwrap();

        assert!(list_open_for_school(&conn, &school_b.id)
            .unwrap()
            .is_empty());
    }

    #[test]
    fn list_open_for_school_excludes_an_already_resolved_conflict() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        stage_pull_conflict(&conn, &school.id, 1, &change()).unwrap();
        let id = list_open_for_school(&conn, &school.id).unwrap()[0]
            .id
            .clone();

        assert!(mark_resolved(&conn, &school.id, &id, ConflictResolution::KeptLocal).unwrap());

        assert!(list_open_for_school(&conn, &school.id).unwrap().is_empty());
    }

    #[test]
    fn mark_resolved_records_which_way_it_was_resolved() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        stage_pull_conflict(&conn, &school.id, 1, &change()).unwrap();
        let id = list_open_for_school(&conn, &school.id).unwrap()[0]
            .id
            .clone();

        mark_resolved(&conn, &school.id, &id, ConflictResolution::UsedIncoming).unwrap();

        let (resolution, resolved_at): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT resolution, resolved_at FROM sync_conflict_review WHERE id = ?1",
                [&id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(resolution.as_deref(), Some("used_incoming"));
        assert!(resolved_at.is_some());
    }

    #[test]
    fn mark_resolved_cannot_resolve_another_schools_conflict() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        stage_pull_conflict(&conn, &school_a.id, 1, &change()).unwrap();
        let id = list_open_for_school(&conn, &school_a.id).unwrap()[0]
            .id
            .clone();

        let updated =
            mark_resolved(&conn, &school_b.id, &id, ConflictResolution::KeptLocal).unwrap();

        assert!(!updated);
        assert_eq!(count_open_for_school(&conn, &school_a.id).unwrap(), 1);
    }

    #[test]
    fn mark_resolved_cannot_re_resolve_an_already_resolved_conflict() {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        stage_pull_conflict(&conn, &school.id, 1, &change()).unwrap();
        let id = list_open_for_school(&conn, &school.id).unwrap()[0]
            .id
            .clone();
        mark_resolved(&conn, &school.id, &id, ConflictResolution::KeptLocal).unwrap();

        let updated =
            mark_resolved(&conn, &school.id, &id, ConflictResolution::UsedIncoming).unwrap();

        assert!(!updated);
    }

    #[test]
    fn find_open_by_id_in_school_returns_none_for_a_different_school() {
        let conn = open_test_db();
        let school_a = school::create(&conn, "School A").unwrap();
        let school_b = school::create(&conn, "School B").unwrap();
        stage_pull_conflict(&conn, &school_a.id, 1, &change()).unwrap();
        let id = list_open_for_school(&conn, &school_a.id).unwrap()[0]
            .id
            .clone();

        assert!(find_open_by_id_in_school(&conn, &school_b.id, &id)
            .unwrap()
            .is_none());
    }
}
