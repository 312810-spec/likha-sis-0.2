//! Tauri commands for the Transfers In/Out Documentation Registry
//! (ADR-0080). `school_id` is always derived from the authenticated
//! session, never a client-supplied argument, per
//! `docs/adr/0004-authentication-and-local-session.md`. All three
//! commands gate on `Capability::ManageTransferRecords` (Registrar,
//! School Head) -- see that capability's doc comment in `auth::mod` for
//! the scope decision.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::transfer_record::{self, TransferRecord};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Records one inter-school transfer for a learner. See
/// `repository::transfer_record::create` for validation detail.
///
/// ADR-0067/0069 sync wiring (Batch 9, continuing the LessonPlan/
/// NutritionRecord slices): the exact same enrollment-gated
/// encrypt-on-enqueue pattern as `commands::nutrition::record_nutrition_measurement`.
/// Create-only, matching `NutritionRecord`'s own precedent for the
/// enqueue path -- status changes go through `update_transfer_status`
/// below, which enqueues its own upsert of the full row.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_transfer(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    direction: String,
    transfer_date: String,
    other_school_name: String,
    status: String,
    remarks: Option<String>,
) -> AppResult<TransferRecord> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = crate::auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTransferRecords,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_transfer_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &learner_id,
        &direction,
        &transfer_date,
        &other_school_name,
        &status,
        remarks.as_deref(),
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::nutrition::resolve_sspk_if_enrolled`.
fn resolve_sspk_if_enrolled(
    app: &AppHandle,
    conn: &Connection,
    school_id: &str,
) -> AppResult<Option<[u8; PAYLOAD_KEY_LEN]>> {
    if device_credential::has_active_for_school(conn, school_id)? {
        Ok(Some(db::load_or_mint_sspk(app)?))
    } else {
        Ok(None)
    }
}

/// Shared logic behind `record_transfer`, kept separate so it can be
/// exercised directly in this module's own tests without a real Tauri
/// `AppHandle` -- same reason as `commands::nutrition`'s equivalent.
/// `sspk` is `None` when this school has never enrolled a device: behaves
/// exactly as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox
/// row. When `Some`, the record insert and the outbox enqueue are atomic
/// together in one `SAVEPOINT` -- a rejected create (invalid direction/
/// date/school name/status) never enqueues an outbox row.
#[allow(clippy::too_many_arguments)]
fn record_transfer_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    learner_id: &str,
    direction: &str,
    transfer_date: &str,
    other_school_name: &str,
    status: &str,
    remarks: Option<&str>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<TransferRecord> {
    let Some(sspk) = sspk else {
        return transfer_record::create(
            conn,
            school_id,
            learner_id,
            direction,
            transfer_date,
            other_school_name,
            status,
            remarks,
            Some(actor_user_id),
        );
    };

    conn.execute_batch("SAVEPOINT record_transfer_with_sync")?;
    let outcome = (|| -> AppResult<TransferRecord> {
        let created = transfer_record::create(
            conn,
            school_id,
            learner_id,
            direction,
            transfer_date,
            other_school_name,
            status,
            remarks,
            Some(actor_user_id),
        )?;
        enqueue_transfer_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE record_transfer_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_transfer_with_sync; RELEASE record_transfer_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a transfer record --
/// newly-created or status-updated -- carrying the full current row.
/// `base_version` always comes from `sync_version_cache::known_version`,
/// matching every other entity's own shape.
fn enqueue_transfer_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    record: &TransferRecord,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = crate::repository::sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::TransferRecord,
        &record.id,
    )?;
    let plaintext = serde_json::to_vec(record)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::TransferRecord,
        entity_id: parse_sync_uuid(&record.id, "transfer record id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::nutrition::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// A learner's full transfer history, most recent first.
#[tauri::command]
pub fn list_transfers_for_learner(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
) -> AppResult<Vec<TransferRecord>> {
    let conn = lock_db(&db);
    let (_, school_id) = crate::auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTransferRecords,
    )?;
    transfer_record::list_for_learner(&conn, &school_id, &learner_id)
}

/// The whole school's transfer ledger, most recent first -- the
/// Registrar/School Head overview list.
#[tauri::command]
pub fn list_transfers_for_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<TransferRecord>> {
    let conn = lock_db(&db);
    let (_, school_id) = crate::auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTransferRecords,
    )?;
    transfer_record::list_for_school(&conn, &school_id)
}

/// Updates a transfer record's document-completion status (e.g.
/// "pending" -> "completed"). Returns `AppError::InvalidInput` if `id`
/// does not resolve within the caller's own school -- indistinguishable
/// from an unknown id, matching this codebase's cross-school-probe-
/// resistance convention.
#[tauri::command]
pub fn update_transfer_status(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
    status: String,
) -> AppResult<TransferRecord> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = crate::auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTransferRecords,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    let Some(sspk) = sspk else {
        return transfer_record::update_status(&conn, &school_id, &id, &status)?
            .ok_or_else(|| AppError::InvalidInput("transfer record not found".to_string()));
    };

    conn.execute_batch("SAVEPOINT update_transfer_status_with_sync")?;
    let outcome = (|| -> AppResult<TransferRecord> {
        let updated = transfer_record::update_status(&conn, &school_id, &id, &status)?
            .ok_or_else(|| AppError::InvalidInput("transfer record not found".to_string()))?;
        enqueue_transfer_sync_change(&conn, &school_id, &actor_user_id, &updated, &sspk)?;
        Ok(updated)
    })();

    match outcome {
        Ok(updated) => {
            conn.execute_batch("RELEASE update_transfer_status_with_sync")?;
            Ok(updated)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO update_transfer_status_with_sync; RELEASE update_transfer_status_with_sync",
            );
            Err(error)
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::crypto::payload_key::PAYLOAD_KEY_LEN;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [7u8; PAYLOAD_KEY_LEN]
    }

    fn record(
        conn: &Connection,
        actor_user_id: &str,
        sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
    ) -> AppResult<TransferRecord> {
        record_transfer_with_optional_sync(
            conn,
            "s1",
            actor_user_id,
            "l1",
            "out",
            "2026-06-15",
            "Synthetic Receiving School",
            "pending",
            None,
            sspk,
        )
    }

    #[test]
    fn with_no_sspk_behaves_exactly_like_a_plain_record() {
        let conn = open_test_db();
        let actor_user_id = seed_school_and_learner(&conn);

        let created = record(&conn, &actor_user_id, None).unwrap();
        assert_eq!(created.direction, "out");

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 0, "no sspk means no outbox row");
    }

    /// Seeds a school, a learner, and a real user (a genuine UUID id, not
    /// a short test literal) -- `enqueue_transfer_sync_change` parses
    /// `actor_user_id` as a UUID for the sync payload, matching every
    /// other entity's own sync-wiring test fixture (see
    /// `commands::nutrition`'s `seed`). Returns the user's id.
    fn seed_school_and_learner(conn: &Connection) -> String {
        conn.execute(
            "INSERT INTO schools (id, name) VALUES ('s1', 'Test School')",
            [],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO learners (id, school_id, given_name, family_name) \
             VALUES ('l1', 's1', 'Ana', 'Cruz')",
            [],
        )
        .unwrap();
        let user = crate::repository::user::create_user(
            conn,
            "registrar1",
            "correct horse battery",
            "Registrar One",
        )
        .unwrap();
        user.id
    }

    #[test]
    fn with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let actor_user_id = seed_school_and_learner(&conn);
        let sspk = test_sspk();

        let created = record(&conn, &actor_user_id, Some(&sspk)).unwrap();

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 1);

        let (kind, entity_id): (String, String) = conn
            .query_row("SELECT entity_kind, entity_id FROM sync_outbox", [], |r| {
                Ok((r.get(0)?, r.get(1)?))
            })
            .unwrap();
        assert_eq!(kind, "transfer_record");
        assert_eq!(entity_id, created.id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let actor_user_id = seed_school_and_learner(&conn);
        let sspk = test_sspk();

        let result = record_transfer_with_optional_sync(
            &conn,
            "s1",
            &actor_user_id,
            "l1",
            "sideways",
            "2026-06-15",
            "Synthetic School",
            "pending",
            None,
            Some(&sspk),
        );
        assert!(result.is_err());

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 0);
    }

    #[test]
    fn update_status_with_sync_enqueues_the_full_updated_row() {
        let conn = open_test_db();
        let actor_user_id = seed_school_and_learner(&conn);
        let sspk = test_sspk();
        let created = record(&conn, &actor_user_id, Some(&sspk)).unwrap();

        let updated = crate::repository::transfer_record::update_status(
            &conn,
            "s1",
            &created.id,
            "completed",
        )
        .unwrap()
        .unwrap();
        enqueue_transfer_sync_change(&conn, "s1", &actor_user_id, &updated, &sspk).unwrap();

        let outbox_count: i64 = conn
            .query_row("SELECT count(*) FROM sync_outbox", [], |r| r.get(0))
            .unwrap();
        assert_eq!(outbox_count, 2, "one for create, one for the status update");
    }
}
