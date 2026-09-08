use std::sync::Mutex;

use rusqlite::Connection;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::lesson_plan::{self, LessonPlan, LessonPlanFields};
use crate::repository::{device_credential, device_identity, sync_outbox, sync_version_cache};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// Every command in this file gates on `lesson_plan::authorize_own_assignment`
/// (create/update) or `lesson_plan::authorize_view` (read) -- the caller
/// must be exactly the teacher on `teaching_assignment_id`, or (read-only)
/// a School Head in the same school.
///
/// ADR-0067/0069 sync wiring (Batch 6): the exact same enrollment-gated
/// encrypt-on-enqueue pattern as `commands::grading::create_grading_period`
/// -- see that command's own doc comment. Both `create` and `update` are
/// wired (unlike `GradingPeriod`'s create-only precedent) because this
/// entity really does have both verbs; `update`'s `base_version` is read
/// from `sync_version_cache::known_version` (never unconditionally 0),
/// matching `commands::attendance`'s own re-recordable-entity pattern,
/// since a plan can be revised more than once.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_lesson_plan(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    plan_date: String,
    learning_competency: String,
    learning_competency_code: String,
    learning_objectives: String,
    connection_to_previous_learning: String,
    learning_experiences: String,
    assessment: String,
    ways_forward: String,
) -> AppResult<Option<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_own_assignment(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    create_lesson_plan_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &teaching_assignment_id,
        &plan_date,
        &LessonPlanFields {
            learning_competency: &learning_competency,
            learning_competency_code: &learning_competency_code,
            learning_objectives: &learning_objectives,
            connection_to_previous_learning: &connection_to_previous_learning,
            learning_experiences: &learning_experiences,
            assessment: &assessment,
            ways_forward: &ways_forward,
        },
        sspk.as_ref(),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_lesson_plan(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    id: String,
    teaching_assignment_id: String,
    learning_competency: String,
    learning_competency_code: String,
    learning_objectives: String,
    connection_to_previous_learning: String,
    learning_experiences: String,
    assessment: String,
    ways_forward: String,
) -> AppResult<Option<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_own_assignment(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    update_lesson_plan_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &id,
        &LessonPlanFields {
            learning_competency: &learning_competency,
            learning_competency_code: &learning_competency_code,
            learning_objectives: &learning_objectives,
            connection_to_previous_learning: &connection_to_previous_learning,
            learning_experiences: &learning_experiences,
            assessment: &assessment,
            ways_forward: &ways_forward,
        },
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

/// Shared logic behind `create_lesson_plan`, kept separate so it can be
/// exercised directly in this module's own tests without a real Tauri
/// `AppHandle` -- same reason as
/// `commands::grading::create_grading_period_with_optional_sync`. `sspk`
/// is `None` when this school has never enrolled a device: behaves
/// exactly as it did before ADR-0067 existed, no `SAVEPOINT`, no outbox
/// row. When `Some`, the plan insert and the outbox enqueue are atomic
/// together in one `SAVEPOINT` -- a rejected create (unresolvable
/// assignment, or a duplicate `(teaching_assignment_id, plan_date)`)
/// never enqueues an outbox row, since the enqueue only runs when
/// `lesson_plan::create` actually returned a row.
#[allow(clippy::too_many_arguments)]
fn create_lesson_plan_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
    fields: &LessonPlanFields<'_>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<LessonPlan>> {
    let Some(sspk) = sspk else {
        return lesson_plan::create(
            conn,
            school_id,
            teaching_assignment_id,
            plan_date,
            actor_user_id,
            fields,
        );
    };

    conn.execute_batch("SAVEPOINT create_lesson_plan_with_sync")?;
    let outcome = (|| -> AppResult<Option<LessonPlan>> {
        let created = lesson_plan::create(
            conn,
            school_id,
            teaching_assignment_id,
            plan_date,
            actor_user_id,
            fields,
        )?;
        if let Some(created) = &created {
            enqueue_lesson_plan_sync_change(conn, school_id, actor_user_id, created, sspk)?;
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE create_lesson_plan_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO create_lesson_plan_with_sync; RELEASE create_lesson_plan_with_sync",
            );
            Err(error)
        }
    }
}

/// Shared logic behind `update_lesson_plan`. Unlike the create path,
/// `base_version` is read from `sync_version_cache::known_version` (not
/// unconditionally `0`) -- a plan can be revised more than once, so a
/// second or later edit must carry the version this device last saw
/// acknowledged, exactly as `commands::attendance`'s own re-recordable
/// pattern does.
#[allow(clippy::too_many_arguments)]
fn update_lesson_plan_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    id: &str,
    fields: &LessonPlanFields<'_>,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<Option<LessonPlan>> {
    let Some(sspk) = sspk else {
        return lesson_plan::update(conn, school_id, id, fields);
    };

    conn.execute_batch("SAVEPOINT update_lesson_plan_with_sync")?;
    let outcome = (|| -> AppResult<Option<LessonPlan>> {
        let updated = lesson_plan::update(conn, school_id, id, fields)?;
        if let Some(updated) = &updated {
            enqueue_lesson_plan_sync_change(conn, school_id, actor_user_id, updated, sspk)?;
        }
        Ok(updated)
    })();

    match outcome {
        Ok(updated) => {
            conn.execute_batch("RELEASE update_lesson_plan_with_sync")?;
            Ok(updated)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO update_lesson_plan_with_sync; RELEASE update_lesson_plan_with_sync",
            );
            Err(error)
        }
    }
}

/// Builds and enqueues a `PendingChange` for a created or updated lesson
/// plan. `base_version` always comes from `sync_version_cache::known_version`
/// (`0` for a plan this device has never pushed before, matching
/// `commands::section::enqueue_section_membership_sync_change`'s own
/// shape) rather than being unconditionally `0` -- correct for both the
/// create and the update call sites above.
fn enqueue_lesson_plan_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    plan: &LessonPlan,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version =
        sync_version_cache::known_version(conn, school_id, EntityKind::LessonPlan, &plan.id)?;
    let plaintext = serde_json::to_vec(plan)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::LessonPlan,
        entity_id: parse_sync_uuid(&plan.id, "lesson plan id")?,
        base_version,
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

/// `teaching_assignment_id` is client-supplied the same legitimate way
/// `class_record_id` already is in `list_assessment_items_by_class_record`
/// -- `authorize_view` resolves it school-scoped before any row is
/// returned, so a foreign or unresolvable id is rejected with
/// `Unauthorized` rather than silently returning an empty list (unlike
/// that command, this one has a real owner to check, not merely a
/// scoping filter).
#[tauri::command]
pub fn list_lesson_plans_by_assignment(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
) -> AppResult<Vec<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_view(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    lesson_plan::list_by_assignment(&conn, &school_id, &teaching_assignment_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{role, school, section, subject, teaching_assignment, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        teacher_id: String,
        assignment_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(
            conn,
            "teacher.a",
            "correct horse battery staple",
            "Teacher A",
        )
        .unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        let assignment = teaching_assignment::create(conn, &s.id, &teacher.id, &sec.id, &sub.id)
            .unwrap()
            .unwrap();
        Fixture {
            school_id: s.id,
            teacher_id: teacher.id,
            assignment_id: assignment.id,
        }
    }

    #[test]
    fn authorize_own_assignment_denies_a_teacher_who_does_not_own_the_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_teacher = user::create_user(
            &conn,
            "teacher.b",
            "correct horse battery staple",
            "Teacher B",
        )
        .unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();

        let result = crate::repository::lesson_plan::authorize_own_assignment(
            &conn,
            &other_teacher.id,
            &f.school_id,
            &f.assignment_id,
        );

        assert!(matches!(result, Err(crate::error::AppError::Unauthorized)));
    }

    #[test]
    fn full_create_update_list_round_trip_via_repository_gate() {
        // Exercises the exact same authorize-then-repository sequence the
        // command handlers use, without needing a real Tauri AppHandle/
        // SessionManager -- matching this codebase's own convention of
        // testing command *logic* at the repository-plus-authorize level
        // (see e.g. `subject_attendance`'s own command tests).
        let conn = open_test_db();
        let f = seed(&conn);

        lesson_plan::authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, &f.assignment_id)
            .unwrap();
        let created = lesson_plan::create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &LessonPlanFields {
                learning_competency: "Add and subtract fractions",
                learning_competency_code: "M7NS-Ig-1",
                learning_objectives: "Objective 1\nObjective 2",
                connection_to_previous_learning: "Prior lesson on like denominators",
                learning_experiences: "Group activity with fraction strips",
                assessment: "3-item exit ticket",
                ways_forward: "Reteach if accuracy is low",
            },
        )
        .unwrap()
        .unwrap();

        let listed =
            lesson_plan::list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();
        assert_eq!(listed.len(), 1);
        assert_eq!(listed[0].id, created.id);

        let updated = lesson_plan::update(
            &conn,
            &f.school_id,
            &created.id,
            &LessonPlanFields {
                learning_competency: "Revised",
                learning_competency_code: "M7NS-Ig-2",
                learning_objectives: "Revised objectives",
                connection_to_previous_learning: "Revised connection",
                learning_experiences: "Revised experiences",
                assessment: "Revised assessment",
                ways_forward: "Revised ways forward",
            },
        )
        .unwrap()
        .unwrap();
        assert_eq!(updated.learning_competency, "Revised");
    }

    #[test]
    fn authorize_view_allows_school_head_read_access() {
        let conn = open_test_db();
        let f = seed(&conn);
        let head =
            user::create_user(&conn, "head.a", "correct horse battery staple", "Head A").unwrap();
        user::add_school_membership(&conn, &head.id, &f.school_id).unwrap();
        role::grant(&conn, &head.id, &f.school_id, role::SCHOOL_HEAD).unwrap();

        let result = lesson_plan::authorize_view(&conn, &head.id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x7a; PAYLOAD_KEY_LEN]
    }

    fn fields() -> LessonPlanFields<'static> {
        LessonPlanFields {
            learning_competency: "Add and subtract fractions",
            learning_competency_code: "M7NS-Ig-1",
            learning_objectives: "Objective 1",
            connection_to_previous_learning: "Prior lesson",
            learning_experiences: "Group activity",
            assessment: "Exit ticket",
            ways_forward: "Reteach if low",
        }
    }

    #[test]
    fn create_lesson_plan_with_no_sspk_behaves_exactly_like_a_plain_create() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            None,
        )
        .unwrap();

        assert!(created.is_some());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a non-enrolled installation must never write an outbox row"
        );
    }

    #[test]
    fn create_lesson_plan_with_an_sspk_enqueues_a_correctly_encrypted_outbox_entry() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued.len(), 1);
        let entry = &queued[0];
        assert_eq!(entry.change.entity_kind, EntityKind::LessonPlan);
        assert_eq!(entry.change.entity_id.to_string(), created.id);
        assert_eq!(entry.change.actor_user_id.to_string(), f.teacher_id);
        assert_eq!(entry.change.base_version, 0);
        assert_eq!(entry.change.operation, ChangeOperation::Upsert);

        let decrypted =
            payload_key::decrypt_payload(&sspk, &entry.change.encrypted_payload).unwrap();
        let round_tripped: LessonPlan = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn create_lesson_plan_stamps_the_change_with_this_installations_own_device_id() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap();

        let expected_device_id = device_identity::current_or_create(&conn).unwrap();
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued[0].change.device_id.to_string(), expected_device_id);
    }

    #[test]
    fn a_rejected_create_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        // An unresolvable teaching_assignment_id -- `lesson_plan::create`
        // returns `Ok(None)`.
        let result = create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            "does-not-exist",
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap();

        assert_eq!(result, None);
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected create must never enqueue an outbox row"
        );
    }

    #[test]
    fn update_lesson_plan_with_an_sspk_enqueues_with_the_known_base_version_not_zero() {
        // Mirrors `commands::attendance`'s own
        // `re_recording_the_same_entity_enqueues_with_the_known_base_version_not_zero`
        // precedent: `base_version` only advances once a push round is
        // actually acknowledged, so this test records that acknowledgment
        // explicitly rather than assuming enqueueing alone advances it.
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap()
        .unwrap();
        sync_version_cache::record_known_version(
            &conn,
            &f.school_id,
            EntityKind::LessonPlan,
            &created.id,
            1,
        )
        .unwrap();

        let updated_fields = LessonPlanFields {
            ways_forward: "Revised ways forward",
            ..fields()
        };
        update_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &created.id,
            &updated_fields,
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(
            queued.len(),
            2,
            "create and update each enqueue their own change"
        );
        assert_eq!(queued[1].change.base_version, 1);
    }

    /// The natural-key-collision scenario: `create_lesson_plan_with_optional_sync`
    /// itself never collides (it always mints a fresh `id`), but proves
    /// the command layer surfaces `lesson_plan::create`'s own rejection
    /// (an existing `(teaching_assignment_id, plan_date)` pair) as
    /// `Ok(None)` with no outbox row -- the same "never enqueue for a
    /// write that didn't happen" guarantee the collision-and-recovery
    /// mechanism in `sync_client` depends on for a PULLED collision (see
    /// `repository::lesson_plan::upsert_from_sync_returns_an_error_on_a_natural_key_collision_distinct_from_id`
    /// for the pulled-side proof).
    #[test]
    fn create_lesson_plan_rejects_a_duplicate_assignment_and_date_without_enqueuing() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap()
        .unwrap();

        let second = create_lesson_plan_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.assignment_id,
            "2026-09-07",
            &fields(),
            Some(&sspk),
        )
        .unwrap();

        assert_eq!(second, None);
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(
            queued.len(),
            1,
            "the duplicate-date rejection must never enqueue a second outbox row"
        );
    }
}
