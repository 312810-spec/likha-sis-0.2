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
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
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
/// comment. `replace_teacher_assignment`/`remove_teaching_assignment` are
/// now wired too (see their own doc comments) -- `TeachingAssignment` is
/// the first entity in this codebase with a real cross-device `Delete`
/// propagated over sync, since a reassignment/removal genuinely deletes
/// the row rather than merely closing it.
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

/// Enqueues a `ChangeOperation::Delete` for an assignment this device
/// just removed locally -- the counterpart to
/// `enqueue_teaching_assignment_sync_change`'s `Upsert`. `base_version`
/// is read from `sync_version_cache`, not hardcoded to `0`: unlike a
/// brand-new create, a delete targets an id that (if this school is
/// enrolled) was very likely already pushed and accepted by the hub at
/// version 1, so a stale `0` would look like a conflict rather than a
/// legitimate next write. Encrypts the removed row's own last-known
/// content (not a placeholder) so a receiving device's
/// `apply_decrypted_change` can still validate `school_id` before acting
/// on it, exactly like every `Upsert` payload does -- `delete_from_sync`
/// itself only actually uses the row's `id`.
fn enqueue_teaching_assignment_delete(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    removed: &TeachingAssignment,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::TeachingAssignment,
        &removed.id,
    )?;
    let plaintext = serde_json::to_vec(removed)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::TeachingAssignment,
        entity_id: parse_sync_uuid(&removed.id, "teaching assignment id")?,
        base_version,
        operation: ChangeOperation::Delete,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

/// Removes any existing assignment for `(section_id, subject_id)` and
/// creates a new one for `new_teacher_user_id` -- an explicit
/// reassignment, never a silent overwrite (see
/// `teaching_assignment::replace_teacher`'s doc comment). ADR-0067/0069
/// sync wiring: the first command in this codebase to enqueue BOTH a
/// `Delete` (the old assignment, if one existed) and an `Upsert` (the
/// new one) for a single user action -- see
/// `enqueue_teaching_assignment_delete`'s own doc comment for why a real
/// delete is propagated here rather than reusing the create-only
/// precedent every other entity's first wiring slice established.
#[tauri::command]
pub fn replace_teacher_assignment(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    subject_id: String,
    new_teacher_user_id: String,
) -> AppResult<Option<TeachingAssignment>> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    replace_teacher_assignment_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &section_id,
        &subject_id,
        &new_teacher_user_id,
        sspk.as_ref(),
    )
}

/// Shared logic behind `replace_teacher_assignment`, pulled out (matching
/// `create_teaching_assignment_with_optional_sync`'s own shape) so it can
/// be unit-tested without a real `AppHandle`/`State`.
fn replace_teacher_assignment_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    section_id: &str,
    subject_id: &str,
    new_teacher_user_id: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<TeachingAssignment>> {
    let outcome = teaching_assignment::replace_teacher(
        conn,
        school_id,
        section_id,
        subject_id,
        new_teacher_user_id,
    )?;
    let Some(outcome) = outcome else {
        return Ok(None);
    };

    if let Some(sspk) = sspk {
        if let Some(previous) = &outcome.previous {
            enqueue_teaching_assignment_delete(conn, school_id, actor_user_id, previous, sspk)?;
        }
        enqueue_teaching_assignment_sync_change(
            conn,
            school_id,
            actor_user_id,
            &outcome.assignment,
            sspk,
        )?;
    }

    Ok(Some(outcome.assignment))
}

/// ADR-0067/0069 sync wiring: enqueues a `Delete` for the removed
/// assignment, propagating it to every other device the same way
/// `replace_teacher_assignment` does for a reassignment's old row -- see
/// `enqueue_teaching_assignment_delete`'s own doc comment.
#[tauri::command]
pub fn remove_teaching_assignment(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
) -> AppResult<bool> {
    let conn = lock_db(&db);
    let (school_id, actor_user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageTeachingAssignments,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    remove_teaching_assignment_with_optional_sync(
        &conn,
        &school_id,
        &actor_user_id,
        &id,
        sspk.as_ref(),
    )
}

/// Shared logic behind `remove_teaching_assignment`, pulled out so it can
/// be unit-tested without a real `AppHandle`/`State` -- same rationale as
/// `replace_teacher_assignment_with_optional_sync`.
fn remove_teaching_assignment_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    id: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<bool> {
    let removed = teaching_assignment::remove(conn, school_id, id)?;
    let Some(removed) = removed else {
        return Ok(false);
    };

    if let Some(sspk) = sspk {
        enqueue_teaching_assignment_delete(conn, school_id, actor_user_id, &removed, sspk)?;
    }

    Ok(true)
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

    #[test]
    fn replace_teacher_assignment_with_an_sspk_enqueues_both_a_delete_and_an_upsert() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();
        let sspk = test_sspk();
        let original = create_teaching_assignment_with_optional_sync(
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
        // The create's own enqueue is not what this test is checking --
        // drain it so only the replace's enqueues are asserted below.
        sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        for entry in sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap() {
            sync_outbox::acknowledge(&conn, &school_id, &entry.change.change_id.to_string())
                .unwrap();
        }
        let other_teacher =
            user_repo::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user_repo::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();

        let replaced = replace_teacher_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &section_id,
            &subject_id,
            &other_teacher.id,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 2, "must enqueue both a delete and an upsert");
        let delete_entry = queued
            .iter()
            .find(|entry| entry.change.operation == ChangeOperation::Delete)
            .expect("a delete change must be enqueued for the old assignment");
        assert_eq!(delete_entry.change.entity_id.to_string(), original.id);
        let upsert_entry = queued
            .iter()
            .find(|entry| entry.change.operation == ChangeOperation::Upsert)
            .expect("an upsert change must be enqueued for the new assignment");
        assert_eq!(upsert_entry.change.entity_id.to_string(), replaced.id);
        assert_ne!(
            delete_entry.change.entity_id, upsert_entry.change.entity_id,
            "the old and new assignment must be genuinely different rows"
        );
    }

    #[test]
    fn replace_teacher_assignment_with_no_prior_assignment_enqueues_only_an_upsert() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();
        let sspk = test_sspk();

        replace_teacher_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &section_id,
            &subject_id,
            &teacher_id,
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(
            queued.len(),
            1,
            "a first assignment is not a reassignment -- no delete to enqueue"
        );
        assert_eq!(queued[0].change.operation, ChangeOperation::Upsert);
    }

    #[test]
    fn replace_teacher_assignment_with_no_sspk_enqueues_nothing() {
        let (conn, school_id, actor_id, teacher_id, section_id, subject_id) = setup();

        replace_teacher_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &section_id,
            &subject_id,
            &teacher_id,
            None,
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn remove_teaching_assignment_with_an_sspk_enqueues_a_delete() {
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
        for entry in sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap() {
            sync_outbox::acknowledge(&conn, &school_id, &entry.change.change_id.to_string())
                .unwrap();
        }

        let removed = remove_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &created.id,
            Some(&sspk),
        )
        .unwrap();

        assert!(removed);
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        assert_eq!(queued[0].change.operation, ChangeOperation::Delete);
        assert_eq!(queued[0].change.entity_id.to_string(), created.id);
    }

    #[test]
    fn remove_teaching_assignment_for_an_unknown_id_enqueues_nothing() {
        let (conn, school_id, actor_id, ..) = setup();
        let sspk = test_sspk();

        let removed = remove_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &Uuid::now_v7().to_string(),
            Some(&sspk),
        )
        .unwrap();

        assert!(!removed);
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(queued.is_empty());
    }

    #[test]
    fn remove_teaching_assignment_with_no_sspk_enqueues_nothing() {
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
        .unwrap()
        .unwrap();

        let removed = remove_teaching_assignment_with_optional_sync(
            &conn,
            &school_id,
            &actor_id,
            &created.id,
            None,
        )
        .unwrap();

        assert!(removed);
        let queued = sync_outbox::pending_for_school(&conn, &school_id, 10).unwrap();
        assert!(queued.is_empty());
    }
}
