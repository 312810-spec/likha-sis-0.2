//! Tauri commands for the DO 006, s. 2026 Child Protection module
//! (ADR-0072) and the multi-silo automated at-risk trigger. Every command
//! gates on `auth::authorize_child_protection_access_for_section` — never
//! a bare `Capability` check — so a general Teacher with no adviser
//! relationship to the target section is denied, matching the task's
//! explicit tighter-than-tenant-scoping requirement. `school_id` is
//! always session-derived, never a client-supplied argument.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::at_risk::{self, AtRiskFlag};
use crate::repository::child_protection::{
    self, BehavioralIncident, InterventionEntryType, InterventionLogEntry, SeverityTier,
};
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

fn parse_tier(raw: &str) -> AppResult<SeverityTier> {
    match raw {
        "level_1" => Ok(SeverityTier::Level1),
        "level_2" => Ok(SeverityTier::Level2),
        "level_3" => Ok(SeverityTier::Level3),
        _ => Err(AppError::InvalidInput(
            "unrecognized severity tier".to_string(),
        )),
    }
}

fn parse_entry_type(raw: &str) -> AppResult<InterventionEntryType> {
    match raw {
        "intervention" => Ok(InterventionEntryType::Intervention),
        "resolution" => Ok(InterventionEntryType::Resolution),
        _ => Err(AppError::InvalidInput(
            "unrecognized intervention entry type".to_string(),
        )),
    }
}

/// Records a new behavioral incident for a learner in `section_id`. Only
/// that section's current adviser, or a School Head, may do this.
///
/// ADR-0067/0069 sync wiring (Batch 6, continuing the LessonPlan slice):
/// the exact same enrollment-gated encrypt-on-enqueue pattern as
/// `commands::lesson_plan::create_lesson_plan`. Create-only, matching
/// `Section`/`AssessmentItem`/`Subject`'s own precedent -- there is no
/// `update_behavioral_incident` command (the narrative content is
/// immutable by design, see migration 44's own comment). **Authorization
/// is preserved unchanged**: `authorize_child_protection_access_for_section`
/// still runs before the sync-aware write path is ever reached, exactly
/// as before this wiring -- sync adds encryption/enqueue only, it never
/// touches or bypasses the existing adviser-or-School-Head gate. This is
/// child-protection PII, so that gate matters even more here than for
/// `LessonPlan`: see this module's own doc comment at the top of the
/// file, and `docs/CURRENT-HANDOFF.md`'s explicit verification entry for
/// this slice.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_behavioral_incident(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    section_id: String,
    severity_tier: String,
    category: String,
    description: String,
    incident_date: String,
) -> AppResult<BehavioralIncident> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &incident_date,
    )?;
    let tier = parse_tier(&severity_tier)?;

    let category = category.trim();
    let description = description.trim();
    if category.is_empty() {
        return Err(AppError::InvalidInput(
            "incident category must not be empty".to_string(),
        ));
    }
    if description.is_empty() {
        return Err(AppError::InvalidInput(
            "incident description must not be empty".to_string(),
        ));
    }
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_behavioral_incident_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &learner_id,
        &section_id,
        tier,
        category,
        description,
        &incident_date,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::lesson_plan::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `record_behavioral_incident`, kept separate so it
/// can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as
/// `commands::lesson_plan::create_lesson_plan_with_optional_sync`.
#[allow(clippy::too_many_arguments)]
fn record_behavioral_incident_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    learner_id: &str,
    section_id: &str,
    tier: SeverityTier,
    category: &str,
    description: &str,
    incident_date: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<BehavioralIncident> {
    let Some(sspk) = sspk else {
        return child_protection::create_incident(
            conn,
            school_id,
            learner_id,
            section_id,
            actor_user_id,
            tier,
            category,
            description,
            incident_date,
        );
    };

    conn.execute_batch("SAVEPOINT record_behavioral_incident_with_sync")?;
    let outcome = (|| -> AppResult<BehavioralIncident> {
        let created = child_protection::create_incident(
            conn,
            school_id,
            learner_id,
            section_id,
            actor_user_id,
            tier,
            category,
            description,
            incident_date,
        )?;
        enqueue_incident_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE record_behavioral_incident_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_behavioral_incident_with_sync; RELEASE record_behavioral_incident_with_sync",
            );
            Err(error)
        }
    }
}

fn enqueue_incident_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    incident: &BehavioralIncident,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::BehavioralIncident,
        &incident.id,
    )?;
    let plaintext = serde_json::to_vec(incident)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::BehavioralIncident,
        entity_id: parse_sync_uuid(&incident.id, "behavioral incident id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::lesson_plan::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// All incidents for one section, newest first — same gate as
/// [`record_behavioral_incident`].
#[tauri::command]
pub fn list_behavioral_incidents_for_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<BehavioralIncident>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    child_protection::list_for_section(&conn, &school_id, &section_id)
}

/// Appends one intervention/resolution entry — the caller must already
/// be authorized for the incident's own section.
///
/// ADR-0067/0069 sync wiring (Batch 6): same enrollment-gated
/// encrypt-on-enqueue pattern as `record_behavioral_incident` above.
/// When a `resolution` entry marks the parent incident resolved (see
/// `child_protection::add_intervention`'s own side effect), the UPDATED
/// `BehavioralIncident` is ALSO enqueued as its own
/// `EntityKind::BehavioralIncident` change in the same `SAVEPOINT` —
/// otherwise a pulling device would see the new intervention note but
/// never learn the incident itself was marked resolved. **Authorization
/// preserved unchanged**: `authorize_child_protection_access_for_section`
/// plus the forged-`incident_id`-different-section guard both still run,
/// unaffected by sync wiring, before any write happens.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_incident_intervention(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    incident_id: String,
    section_id: String,
    as_of_date: String,
    entry_type: String,
    note: String,
) -> AppResult<InterventionLogEntry> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let entry_type = parse_entry_type(&entry_type)?;
    let note = note.trim();
    if note.is_empty() {
        return Err(AppError::InvalidInput(
            "intervention note must not be empty".to_string(),
        ));
    }
    // Defense-in-depth: confirm the incident itself really belongs to the
    // authorized section, not merely to the caller's school — a forged
    // `incident_id` from a different section must not be writable just
    // because the caller advises `section_id`.
    let Some(incident) = child_protection::find_incident_by_id(&conn, &school_id, &incident_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if incident.section_id != section_id {
        return Err(AppError::Unauthorized);
    }
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    add_incident_intervention_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &incident_id,
        entry_type,
        note,
        sspk.as_ref(),
    )
}

/// Shared logic behind `add_incident_intervention`, kept separate so it
/// can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle`.
fn add_incident_intervention_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    incident_id: &str,
    entry_type: InterventionEntryType,
    note: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<InterventionLogEntry> {
    let Some(sspk) = sspk else {
        return child_protection::add_intervention(
            conn,
            school_id,
            incident_id,
            actor_user_id,
            entry_type,
            note,
        );
    };

    conn.execute_batch("SAVEPOINT add_incident_intervention_with_sync")?;
    let outcome = (|| -> AppResult<InterventionLogEntry> {
        let created = child_protection::add_intervention(
            conn,
            school_id,
            incident_id,
            actor_user_id,
            entry_type,
            note,
        )?;
        enqueue_intervention_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        // A `resolution` entry also marks the parent incident resolved
        // (see `add_intervention`'s own side effect) — push that
        // updated incident row too, in the same atomic SAVEPOINT, so a
        // pulling device learns both facts together.
        if entry_type == InterventionEntryType::Resolution {
            if let Some(updated_incident) =
                child_protection::find_incident_by_id(conn, school_id, incident_id)?
            {
                enqueue_incident_sync_change(
                    conn,
                    school_id,
                    actor_user_id,
                    &updated_incident,
                    sspk,
                )?;
            }
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE add_incident_intervention_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO add_incident_intervention_with_sync; RELEASE add_incident_intervention_with_sync",
            );
            Err(error)
        }
    }
}

fn enqueue_intervention_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    entry: &InterventionLogEntry,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::IncidentIntervention,
        &entry.id,
    )?;
    let plaintext = serde_json::to_vec(entry)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::IncidentIntervention,
        entity_id: parse_sync_uuid(&entry.id, "intervention entry id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// The full append-only intervention log for one incident.
#[tauri::command]
pub fn list_incident_interventions(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    incident_id: String,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<InterventionLogEntry>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let Some(incident) = child_protection::find_incident_by_id(&conn, &school_id, &incident_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if incident.section_id != section_id {
        return Err(AppError::Unauthorized);
    }
    child_protection::list_interventions_for_incident(&conn, &school_id, &incident_id)
}

/// Multi-silo automated at-risk detection for one section, computed on
/// read — same gate as every other child-protection command (this is
/// still child-protection-adjacent PII: which learners are flagged as at
/// risk).
#[tauri::command]
pub fn get_at_risk_flags_for_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    school_year: String,
    as_of_date: String,
) -> AppResult<Vec<AtRiskFlag>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    at_risk::compute_for_section(&conn, &school_id, &section_id, &school_year, &as_of_date)
}

#[cfg(test)]
mod sync_tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        adviser_id: String,
        section_id: String,
        learner_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let school = crate::repository::school::create(conn, "Rizal Elementary").unwrap();
        let adviser = crate::repository::user::create_user(
            conn,
            "adviser.a",
            "correct horse battery staple",
            "Adviser A",
        )
        .unwrap();
        crate::repository::user::add_school_membership(conn, &adviser.id, &school.id).unwrap();
        let section =
            crate::repository::section::create(conn, &school.id, "2026-2027", "5", "Section A")
                .unwrap();
        crate::repository::section_advisory::assign(
            conn,
            &school.id,
            &section.id,
            &adviser.id,
            "2026-06-08",
        )
        .unwrap();
        let learner =
            crate::repository::learner::create(conn, &school.id, "Ana", "Cruz", None, None)
                .unwrap();
        Fixture {
            school_id: school.id,
            adviser_id: adviser.id,
            section_id: section.id,
            learner_id: learner.id,
        }
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x3a; PAYLOAD_KEY_LEN]
    }

    #[test]
    fn record_incident_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = record_behavioral_incident_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            SeverityTier::Level1,
            "tardiness",
            "Synthetic description.",
            "2026-09-01",
            None,
        )
        .unwrap();

        assert!(!created.id.is_empty());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn record_incident_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = record_behavioral_incident_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            SeverityTier::Level2,
            "bullying",
            "Synthetic description.",
            "2026-09-01",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::BehavioralIncident);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), f.adviser_id);
        assert_eq!(entry.change.base_version, 0);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: BehavioralIncident = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn add_intervention_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let incident = record_behavioral_incident_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            SeverityTier::Level2,
            "bullying",
            "Synthetic description.",
            "2026-09-01",
            Some(&sspk),
        )
        .unwrap();

        let created = add_incident_intervention_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &incident.id,
            InterventionEntryType::Intervention,
            "Synthetic: met with learner.",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // The incident create + this one intervention.
        assert_eq!(queued.len(), 2);
        let entry = &queued[1];
        assert_eq!(entry.change.entity_kind, EntityKind::IncidentIntervention);
        assert_eq!(entry.change.entity_id.to_string(), created.id);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: InterventionLogEntry = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    /// A `resolution` entry marks the parent incident resolved -- proves
    /// the UPDATED `BehavioralIncident` is enqueued as its own change,
    /// alongside the intervention entry itself, in the same atomic
    /// SAVEPOINT.
    #[test]
    fn a_resolution_entry_also_enqueues_the_updated_incident_as_its_own_change() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let incident = record_behavioral_incident_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            SeverityTier::Level2,
            "bullying",
            "Synthetic description.",
            "2026-09-01",
            Some(&sspk),
        )
        .unwrap();

        add_incident_intervention_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &incident.id,
            InterventionEntryType::Resolution,
            "Synthetic: resolved after mediation.",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // incident create + intervention entry + the re-pushed resolved incident.
        assert_eq!(queued.len(), 3);
        let incident_changes: Vec<_> = queued
            .iter()
            .filter(|q| q.change.entity_kind == EntityKind::BehavioralIncident)
            .collect();
        assert_eq!(incident_changes.len(), 2);
        let last_incident_payload =
            payload_key::decrypt_payload(&sspk, &incident_changes[1].change.encrypted_payload)
                .unwrap();
        let resolved: BehavioralIncident = serde_json::from_slice(&last_incident_payload).unwrap();
        assert!(resolved.resolved_at.is_some());
    }

    #[test]
    fn a_rejected_intervention_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        // An unresolvable incident_id -- `add_intervention` fails at the
        // FK constraint.
        let result = add_incident_intervention_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            "does-not-exist",
            InterventionEntryType::Intervention,
            "Synthetic note.",
            Some(&sspk),
        );

        assert!(result.is_err());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected intervention must never enqueue an outbox row"
        );
    }
}
