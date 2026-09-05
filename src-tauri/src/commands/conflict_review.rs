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
use crate::repository::{attendance, learner, section};
use crate::repository::{
    sync_conflict_review::{self, ConflictResolution, ConflictReviewRow},
    sync_version_cache,
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
        _ => None,
    })
}

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
        _ => None,
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
/// **Known limitation, disclosed rather than silently swallowed**:
/// `KeepLocal` does not rewrite this device's still-pending `sync_outbox`
/// entry's stale `base_version` (out of this slice's scope --
/// `sync_client::pull_once`'s and `push_once`'s own staging logic are
/// deliberately untouched). If that entry pushes again before the hub's
/// version changes further, `sync_hub::push_change` will stage a fresh
/// push-side conflict for the same entity, surfacing back on this same
/// screen for another review rather than looping silently or being lost.
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
        ConflictResolutionChoice::KeepLocal => sync_conflict_review::mark_resolved(
            &conn,
            &school_id,
            &conflict_id,
            ConflictResolution::KeptLocal,
        ),
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
                |()| {
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
    use crate::repository::{school, sync_conflict_review::stage_pull_conflict};
    use crate::sync::{ChangeOperation, SyncCursor};
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
}
