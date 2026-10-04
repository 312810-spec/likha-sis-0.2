use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::school_planning::{self, SchoolPlanningInput, SchoolPlanningItem};
use rusqlite::Connection;
use std::sync::Mutex;
use tauri::{AppHandle, State};
#[tauri::command]
pub fn list_school_planning_items(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<SchoolPlanningItem>> {
    let conn = lock_db(&db);
    let school = sessions.require_active_school_scope(&conn)?;
    school_planning::list(&conn, &school)
}
#[tauri::command]
pub fn save_school_planning_item(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    input: SchoolPlanningInput,
    id: Option<String>,
    expected_revision: Option<u32>,
) -> AppResult<SchoolPlanningItem> {
    let conn = lock_db(&db);
    let (school, actor) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    if !crate::repository::role::list_roles(&conn, &actor, &school)?
        .iter()
        .any(|r| r == "school_head")
    {
        return Err(AppError::Unauthorized);
    }
    let key = if crate::repository::device_credential::has_active_for_school(&conn, &school)? {
        Some(crate::db::load_or_mint_sspk(&app)?)
    } else {
        None
    };
    save_with_sync(
        &conn,
        &school,
        &actor,
        &input,
        id.as_deref(),
        expected_revision,
        key.as_ref(),
    )
}
pub(crate) fn save_with_sync(
    conn: &Connection,
    school: &str,
    actor: &str,
    input: &SchoolPlanningInput,
    id: Option<&str>,
    expected_revision: Option<u32>,
    key: Option<&[u8; crate::crypto::payload_key::PAYLOAD_KEY_LEN]>,
) -> AppResult<SchoolPlanningItem> {
    if !crate::repository::role::list_roles(conn, actor, school)?
        .iter()
        .any(|r| r == "school_head")
    {
        return Err(AppError::Unauthorized);
    }
    conn.execute_batch("SAVEPOINT school_planning_and_enqueue")?;
    let result = (|| -> AppResult<SchoolPlanningItem> {
        let item = school_planning::save(conn, school, actor, input, id, expected_revision)?;
        if let Some(key) = key {
            let publication = school_planning::publication(conn, school, item.clone())?;
            let plaintext = serde_json::to_vec(&publication)
                .map_err(|_| AppError::Import("Cannot prepare school planning transfer.".into()))?;
            let parse = |value: &str| {
                uuid::Uuid::parse_str(value)
                    .map_err(|_| AppError::Import("Invalid synchronization identifier.".into()))
            };
            let base_version = crate::repository::sync_version_cache::known_version(
                conn,
                school,
                crate::sync::EntityKind::SchoolPlanning,
                &item.id,
            )?;
            let change = crate::sync::PendingChange {
                change_id: uuid::Uuid::now_v7(),
                device_id: parse(&crate::repository::device_identity::current_or_create(
                    conn,
                )?)?,
                actor_user_id: parse(actor)?,
                entity_kind: crate::sync::EntityKind::SchoolPlanning,
                entity_id: parse(&item.id)?,
                base_version,
                operation: crate::sync::ChangeOperation::Upsert,
                encrypted_payload: crate::crypto::payload_key::encrypt_payload(key, &plaintext)?,
            };
            crate::sync::validate_change(&change).map_err(|_| {
                AppError::Import(
                    "School planning history exceeds transfer capacity. Keep this item smaller."
                        .into(),
                )
            })?;
            // Latest pending snapshot includes all earlier immutable revisions.
            crate::repository::sync_outbox::discard_pending_for_entity(
                conn,
                school,
                crate::sync::EntityKind::SchoolPlanning,
                &item.id,
            )?;
            crate::repository::sync_outbox::enqueue(conn, school, &change)?;
        }
        Ok(item)
    })();
    match result {
        Ok(item) => {
            conn.execute_batch("RELEASE school_planning_and_enqueue")?;
            Ok(item)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO school_planning_and_enqueue; RELEASE school_planning_and_enqueue",
            );
            Err(error)
        }
    }
}
