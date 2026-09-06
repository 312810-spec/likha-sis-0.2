use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::subject_attendance::{
    self, AdviserAttendanceOverview, EntryStatus, RecordEntryOutcome, SubjectAttendanceMonitor,
    SubjectAttendanceRosterRow, SubjectAttendanceSession,
};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Every assignment-owned command in this file gates on
/// `subject_attendance::authorize_own_assignment` -- the caller must be
/// exactly the teacher on `teaching_assignment_id`, matching
/// `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s "only for subject-section
/// assignments they are authorized to teach" rule. This is deliberately
/// NOT `Capability::ManageLearners`/`ManageTeachingAssignments` -- those
/// gate a role across the whole school; this gates one specific
/// assignment, the same shape `auth::authorize_view_teacher_load`
/// already uses for "self." Adviser/School-Head access is a separate
/// read-only command at the bottom of this file, gated by
/// `authorize_adviser_of_section`; it never shares or weakens this
/// assignment-owner write boundary.
///
/// ADR-0067/0069 sync wiring (ninth entity wired end to end, following
/// `Learner`/`Attendance`/`Section`/`LearnerScore`/`AssessmentItem`/
/// `Subject`/`TeachingAssignment`/`GradingPeriod`): the exact same
/// enrollment-gated encrypt-on-enqueue pattern as
/// `commands::grading::create_grading_period`. Only the SESSION-opening
/// writes here (`open_subject_attendance_session`/
/// `mark_subject_attendance_no_class`) are wired to `EntityKind::
/// SubjectAttendance` -- create-only, matching
/// `Section`/`Subject`/`TeachingAssignment`/`GradingPeriod`'s own
/// precedent, since both `open_or_get_session` and `mark_no_class` only
/// ever `INSERT ... ON CONFLICT DO NOTHING` (a session's `status` never
/// changes once created). The per-learner marks
/// (`record_subject_attendance_entry`/`mark_subject_attendance_all_present`)
/// are deliberately NOT wired here: `subject_attendance_entries.session_id`
/// is a `NOT NULL REFERENCES subject_attendance_sessions(id)` foreign key,
/// and every `entity_kind` `CHECK` constraint in this schema
/// (`sync_outbox`/`sync_conflict_review`/`sync_version_cache`/the pull
/// cursor's own table) has exactly one reserved slot for this feature --
/// `'subject_attendance'` -- spent here on the session, its own real sync
/// prerequisite, exactly mirroring why `Section` was wired before
/// `Attendance` (see `sync_client`'s own module doc comment: "chosen
/// specifically because `attendance_records.section_id` is the real FK
/// that an unwired `Section` left unresolvable on pull"). Wiring entries
/// without first wiring sessions would produce the identical unresolvable-FK
/// failure on a receiving device. A future slice that widens the `CHECK`
/// constraint (a real schema migration, out of scope here) can add a
/// second entity kind for entries.
#[tauri::command]
pub fn open_subject_attendance_session(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_date: String,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;
    open_session_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &teaching_assignment_id,
        &session_date,
        sspk.as_ref(),
    )
}

#[tauri::command]
pub fn mark_subject_attendance_no_class(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_date: String,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;
    mark_no_class_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &teaching_assignment_id,
        &session_date,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::grading::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `open_subject_attendance_session`, kept separate so
/// it can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as
/// `commands::grading::create_grading_period_with_optional_sync`. `sspk`
/// is `None` when this school has never enrolled a device: behaves
/// exactly as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox
/// row. When `Some`, the session open and the outbox enqueue are atomic
/// together in one `SAVEPOINT` -- a forged/unresolvable
/// `teaching_assignment_id` (`open_or_get_session` returns `Ok(None)`)
/// never enqueues an outbox row.
fn open_session_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    teaching_assignment_id: &str,
    session_date: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let Some(sspk) = sspk else {
        return subject_attendance::open_or_get_session(
            conn,
            school_id,
            teaching_assignment_id,
            session_date,
            actor_user_id,
        );
    };

    conn.execute_batch("SAVEPOINT open_subject_attendance_session_with_sync")?;
    let outcome = (|| -> AppResult<Option<SubjectAttendanceSession>> {
        let opened = subject_attendance::open_or_get_session(
            conn,
            school_id,
            teaching_assignment_id,
            session_date,
            actor_user_id,
        )?;
        if let Some(opened) = &opened {
            enqueue_session_sync_change_if_new(conn, school_id, actor_user_id, opened, sspk)?;
        }
        Ok(opened)
    })();

    match outcome {
        Ok(opened) => {
            conn.execute_batch("RELEASE open_subject_attendance_session_with_sync")?;
            Ok(opened)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO open_subject_attendance_session_with_sync; \
                 RELEASE open_subject_attendance_session_with_sync",
            );
            Err(error)
        }
    }
}

/// Same shape as `open_session_with_optional_sync`, for `mark_no_class`.
/// Kept as a separate function (rather than a shared helper taking a
/// function pointer) because the two repository calls
/// (`open_or_get_session`/`mark_no_class`) take the same arguments but are
/// genuinely different writes -- matching this codebase's existing
/// preference for one small, readable function per command over a
/// generic wrapper.
fn mark_no_class_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    teaching_assignment_id: &str,
    session_date: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<SubjectAttendanceSession>> {
    let Some(sspk) = sspk else {
        return subject_attendance::mark_no_class(
            conn,
            school_id,
            teaching_assignment_id,
            session_date,
            actor_user_id,
        );
    };

    conn.execute_batch("SAVEPOINT mark_subject_attendance_no_class_with_sync")?;
    let outcome = (|| -> AppResult<Option<SubjectAttendanceSession>> {
        let marked = subject_attendance::mark_no_class(
            conn,
            school_id,
            teaching_assignment_id,
            session_date,
            actor_user_id,
        )?;
        if let Some(marked) = &marked {
            enqueue_session_sync_change_if_new(conn, school_id, actor_user_id, marked, sspk)?;
        }
        Ok(marked)
    })();

    match outcome {
        Ok(marked) => {
            conn.execute_batch("RELEASE mark_subject_attendance_no_class_with_sync")?;
            Ok(marked)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO mark_subject_attendance_no_class_with_sync; \
                 RELEASE mark_subject_attendance_no_class_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a session row returned by
/// `open_or_get_session`/`mark_no_class` -- both are idempotent
/// create-or-return calls (see their own doc comments), so `session`
/// here may be a session this exact call just created, OR the same
/// already-existing session a previous call already enqueued (the
/// "idempotent retry" case). Enqueuing again in that second case is
/// harmless -- `sync_outbox`/`sync_hub` already tolerate a redundant
/// `base_version = 0` create-shaped change the same way
/// `commands::grading::enqueue_grading_period_sync_change` does not need
/// to guard against a second `create_grading_period` call, because there
/// is none for that entity -- but two calls IS a real, expected shape for
/// sessions (`open_or_get_session` is explicitly designed to be called
/// repeatedly). `base_version` is unconditionally `0` -- matching
/// `enqueue_grading_period_sync_change`'s own reasoning: only creation is
/// wired to the outbox for this entity, so this is always this device's
/// first (and only) change for this exact `entity_id`.
fn enqueue_session_sync_change_if_new(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    session: &SubjectAttendanceSession,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let plaintext = serde_json::to_vec(session)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::SubjectAttendance,
        entity_id: parse_sync_uuid(&session.id, "subject attendance session id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::grading::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// `teaching_assignment_id` is required alongside `session_id` purely for
/// authorization -- `session_id` alone cannot be checked against "does
/// the caller own this" without first resolving which assignment it
/// belongs to, and resolving it from an unauthenticated read would leak
/// whether a given `session_id` exists at all. Re-checking after
/// resolving the session (below) confirms the two actually correspond,
/// so a caller cannot pass a real assignment they own alongside a
/// `session_id` belonging to a different one.
#[tauri::command]
pub fn record_subject_attendance_entry(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
    membership_id: String,
    status: EntryStatus,
    note: Option<String>,
) -> AppResult<RecordEntryOutcome> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Err(crate::error::AppError::Unauthorized);
        }
    }
    subject_attendance::record_entry(
        &conn,
        &school_id,
        &session_id,
        &membership_id,
        status,
        note.as_deref(),
        &user_id,
    )
}

#[tauri::command]
pub fn mark_subject_attendance_all_present(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Err(crate::error::AppError::Unauthorized);
        }
    }
    subject_attendance::mark_all_present(&conn, &school_id, &session_id, &user_id)
}

#[tauri::command]
pub fn subject_attendance_roster_for_session(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    session_id: String,
) -> AppResult<Option<Vec<SubjectAttendanceRosterRow>>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    if let Some(session) =
        subject_attendance::find_session_by_id_in_school(&conn, &school_id, &session_id)?
    {
        if session.teaching_assignment_id != teaching_assignment_id {
            return Ok(None);
        }
    }
    subject_attendance::roster_for_session(&conn, &school_id, &session_id)
}

#[tauri::command]
pub fn list_subject_attendance_sessions(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<SubjectAttendanceSession>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::list_sessions_for_assignment(&conn, &school_id, &teaching_assignment_id)
}

/// Subject Monitor -- `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s
/// per-learner attendance report for one teaching assignment. Reuses
/// `authorize_own_assignment` unchanged: this is a reporting view over
/// data the caller already owns, not a new authorization shape. Adviser
/// View uses a separate section-wide read model and gate below; this
/// command remains strictly the subject teacher's own monitor.
#[tauri::command]
pub fn subject_attendance_monitor(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    as_of_date: String,
) -> AppResult<Option<SubjectAttendanceMonitor>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    subject_attendance::authorize_own_assignment(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
    )?;
    subject_attendance::monitor_for_assignment(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &as_of_date,
    )
}

/// Adviser View -- read-only Subject Attendance signals across one
/// advisory section. The Wave 3E gate is the trusted boundary: active
/// section advisers and School Heads pass; another teacher and every
/// cross-school id fail closed. No write function is reachable here.
#[tauri::command]
pub fn adviser_subject_attendance_overview(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Option<AdviserAttendanceOverview>> {
    let conn = lock_db(&db);
    let (_, school_id) =
        crate::auth::authorize_adviser_of_section(&conn, &sessions, &section_id, &as_of_date)?;
    subject_attendance::adviser_overview_for_section(&conn, &school_id, &section_id, &as_of_date)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{
        learner, school, section, section_membership, subject, teaching_assignment, user,
    };

    fn open_test_db() -> Connection {
        crate::db::open(
            std::path::Path::new(":memory:"),
            &crate::crypto::generate_key(),
        )
        .unwrap()
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    /// School + section + subject + teaching assignment + an enrolled
    /// learner -- the minimum fixture the session-opening writes need.
    /// Mirrors `repository::subject_attendance::tests::seed`'s shape.
    fn setup() -> (Connection, String, String, String) {
        let conn = open_test_db();
        let s = school::create(&conn, "Rizal Elementary").unwrap();
        let t = user::create_user(
            &conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        user::add_school_membership(&conn, &t.id, &s.id).unwrap();
        let sec = section::create(&conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(&conn, &s.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(&conn, &s.id, &t.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        let l = learner::create(&conn, &s.id, "Ana", "Cruz", None, None).unwrap();
        section_membership::enroll(&conn, &s.id, &sec.id, &l.id, "2026-06-01").unwrap();
        (conn, s.id, t.id, assignment.id)
    }

    #[test]
    fn open_session_with_no_sspk_behaves_exactly_like_a_plain_open() {
        let (conn, school_id, teacher_id, assignment_id) = setup();

        let opened = open_session_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &assignment_id,
            "2026-08-29",
            None,
        )
        .unwrap();

        assert!(opened.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn open_session_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, teacher_id, assignment_id) = setup();
        let sspk = test_sspk();

        let opened = open_session_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &assignment_id,
            "2026-08-29",
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::SubjectAttendance);
        assert_eq!(entry.change.entity_id.to_string(), opened.id);
        assert_eq!(entry.change.actor_user_id.to_string(), teacher_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: SubjectAttendanceSession = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, opened);
    }

    #[test]
    fn open_session_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, teacher_id, assignment_id) = setup();
        let sspk = test_sspk();

        open_session_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &assignment_id,
            "2026-08-29",
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_forged_teaching_assignment_id_never_enqueues_an_outbox_row() {
        let (conn, school_id, teacher_id, _assignment_id) = setup();
        let sspk = test_sspk();

        let result = open_session_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            "does-not-exist",
            "2026-08-29",
            Some(&sspk),
        )
        .unwrap();

        assert!(result.is_none());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected open must never enqueue an outbox row"
        );
    }

    #[test]
    fn mark_no_class_with_no_sspk_behaves_exactly_like_a_plain_mark() {
        let (conn, school_id, teacher_id, assignment_id) = setup();

        let marked = mark_no_class_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &assignment_id,
            "2026-08-29",
            None,
        )
        .unwrap();

        assert!(marked.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn mark_no_class_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, teacher_id, assignment_id) = setup();
        let sspk = test_sspk();

        let marked = mark_no_class_with_optional_sync(
            &conn,
            &school_id,
            &teacher_id,
            &assignment_id,
            "2026-08-29",
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::SubjectAttendance);
        assert_eq!(entry.change.entity_id.to_string(), marked.id);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: SubjectAttendanceSession = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, marked);
    }
}
