use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::schedule_meeting::{self, CreateMeetingOutcome, ScheduleMeeting};
use crate::repository::teaching_assignment::{
    self, TeacherLoad, TeachingAssignment, TeachingAssignmentDetail,
};
use crate::repository::{device_credential, device_identity, sync_outbox};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// `section_id`/`subject_id`/`teacher_user_id` are client-supplied the
/// same legitimate way every other referenced id already is in this
/// codebase (`class_record::create`'s section/subject/grading-period
/// ids, `create_learner`'s school-derived scope) -- `teaching_assignment::create`
/// verifies each resolves within the caller's own school before writing.
/// `school_id` comes only from the session, gated by the School-Head-only
/// `ManageTeachingAssignments` capability.
///
/// ADR-0067/0069 sync wiring (seventh entity wired end to end, following
/// `Learner`/`Attendance`/`Section`/`LearnerScore`/`AssessmentItem`/
/// `Subject`): the exact same enrollment-gated encrypt-on-enqueue pattern
/// as `commands::subject::create_subject` -- see that command's own doc
/// comment. Only `create` is wired here, matching `Section`/`Subject`'s
/// own create-only precedent: `teaching_assignment::replace_teacher` and
/// `::remove` remain unwired (this task's own scope is "wire that ONE
/// entity", not every verb on it), tracked the same way `Subject`'s own
/// still-missing `update`/`rename` command is -- `upsert_from_sync`
/// already tolerates a future push of either verb without changes (see
/// its own doc comment). `GradingPeriod` and `SubjectAttendance` remain
/// the next unwired entities.
#[tauri::command]
pub fn create_teaching_assignment(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
    section_id: String,
    subject_id: String,
) -> AppResult<Option<TeachingAssignment>> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_teaching_assignment_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &teacher_user_id,
        &section_id,
        &subject_id,
        sspk.as_ref(),
    )
}

/// Resolves the SSPK only if this school has already completed the
/// enrollment ceremony -- identical contract and rationale as
/// `commands::subject::resolve_sspk_if_enrolled`.
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

/// Shared logic behind `create_teaching_assignment`, kept separate so it
/// can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle` -- same reason as
/// `commands::subject::create_subject_with_optional_sync`. `sspk` is
/// `None` when this school has never enrolled a device: behaves exactly
/// as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox row.
/// When `Some`, the assignment insert and the outbox enqueue are atomic
/// together in one `SAVEPOINT` -- a rejected create (invalid
/// section/subject/teacher reference, or the duplicate
/// `(section_id, subject_id)` `UNIQUE` constraint) never enqueues an
/// outbox row, since the enqueue only runs when `teaching_assignment::
/// create` actually returned a row.
#[allow(clippy::too_many_arguments)]
fn create_teaching_assignment_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    teacher_user_id: &str,
    section_id: &str,
    subject_id: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<TeachingAssignment>> {
    let Some(sspk) = sspk else {
        return teaching_assignment::create(
            conn,
            school_id,
            teacher_user_id,
            section_id,
            subject_id,
        );
    };

    conn.execute_batch("SAVEPOINT create_teaching_assignment_with_sync")?;
    let outcome = (|| -> AppResult<Option<TeachingAssignment>> {
        let created =
            teaching_assignment::create(conn, school_id, teacher_user_id, section_id, subject_id)?;
        if let Some(created) = &created {
            enqueue_teaching_assignment_sync_change(conn, school_id, actor_user_id, created, sspk)?;
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_teaching_assignment_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_teaching_assignment_with_sync; RELEASE create_teaching_assignment_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a freshly created teaching
/// assignment. `base_version` is unconditionally `0` -- same rationale
/// as `commands::subject::enqueue_subject_sync_change`'s identical
/// comment: this `entity_id` has never existed before this exact call
/// (only `create` is wired to the outbox).
fn enqueue_teaching_assignment_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    created: &TeachingAssignment,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let plaintext = serde_json::to_vec(created)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::TeachingAssignment,
        entity_id: parse_sync_uuid(&created.id, "teaching assignment id")?,
        base_version: 0,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Same rationale as `commands::subject::parse_sync_uuid`.
fn parse_sync_uuid(value: &str, field_name: &str) -> AppResult<Uuid> {
    Uuid::parse_str(value)
        .map_err(|e| AppError::key_store(format!("invalid {field_name} for sync: {e}")))
}

/// Removes any existing assignment for `(section_id, subject_id)` and
/// creates a new one for `new_teacher_user_id` -- an explicit
/// reassignment, never a silent overwrite (see
/// `teaching_assignment::replace_teacher`'s doc comment).
#[tauri::command]
pub fn replace_teacher_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    subject_id: String,
    new_teacher_user_id: String,
) -> AppResult<Option<TeachingAssignment>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::replace_teacher(
        &conn,
        &school_id,
        &section_id,
        &subject_id,
        &new_teacher_user_id,
    )
}

#[tauri::command]
pub fn remove_teaching_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    teaching_assignment::remove(&conn, &school_id, &id)
}

/// Reference data any authenticated school member may read -- matching
/// this codebase's established convention that section/subject/roster
/// information is generally viewable within one's own school without a
/// dedicated capability (e.g. `list_learners_by_school`).
#[tauri::command]
pub fn list_teaching_assignments_by_section(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    teaching_assignment::list_by_section_in_school(&conn, &school_id, &section_id)
}

/// A teacher may always list their own assignments; listing another
/// teacher's requires `auth::authorize_view_teacher_load`'s School-Head
/// check (same rule, reused here rather than a second gate function).
#[tauri::command]
pub fn list_teacher_assignments(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_view_teacher_load(&conn, &sessions, &teacher_user_id)?;
    teaching_assignment::list_by_teacher_in_school(&conn, &school_id, &teacher_user_id)
}

/// See `auth::authorize_view_teacher_load`'s doc comment: self, or a
/// School Head viewing a colleague within the same school.
#[tauri::command]
pub fn get_teacher_load(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teacher_user_id: String,
) -> AppResult<TeacherLoad> {
    let conn = lock_db(&db);
    let school_id = auth::authorize_view_teacher_load(&conn, &sessions, &teacher_user_id)?;
    teaching_assignment::teacher_load(&conn, &school_id, &teacher_user_id)
}

/// `weekday`/`starts_at`/`ends_at`/`room` are client-supplied;
/// `teaching_assignment::create`'s own conflict checks (teacher, section,
/// room) run before any write -- see `CreateMeetingOutcome`'s doc
/// comment for why this returns a specific reason rather than the
/// codebase's usual collapsed-`None` convention.
#[tauri::command]
pub fn create_schedule_meeting(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    weekday: i64,
    starts_at: String,
    ends_at: String,
    room: Option<String>,
) -> AppResult<CreateMeetingOutcome> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    schedule_meeting::create(
        &conn,
        &school_id,
        &teaching_assignment_id,
        weekday,
        &starts_at,
        &ends_at,
        room.as_deref(),
    )
}

/// Gated by `auth::authorize_view_teacher_load` on the assignment's own
/// teacher -- otherwise a Teacher session could reconstruct a colleague's
/// full weekly schedule (weekday/time/room) by chaining
/// `list_teaching_assignments_by_section` (reference data, intentionally
/// open) with this command, bypassing the narrower rule
/// `docs/adr/0039-teacher-load-class-schedule-foundation.md` states for
/// teacher-keyed views. An assignment id foreign to the caller's school
/// resolves to an empty list, matching this codebase's established
/// `find_by_id_in_school` convention (e.g. `commands::export`).
/// School-Head-only, mirroring `remove_teaching_assignment`'s exact
/// shape -- deleting a meeting is a scheduling-authority decision, the
/// same `ManageTeachingAssignments` gate `create_schedule_meeting`
/// already uses.
#[tauri::command]
pub fn remove_schedule_meeting(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageTeachingAssignments)?;
    schedule_meeting::remove(&conn, &school_id, &id)
}

#[tauri::command]
pub fn list_schedule_meetings_by_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<ScheduleMeeting>> {
    let conn = lock_db(&db);
    let school_id = sessions.require_active_school_scope(&conn)?;
    let Some(assignment) =
        teaching_assignment::find_by_id_in_school(&conn, &school_id, &teaching_assignment_id)?
    else {
        return Ok(Vec::new());
    };
    auth::authorize_view_teacher_load(&conn, &sessions, &assignment.teacher_user_id)?;
    schedule_meeting::list_by_assignment_in_school(&conn, &school_id, &teaching_assignment_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::repository::{school, section, subject, user as user_repo};

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

    /// A school, one member teacher, one section, one subject, and an
    /// actor user id -- mirrors `commands::subject::tests::setup`'s
    /// shape, extended with the section/subject/teacher a teaching
    /// assignment needs.
    fn setup() -> (Connection, String, String, String, String, String) {
        let conn = open_test_db();
        let school = school::create(&conn, "Rizal Elementary").unwrap();
        let actor = user_repo::create_user(&conn, "ana.cruz", "password", "Ana Cruz").unwrap();
        let teacher = user_repo::create_user(&conn, "teacher.a", "password", "Teacher A").unwrap();
        user_repo::add_school_membership(&conn, &teacher.id, &school.id).unwrap();
        let sec = section::create(&conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(&conn, &school.id, "Mathematics").unwrap();
        (conn, school.id, actor.id, teacher.id, sec.id, sub.id)
    }

    #[test]
    fn create_teaching_assignment_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();

        let created = create_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &teacher_id,
            &section_id,
            &subject_id,
            None,
        )
        .unwrap();

        assert!(created.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_teaching_assignment_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();
        let sspk = test_sspk();

        let created = create_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &teacher_id,
            &section_id,
            &subject_id,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::TeachingAssignment);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), actor_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: TeachingAssignment = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_teaching_assignment_stamps_the_change_with_this_installations_own_device_id() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();
        let sspk = test_sspk();

        create_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &teacher_id,
            &section_id,
            &subject_id,
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let (conn, school_id, actor_id, teacher_id, _section_id, subject_id) = setup();
        let sspk = test_sspk();
        // A section from a different school is an invalid reference --
        // `teaching_assignment::create` returns `Ok(None)`.
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2026-2027", "8", "Bonifacio").unwrap();

        let result = create_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &teacher_id,
            &other_section.id,
            &subject_id,
            Some(&sspk),
        )
        .unwrap();

        assert_eq!(result, None);
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected create must never enqueue an outbox row"
        );
    }
}
