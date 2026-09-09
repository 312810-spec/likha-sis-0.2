//! Persistence for `transfer_records` -- the Transfers In/Out
//! Documentation Registry (migration 52, ADR-0080). All SQL for this
//! feature lives here, per `.claude/rules/architecture.md` --
//! `commands::transfer_record` calls only these functions, never raw SQL.
//! Every query is tenant-scoped by `school_id` (never a client-supplied
//! trust boundary on its own -- callers derive it from the authenticated
//! session, see `commands::transfer_record`). Field shape mirrors
//! `src/domain/transfer-record.ts` (Batch 5) exactly -- see that module's
//! doc comment -- so validation never diverges between the two layers.

use rusqlite::{Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::learner;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TransferRecord {
    pub id: String,
    pub school_id: String,
    pub learner_id: String,
    pub direction: String,
    pub transfer_date: String,
    pub other_school_name: String,
    pub status: String,
    pub remarks: Option<String>,
    pub created_by_user_id: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

const SELECT_COLUMNS: &str = "id, school_id, learner_id, direction, transfer_date, \
     other_school_name, status, remarks, created_by_user_id, created_at, updated_at";

fn row_to_record(row: &rusqlite::Row) -> rusqlite::Result<TransferRecord> {
    Ok(TransferRecord {
        id: row.get(0)?,
        school_id: row.get(1)?,
        learner_id: row.get(2)?,
        direction: row.get(3)?,
        transfer_date: row.get(4)?,
        other_school_name: row.get(5)?,
        status: row.get(6)?,
        remarks: row.get(7)?,
        created_by_user_id: row.get(8)?,
        created_at: row.get(9)?,
        updated_at: row.get(10)?,
    })
}

/// A dependency-free `YYYY-MM-DD` shape check -- same rationale and
/// implementation as `section_membership::is_iso_date`: the repository
/// layer stores dates as opaque ISO strings, and a malformed one arriving
/// straight over IPC (bypassing the TS `ISO_DATE_PATTERN` guard in
/// `src/domain/transfer-record.ts`) could otherwise be persisted. This is
/// a shape guard, not a calendar.
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let all_digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    if !(all_digits(0..4) && all_digits(5..7) && all_digits(8..10)) {
        return false;
    }
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
}

fn is_valid_direction(value: &str) -> bool {
    matches!(value, "in" | "out")
}

fn is_valid_status(value: &str) -> bool {
    matches!(value, "pending" | "completed" | "cancelled")
}

/// Records one transfer for `learner_id`. Mirrors
/// `validateTransferRecord` in `src/domain/transfer-record.ts` --
/// trim/non-empty/max-length on `other_school_name` and `remarks`, a
/// shape check on `transfer_date` -- so a request that bypasses the
/// TypeScript `TransferRecordApplicationService` (a forged/raw IPC call)
/// cannot persist a record the UI path would have rejected. Returns
/// `AppError::InvalidInput` for any violation. `learner_id` must already
/// resolve to an existing learner in `school_id`; an unknown learner is
/// reported as `AppError::InvalidInput`, indistinguishable from a
/// cross-school learner id, matching this module's convention of never
/// letting a caller probe another school's learner ids.
#[allow(clippy::too_many_arguments)]
pub fn create(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    direction: &str,
    transfer_date: &str,
    other_school_name: &str,
    status: &str,
    remarks: Option<&str>,
    created_by_user_id: Option<&str>,
) -> AppResult<TransferRecord> {
    if learner::find_by_id_in_school(conn, school_id, learner_id)?.is_none() {
        return Err(AppError::InvalidInput(
            "learner not found in this school".to_string(),
        ));
    }
    if !is_valid_direction(direction) {
        return Err(AppError::InvalidInput(
            "direction must be 'in' or 'out'".to_string(),
        ));
    }
    if !is_iso_date(transfer_date) {
        return Err(AppError::InvalidInput(
            "transfer date must be a valid yyyy-mm-dd date".to_string(),
        ));
    }
    let other_school_name = other_school_name.trim();
    if other_school_name.is_empty() {
        return Err(AppError::InvalidInput(
            "the other school's name is required".to_string(),
        ));
    }
    if other_school_name.chars().count() > 200 {
        return Err(AppError::InvalidInput(
            "the school name is too long".to_string(),
        ));
    }
    if !is_valid_status(status) {
        return Err(AppError::InvalidInput(
            "status must be 'pending', 'completed', or 'cancelled'".to_string(),
        ));
    }
    let remarks = remarks.map(str::trim).filter(|r| !r.is_empty());
    if let Some(remarks) = remarks {
        if remarks.chars().count() > 1000 {
            return Err(AppError::InvalidInput("remarks are too long".to_string()));
        }
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO transfer_records \
            (id, school_id, learner_id, direction, transfer_date, other_school_name, \
             status, remarks, created_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        (
            &id,
            school_id,
            learner_id,
            direction,
            transfer_date,
            other_school_name,
            status,
            remarks,
            created_by_user_id,
        ),
    )?;

    find_by_id(conn, school_id, &id)?.ok_or_else(|| {
        AppError::InvalidInput("transfer record vanished immediately after insert".to_string())
    })
}

pub fn find_by_id(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<TransferRecord>> {
    let sql =
        format!("SELECT {SELECT_COLUMNS} FROM transfer_records WHERE school_id = ?1 AND id = ?2");
    conn.query_row(&sql, (school_id, id), row_to_record)
        .optional()
        .map_err(AppError::from)
}

/// A learner's full transfer history, most recent first -- tenant-scoped
/// by `school_id` in the query itself (not merely implied by `learner_id`
/// belonging to that school), so a caller supplying the wrong `school_id`
/// can never see another school's transfer records for a same-id learner.
pub fn list_for_learner(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<TransferRecord>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM transfer_records \
         WHERE school_id = ?1 AND learner_id = ?2 \
         ORDER BY transfer_date DESC, created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map((school_id, learner_id), row_to_record)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// The whole school's transfer ledger, most recent first -- the Registrar/
/// School Head overview list.
pub fn list_for_school(conn: &Connection, school_id: &str) -> AppResult<Vec<TransferRecord>> {
    let sql = format!(
        "SELECT {SELECT_COLUMNS} FROM transfer_records \
         WHERE school_id = ?1 \
         ORDER BY transfer_date DESC, created_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map((school_id,), row_to_record)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Updates only the document-completion `status` of an existing transfer
/// record, tenant-scoped by `(school_id, id)` together -- a forged/
/// cross-school id is indistinguishable from an unknown one, returning
/// `Ok(None)`, matching `section_membership`'s cross-school-probe-
/// resistance convention. Never touches any other field: the transfer's
/// date/direction/school name are a factual record of what was submitted
/// and are never rewritten after creation, only the status a registrar is
/// tracking (e.g. "pending" -> "completed" once the paperwork clears).
pub fn update_status(
    conn: &Connection,
    school_id: &str,
    id: &str,
    status: &str,
) -> AppResult<Option<TransferRecord>> {
    if !is_valid_status(status) {
        return Err(AppError::InvalidInput(
            "status must be 'pending', 'completed', or 'cancelled'".to_string(),
        ));
    }
    let affected = conn.execute(
        "UPDATE transfer_records \
         SET status = ?1, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE school_id = ?2 AND id = ?3",
        (status, school_id, id),
    )?;
    if affected == 0 {
        return Ok(None);
    }
    find_by_id(conn, school_id, id)
}

/// Sync-pull counterpart to `create`/`update_status` -- materializes a
/// `TransferRecord` this device received, instead of re-deriving one from
/// raw caller input. Mirrors `nutrition::upsert_from_sync`'s exact shape:
/// an `INSERT ... ON CONFLICT(id) DO UPDATE` keyed on the row's own
/// stable `id`. Unlike `nutrition_records`, this table carries no
/// natural-key `UNIQUE` constraint beyond `id` (see migration 52's doc
/// comment -- a learner may have any number of transfer rows over time),
/// so a collision here can only ever be an `id` collision, which `ON
/// CONFLICT(id)` always resolves as an update, never an error. Not
/// re-validating learner/direction/status/date here is deliberate and
/// safe, matching `attendance::upsert_from_sync`'s own reasoning: this
/// data already passed `create`'s validation on the device that
/// originally wrote it.
pub fn upsert_from_sync(conn: &Connection, record: &TransferRecord) -> AppResult<()> {
    conn.execute(
        "INSERT INTO transfer_records \
            (id, school_id, learner_id, direction, transfer_date, other_school_name, \
             status, remarks, created_by_user_id, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11) \
         ON CONFLICT(id) DO UPDATE SET \
             learner_id = excluded.learner_id, \
             direction = excluded.direction, \
             transfer_date = excluded.transfer_date, \
             other_school_name = excluded.other_school_name, \
             status = excluded.status, \
             remarks = excluded.remarks, \
             created_by_user_id = excluded.created_by_user_id, \
             updated_at = excluded.updated_at",
        (
            &record.id,
            &record.school_id,
            &record.learner_id,
            &record.direction,
            &record.transfer_date,
            &record.other_school_name,
            &record.status,
            &record.remarks,
            &record.created_by_user_id,
            &record.created_at,
            &record.updated_at,
        ),
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn setup() -> Connection {
        let conn = crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap();
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School'), ('s2', 'Other School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Ana', 'Cruz'), ('l2', 's2', 'Bo', 'Reyes')",
            [],
        )
        .unwrap();
        conn
    }

    #[test]
    fn create_and_find_round_trip() {
        let conn = setup();
        let record = create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic Receiving School",
            "pending",
            Some("Synthetic remark"),
            None,
        )
        .unwrap();

        let found = find_by_id(&conn, "s1", &record.id).unwrap().unwrap();
        assert_eq!(found.direction, "out");
        assert_eq!(found.status, "pending");
        assert_eq!(found.other_school_name, "Synthetic Receiving School");
    }

    #[test]
    fn create_rejects_an_unknown_direction() {
        let conn = setup();
        let result = create(
            &conn,
            "s1",
            "l1",
            "sideways",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_an_invalid_transfer_date() {
        let conn = setup();
        let result = create(
            &conn,
            "s1",
            "l1",
            "in",
            "not-a-date",
            "Synthetic School",
            "pending",
            None,
            None,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_an_empty_school_name() {
        let conn = setup();
        let result = create(
            &conn,
            "s1",
            "l1",
            "in",
            "2026-06-15",
            "   ",
            "pending",
            None,
            None,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn create_rejects_a_learner_from_a_different_school() {
        let conn = setup();
        let result = create(
            &conn,
            "s1",
            "l2",
            "in",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        );
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    #[test]
    fn list_for_learner_is_tenant_scoped() {
        let conn = setup();
        create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        )
        .unwrap();

        let found = list_for_learner(&conn, "s1", "l1").unwrap();
        assert_eq!(found.len(), 1);

        // Same learner id string cannot be probed from another school.
        let cross_tenant = list_for_learner(&conn, "s2", "l1").unwrap();
        assert_eq!(cross_tenant.len(), 0);
    }

    #[test]
    fn list_for_school_returns_only_that_schools_records() {
        let conn = setup();
        create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School A",
            "pending",
            None,
            None,
        )
        .unwrap();
        create(
            &conn,
            "s2",
            "l2",
            "in",
            "2026-07-01",
            "Synthetic School B",
            "completed",
            None,
            None,
        )
        .unwrap();

        let s1_records = list_for_school(&conn, "s1").unwrap();
        assert_eq!(s1_records.len(), 1);
        assert_eq!(s1_records[0].other_school_name, "Synthetic School A");
    }

    #[test]
    fn update_status_changes_only_the_status() {
        let conn = setup();
        let record = create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        )
        .unwrap();

        let updated = update_status(&conn, "s1", &record.id, "completed")
            .unwrap()
            .unwrap();

        assert_eq!(updated.status, "completed");
        assert_eq!(updated.other_school_name, record.other_school_name);
        assert_eq!(updated.transfer_date, record.transfer_date);
    }

    #[test]
    fn update_status_is_tenant_scoped() {
        let conn = setup();
        let record = create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        )
        .unwrap();

        // A forged/cross-school id must yield None, not leak or apply the
        // update.
        let result = update_status(&conn, "s2", &record.id, "completed").unwrap();
        assert!(result.is_none());
        let still_pending = find_by_id(&conn, "s1", &record.id).unwrap().unwrap();
        assert_eq!(still_pending.status, "pending");
    }

    #[test]
    fn update_status_rejects_an_unknown_status() {
        let conn = setup();
        let record = create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        )
        .unwrap();

        let result = update_status(&conn, "s1", &record.id, "archived");
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    fn sample_incoming(id: &str) -> TransferRecord {
        TransferRecord {
            id: id.to_string(),
            school_id: "s1".to_string(),
            learner_id: "l1".to_string(),
            direction: "out".to_string(),
            transfer_date: "2026-06-15".to_string(),
            other_school_name: "Synthetic School".to_string(),
            status: "pending".to_string(),
            remarks: None,
            created_by_user_id: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }

    #[test]
    fn upsert_from_sync_inserts_a_record_this_device_has_never_seen() {
        let conn = setup();
        let incoming = sample_incoming("t1");

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id(&conn, "s1", "t1").unwrap().unwrap();
        assert_eq!(found.other_school_name, incoming.other_school_name);
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place_without_a_duplicate() {
        let conn = setup();
        let original = create(
            &conn,
            "s1",
            "l1",
            "out",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            None,
        )
        .unwrap();

        let updated = TransferRecord {
            status: "completed".to_string(),
            updated_at: "2026-02-01T00:00:00.000Z".to_string(),
            ..original.clone()
        };
        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id(&conn, "s1", &original.id).unwrap().unwrap();
        assert_eq!(found.status, "completed");
        let all = list_for_school(&conn, "s1").unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }
}
