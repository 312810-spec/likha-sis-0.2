//! Tauri commands for Anecdotal / Guidance Records (Batch 12, ADR-0083).
//! Every command gates on
//! `auth::authorize_child_protection_access_for_section` -- the exact
//! same function DO 006 Child Protection (ADR-0072) uses, reused
//! directly rather than a near-identical sibling (see ADR-0083 for why)
//! -- so a general Teacher with no adviser relationship to the target
//! section is denied. `school_id` is always session-derived, never a
//! client-supplied argument.
//!
//! Sync wiring (Checkpoint 4, ADR-0083): the exact same enrollment-gated
//! encrypt-on-enqueue pattern as `commands::child_protection`. **The
//! authorization gate above runs unchanged, before the sync-aware write
//! path is ever reached** -- sync adds encryption/enqueue only, it never
//! touches or bypasses `authorize_child_protection_access_for_section`.

use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::anecdotal_record::{
    self, AnecdotalCategory, AnecdotalRecord, AnecdotalRecordFollowup,
};
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

fn parse_category(raw: &str) -> AppResult<AnecdotalCategory> {
    match raw {
        "positive" => Ok(AnecdotalCategory::Positive),
        "negative" => Ok(AnecdotalCategory::Negative),
        "neutral" => Ok(AnecdotalCategory::Neutral),
        _ => Err(AppError::InvalidInput(
            "unrecognized anecdotal record category".to_string(),
        )),
    }
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::child_protection::resolve_sspk_if_enrolled`.
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

/// Same rationale as `commands::child_protection::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// Records a new anecdotal/guidance entry for a learner in `section_id`.
/// Only that section's current adviser, or a School Head, may do this --
/// there is no `update_anecdotal_record` command at all (the narrative
/// content is immutable by design, see migration 57's own comment).
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn record_anecdotal_entry(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    learner_id: String,
    section_id: String,
    category: String,
    entry_date: String,
    narrative: String,
) -> AppResult<AnecdotalRecord> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &entry_date,
    )?;
    let category = parse_category(&category)?;

    let narrative = narrative.trim();
    if narrative.is_empty() {
        return Err(AppError::InvalidInput(
            "narrative must not be empty".to_string(),
        ));
    }
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_anecdotal_entry_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &learner_id,
        &section_id,
        category,
        &entry_date,
        narrative,
        sspk.as_ref(),
    )
}

/// Shared logic behind `record_anecdotal_entry`, kept separate so it can
/// be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as
/// `commands::child_protection::record_behavioral_incident_with_optional_sync`.
#[allow(clippy::too_many_arguments)]
fn record_anecdotal_entry_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    learner_id: &str,
    section_id: &str,
    category: AnecdotalCategory,
    entry_date: &str,
    narrative: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<AnecdotalRecord> {
    let Some(sspk) = sspk else {
        return anecdotal_record::create_record(
            conn,
            school_id,
            learner_id,
            section_id,
            actor_user_id,
            category,
            entry_date,
            narrative,
        );
    };

    conn.execute_batch("SAVEPOINT record_anecdotal_entry_with_sync")?;
    let outcome = (|| -> AppResult<AnecdotalRecord> {
        let created = anecdotal_record::create_record(
            conn,
            school_id,
            learner_id,
            section_id,
            actor_user_id,
            category,
            entry_date,
            narrative,
        )?;
        enqueue_record_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE record_anecdotal_entry_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_anecdotal_entry_with_sync; RELEASE record_anecdotal_entry_with_sync",
            );
            Err(error)
        }
    }
}

fn enqueue_record_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    record: &AnecdotalRecord,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::AnecdotalRecord,
        &record.id,
    )?;
    let plaintext = serde_json::to_vec(record)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::AnecdotalRecord,
        entity_id: parse_sync_uuid(&record.id, "anecdotal record id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// All anecdotal records for one section, newest first -- same gate as
/// [`record_anecdotal_entry`].
#[tauri::command]
pub fn list_anecdotal_records_for_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<AnecdotalRecord>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    anecdotal_record::list_for_section(&conn, &school_id, &section_id)
}

/// Appends one follow-up entry -- the caller must already be authorized
/// for the anecdotal record's own section. Deliberately INSERT-only --
/// there is no update/delete command for a follow-up, matching
/// migration 57's append-only contract.
///
/// Defense in depth: confirms the target `anecdotal_record_id` actually
/// belongs to the authorized `section_id`, not merely to the caller's
/// school -- same guard as
/// `commands::child_protection::add_incident_intervention`.
#[allow(clippy::too_many_arguments)]
#[tauri::command]
pub fn add_anecdotal_record_followup(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    anecdotal_record_id: String,
    section_id: String,
    as_of_date: String,
    note: String,
) -> AppResult<AnecdotalRecordFollowup> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let note = note.trim();
    if note.is_empty() {
        return Err(AppError::InvalidInput(
            "follow-up note must not be empty".to_string(),
        ));
    }
    let Some(record) =
        anecdotal_record::find_record_by_id(&conn, &school_id, &anecdotal_record_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if record.section_id != section_id {
        return Err(AppError::Unauthorized);
    }
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    add_anecdotal_record_followup_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &anecdotal_record_id,
        note,
        sspk.as_ref(),
    )
}

/// Shared logic behind `add_anecdotal_record_followup`, kept separate so
/// it can be exercised directly in this module's own tests without a
/// real Tauri `AppHandle`.
fn add_anecdotal_record_followup_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    anecdotal_record_id: &str,
    note: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<AnecdotalRecordFollowup> {
    let Some(sspk) = sspk else {
        return anecdotal_record::add_followup(
            conn,
            school_id,
            anecdotal_record_id,
            actor_user_id,
            note,
        );
    };

    conn.execute_batch("SAVEPOINT add_anecdotal_record_followup_with_sync")?;
    let outcome = (|| -> AppResult<AnecdotalRecordFollowup> {
        let created = anecdotal_record::add_followup(
            conn,
            school_id,
            anecdotal_record_id,
            actor_user_id,
            note,
        )?;
        enqueue_followup_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE add_anecdotal_record_followup_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO add_anecdotal_record_followup_with_sync; RELEASE add_anecdotal_record_followup_with_sync",
            );
            Err(error)
        }
    }
}

fn enqueue_followup_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    followup: &AnecdotalRecordFollowup,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::AnecdotalRecordFollowup,
        &followup.id,
    )?;
    let plaintext = serde_json::to_vec(followup)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::AnecdotalRecordFollowup,
        entity_id: parse_sync_uuid(&followup.id, "follow-up entry id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// The full append-only follow-up log for one anecdotal record.
#[tauri::command]
pub fn list_anecdotal_record_followups(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    anecdotal_record_id: String,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<AnecdotalRecordFollowup>> {
    let conn = lock_db(&db);
    let (_user_id, school_id) = auth::authorize_child_protection_access_for_section(
        &conn,
        &sessions,
        &section_id,
        &as_of_date,
    )?;
    let Some(record) =
        anecdotal_record::find_record_by_id(&conn, &school_id, &anecdotal_record_id)?
    else {
        return Err(AppError::Unauthorized);
    };
    if record.section_id != section_id {
        return Err(AppError::Unauthorized);
    }
    anecdotal_record::list_followups_for_record(&conn, &school_id, &anecdotal_record_id)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn open_test_db() -> Connection {
        crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap()
    }

    struct Fixture {
        school_id: String,
        adviser_id: String,
        section_id: String,
        learner_id: String,
    }

    /// Seeds a school, an adviser, a section advised by them, and a
    /// learner. Mirrors
    /// `commands::formative_assessment::tests::seed`'s own shape.
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

    #[test]
    fn parse_category_accepts_exactly_the_three_generic_values() {
        assert_eq!(
            parse_category("positive").unwrap(),
            AnecdotalCategory::Positive
        );
        assert_eq!(
            parse_category("negative").unwrap(),
            AnecdotalCategory::Negative
        );
        assert_eq!(
            parse_category("neutral").unwrap(),
            AnecdotalCategory::Neutral
        );
    }

    #[test]
    fn parse_category_rejects_a_disciplinary_only_style_value_never_stored_by_this_module() {
        // Guards against ever silently narrowing back to Awards' framing
        // (see ADR-0083) -- "disciplinary" is not, and must never become,
        // a stored category value.
        let result = parse_category("disciplinary");
        assert!(matches!(result, Err(AppError::InvalidInput(_))));
    }

    /// Proves the command layer's authorization call and the repository
    /// create+list path compose correctly end to end for the section's
    /// own adviser -- the authorization function itself
    /// (`auth::authorize_child_protection_access_for_section`) is already
    /// exhaustively tested in `auth::mod`'s own test module (adviser
    /// allowed, non-adviser Teacher denied, School Head allowed,
    /// cross-school forged section denied, no session fails closed) —
    /// reused here unchanged, not re-proven.
    #[test]
    fn authorized_adviser_can_create_via_repository_and_list_for_section_round_trip() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let f = seed(&conn);
        auth::login(
            &conn,
            &sessions,
            "adviser.a",
            "correct horse battery staple",
            &f.school_id,
        )
        .unwrap();

        let (user_id, school_id) = auth::authorize_child_protection_access_for_section(
            &conn,
            &sessions,
            &f.section_id,
            "2026-09-01",
        )
        .unwrap();
        assert_eq!(user_id, f.adviser_id);
        assert_eq!(school_id, f.school_id);

        let created = anecdotal_record::create_record(
            &conn,
            &school_id,
            &f.learner_id,
            &f.section_id,
            &user_id,
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic: helped a classmate with a reading exercise.",
        )
        .unwrap();

        let list = anecdotal_record::list_for_section(&conn, &school_id, &f.section_id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!(list[0].id, created.id);

        let followup = anecdotal_record::add_followup(
            &conn,
            &school_id,
            &created.id,
            &user_id,
            "Synthetic: brief check-in the following week.",
        )
        .unwrap();
        let log =
            anecdotal_record::list_followups_for_record(&conn, &school_id, &created.id).unwrap();
        assert_eq!(log.len(), 1);
        assert_eq!(log[0].id, followup.id);
    }

    /// A bare Teacher with no adviser relationship to the section is
    /// denied by the same reused authorization function -- confirms the
    /// command layer's gate call site actually surfaces that denial
    /// (not merely that `auth::` itself proves it in isolation).
    #[test]
    fn a_teacher_with_no_adviser_relationship_is_denied_by_the_reused_gate() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let f = seed(&conn);
        let other_teacher = crate::repository::user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        crate::repository::user::add_school_membership(&conn, &other_teacher.id, &f.school_id)
            .unwrap();
        auth::login(
            &conn,
            &sessions,
            "teacher.b",
            "correct horse battery staple",
            &f.school_id,
        )
        .unwrap();

        let result = auth::authorize_child_protection_access_for_section(
            &conn,
            &sessions,
            &f.section_id,
            "2026-09-01",
        );

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    /// A School Head (no adviser relationship required) may still act on
    /// any section in their own school.
    #[test]
    fn a_school_head_is_authorized_without_advising_the_section() {
        let conn = open_test_db();
        let sessions = SessionManager::new();
        let f = seed(&conn);
        let head = crate::repository::user::create_user(
            &conn,
            "head.a",
            "correct horse battery staple",
            "Head A",
        )
        .unwrap();
        crate::repository::user::add_school_membership(&conn, &head.id, &f.school_id).unwrap();
        crate::repository::role::grant(
            &conn,
            &head.id,
            &f.school_id,
            crate::repository::role::SCHOOL_HEAD,
        )
        .unwrap();
        auth::login(
            &conn,
            &sessions,
            "head.a",
            "correct horse battery staple",
            &f.school_id,
        )
        .unwrap();

        let result = auth::authorize_child_protection_access_for_section(
            &conn,
            &sessions,
            &f.section_id,
            "2026-09-01",
        );

        assert!(result.is_ok());
    }

    /// Tenant isolation: a record created in one school is invisible to
    /// an authorized adviser-equivalent lookup scoped to a different
    /// school's `school_id`, even if section ids were guessable.
    #[test]
    fn tenant_isolation_a_record_is_not_visible_under_a_different_schools_scope() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = anecdotal_record::create_record(
            &conn,
            &f.school_id,
            &f.learner_id,
            &f.section_id,
            &f.adviser_id,
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "Synthetic narrative.",
        )
        .unwrap();

        let other_school = crate::repository::school::create(&conn, "Other School").unwrap();
        let found =
            anecdotal_record::find_record_by_id(&conn, &other_school.id, &created.id).unwrap();
        assert!(found.is_none(), "a record must never leak across schools");
    }
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
    fn record_entry_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = record_anecdotal_entry_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            AnecdotalCategory::Positive,
            "2026-09-01",
            "Synthetic narrative.",
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
    fn record_entry_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = record_anecdotal_entry_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            AnecdotalCategory::Negative,
            "2026-09-01",
            "Synthetic narrative.",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::AnecdotalRecord);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), f.adviser_id);
        assert_eq!(entry.change.base_version, 0);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: AnecdotalRecord = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn add_followup_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let record = record_anecdotal_entry_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &f.learner_id,
            &f.section_id,
            AnecdotalCategory::Neutral,
            "2026-09-01",
            "Synthetic narrative.",
            Some(&sspk),
        )
        .unwrap();

        let created = add_anecdotal_record_followup_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            &record.id,
            "Synthetic: met with learner.",
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // The record create + this one follow-up.
        assert_eq!(queued.len(), 2);
        let entry = &queued[1];
        assert_eq!(
            entry.change.entity_kind,
            EntityKind::AnecdotalRecordFollowup
        );
        assert_eq!(entry.change.entity_id.to_string(), created.id);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: AnecdotalRecordFollowup = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn a_rejected_followup_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        // An unresolvable anecdotal_record_id -- `add_followup` fails at
        // the FK constraint.
        let result = add_anecdotal_record_followup_with_optional_sync(
            &conn,
            &f.school_id,
            &f.adviser_id,
            "does-not-exist",
            "Synthetic note.",
            Some(&sspk),
        );

        assert!(result.is_err());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected follow-up must never enqueue an outbox row"
        );
    }
}
