use std::sync::Mutex;
use std::time::Duration;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::sync_hub::AcceptedChange;
use crate::repository::{
    attendance, child_protection, grade_submission, learner, lesson_plan, nutrition, school,
    section, transfer_record,
};
use crate::repository::{
    sync_conflict_review::{self, ConflictResolution, ConflictReviewRow},
    sync_outbox, sync_version_cache,
};
use crate::sync::EntityKind;
use crate::sync_client::{self, SyncClientConfig};

/// Tauri command surface for the conflict-review screen -- the first UI
/// to let a teacher decide which version of their own data survives a
/// sync conflict (`repository::sync_conflict_review`, staged by
/// `sync_client::pull_once`, per ADR-0067's protocol contract point 6:
/// "Learner identity, enrollment, attendance, and grading records never
/// use silent last-write-wins").
///
/// **Who may view/resolve conflicts**: ADR-0067's own conflict-review
/// design notes name a "conflict-review ownership" responsibility as part
/// of the school-laptop operations gate, but do not assign it to a
/// specific role tier -- unlike device revocation (ADR-0069), which is a
/// security action over a *shared* credential every other teacher's sync
/// depends on, resolving a conflict is a decision about a *specific
/// record* a teacher is already trusted to read/write day to day (their
/// own attendance entries, learners in their own school, sections they
/// teach). Gatekeeping it behind `SCHOOL_HEAD`/`ManageSchoolMembership`
/// would block the exact person named in the task -- "a regular teacher
/// may need to resolve conflicts on their own class records" -- from
/// doing so without an admin's involvement, for no compensating security
/// benefit (this device already trusts its authenticated session with
/// full read/write of every entity kind that can conflict). So this
/// module follows `list_device_sync_credentials`' "any active school
/// member, same-school reference data" convention for viewing, AND
/// extends it to resolving: any authenticated member of the conflict's
/// own school (session-derived `school_id`, never a parameter) may
/// resolve it. `school_id` isolation is still enforced at the repository
/// boundary (`find_open_by_id_in_school`/`mark_resolved`), never by UI
/// hiding, matching `.claude/rules/security-privacy.md`.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum ConflictEntityPreview {
    Learner {
        given_name: String,
        family_name: String,
        lrn: Option<String>,
    },
    Attendance {
        section_id: String,
        learner_id: String,
        attendance_date: String,
        status: String,
    },
    Section {
        name: String,
        grade_level: String,
        school_year: String,
    },
    LessonPlan {
        plan_date: String,
        learning_competency: String,
        learning_competency_code: String,
        learning_objectives: String,
    },
    NutritionRecord {
        learner_id: String,
        school_year: String,
        period: String,
        height_m: f64,
        weight_kg: f64,
        nutritional_status: Option<String>,
    },
    BehavioralIncident {
        learner_id: String,
        severity_tier: String,
        category: String,
        description: String,
        incident_date: String,
        resolved_at: Option<String>,
    },
    IncidentIntervention {
        incident_id: String,
        entry_type: String,
        note: String,
    },
    GradeSubmission {
        class_record_id: String,
        status: String,
        submitted_at: String,
    },
    GradeSubmissionNote {
        submission_id: String,
        note_type: String,
        note: String,
    },
    TransferRecord {
        learner_id: String,
        direction: String,
        transfer_date: String,
        other_school_name: String,
        status: String,
    },
    /// Deliberately omits the raw logo bytes -- a conflict-review preview
    /// is rendered as text/JSON on screen, not an `<img>`, and the whole
    /// point of `MAX_LOGO_BYTES` being small (Batch 10, ADR-0081) doesn't
    /// license shipping the full binary blob through a preview payload
    /// meant for a size-vs-size, mime-vs-mime glance. `byte_len` lets a
    /// teacher still see "this changed" (a different size) without
    /// needing to see the image itself.
    SchoolLogo { mime: String, byte_len: usize },
    /// Fallback for any entity kind wired to sync that has no dedicated
    /// typed preview above (every currently-wired kind has one as of
    /// this commit; this stays in place for a future kind added before
    /// its own preview is wired). Deliberately distinct from "could not
    /// decrypt" -- decryption already succeeded by the time
    /// `decrypt_preview` runs (see its own doc comment) -- so a teacher
    /// can still safely choose "use incoming" for such a kind even
    /// without a field-level breakdown, rather than the resolve action
    /// being silently unavailable.
    Unknown,
}

fn learner_preview(l: &learner::Learner) -> ConflictEntityPreview {
    ConflictEntityPreview::Learner {
        given_name: l.given_name.clone(),
        family_name: l.family_name.clone(),
        lrn: l.lrn.clone(),
    }
}

fn attendance_preview(r: &attendance::AttendanceRecord) -> ConflictEntityPreview {
    ConflictEntityPreview::Attendance {
        section_id: r.section_id.clone(),
        learner_id: r.learner_id.clone(),
        attendance_date: r.attendance_date.clone(),
        status: format!("{:?}", r.status),
    }
}

fn section_preview(s: &section::Section) -> ConflictEntityPreview {
    ConflictEntityPreview::Section {
        name: s.name.clone(),
        grade_level: s.grade_level.clone(),
        school_year: s.school_year.clone(),
    }
}

fn lesson_plan_preview(p: &lesson_plan::LessonPlan) -> ConflictEntityPreview {
    ConflictEntityPreview::LessonPlan {
        plan_date: p.plan_date.clone(),
        learning_competency: p.learning_competency.clone(),
        learning_competency_code: p.learning_competency_code.clone(),
        learning_objectives: p.learning_objectives.clone(),
    }
}

fn nutrition_record_preview(r: &nutrition::NutritionRecord) -> ConflictEntityPreview {
    ConflictEntityPreview::NutritionRecord {
        learner_id: r.learner_id.clone(),
        school_year: r.school_year.clone(),
        period: r.period.clone(),
        height_m: r.height_m,
        weight_kg: r.weight_kg,
        nutritional_status: r.nutritional_status.clone(),
    }
}

fn behavioral_incident_preview(i: &child_protection::BehavioralIncident) -> ConflictEntityPreview {
    ConflictEntityPreview::BehavioralIncident {
        learner_id: i.learner_id.clone(),
        severity_tier: format!("{:?}", i.severity_tier),
        category: i.category.clone(),
        description: i.description.clone(),
        incident_date: i.incident_date.clone(),
        resolved_at: i.resolved_at.clone(),
    }
}

fn incident_intervention_preview(
    e: &child_protection::InterventionLogEntry,
) -> ConflictEntityPreview {
    ConflictEntityPreview::IncidentIntervention {
        incident_id: e.incident_id.clone(),
        entry_type: format!("{:?}", e.entry_type),
        note: e.note.clone(),
    }
}

fn grade_submission_preview(s: &grade_submission::GradeSubmission) -> ConflictEntityPreview {
    ConflictEntityPreview::GradeSubmission {
        class_record_id: s.class_record_id.clone(),
        status: format!("{:?}", s.status),
        submitted_at: s.submitted_at.clone(),
    }
}

fn grade_submission_note_preview(n: &grade_submission::SubmissionNote) -> ConflictEntityPreview {
    ConflictEntityPreview::GradeSubmissionNote {
        submission_id: n.submission_id.clone(),
        note_type: format!("{:?}", n.note_type),
        note: n.note.clone(),
    }
}

fn transfer_record_preview(r: &transfer_record::TransferRecord) -> ConflictEntityPreview {
    ConflictEntityPreview::TransferRecord {
        learner_id: r.learner_id.clone(),
        direction: r.direction.clone(),
        transfer_date: r.transfer_date.clone(),
        other_school_name: r.other_school_name.clone(),
        status: r.status.clone(),
    }
}

fn school_logo_preview(r: &school::SchoolLogoSyncRecord) -> ConflictEntityPreview {
    ConflictEntityPreview::SchoolLogo {
        mime: r.mime.clone(),
        byte_len: r.bytes.len(),
    }
}

/// This device's own currently-live version of the conflicting entity --
/// read straight from the domain table, never from the staged conflict
/// row itself, because the staged row never captured it (staging never
/// touches the domain table, see `sync_conflict_review`'s own doc
/// comment). `None` if this device's own local copy is gone (e.g.
/// deleted since the conflict was staged) -- a real, disclosable state,
/// not an error.
fn local_preview(
    conn: &Connection,
    school_id: &str,
    entity_kind: EntityKind,
    entity_id: &str,
) -> AppResult<Option<ConflictEntityPreview>> {
    Ok(match entity_kind {
        EntityKind::Learner => learner::find_by_id_in_school(conn, school_id, entity_id)?
            .as_ref()
            .map(learner_preview),
        EntityKind::Attendance => attendance::find_by_id_in_school(conn, school_id, entity_id)?
            .as_ref()
            .map(attendance_preview),
        EntityKind::Section => section::find_by_id_in_school(conn, school_id, entity_id)?
            .as_ref()
            .map(section_preview),
        EntityKind::LessonPlan => lesson_plan::find_by_id_in_school(conn, school_id, entity_id)?
            .as_ref()
            .map(lesson_plan_preview),
        EntityKind::NutritionRecord => nutrition::find_by_id(conn, school_id, entity_id)?
            .as_ref()
            .map(nutrition_record_preview),
        EntityKind::BehavioralIncident => {
            child_protection::find_incident_by_id(conn, school_id, entity_id)?
                .as_ref()
                .map(behavioral_incident_preview)
        }
        EntityKind::IncidentIntervention => {
            child_protection::find_intervention_by_id(conn, school_id, entity_id)?
                .as_ref()
                .map(incident_intervention_preview)
        }
        EntityKind::GradeSubmission => grade_submission::find_by_id(conn, school_id, entity_id)?
            .as_ref()
            .map(grade_submission_preview),
        EntityKind::GradeSubmissionNote => {
            grade_submission::find_note_by_id(conn, school_id, entity_id)?
                .as_ref()
                .map(grade_submission_note_preview)
        }
        EntityKind::TransferRecord => transfer_record::find_by_id(conn, school_id, entity_id)?
            .as_ref()
            .map(transfer_record_preview),
        EntityKind::SchoolLogo => school::find_logo_by_id(conn, school_id, entity_id)?
            .as_ref()
            .map(school_logo_preview),
        _ => None,
    })
}

/// Called only after `payload_key::decrypt_payload` has already
/// succeeded (see `to_summary`'s own match) -- so every arm here,
/// including the fallback, represents a genuinely decrypted, trusted
/// payload. The three typed arms additionally require the JSON to
/// deserialize into that entity's own struct (a defensive belt-and-
/// braces check, not the primary trust boundary); every OTHER wired
/// entity kind (`LessonPlan`, `NutritionRecord`, `BehavioralIncident`,
/// `IncidentIntervention`, `GradeSubmission`, `GradeSubmissionNote`, and
/// any future kind) falls through to `ConflictEntityPreview::Unknown`
/// rather than `None` -- `None` is reserved for a genuine failure
/// (`to_summary`'s `Err(_)` arm), never "no preview support yet," so
/// `resolve_conflict_review`'s "use incoming" action stays available for
/// every wired entity kind, not just the three with a field-level
/// breakdown.
fn decrypt_preview(entity_kind: EntityKind, plaintext: &[u8]) -> Option<ConflictEntityPreview> {
    match entity_kind {
        EntityKind::Learner => serde_json::from_slice::<learner::Learner>(plaintext)
            .ok()
            .as_ref()
            .map(learner_preview),
        EntityKind::Attendance => serde_json::from_slice::<attendance::AttendanceRecord>(plaintext)
            .ok()
            .as_ref()
            .map(attendance_preview),
        EntityKind::Section => serde_json::from_slice::<section::Section>(plaintext)
            .ok()
            .as_ref()
            .map(section_preview),
        EntityKind::LessonPlan => serde_json::from_slice::<lesson_plan::LessonPlan>(plaintext)
            .ok()
            .as_ref()
            .map(lesson_plan_preview),
        EntityKind::NutritionRecord => {
            serde_json::from_slice::<nutrition::NutritionRecord>(plaintext)
                .ok()
                .as_ref()
                .map(nutrition_record_preview)
        }
        EntityKind::BehavioralIncident => {
            serde_json::from_slice::<child_protection::BehavioralIncident>(plaintext)
                .ok()
                .as_ref()
                .map(behavioral_incident_preview)
        }
        EntityKind::IncidentIntervention => {
            serde_json::from_slice::<child_protection::InterventionLogEntry>(plaintext)
                .ok()
                .as_ref()
                .map(incident_intervention_preview)
        }
        EntityKind::GradeSubmission => {
            serde_json::from_slice::<grade_submission::GradeSubmission>(plaintext)
                .ok()
                .as_ref()
                .map(grade_submission_preview)
        }
        EntityKind::GradeSubmissionNote => {
            serde_json::from_slice::<grade_submission::SubmissionNote>(plaintext)
                .ok()
                .as_ref()
                .map(grade_submission_note_preview)
        }
        EntityKind::TransferRecord => {
            serde_json::from_slice::<transfer_record::TransferRecord>(plaintext)
                .ok()
                .as_ref()
                .map(transfer_record_preview)
        }
        EntityKind::SchoolLogo => serde_json::from_slice::<school::SchoolLogoSyncRecord>(plaintext)
            .ok()
            .as_ref()
            .map(school_logo_preview),
        _ => Some(ConflictEntityPreview::Unknown),
    }
}

/// One conflict on the review screen's list, with both versions the
/// teacher must choose between shown wherever they can safely be shown.
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ConflictReviewSummary {
    pub id: String,
    pub entity_kind: String,
    pub entity_id: String,
    pub device_id: String,
    pub created_at: String,
    pub submitted_base_version: u64,
    pub current_hub_version: u64,
    /// The other device's incoming edit, decrypted for display. `None`
    /// only if it could not be decrypted (e.g. the SSPK was rotated by a
    /// revocation since this conflict was staged) -- disclosed via
    /// `incoming_unavailable_reason`, never silently hidden as if there
    /// were no incoming change at all.
    pub incoming: Option<ConflictEntityPreview>,
    pub incoming_unavailable_reason: Option<String>,
    /// This device's own current edit. `None` if it no longer exists
    /// locally (see `local_preview`'s own doc comment).
    pub local: Option<ConflictEntityPreview>,
}

fn to_summary(
    row: &ConflictReviewRow,
    conn: &Connection,
    school_id: &str,
    sspk: Option<[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<ConflictReviewSummary> {
    let (incoming, incoming_unavailable_reason) = match sspk {
        None => (
            None,
            Some("Could not reach this school's sync key to decrypt the incoming change. Try again once this device is connected to the sync hub.".to_string()),
        ),
        Some(key) => match payload_key::decrypt_payload(&key, &row.encrypted_payload) {
            Ok(plaintext) => match decrypt_preview(row.entity_kind, &plaintext) {
                Some(preview) => (Some(preview), None),
                None => (
                    None,
                    Some("The incoming change could not be read.".to_string()),
                ),
            },
            Err(_) => (
                None,
                Some(
                    "The incoming change could not be decrypted -- this school's sync key may have changed since it was received."
                        .to_string(),
                ),
            ),
        },
    };

    let local = local_preview(conn, school_id, row.entity_kind, &row.entity_id)?;

    Ok(ConflictReviewSummary {
        id: row.id.clone(),
        entity_kind: row.entity_kind.as_db_str().to_string(),
        entity_id: row.entity_id.clone(),
        device_id: row.device_id.clone(),
        created_at: row.created_at.clone(),
        submitted_base_version: row.submitted_base_version,
        current_hub_version: row.current_hub_version,
        incoming,
        incoming_unavailable_reason,
        local,
    })
}

fn http_client() -> Option<reqwest::blocking::Client> {
    reqwest::blocking::Client::builder()
        .timeout(Duration::from_secs(10))
        .build()
        .ok()
}

/// Best-effort resolution of this school's current SSPK, for decrypting
/// conflict previews -- `None` (never an error) when there is no stored
/// sync credential yet, or the hub cannot be reached right now. A
/// conflict can still be listed and reviewed by its metadata alone in
/// that case; only the decrypted preview is unavailable (see
/// `to_summary`).
fn resolve_sspk_for_school(conn: &Connection, school_id: &str) -> Option<[u8; PAYLOAD_KEY_LEN]> {
    let config = SyncClientConfig::discover(conn).ok().flatten()?;
    if config.school_id != school_id {
        return None;
    }
    let client = http_client()?;
    sync_client::resolve_sspk(&client, &config)
}

/// Lists every not-yet-resolved conflict staged for the caller's own
/// school, oldest first. `school_id` is always session-derived, matching
/// every other tenant-data command in this codebase -- see this module's
/// own doc comment for why any active school member (not just
/// `SCHOOL_HEAD`) may call this.
#[tauri::command]
pub fn list_conflict_reviews(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<ConflictReviewSummary>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let rows = sync_conflict_review::list_open_for_school(&conn, &school_id)?;
    let sspk = resolve_sspk_for_school(&conn, &school_id);
    rows.iter()
        .map(|row| to_summary(row, &conn, &school_id, sspk))
        .collect()
}

/// Which version of a conflicting record the teacher chose.
#[derive(Debug, Clone, Copy, serde::Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ConflictResolutionChoice {
    KeepLocal,
    UseIncoming,
}

fn parse_uuid(value: &str, what: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|_| AppError::key_store(format!("stored {what} was not a valid UUID")))
}

/// Resolves one staged conflict per the teacher's explicit choice --
/// never a bulk or automatic resolution (see this module's own scope
/// boundary in the task that added it). `KeepLocal` marks the conflict
/// resolved and leaves this device's own local edit exactly as it is,
/// never touching the domain table; the incoming hub version is
/// discarded. `UseIncoming` decrypts and applies the incoming version to
/// the domain table (`sync_client::apply_decrypted_change`, the same
/// function `pull_once` itself uses for a non-conflicting change, so a
/// resolved conflict is materialized identically to any other applied
/// pull) and advances this device's `sync_version_cache` watermark to
/// the hub's version, so this entity is no longer treated as behind.
///
/// `KeepLocal` also corrects this device's own still-pending
/// `sync_outbox` entry for the same entity, if one exists
/// (`sync_outbox::correct_base_version_for_entity`): the row's
/// `base_version` is advanced to `current_hub_version` (the hub-side
/// version recorded when this conflict was staged), so the NEXT push for
/// this entity is recognized as building on the latest known hub state.
/// Without this, the resolution would clear the conflict-review row but
/// leave the outbox push carrying the same stale `base_version` that
/// caused the conflict in the first place, letting `sync_hub::push_change`
/// re-stage the identical conflict on the very next push attempt --
/// disclosed and closed rather than left as a known limitation.
#[tauri::command]
pub fn resolve_conflict_review(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    conflict_id: String,
    resolution: ConflictResolutionChoice,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;

    let Some(row) =
        sync_conflict_review::find_open_by_id_in_school(&conn, &school_id, &conflict_id)?
    else {
        return Ok(false);
    };

    match resolution {
        ConflictResolutionChoice::KeepLocal => {
            sync_outbox::correct_base_version_for_entity(
                &conn,
                &school_id,
                row.entity_kind,
                &row.entity_id,
                row.current_hub_version,
            )?;
            sync_conflict_review::mark_resolved(
                &conn,
                &school_id,
                &conflict_id,
                ConflictResolution::KeptLocal,
            )
        }
        ConflictResolutionChoice::UseIncoming => {
            // Primary: the same network round trip `pull_once` itself
            // uses to obtain this device's own wrap of the SSPK (works
            // for any enrolled device). Fallback: `db::load_or_mint_sspk`
            // -- correct only when THIS installation is itself the hub
            // (the same fallback `enroll_device_sync_credential` already
            // relies on), so tried second, never first, to avoid masking
            // a real "device unreachable" case with a locally-minted key
            // that would not match what actually encrypted the payload.
            let sspk = resolve_sspk_for_school(&conn, &school_id)
                .or_else(|| db::load_or_mint_sspk(&app).ok());
            let Some(sspk) = sspk else {
                return Err(AppError::key_store(
                    "could not resolve this school's sync key to apply the incoming change"
                        .to_string(),
                ));
            };

            let change = AcceptedChange {
                cursor: crate::sync::SyncCursor(0),
                change_id: parse_uuid(&row.change_id, "conflict change id")?,
                device_id: parse_uuid(&row.device_id, "conflict device id")?,
                actor_user_id: parse_uuid(&row.actor_user_id, "conflict actor user id")?,
                entity_kind: row.entity_kind,
                entity_id: parse_uuid(&row.entity_id, "conflict entity id")?,
                version: row.current_hub_version,
                operation: row.operation,
                encrypted_payload: row.encrypted_payload.clone(),
            };

            sync_client::apply_decrypted_change(&conn, &school_id, &change, &sspk).map_err(
                |_rejection| {
                    AppError::key_store(
                        "the incoming change could not be applied -- it may be corrupted or encrypted under a different key"
                            .to_string(),
                    )
                },
            )?;
            sync_version_cache::record_known_version(
                &conn,
                &school_id,
                row.entity_kind,
                &row.entity_id,
                row.current_hub_version,
            )?;

            sync_conflict_review::mark_resolved(
                &conn,
                &school_id,
                &conflict_id,
                ConflictResolution::UsedIncoming,
            )
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::device_credential::VerifiedDevice;
    use crate::repository::{school, sync_conflict_review::stage_pull_conflict, sync_hub};
    use crate::sync::{ChangeOperation, PendingChange, SyncCursor};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x22; PAYLOAD_KEY_LEN]
    }

    fn stage_learner_conflict(
        conn: &Connection,
        school_id: &str,
        incoming: &learner::Learner,
        sspk: &[u8; PAYLOAD_KEY_LEN],
    ) -> ConflictReviewRow {
        let plaintext = serde_json::to_vec(incoming).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::parse_str(&incoming.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(conn, school_id, 1, &change).unwrap();
        sync_conflict_review::list_open_for_school(conn, school_id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap()
    }

    #[test]
    fn to_summary_shows_both_the_incoming_and_local_learner_versions() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let local = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let sspk = test_sspk();
        let incoming = learner::Learner {
            given_name: "Anna".to_string(),
            ..local.clone()
        };
        let row = stage_learner_conflict(&conn, &s.id, &incoming, &sspk);

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();

        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::Learner { ref given_name, .. }) if given_name == "Anna"
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::Learner { ref given_name, .. }) if given_name == "Ana"
        ));
        assert!(summary.incoming_unavailable_reason.is_none());
    }

    #[test]
    fn to_summary_discloses_when_the_incoming_change_cannot_be_decrypted() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let local = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let row = stage_learner_conflict(&conn, &s.id, &local, &test_sspk());

        // No SSPK available at all (e.g. hub unreachable).
        let summary = to_summary(&row, &conn, &s.id, None).unwrap();
        assert!(summary.incoming.is_none());
        assert!(summary.incoming_unavailable_reason.is_some());
        // The local version is still shown even though the incoming one
        // is unavailable -- a teacher is never left with nothing to look
        // at.
        assert!(summary.local.is_some());

        // Wrong SSPK -- decryption fails (tamper/auth-tag mismatch).
        let mut wrong_key = test_sspk();
        wrong_key[0] ^= 0xFF;
        let summary = to_summary(&row, &conn, &s.id, Some(wrong_key)).unwrap();
        assert!(summary.incoming.is_none());
        assert!(summary.incoming_unavailable_reason.is_some());
    }

    #[test]
    fn to_summary_shows_local_as_absent_when_this_device_no_longer_has_the_record() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sspk = test_sspk();
        let ghost = learner::Learner {
            id: Uuid::now_v7().to_string(),
            school_id: s.id.clone(),
            given_name: "Bea".to_string(),
            family_name: "Reyes".to_string(),
            lrn: None,
            sex: None,
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };
        let row = stage_learner_conflict(&conn, &s.id, &ghost, &sspk);

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();

        assert!(summary.incoming.is_some());
        assert!(summary.local.is_none());
    }

    /// Exercises the exact composition `resolve_conflict_review`'s
    /// `UseIncoming` branch performs (decrypt, apply via the same
    /// function `pull_once` itself uses, advance the version watermark,
    /// mark resolved) without needing a real `AppHandle`/`State` --
    /// matching `commands::device_sync`'s own established test
    /// convention for command bodies that wrap already-tested logic.
    #[test]
    fn using_the_incoming_version_applies_it_and_resolves_the_conflict() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let local = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let sspk = test_sspk();
        let incoming = learner::Learner {
            given_name: "Anna".to_string(),
            ..local.clone()
        };
        let row = stage_learner_conflict(&conn, &s.id, &incoming, &sspk);

        let change = AcceptedChange {
            cursor: SyncCursor(0),
            change_id: parse_uuid(&row.change_id, "change id").unwrap(),
            device_id: parse_uuid(&row.device_id, "device id").unwrap(),
            actor_user_id: parse_uuid(&row.actor_user_id, "actor id").unwrap(),
            entity_kind: row.entity_kind,
            entity_id: parse_uuid(&row.entity_id, "entity id").unwrap(),
            version: row.current_hub_version,
            operation: row.operation,
            encrypted_payload: row.encrypted_payload.clone(),
        };
        sync_client::apply_decrypted_change(&conn, &s.id, &change, &sspk).unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &s.id,
            row.entity_kind,
            &row.entity_id,
            row.current_hub_version,
        )
        .unwrap();
        let resolved = sync_conflict_review::mark_resolved(
            &conn,
            &s.id,
            &row.id,
            ConflictResolution::UsedIncoming,
        )
        .unwrap();

        assert!(resolved);
        let stored = learner::find_by_id_in_school(&conn, &s.id, &local.id)
            .unwrap()
            .unwrap();
        assert_eq!(stored.given_name, "Anna", "the incoming edit must win");
        assert_eq!(
            sync_conflict_review::count_open_for_school(&conn, &s.id).unwrap(),
            0
        );
    }

    /// The "keep local" path: the conflict is resolved but the domain
    /// table is never touched, since this device's own unsynced edit was
    /// never overwritten when the conflict was staged in the first place.
    #[test]
    fn keeping_the_local_version_resolves_the_conflict_without_touching_the_domain_table() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let local = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let sspk = test_sspk();
        let incoming = learner::Learner {
            given_name: "Anna".to_string(),
            ..local.clone()
        };
        let row = stage_learner_conflict(&conn, &s.id, &incoming, &sspk);

        let resolved = sync_conflict_review::mark_resolved(
            &conn,
            &s.id,
            &row.id,
            ConflictResolution::KeptLocal,
        )
        .unwrap();

        assert!(resolved);
        let stored = learner::find_by_id_in_school(&conn, &s.id, &local.id)
            .unwrap()
            .unwrap();
        assert_eq!(
            stored.given_name, "Ana",
            "the local edit must be left exactly as it was"
        );
        assert_eq!(
            sync_conflict_review::count_open_for_school(&conn, &s.id).unwrap(),
            0
        );
    }

    /// Reproduces the exact gap this task closes: after "keep local", this
    /// device's own still-pending `sync_outbox` push for the same entity
    /// must carry the hub's current version as its `base_version`, so the
    /// NEXT push is accepted rather than re-staged as another conflict.
    /// Exercises the same composition `resolve_conflict_review`'s
    /// `KeepLocal` branch performs (`correct_base_version_for_entity` then
    /// `mark_resolved`), matching this module's established test
    /// convention for command bodies that wrap already-tested logic.
    #[test]
    fn keeping_local_corrects_the_pending_outbox_entry_so_the_next_push_is_accepted() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let entity_id = Uuid::now_v7();

        let verified = VerifiedDevice {
            credential_id: "cred-1".to_string(),
            school_id: s.id.clone(),
            user_id: Uuid::now_v7().to_string(),
            device_id: Uuid::now_v7().to_string(),
        };

        // The hub already has one accepted change for this entity (version 1).
        let first = PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::parse_str(&verified.device_id).unwrap(),
            actor_user_id: Uuid::parse_str(&verified.user_id).unwrap(),
            entity_kind: EntityKind::Learner,
            entity_id,
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![1, 2, 3],
        };
        assert_eq!(
            sync_hub::push_change(&conn, &verified, &first).unwrap(),
            sync_hub::PushOutcome::Accepted(SyncCursor(1))
        );

        // This device's own still-pending outbox push for the same entity
        // was enqueued back when the hub was at version 0 -- now stale.
        let outbox_change = PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::parse_str(&verified.device_id).unwrap(),
            actor_user_id: Uuid::parse_str(&verified.user_id).unwrap(),
            entity_kind: EntityKind::Learner,
            entity_id,
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![4, 5, 6],
        };
        sync_outbox::enqueue(&conn, &s.id, &outbox_change).unwrap();

        // A conflict is staged for this entity at current_hub_version = 1.
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id,
            version: 1,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![7, 8, 9],
        };
        stage_pull_conflict(&conn, &s.id, 0, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        // The exact composition `resolve_conflict_review`'s `KeepLocal`
        // branch performs.
        sync_outbox::correct_base_version_for_entity(
            &conn,
            &s.id,
            row.entity_kind,
            &row.entity_id,
            row.current_hub_version,
        )
        .unwrap();
        assert!(sync_conflict_review::mark_resolved(
            &conn,
            &s.id,
            &row.id,
            ConflictResolution::KeptLocal,
        )
        .unwrap());

        // The corrected outbox entry now carries the hub's current version.
        let pending = sync_outbox::pending_for_school(&conn, &s.id, 20).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(pending[0].change.base_version, 1);

        // Pushing it now is accepted, not re-staged as a conflict.
        let mut resend = pending[0].change.clone();
        resend.device_id = Uuid::parse_str(&verified.device_id).unwrap();
        resend.actor_user_id = Uuid::parse_str(&verified.user_id).unwrap();
        let outcome = sync_hub::push_change(&conn, &verified, &resend).unwrap();
        assert_eq!(outcome, sync_hub::PushOutcome::Accepted(SyncCursor(2)));
    }

    /// Proves the conflict-review RESOLUTION mechanism is already
    /// generic across every wired `EntityKind` -- not hardcoded to the
    /// kinds with a dedicated typed preview -- without adding a single
    /// entity-specific line here. `to_summary`'s `local`/`incoming`
    /// PREVIEW rendering (`local_preview`/`decrypt_preview` above) IS
    /// still scoped to the kinds with a dedicated typed arm (a UX-only
    /// limitation: an unrecognized kind's preview is `Unknown`/`None`,
    /// never an error, and this test explicitly checks that), but
    /// `resolve_conflict_review`'s actual apply/keep-local logic never
    /// matches on entity kind at all -- it dispatches generically through
    /// `row.entity_kind` into `sync_client::apply_decrypted_change` (the
    /// same function every entity's own `apply_decrypted_change` arm
    /// already proves correct in `sync_client.rs`'s own tests) and
    /// `sync_outbox::correct_base_version_for_entity`, both of which are
    /// keyed purely on `EntityKind` + `entity_id`. This test exercises
    /// that generic path end to end for `Subject` -- picked precisely
    /// because it is NOT one of the kinds `local_preview`/`decrypt_preview`
    /// special-case (as of this commit, every kind added in Batch 6's sync
    /// expansion now has its own typed preview; `Subject` still predates
    /// that and has none) -- to prove new/unpreviewed entities need zero
    /// changes here to resolve correctly.
    #[test]
    fn conflict_resolution_is_already_generic_for_an_entity_kind_with_no_typed_preview() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sspk = test_sspk();

        let incoming = crate::repository::subject::Subject {
            id: Uuid::now_v7().to_string(),
            school_id: s.id.clone(),
            name: "Mathematics".to_string(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
        };
        let plaintext = serde_json::to_vec(&incoming).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Subject,
            entity_id: Uuid::parse_str(&incoming.id).unwrap(),
            version: 1,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 0, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        // The screen's own read model handles this unrecognized-preview
        // kind gracefully -- a genuine `Unknown` preview (decryption DID
        // succeed), never a panic, never `None`/"could not be read" --
        // so `resolve_conflict_review`'s "use incoming" action stays
        // available (the frontend gates that button on `incoming` being
        // present, see `ConflictReviewScreen.tsx`'s own doc comment).
        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert_eq!(summary.entity_kind, "subject");
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::Unknown)
        ));
        assert!(summary.incoming_unavailable_reason.is_none());
        assert!(summary.local.is_none());

        // The generic RESOLUTION path (same composition
        // `resolve_conflict_review`'s `UseIncoming` branch performs)
        // still applies the incoming Subject correctly, with zero
        // Subject-specific code in this module.
        let apply_change = AcceptedChange {
            cursor: SyncCursor(0),
            change_id: parse_uuid(&row.change_id, "change id").unwrap(),
            device_id: parse_uuid(&row.device_id, "device id").unwrap(),
            actor_user_id: parse_uuid(&row.actor_user_id, "actor id").unwrap(),
            entity_kind: row.entity_kind,
            entity_id: parse_uuid(&row.entity_id, "entity id").unwrap(),
            version: row.current_hub_version,
            operation: row.operation,
            encrypted_payload: row.encrypted_payload.clone(),
        };
        sync_client::apply_decrypted_change(&conn, &s.id, &apply_change, &sspk).unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &s.id,
            row.entity_kind,
            &row.entity_id,
            row.current_hub_version,
        )
        .unwrap();
        let resolved = sync_conflict_review::mark_resolved(
            &conn,
            &s.id,
            &row.id,
            ConflictResolution::UsedIncoming,
        )
        .unwrap();

        assert!(resolved);
        let stored = crate::repository::subject::find_by_id_in_school(&conn, &s.id, &incoming.id)
            .unwrap()
            .unwrap();
        assert_eq!(stored.name, "Mathematics");
        assert_eq!(
            sync_conflict_review::count_open_for_school(&conn, &s.id).unwrap(),
            0
        );
    }

    /// Regression: the "use incoming" path must not touch an unrelated
    /// pending outbox entry for the same entity -- only `KeepLocal`
    /// corrects `base_version`, since `UseIncoming` already advances this
    /// device's applied state via `sync_version_cache`, and the pending
    /// outbox push is a separate, still-unsynced edit this task's scope
    /// does not touch.
    #[test]
    fn using_incoming_leaves_a_pending_outbox_entrys_base_version_untouched() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let local = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let sspk = test_sspk();
        let incoming = learner::Learner {
            given_name: "Anna".to_string(),
            ..local.clone()
        };
        let row = stage_learner_conflict(&conn, &s.id, &incoming, &sspk);

        let outbox_change = PendingChange {
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::Learner,
            entity_id: Uuid::parse_str(&local.id).unwrap(),
            base_version: 0,
            operation: ChangeOperation::Upsert,
            encrypted_payload: vec![9, 9, 9],
        };
        sync_outbox::enqueue(&conn, &s.id, &outbox_change).unwrap();

        let change = AcceptedChange {
            cursor: SyncCursor(0),
            change_id: parse_uuid(&row.change_id, "change id").unwrap(),
            device_id: parse_uuid(&row.device_id, "device id").unwrap(),
            actor_user_id: parse_uuid(&row.actor_user_id, "actor id").unwrap(),
            entity_kind: row.entity_kind,
            entity_id: parse_uuid(&row.entity_id, "entity id").unwrap(),
            version: row.current_hub_version,
            operation: row.operation,
            encrypted_payload: row.encrypted_payload.clone(),
        };
        sync_client::apply_decrypted_change(&conn, &s.id, &change, &sspk).unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &s.id,
            row.entity_kind,
            &row.entity_id,
            row.current_hub_version,
        )
        .unwrap();
        sync_conflict_review::mark_resolved(
            &conn,
            &s.id,
            &row.id,
            ConflictResolution::UsedIncoming,
        )
        .unwrap();

        let pending = sync_outbox::pending_for_school(&conn, &s.id, 20).unwrap();
        assert_eq!(pending.len(), 1);
        assert_eq!(
            pending[0].change.base_version, 0,
            "UseIncoming must not touch an unrelated pending outbox entry's base_version"
        );
    }

    // -- Typed previews for the six entity kinds wired in Batch 6's sync
    // expansion (`LessonPlan`, `NutritionRecord`, `BehavioralIncident`,
    // `IncidentIntervention`, `GradeSubmission`, `GradeSubmissionNote`).
    // Each test stages a conflict with a distinct incoming value and a
    // distinct pre-existing local row, then checks `to_summary` renders
    // the real typed variant (not `Unknown`) for both sides -- proving a
    // teacher sees actual field differences, matching this module's own
    // `Learner` precedent above.

    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    #[test]
    fn to_summary_shows_typed_lesson_plan_previews() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let teacher = crate::repository::user::create_user(
            &conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        crate::repository::user::add_school_membership(&conn, &teacher.id, &s.id).unwrap();
        let section =
            crate::repository::section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let subject = crate::repository::subject::create(&conn, &s.id, "Mathematics").unwrap();
        let assignment = crate::repository::teaching_assignment::create(
            &conn,
            &s.id,
            &teacher.id,
            &section.id,
            &subject.id,
        )
        .unwrap()
        .unwrap();
        let sspk = test_sspk();

        let local = crate::repository::lesson_plan::create(
            &conn,
            &s.id,
            &assignment.id,
            "2026-09-07",
            &teacher.id,
            &crate::repository::lesson_plan::LessonPlanFields {
                learning_competency: "Add fractions",
                learning_competency_code: "M7NS-Ig-1",
                learning_objectives: "Add fractions with like denominators",
                connection_to_previous_learning: "Builds on whole numbers",
                learning_experiences: "Think-pair-share",
                assessment: "Exit ticket",
                ways_forward: "Reteach if needed",
            },
        )
        .unwrap()
        .unwrap();

        let incoming = crate::repository::lesson_plan::LessonPlan {
            learning_objectives: "Add fractions with UNLIKE denominators".to_string(),
            ..local.clone()
        };
        let plaintext = serde_json::to_vec(&incoming).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::LessonPlan,
            entity_id: Uuid::parse_str(&incoming.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::LessonPlan { ref learning_objectives, .. })
                if learning_objectives == "Add fractions with UNLIKE denominators"
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::LessonPlan { ref learning_objectives, .. })
                if learning_objectives == "Add fractions with like denominators"
        ));
    }

    #[test]
    fn to_summary_shows_typed_school_logo_previews() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sspk = test_sspk();
        school::set_logo(&conn, &s.id, "image/png", &[1, 2, 3]).unwrap();

        let incoming = school::SchoolLogoSyncRecord {
            school_id: s.id.clone(),
            mime: "image/webp".to_string(),
            bytes: vec![9, 9, 9, 9, 9],
        };
        let plaintext = serde_json::to_vec(&incoming).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::SchoolLogo,
            entity_id: Uuid::parse_str(&s.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::SchoolLogo { ref mime, byte_len })
                if mime == "image/webp" && byte_len == 5
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::SchoolLogo { ref mime, byte_len })
                if mime == "image/png" && byte_len == 3
        ));
    }

    #[test]
    fn to_summary_shows_typed_nutrition_record_previews() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let learner = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let sspk = test_sspk();

        let local = crate::repository::nutrition::record_measurement(
            &conn,
            &s.id,
            &learner.id,
            "2026-2027",
            crate::repository::nutrition::Period::Bosy,
            "5",
            "F",
            "2016-01-01",
            "2026-06-10",
            1.20,
            25.0,
        )
        .unwrap();

        let incoming = crate::repository::nutrition::NutritionRecord {
            weight_kg: 27.5,
            ..local.clone()
        };
        let plaintext = serde_json::to_vec(&incoming).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::NutritionRecord,
            entity_id: Uuid::parse_str(&incoming.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::NutritionRecord { weight_kg, .. }) if weight_kg == 27.5
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::NutritionRecord { weight_kg, .. }) if weight_kg == 25.0
        ));
    }

    #[test]
    fn to_summary_shows_typed_behavioral_incident_and_intervention_previews() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let learner = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        let section =
            crate::repository::section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let adviser = crate::repository::user::create_user(
            &conn,
            "adviser.a",
            "correct horse battery staple",
            "Adviser A",
        )
        .unwrap();
        let sspk = test_sspk();

        let local_incident = child_protection::create_incident(
            &conn,
            &s.id,
            &learner.id,
            &section.id,
            &adviser.id,
            child_protection::SeverityTier::Level1,
            "Tardiness",
            "Arrived late three times",
            "2026-09-01",
        )
        .unwrap();

        let incoming_incident = child_protection::BehavioralIncident {
            description: "Arrived late five times".to_string(),
            ..local_incident.clone()
        };
        let plaintext = serde_json::to_vec(&incoming_incident).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::BehavioralIncident,
            entity_id: Uuid::parse_str(&incoming_incident.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::BehavioralIncident { ref description, .. })
                if description == "Arrived late five times"
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::BehavioralIncident { ref description, .. })
                if description == "Arrived late three times"
        ));

        // IncidentIntervention preview, keyed by the intervention's OWN
        // id (not the incident's) -- exercises the new
        // `find_intervention_by_id` local lookup added for this task.
        let local_entry = child_protection::add_intervention(
            &conn,
            &s.id,
            &local_incident.id,
            &adviser.id,
            child_protection::InterventionEntryType::Intervention,
            "Called guardian",
        )
        .unwrap();
        let incoming_entry = child_protection::InterventionLogEntry {
            note: "Scheduled counseling session".to_string(),
            ..local_entry.clone()
        };
        let plaintext = serde_json::to_vec(&incoming_entry).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(2),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::IncidentIntervention,
            entity_id: Uuid::parse_str(&incoming_entry.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .find(|r| r.entity_id == incoming_entry.id)
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::IncidentIntervention { ref note, .. })
                if note == "Scheduled counseling session"
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::IncidentIntervention { ref note, .. })
                if note == "Called guardian"
        ));
    }

    fn setup_class_record(conn: &Connection, school_id: &str) -> String {
        let section =
            crate::repository::section::create(conn, school_id, "2026-2027", "5", "Section A")
                .unwrap();
        let subject = crate::repository::subject::create(conn, school_id, "Mathematics").unwrap();
        let period = crate::repository::grading::create(
            conn,
            school_id,
            "2026-2027",
            "00000000-0000-7000-8000-000000000011",
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let class_record = crate::repository::class_record::create(
            conn,
            school_id,
            &section.id,
            &subject.id,
            &period.id,
            K10_POLICY,
            None,
        )
        .unwrap()
        .unwrap();
        conn.execute(
            "INSERT INTO users (id, username, password_hash, display_name) \
             VALUES ('teacher1', 'teacher1', 'hash', 'Teacher One')",
            [],
        )
        .unwrap();
        class_record.id
    }

    #[test]
    fn to_summary_shows_typed_grade_submission_and_note_previews() {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let class_record_id = setup_class_record(&conn, &s.id);
        let sspk = test_sspk();

        let local_submission =
            grade_submission::submit(&conn, &s.id, &class_record_id, "teacher1").unwrap();

        let incoming_submission = grade_submission::GradeSubmission {
            status: grade_submission::SubmissionStatus::Approved,
            decided_by_user_id: Some("head1".to_string()),
            decided_at: Some("2026-09-08T00:00:00.000Z".to_string()),
            ..local_submission.clone()
        };
        let plaintext = serde_json::to_vec(&incoming_submission).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(1),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::GradeSubmission,
            entity_id: Uuid::parse_str(&incoming_submission.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::GradeSubmission { ref status, .. }) if status == "Approved"
        ));
        assert!(matches!(
            summary.local,
            Some(ConflictEntityPreview::GradeSubmission { ref status, .. }) if status == "Submitted"
        ));

        // GradeSubmissionNote preview, keyed by the note's OWN id --
        // exercises the new `find_note_by_id` local lookup added for
        // this task. The submission's own `submit` already appended one
        // automated-check note; use that as the "local" fixture.
        let local_note = grade_submission::list_notes(&conn, &s.id, &local_submission.id)
            .unwrap()
            .into_iter()
            .next()
            .unwrap();
        let incoming_note = grade_submission::SubmissionNote {
            note: "Reviewed and cleared".to_string(),
            ..local_note.clone()
        };
        let plaintext = serde_json::to_vec(&incoming_note).unwrap();
        let encrypted_payload = payload_key::encrypt_payload(&sspk, &plaintext).unwrap();
        let change = AcceptedChange {
            cursor: SyncCursor(2),
            change_id: Uuid::now_v7(),
            device_id: Uuid::now_v7(),
            actor_user_id: Uuid::now_v7(),
            entity_kind: EntityKind::GradeSubmissionNote,
            entity_id: Uuid::parse_str(&incoming_note.id).unwrap(),
            version: 2,
            operation: ChangeOperation::Upsert,
            encrypted_payload,
        };
        stage_pull_conflict(&conn, &s.id, 1, &change).unwrap();
        let row = sync_conflict_review::list_open_for_school(&conn, &s.id)
            .unwrap()
            .into_iter()
            .find(|r| r.entity_id == incoming_note.id)
            .unwrap();

        let summary = to_summary(&row, &conn, &s.id, Some(sspk)).unwrap();
        assert!(matches!(
            summary.incoming,
            Some(ConflictEntityPreview::GradeSubmissionNote { ref note, .. })
                if note == "Reviewed and cleared"
        ));
        assert!(summary.local.is_some());
    }
}
