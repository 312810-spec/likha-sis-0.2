use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::attendance::{
    self, AttendanceRecord, AttendanceRosterEntry, AttendanceStatus, MonthlyAttendanceReport,
    SchoolDayTotals,
};
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `school_id` is derived from the session, never a parameter — see
/// `commands::learner::list_learners_by_school` for the same convention.
/// `section_id` identifies WHICH section's roster; it is a legitimately
/// client-supplied identifier the same way `learner_id` already is
/// elsewhere in this codebase — isolation is still enforced, because
/// `repository::attendance::roster_for_section_date` scopes its query by
/// `school_id` AND `section_id` together, so a `section_id` from another
/// school simply returns an empty roster rather than leaking rows.
#[tauri::command]
pub fn attendance_roster_for_date(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    attendance_date: String,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::roster_for_section_date(&conn, &school_id, &section_id, &attendance_date)
}

/// `learner_id`/`section_id` identify WHO and WHICH section; `school_id`
/// still comes only from the session. Returns `None`, not an error, when
/// `section_id` doesn't resolve within the caller's own school, when
/// `learner_id` doesn't either, or when the learner isn't an active member
/// of that section on that date — see `repository::attendance::record`'s
/// doc comment.
///
/// ADR-0067/0069 sync wiring (second domain write, after
/// `commands::learner::create_learner`): if this school has an active
/// device sync credential, the resulting record is also encrypted and
/// enqueued into `sync_outbox`, atomically with the write itself — exact
/// same enrollment-gated, opt-in pattern as `create_learner`. Attendance
/// was chosen over the other not-yet-wired entities because it is the
/// kind of record a teacher needs reflected promptly across a shared
/// school-laptop hub (another teacher or the registrar checking the same
/// section's roster later that day), unlike rarely-changing reference
/// data (subjects, grading periods).
#[tauri::command]
pub fn record_attendance(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    learner_id: String,
    attendance_date: String,
    status: AttendanceStatus,
) -> AppResult<Option<AttendanceRecord>> {
    let conn = lock_db(&db);
    let (actor_user_id, school_id) = sessions.require_active_session(&conn)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    record_attendance_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &section_id,
        &learner_id,
        &attendance_date,
        status,
        sspk.as_ref(),
    )
}

/// See `commands::learner::resolve_sspk_if_enrolled`'s doc comment — same
/// enrollment gate, same reasoning, duplicated rather than shared because
/// each command module owns its own thin `AppHandle`-touching wrapper (the
/// only part of this wiring that genuinely needs a real Tauri runtime to
/// exercise, per that function's own comment on why it stays untested
/// directly).
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

/// Shared logic exercised directly by this module's own tests (see
/// `commands::learner::create_learner_with_optional_sync`'s doc comment
/// for why the `AppHandle`-touching wrapper stays separate). `sspk` is
/// `None` when this school has never enrolled a device — behaves exactly
/// as this command did before ADR-0067 existed. When `Some`, the
/// attendance write and the outbox enqueue are atomic together in one
/// `SAVEPOINT`.
#[allow(clippy::too_many_arguments)]
fn record_attendance_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    section_id: &str,
    learner_id: &str,
    attendance_date: &str,
    status: AttendanceStatus,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<AttendanceRecord>> {
    let Some(sspk) = sspk else {
        return attendance::record(
            conn,
            school_id,
            section_id,
            learner_id,
            attendance_date,
            status,
        );
    };

    conn.execute_batch("SAVEPOINT record_attendance_with_sync")?;
    let outcome = (|| -> AppResult<Option<AttendanceRecord>> {
        let recorded = attendance::record(
            conn,
            school_id,
            section_id,
            learner_id,
            attendance_date,
            status,
        )?;
        if let Some(recorded) = &recorded {
            enqueue_attendance_sync_change(conn, school_id, actor_user_id, recorded, sspk)?;
        }
        Ok(recorded)
    })();

    match outcome {
        Ok(recorded) => {
            conn.execute_batch("RELEASE record_attendance_with_sync")?;
            Ok(recorded)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO record_attendance_with_sync; RELEASE record_attendance_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a recorded/updated attendance
/// row. Unlike `commands::learner::enqueue_learner_sync_change` (a
/// create-only write, always `base_version = 0`), attendance can be
/// re-recorded for the same learner/date — `base_version` here is this
/// device's own last-known version for this exact entity id, read from
/// `sync_version_cache`, so a real second edit is not misreported as a
/// stale conflict against itself. See `sync::PendingChange::base_version`'s
/// own contract and `sync_client::push_once`'s conflict classification.
fn enqueue_attendance_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    recorded: &AttendanceRecord,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version =
        sync_version_cache::known_version(conn, school_id, EntityKind::Attendance, &recorded.id)?;
    let plaintext = serde_json::to_vec(recorded)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::Attendance,
        entity_id: parse_sync_uuid(&recorded.id, "attendance record id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// See `commands::learner::parse_sync_uuid`'s doc comment — identical
/// reasoning, duplicated per module rather than shared across command
/// modules.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// Marks every currently-unmarked learner on `section_id`'s roster for
/// `attendance_date` as Present, leaving any already-marked learner
/// untouched — see `repository::attendance::bulk_mark_present`'s doc
/// comment for why this never overwrites an existing mark. `school_id` is
/// derived from the session; `section_id` is client-supplied the same way
/// as every other attendance command here.
#[tauri::command]
pub fn bulk_mark_attendance_present(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    attendance_date: String,
) -> AppResult<Vec<AttendanceRosterEntry>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::bulk_mark_present(&conn, &school_id, &section_id, &attendance_date)
}

/// `school_id` is derived from the session, never a parameter — same
/// convention as every other command here. `section_id` is client-supplied
/// for the same reason as `attendance_roster_for_date` above. `year`/`month`
/// sanity (a real month 1-12) is validated one layer up in
/// `AttendanceApplicationService`; an out-of-range `month` here degrades
/// to an empty report rather than an error (see
/// `repository::attendance::monthly_grid_for_section`'s doc comment).
#[tauri::command]
pub fn monthly_attendance_summary(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    year: i32,
    month: u32,
) -> AppResult<MonthlyAttendanceReport> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    attendance::monthly_grid_for_section(&conn, &school_id, &section_id, year, month)
}

/// School-wide attendance counts for one date. Aggregate counts only --
/// no learner identity in the response. Gated on `Capability::ManageLearners`
/// (registrar / school head) and scoped to the caller's own school, both
/// derived server-side; `date` (ISO YYYY-MM-DD) is the only client input.
#[tauri::command]
pub fn school_attendance_day_totals(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    date: String,
) -> AppResult<SchoolDayTotals> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_capability(&conn, &sessions, Capability::ManageLearners)?;
    attendance::school_day_totals(&conn, &school_id, &date)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{learner, school, section, section_membership, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        crate::db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    /// School + a section + an enrolled learner + an active user -- the
    /// minimum fixture `record_attendance_with_optional_sync` needs. Mirrors
    /// `repository::attendance::tests::setup_enrolled_learner`, plus a
    /// user to stand in as `actor_user_id`.
    fn setup() -> (Connection, String, String, String, String) {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let sec = section::create(&conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        let l = learner::create(&conn, &s.id, "Juan", "Dela Cruz", None, None).unwrap();
        section_membership::enroll(&conn, &s.id, &sec.id, &l.id, "2026-08-01").unwrap();
        let actor = user::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        (conn, s.id, sec.id, l.id, actor.id)
    }

    #[test]
    fn record_attendance_with_no_sspk_behaves_exactly_like_a_plain_record() {
        let (conn, school_id, section_id, learner_id, actor_user_id) = setup();

        let recorded = record_attendance_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Present,
            None,
        )
        .unwrap();

        assert!(recorded.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn record_attendance_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, section_id, learner_id, actor_user_id) = setup();
        let sspk = test_sspk();

        let recorded = record_attendance_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Present,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::Attendance);
        assert_eq!(entry.change.entity_id.to_string(), recorded.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_user_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: AttendanceRecord = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, recorded);
    }

    #[test]
    fn re_recording_the_same_entity_enqueues_with_the_known_base_version_not_zero() {
        let (conn, school_id, section_id, learner_id, actor_user_id) = setup();
        let sspk = test_sspk();

        record_attendance_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Absent,
            Some(&sspk),
        )
        .unwrap();
        let pending = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        let first_id = pending[0].change.entity_id;
        // Simulate this device's first change having already been pushed
        // and acknowledged -- advancing its known version, exactly as
        // `sync_client::push_once` does on acceptance.
        sync_outbox::acknowledge(&conn, &school_id, &pending[0].change.change_id.to_string())
            .unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &school_id,
            EntityKind::Attendance,
            &first_id.to_string(),
            1,
        )
        .unwrap();

        record_attendance_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Tardy,
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].change.base_version, 1);
    }

    #[test]
    fn record_attendance_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, section_id, learner_id, actor_user_id) = setup();
        let sspk = test_sspk();

        record_attendance_with_optional_sync(
            &conn,
            &school_id,
            &actor_user_id,
            &section_id,
            &learner_id,
            "2026-08-24",
            AttendanceStatus::Present,
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }
}
