use std::sync::Mutex;

use rusqlite::Connection;
use tauri::State;

use crate::auth::SessionManager;
use crate::commands::lock_db;
use crate::error::AppResult;
use crate::repository::lesson_plan::{self, LessonPlan, LessonPlanFields};

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
) -> AppResult<Option<LessonPlan>> {
    let conn = lock_db(&db);
    let (user_id, school_id) = sessions.require_active_session(&conn)?;
    lesson_plan::authorize_own_assignment(&conn, &user_id, &school_id, &teaching_assignment_id)?;
    lesson_plan::create(
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
    lesson_plan::update(
        &conn,
        &school_id,
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
}
