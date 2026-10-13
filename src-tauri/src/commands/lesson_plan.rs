use std::fs;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::{AppError, AppResult};
use crate::repository::lesson_plan::{
    self, LessonPlan, LessonPlanFields, LessonSourceAmendment, LessonSourceArtifact,
    LessonSourceReference,
};

const MAX_SOURCE_FILE_BYTES: u64 = 8 * 1024 * 1024;

fn source_file_identity(path: &Path, content: &[u8]) -> AppResult<(String, &'static str)> {
    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .map(str::trim)
        .filter(|name| !name.is_empty())
        .ok_or_else(|| AppError::Validation("Source file name is required".into()))?;
    let extension = path
        .extension()
        .and_then(|value| value.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    let media_type = match extension.as_str() {
        "pdf" if content.starts_with(b"%PDF-") => "application/pdf",
        "docx" if content.starts_with(b"PK\x03\x04") => {
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        }
        "xlsx" if content.starts_with(b"PK\x03\x04") => {
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        }
        "pdf" | "docx" | "xlsx" => {
            return Err(AppError::Validation(
                "Source file contents do not match the selected file type".into(),
            ));
        }
        _ => return Err(AppError::Validation("Unsupported source file type".into())),
    };
    Ok((file_name.to_string(), media_type))
}

#[tauri::command]
pub fn ingest_lesson_source_file(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    teaching_assignment_id: String,
    file_path: String,
) -> AppResult<LessonSourceArtifact> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_own_assignment(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    let path = Path::new(&file_path);
    let metadata = fs::metadata(path)
        .map_err(|_| AppError::Validation("The selected source file could not be opened".into()))?;
    if !metadata.is_file() || metadata.len() == 0 || metadata.len() > MAX_SOURCE_FILE_BYTES {
        return Err(AppError::Validation(
            "Source file must contain data and be no larger than 8 MiB".into(),
        ));
    }
    let content = fs::read(path)
        .map_err(|_| AppError::Validation("The selected source file could not be read".into()))?;
    let (file_name, media_type) = source_file_identity(path, &content)?;
    lesson_plan::ingest_source_artifact_authorized(
        &conn,
        &user_id,
        &school_id,
        &teaching_assignment_id,
        &file_name,
        media_type,
        &content,
    )
}

#[tauri::command]
pub fn get_lesson_source_artifact(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    artifact_id: String,
) -> AppResult<Option<LessonSourceArtifact>> {
    let conn = lock_db(&db);
    let (_, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::find_source_artifact(&conn, &school_id, artifact_id.trim())
}

/// Every command in this file gates on `lesson_plan::authorize_own_assignment`
/// (create/update) or `lesson_plan::authorize_view` (read) -- the caller
/// must be exactly the teacher on `teaching_assignment_id`, or (read-only)
/// a School Head in the same school. Deliberately not wired to sync in
/// this slice -- a lesson plan is the teacher's own planning content,
/// read only by that teacher (and, read-only, their School Head), never
/// a cross-device coordination point the way `AssessmentItem`/
/// `SubjectAttendance` sessions are (another device recording a score or
/// attendance mark against an unwired row). A future slice can widen the
/// `entity_kind` `CHECK` constraint to add sync if cross-device lesson
/// planning is ever requested.
#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn create_lesson_plan(
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
    source_reference: Option<LessonSourceReference>,
) -> AppResult<Option<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_own_assignment(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    lesson_plan::create_with_source(
        &conn,
        &school_id,
        &teaching_assignment_id,
        &plan_date,
        &user_id,
        &LessonPlanFields {
            learning_competency: &learning_competency,
            learning_competency_code: &learning_competency_code,
            learning_objectives: &learning_objectives,
            connection_to_previous_learning: &connection_to_previous_learning,
            learning_experiences: &learning_experiences,
            assessment: &assessment,
            ways_forward: &ways_forward,
        },
        source_reference.as_ref(),
    )
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn update_lesson_plan(
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
    lesson_plan::update_authorized(
        &conn,
        &user_id,
        &school_id,
        &id,
        &teaching_assignment_id,
        &LessonPlanFields {
            learning_competency: &learning_competency,
            learning_competency_code: &learning_competency_code,
            learning_objectives: &learning_objectives,
            connection_to_previous_learning: &connection_to_previous_learning,
            learning_experiences: &learning_experiences,
            assessment: &assessment,
            ways_forward: &ways_forward,
        },
    )
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

#[tauri::command]
pub fn amend_lesson_source(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    lesson_plan_id: String,
    teaching_assignment_id: String,
    source_reference: LessonSourceReference,
    reason: String,
) -> AppResult<Option<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::amend_source_authorized(
        &conn,
        &user_id,
        &school_id,
        &lesson_plan_id,
        &teaching_assignment_id,
        &source_reference,
        &reason,
    )
}

#[tauri::command]
pub fn list_lesson_source_amendments(
    db: State<'_, Mutex<Connection>>,
    sessions: State<'_, SessionManager>,
    lesson_plan_id: String,
    teaching_assignment_id: String,
) -> AppResult<Vec<LessonSourceAmendment>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    let plan = lesson_plan::find_by_id_in_school(&conn, &school_id, &lesson_plan_id)?
        .ok_or(crate::error::AppError::Unauthorized)?;
    if plan.teaching_assignment_id != teaching_assignment_id {
        return Err(crate::error::AppError::Unauthorized);
    }
    lesson_plan::authorize_view(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    lesson_plan::list_source_amendments(&conn, &school_id, &lesson_plan_id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{role, school, section, subject, teaching_assignment, user};

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    #[test]
    fn source_file_identity_checks_extension_and_container_signature() {
        assert_eq!(
            source_file_identity(Path::new("source.PDF"), b"%PDF-1.7\nfixture")
                .unwrap()
                .1,
            "application/pdf"
        );
        assert!(source_file_identity(Path::new("source.pdf"), b"PK\x03\x04fixture").is_err());
        assert!(source_file_identity(Path::new("source.doc"), b"PK\x03\x04fixture").is_err());
        assert!(source_file_identity(Path::new("source.xlsx"), b"PK\x03\x04fixture").is_ok());
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

        let updated = lesson_plan::update_authorized(
            &conn,
            &f.teacher_id,
            &f.school_id,
            &created.id,
            &f.assignment_id,
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

    #[test]
    fn update_cannot_use_an_owned_assignment_to_edit_another_teachers_plan() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();
        let sec = section::create(&conn, &f.school_id, "2026-2027", "8", "Other").unwrap();
        let sub = subject::create(&conn, &f.school_id, "TLE").unwrap();
        let assignment =
            teaching_assignment::create(&conn, &f.school_id, &other.id, &sec.id, &sub.id)
                .unwrap()
                .unwrap();
        let fields = LessonPlanFields {
            learning_competency: "Synthetic competency",
            learning_competency_code: "",
            learning_objectives: "Synthetic objective",
            connection_to_previous_learning: "",
            learning_experiences: "Synthetic activity",
            assessment: "Synthetic assessment",
            ways_forward: "",
        };
        let plan = lesson_plan::create(
            &conn,
            &f.school_id,
            &assignment.id,
            "2026-10-13",
            &other.id,
            &fields,
        )
        .unwrap()
        .unwrap();
        assert!(matches!(
            lesson_plan::update_authorized(
                &conn,
                &f.teacher_id,
                &f.school_id,
                &plan.id,
                &f.assignment_id,
                &fields,
            ),
            Err(crate::error::AppError::Unauthorized)
        ));
        assert!(matches!(
            lesson_plan::update_authorized(
                &conn,
                &f.teacher_id,
                &f.school_id,
                &plan.id,
                &assignment.id,
                &fields,
            ),
            Err(crate::error::AppError::Unauthorized)
        ));
        assert_eq!(
            lesson_plan::find_by_id_in_school(&conn, &f.school_id, &plan.id).unwrap(),
            Some(plan)
        );
    }
}
