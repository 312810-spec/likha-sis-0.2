//! Tauri commands for the Multi-Tier Review & Audit Pipeline.
//! `submit_grades_for_review` gates on
//! `auth::authorize_grade_submission_owner` (self-or-School-Head).
//! ADR-0089's permanent two-tier design (Batch 17, checkpoint 3) splits
//! the decision itself into two commands:
//!
//! * `decide_grade_submission_master_teacher` gates on
//!   `auth::authorize_grade_submission_master_teacher_decision` (only the
//!   submitter's CURRENTLY-assigned Master Teacher overseer, never the
//!   submitter themselves).
//! * `decide_grade_submission` is School Head's step -- either the
//!   distinct final lock after Master Teacher approval, or, when the
//!   submitter currently has no Master Teacher assigned, the intentional
//!   fallback direct decision identical to ADR-0073's original
//!   behavior. This command itself checks whether a Master Teacher is
//!   currently assigned and structurally refuses to let School Head skip
//!   a pending Master-Teacher-tier decision -- this is not left to the
//!   UI to hide a button.
//!
//! `list_grade_submissions_for_school`/`get_principal_overview_dashboard`
//! also gate on `Capability::ManageGradeSubmissionReview` (School Head).

use std::sync::Mutex;

use rusqlite::Connection;
use serde::Serialize;
use tauri::{AppHandle, State};
use uuid::Uuid;

use crate::auth::{self, Capability, SessionManager};
use crate::commands::lock_db;
use crate::crypto::payload_key::{self, PAYLOAD_KEY_LEN};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::repository::grade_submission::{self, GradeSubmission, SubmissionNote};
use crate::repository::{
    device_credential, device_identity, section_membership, sync_outbox, sync_version_cache,
    teacher_oversight_assignment,
};
use crate::sync::{ChangeOperation, EntityKind, PendingChange};

/// ADR-0067/0069 sync wiring (Batch 6, continuing the LessonPlan slice):
/// the exact same enrollment-gated encrypt-on-enqueue pattern as
/// `commands::lesson_plan::create_lesson_plan`. `submit` creates a
/// `GradeSubmission` (create-only, matching `Section`/`AssessmentItem`)
/// plus zero or more `automated_check` notes written internally by
/// `grade_submission::submit` -- every note actually attached to the new
/// submission (there is nothing else there yet, since it was just
/// created) is enqueued as its own `EntityKind::GradeSubmissionNote`
/// change in the same atomic `SAVEPOINT`.
#[tauri::command]
pub fn submit_grades_for_review(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    class_record_id: String,
) -> AppResult<GradeSubmission> {
    let conn = lock_db(&db);
    let (user_id, school_id) =
        auth::authorize_grade_submission_owner(&conn, &sessions, &class_record_id)?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    submit_grades_for_review_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &class_record_id,
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

/// Shared logic behind `submit_grades_for_review`, kept separate so it
/// can be exercised directly in this module's own tests without a real
/// Tauri `AppHandle`.
fn submit_grades_for_review_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    class_record_id: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
) -> AppResult<GradeSubmission> {
    let Some(sspk) = sspk else {
        return grade_submission::submit(conn, school_id, class_record_id, actor_user_id);
    };

    conn.execute_batch("SAVEPOINT submit_grades_for_review_with_sync")?;
    let outcome = (|| -> AppResult<GradeSubmission> {
        let created = grade_submission::submit(conn, school_id, class_record_id, actor_user_id)?;
        enqueue_submission_sync_change(conn, school_id, actor_user_id, &created, sspk)?;
        for note in grade_submission::list_notes(conn, school_id, &created.id)? {
            enqueue_note_sync_change(conn, school_id, actor_user_id, &note, sspk)?;
        }
        Ok(created)
    })();

    match outcome {
        Ok(created) => {
            conn.execute_batch("RELEASE submit_grades_for_review_with_sync")?;
            Ok(created)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO submit_grades_for_review_with_sync; RELEASE submit_grades_for_review_with_sync",
            );
            Err(error)
        }
    }
}

/// ADR-0089 tier 1: only the submitter's currently-assigned Master
/// Teacher overseer may call this (see
/// `auth::authorize_grade_submission_master_teacher_decision`, which also
/// structurally blocks self-approval). `as_of_date` resolves "currently
/// assigned" the same way every other date-scoped read in this codebase
/// takes an explicit, client-supplied date (e.g.
/// `get_principal_overview_dashboard`) rather than trusting a server
/// clock read baked into the authorization boundary itself.
#[tauri::command]
pub fn decide_grade_submission_master_teacher(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    submission_id: String,
    approve: bool,
    feedback_note: Option<String>,
    as_of_date: String,
) -> AppResult<GradeSubmission> {
    let conn = lock_db(&db);
    let (user_id, school_id) = auth::authorize_grade_submission_master_teacher_decision(
        &conn,
        &sessions,
        &submission_id,
        &as_of_date,
    )?;
    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    decide_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &submission_id,
        sspk.as_ref(),
        |conn| {
            grade_submission::decide_master_teacher(
                conn,
                &school_id,
                &submission_id,
                &user_id,
                approve,
                feedback_note.as_deref(),
            )
        },
    )
}

/// ADR-0089 tier 2 / the no-MT-assigned fallback. Before deciding,
/// resolves whether the submitter currently has an assigned Master
/// Teacher overseer (`as_of_date`, same client-supplied-date convention
/// as the sibling command above): if one is assigned and the Master
/// Teacher tier has not yet decided, School Head is structurally refused
/// -- skipping that tier is never left to the UI to prevent by merely
/// hiding a button. Otherwise (no Master Teacher assigned -- the
/// fallback -- or the Master Teacher tier already approved) proceeds to
/// `grade_submission::decide_school_head`.
#[tauri::command]
pub fn decide_grade_submission(
    app: AppHandle,
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    submission_id: String,
    approve: bool,
    feedback_note: Option<String>,
    as_of_date: String,
) -> AppResult<GradeSubmission> {
    let conn = lock_db(&db);
    let (school_id, user_id) = auth::authorize_capability_with_actor(
        &conn,
        &sessions,
        Capability::ManageGradeSubmissionReview,
    )?;

    require_no_pending_master_teacher_decision(&conn, &school_id, &submission_id, &as_of_date)?;

    let sspk = resolve_sspk_if_enrolled(&app, &conn, &school_id)?;

    decide_with_optional_sync(
        &conn,
        &school_id,
        &user_id,
        &submission_id,
        sspk.as_ref(),
        |conn| {
            grade_submission::decide_school_head(
                conn,
                &school_id,
                &submission_id,
                &user_id,
                approve,
                feedback_note.as_deref(),
            )
        },
    )
}

/// The structural skip-tier guard behind `decide_grade_submission`:
/// refuses School Head's decision when the submitter currently has an
/// assigned Master Teacher overseer who has not yet decided. Extracted
/// as its own testable function -- exercised directly by this module's
/// own tests without needing a real Tauri `AppHandle`/`State`, the same
/// rationale `*_with_optional_sync` extraction already established in
/// this file.
fn require_no_pending_master_teacher_decision(
    conn: &Connection,
    school_id: &str,
    submission_id: &str,
    as_of_date: &str,
) -> AppResult<()> {
    let Some(submission) = grade_submission::find_by_id(conn, school_id, submission_id)? else {
        return Err(AppError::InvalidInput(
            "unknown grade submission".to_string(),
        ));
    };
    if submission.master_teacher_decision.is_none() {
        if let Some(submitted_by) = submission.submitted_by_user_id.as_deref() {
            if teacher_oversight_assignment::current_overseer_for_teacher(
                conn,
                school_id,
                submitted_by,
                as_of_date,
            )?
            .is_some()
            {
                return Err(AppError::InvalidInput(
                    "this submission has a Master Teacher assigned and must be decided by them first"
                        .to_string(),
                ));
            }
        }
    }
    Ok(())
}

/// Shared sync-enqueue wrapper behind both decision commands above: the
/// UPDATED submission is always enqueued (its `status`/`decided_*`/
/// `master_teacher_decided_*` columns changed even with no note), and,
/// if a note was actually added, it is enqueued too, both in the same
/// atomic `SAVEPOINT`. `decide` performs the actual repository decision
/// (either tier) and is called inside that savepoint.
fn decide_with_optional_sync(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    submission_id: &str,
    sspk: Option<&[u8; PAYLOAD_KEY_LEN]>,
    decide: impl FnOnce(&Connection) -> AppResult<GradeSubmission>,
) -> AppResult<GradeSubmission> {
    let Some(sspk) = sspk else {
        return decide(conn);
    };

    conn.execute_batch("SAVEPOINT decide_grade_submission_with_sync")?;
    let outcome = (|| -> AppResult<GradeSubmission> {
        let notes_before = grade_submission::list_notes(conn, school_id, submission_id)?.len();
        let updated = decide(conn)?;
        enqueue_submission_sync_change(conn, school_id, actor_user_id, &updated, sspk)?;
        let notes_after = grade_submission::list_notes(conn, school_id, submission_id)?;
        if notes_after.len() > notes_before {
            // Notes are ordered oldest-first (see `list_notes`), so a
            // newly appended note is always the last element.
            let newest = notes_after
                .last()
                .expect("notes_after.len() > notes_before implies at least one element");
            enqueue_note_sync_change(conn, school_id, actor_user_id, newest, sspk)?;
        }
        Ok(updated)
    })();

    match outcome {
        Ok(updated) => {
            conn.execute_batch("RELEASE decide_grade_submission_with_sync")?;
            Ok(updated)
        }
        Err(error) => {
            let _ = conn.execute_batch(
                "ROLLBACK TO decide_grade_submission_with_sync; RELEASE decide_grade_submission_with_sync",
            );
            Err(error)
        }
    }
}

fn enqueue_submission_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    submission: &GradeSubmission,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::GradeSubmission,
        &submission.id,
    )?;
    let plaintext = serde_json::to_vec(submission)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::GradeSubmission,
        entity_id: parse_sync_uuid(&submission.id, "grade submission id")?,
        base_version,
        operation: ChangeOperation::Upsert,
        encrypted_payload,
    };

    sync_outbox::enqueue(conn, school_id, &change)?;
    Ok(())
}

fn enqueue_note_sync_change(
    conn: &Connection,
    school_id: &str,
    actor_user_id: &str,
    note: &SubmissionNote,
    sspk: &[u8; PAYLOAD_KEY_LEN],
) -> AppResult<()> {
    let device_id = device_identity::current_or_create(conn)?;
    let base_version = sync_version_cache::known_version(
        conn,
        school_id,
        EntityKind::GradeSubmissionNote,
        &note.id,
    )?;
    let plaintext = serde_json::to_vec(note)
        .map_err(|e| AppError::key_store(format!("failed to serialize sync payload: {e}")))?;
    let encrypted_payload = payload_key::encrypt_payload(sspk, &plaintext)?;

    let change = PendingChange {
        change_id: Uuid::now_v7(),
        device_id: parse_sync_uuid(&device_id, "local device id")?,
        actor_user_id: parse_sync_uuid(actor_user_id, "actor user id")?,
        entity_kind: EntityKind::GradeSubmissionNote,
        entity_id: parse_sync_uuid(&note.id, "grade submission note id")?,
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

#[tauri::command]
pub fn list_grade_submissions_for_school(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
) -> AppResult<Vec<GradeSubmission>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    grade_submission::list_for_school(&conn, &school_id)
}

#[tauri::command]
pub fn list_grade_submission_notes(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    submission_id: String,
) -> AppResult<Vec<SubmissionNote>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    grade_submission::list_notes(&conn, &school_id, &submission_id)
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PrincipalDashboardRow {
    pub learner_id: String,
    pub general_average: Option<f64>,
}

/// Principal (School-Head) Overview Dashboard: composite-grade view for
/// one section, reusing `grade_submission::composite_grades_for_section`
/// (itself reusing `grading_computation` — no new grade engine). The
/// submission-status matrix half is `list_grade_submissions_for_school`
/// above; the frontend combines both, matching this codebase's
/// established pattern of composing narrow commands rather than one
/// monolithic dashboard query.
#[tauri::command]
pub fn get_principal_overview_dashboard(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    section_id: String,
    as_of_date: String,
) -> AppResult<Vec<PrincipalDashboardRow>> {
    let conn = lock_db(&db);
    let school_id =
        auth::authorize_capability(&conn, &sessions, Capability::ManageGradeSubmissionReview)?;
    let roster =
        section_membership::roster_for_section(&conn, &school_id, &section_id, &as_of_date)?;
    let learner_ids: Vec<String> = roster.into_iter().map(|m| m.learner_id).collect();
    let averages = grade_submission::composite_grades_for_section(
        &conn,
        &school_id,
        &section_id,
        &learner_ids,
    )?;
    Ok(averages
        .into_iter()
        .map(|(learner_id, general_average)| PrincipalDashboardRow {
            learner_id,
            general_average,
        })
        .collect())
}

#[cfg(test)]
mod sync_tests {
    use super::*;
    use crate::db;
    use std::path::Path;

    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        class_record_id: String,
        teacher_id: String,
        head_id: String,
        mt_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let school = crate::repository::school::create(conn, "Rizal Elementary").unwrap();
        let section =
            crate::repository::section::create(conn, &school.id, "2026-2027", "5", "Section A")
                .unwrap();
        let subject = crate::repository::subject::create(conn, &school.id, "Mathematics").unwrap();
        let period = crate::repository::grading::create(
            conn,
            &school.id,
            "2026-2027",
            TERM_1,
            "2026-06-08",
            "2026-09-15",
        )
        .unwrap()
        .unwrap();
        let class_record = crate::repository::class_record::create(
            conn,
            &school.id,
            &section.id,
            &subject.id,
            &period.id,
            K10_POLICY,
            None,
        )
        .unwrap()
        .unwrap();
        let teacher = crate::repository::user::create_user(
            conn,
            "teacher1",
            "correct horse battery staple",
            "Teacher One",
        )
        .unwrap();
        crate::repository::user::add_school_membership(conn, &teacher.id, &school.id).unwrap();
        let head = crate::repository::user::create_user(
            conn,
            "head1",
            "correct horse battery staple",
            "Head One",
        )
        .unwrap();
        let mt = crate::repository::user::create_user(
            conn,
            "mt1",
            "correct horse battery staple",
            "MT One",
        )
        .unwrap();
        crate::repository::user::add_school_membership(conn, &mt.id, &school.id).unwrap();
        crate::repository::role::grant(
            conn,
            &mt.id,
            &school.id,
            crate::repository::role::MASTER_TEACHER,
        )
        .unwrap();
        Fixture {
            school_id: school.id,
            class_record_id: class_record.id,
            teacher_id: teacher.id,
            head_id: head.id,
            mt_id: mt.id,
        }
    }

    fn test_sspk() -> [u8; PAYLOAD_KEY_LEN] {
        [0x9b; PAYLOAD_KEY_LEN]
    }

    #[test]
    fn submit_with_no_sspk_behaves_exactly_like_a_plain_submit() {
        let conn = open_test_db();
        let f = seed(&conn);

        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
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
    fn submit_with_an_sspk_enqueues_the_submission_and_its_automated_check_notes() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            Some(&sspk),
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // The submission itself, plus at least one automated-check
        // finding (an empty class record always has one -- see
        // `grade_submission::run_automated_checks`).
        assert!(queued.len() >= 2);
        let submission_changes: Vec<_> = queued
            .iter()
            .filter(|q| q.change.entity_kind == EntityKind::GradeSubmission)
            .collect();
        assert_eq!(submission_changes.len(), 1);
        assert_eq!(
            submission_changes[0].change.entity_id.to_string(),
            created.id
        );
        let note_changes: Vec<_> = queued
            .iter()
            .filter(|q| q.change.entity_kind == EntityKind::GradeSubmissionNote)
            .collect();
        assert!(!note_changes.is_empty());

        let decrypted =
            payload_key::decrypt_payload(&sspk, &submission_changes[0].change.encrypted_payload)
                .unwrap();
        let round_tripped: GradeSubmission = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(round_tripped, created);
    }

    #[test]
    fn decide_with_an_sspk_enqueues_the_updated_submission_and_the_feedback_note() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            Some(&sspk),
        )
        .unwrap();
        let queued_before = sync_outbox::pending_for_school(&conn, &f.school_id, 10)
            .unwrap()
            .len();

        let decided = decide_with_optional_sync(
            &conn,
            &f.school_id,
            &f.head_id,
            &created.id,
            Some(&sspk),
            |conn| {
                grade_submission::decide_school_head(
                    conn,
                    &f.school_id,
                    &created.id,
                    &f.head_id,
                    true,
                    Some("Synthetic: looks good, approved."),
                )
            },
        )
        .unwrap();

        assert_eq!(decided.status, grade_submission::SubmissionStatus::Approved);
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // The updated submission + the new feedback note, on top of
        // whatever `submit` already enqueued.
        assert_eq!(queued.len(), queued_before + 2);
        let last_submission_change = queued
            .iter()
            .rfind(|q| q.change.entity_kind == EntityKind::GradeSubmission)
            .unwrap();
        let decrypted =
            payload_key::decrypt_payload(&sspk, &last_submission_change.change.encrypted_payload)
                .unwrap();
        let round_tripped: GradeSubmission = serde_json::from_slice(&decrypted).unwrap();
        assert_eq!(
            round_tripped.status,
            grade_submission::SubmissionStatus::Approved
        );
    }

    #[test]
    fn decide_with_no_feedback_note_enqueues_only_the_updated_submission() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            Some(&sspk),
        )
        .unwrap();
        let queued_before = sync_outbox::pending_for_school(&conn, &f.school_id, 10)
            .unwrap()
            .len();

        decide_with_optional_sync(
            &conn,
            &f.school_id,
            &f.head_id,
            &created.id,
            Some(&sspk),
            |conn| {
                grade_submission::decide_school_head(
                    conn,
                    &f.school_id,
                    &created.id,
                    &f.head_id,
                    true,
                    None,
                )
            },
        )
        .unwrap();

        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert_eq!(queued.len(), queued_before + 1);
    }

    #[test]
    fn a_rejected_decide_never_enqueues_an_outbox_row() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();

        // An unknown submission_id -- `grade_submission::decide_school_head` errors.
        let result = decide_with_optional_sync(
            &conn,
            &f.school_id,
            &f.head_id,
            "does-not-exist",
            Some(&sspk),
            |conn| {
                grade_submission::decide_school_head(
                    conn,
                    &f.school_id,
                    "does-not-exist",
                    &f.head_id,
                    true,
                    None,
                )
            },
        );

        assert!(result.is_err());
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        assert!(
            queued.is_empty(),
            "a rejected decide must never enqueue an outbox row"
        );
    }

    // ---- ADR-0089 checkpoint 3: the skip-tier guard ----

    #[test]
    fn require_no_pending_master_teacher_decision_allows_the_fallback_with_no_mt_assigned() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            None,
        )
        .unwrap();

        // No teacher_oversight_assignment ever created for f.teacher_id.
        let result = require_no_pending_master_teacher_decision(
            &conn,
            &f.school_id,
            &created.id,
            "2026-08-29",
        );

        assert!(result.is_ok());
    }

    #[test]
    fn require_no_pending_master_teacher_decision_blocks_school_head_when_an_mt_is_assigned_and_undecided(
    ) {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            None,
        )
        .unwrap();
        teacher_oversight_assignment::assign(
            &conn,
            &f.school_id,
            &f.mt_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        let result = require_no_pending_master_teacher_decision(
            &conn,
            &f.school_id,
            &created.id,
            "2026-08-29",
        );

        assert!(
            result.is_err(),
            "School Head must not be able to skip a pending Master Teacher decision"
        );
    }

    #[test]
    fn require_no_pending_master_teacher_decision_allows_school_head_after_mt_approval() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            None,
        )
        .unwrap();
        teacher_oversight_assignment::assign(
            &conn,
            &f.school_id,
            &f.mt_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        grade_submission::decide_master_teacher(&conn, &f.school_id, &created.id, &f.mt_id, true, None)
            .unwrap();

        let result = require_no_pending_master_teacher_decision(
            &conn,
            &f.school_id,
            &created.id,
            "2026-08-29",
        );

        assert!(result.is_ok());
    }

    // ---- ADR-0089 checkpoint 3: decide_master_teacher_with_optional_sync ----

    #[test]
    fn master_teacher_approval_with_an_sspk_enqueues_the_updated_submission() {
        let conn = open_test_db();
        let f = seed(&conn);
        let sspk = test_sspk();
        let created = submit_grades_for_review_with_optional_sync(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &f.class_record_id,
            Some(&sspk),
        )
        .unwrap();
        teacher_oversight_assignment::assign(
            &conn,
            &f.school_id,
            &f.mt_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let queued_before = sync_outbox::pending_for_school(&conn, &f.school_id, 10)
            .unwrap()
            .len();

        let decided = decide_with_optional_sync(
            &conn,
            &f.school_id,
            &f.mt_id,
            &created.id,
            Some(&sspk),
            |conn| {
                grade_submission::decide_master_teacher(
                    conn,
                    &f.school_id,
                    &created.id,
                    &f.mt_id,
                    true,
                    Some("Synthetic: MT approves."),
                )
            },
        )
        .unwrap();

        assert_eq!(decided.status, grade_submission::SubmissionStatus::Submitted);
        assert_eq!(
            decided.master_teacher_decision,
            Some(grade_submission::MasterTeacherDecision::Approved)
        );
        let queued = sync_outbox::pending_for_school(&conn, &f.school_id, 10).unwrap();
        // The updated submission + the new feedback note.
        assert_eq!(queued.len(), queued_before + 2);

        // School Head's final lock is still required and still enqueues
        // its own update -- the end-to-end two-tier flow this checkpoint
        // adds.
        let locked = decide_with_optional_sync(
            &conn,
            &f.school_id,
            &f.head_id,
            &created.id,
            Some(&sspk),
            |conn| {
                grade_submission::decide_school_head(
                    conn,
                    &f.school_id,
                    &created.id,
                    &f.head_id,
                    true,
                    None,
                )
            },
        )
        .unwrap();
        assert_eq!(locked.status, grade_submission::SubmissionStatus::Approved);
    }
}
