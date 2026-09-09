use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::error::{AppError, AppResult};
use crate::repository::{role, teaching_assignment};

/// A structured lesson plan authored under the "ILAW" format --
/// Intentions, Learning Experiences, Assessment, Ways Forward -- per
/// DepEd Order No. 16, s. 2026 (researched this session; see
/// `docs/CURRENT-HANDOFF.md` for sources and confidence). Scoped to one
/// `(teaching_assignment_id, plan_date)` pair -- see migration 40's own
/// doc comment for why that FK alone is sufficient to also scope the
/// owning teacher/section/subject. This is a teacher's own authoring
/// tool, not an official DepEd form output -- no PDF export in this
/// slice.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct LessonPlan {
    pub id: String,
    pub school_id: String,
    pub teaching_assignment_id: String,
    pub plan_date: String,
    pub learning_competency: String,
    pub learning_competency_code: String,
    pub learning_objectives: String,
    pub connection_to_previous_learning: String,
    pub learning_experiences: String,
    pub assessment: String,
    pub ways_forward: String,
    pub created_by_user_id: String,
    pub created_at: String,
    pub updated_at: String,
}

/// The exact fields a teacher supplies from the authoring screen --
/// grouped into one struct so `create`/`update` share one parameter
/// list rather than each growing an unwieldy positional arg count (this
/// entity has more free-text fields than any existing repository
/// module's create/update pair).
#[derive(Debug, Clone)]
pub struct LessonPlanFields<'a> {
    pub learning_competency: &'a str,
    pub learning_competency_code: &'a str,
    pub learning_objectives: &'a str,
    pub connection_to_previous_learning: &'a str,
    pub learning_experiences: &'a str,
    pub assessment: &'a str,
    pub ways_forward: &'a str,
}

/// The caller must be exactly the teacher on `teaching_assignment_id`,
/// or a School Head in the same school (read/write parity is
/// deliberately narrower for School Head than
/// `subject_attendance::authorize_own_assignment`'s teacher-only write
/// gate below -- see `authorize_view` for the read-only, School-Head-
/// inclusive check). Mirrors
/// `subject_attendance::authorize_own_assignment` exactly for the write
/// path: only the assignment's own teacher may create/update their own
/// plan.
pub fn authorize_own_assignment(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let assignment =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
            .ok_or(AppError::Unauthorized)?;
    if assignment.teacher_user_id != user_id {
        return Err(AppError::Unauthorized);
    }
    Ok(())
}

/// Read access: the assignment's own teacher, or a School Head in the
/// same school -- matching this codebase's general "School Head can see
/// everything in their school" precedent (e.g. `SchoolHeadHome`'s broad
/// read access, `authorize_adviser_of_section`'s self-or-School-Head
/// shape). A School Head cannot create/edit another teacher's plan
/// (`authorize_own_assignment` above stays teacher-only for writes) --
/// only view it.
pub fn authorize_view(
    conn: &Connection,
    user_id: &str,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<()> {
    let assignment =
        teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?
            .ok_or(AppError::Unauthorized)?;
    if assignment.teacher_user_id == user_id {
        return Ok(());
    }
    if role::has_any_role(conn, user_id, school_id, &[role::SCHOOL_HEAD])? {
        return Ok(());
    }
    Err(AppError::Unauthorized)
}

/// Creates a lesson plan under `teaching_assignment_id` (verified to
/// resolve within `school_id` by the caller's `authorize_own_assignment`
/// check before this is reached). Returns `Ok(None)` if the assignment
/// doesn't resolve in `school_id`, or if one already exists for this
/// exact `(teaching_assignment_id, plan_date)` pair -- callers wanting
/// to change an existing day's plan should use `update` instead, the
/// same create-vs-update split every other entity in this codebase
/// uses.
pub fn create(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
    created_by_user_id: &str,
    fields: &LessonPlanFields<'_>,
) -> AppResult<Option<LessonPlan>> {
    if teaching_assignment::find_by_id_in_school(conn, school_id, teaching_assignment_id)?.is_none()
    {
        return Ok(None);
    }
    if find_by_assignment_and_date(conn, school_id, teaching_assignment_id, plan_date)?.is_some() {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO lesson_plans \
             (id, school_id, teaching_assignment_id, plan_date, \
              learning_competency, learning_competency_code, learning_objectives, \
              connection_to_previous_learning, learning_experiences, assessment, \
              ways_forward, created_by_user_id) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        (
            &id,
            school_id,
            teaching_assignment_id,
            plan_date,
            fields.learning_competency,
            fields.learning_competency_code,
            fields.learning_objectives,
            fields.connection_to_previous_learning,
            fields.learning_experiences,
            fields.assessment,
            fields.ways_forward,
            created_by_user_id,
        ),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// Fully edits an existing lesson plan's ILAW fields (never its
/// `teaching_assignment_id`/`plan_date` identity -- a teacher wanting
/// a different assignment/date creates a new plan instead). Returns
/// `Ok(None)` if the plan doesn't resolve in `school_id`. Unlike
/// `assessment_item::update`, there is no "already has downstream
/// data" guard here -- a lesson plan is planning content, never read by
/// grade computation or export, so it is always safely re-editable.
pub fn update(
    conn: &Connection,
    school_id: &str,
    id: &str,
    fields: &LessonPlanFields<'_>,
) -> AppResult<Option<LessonPlan>> {
    if find_by_id_in_school(conn, school_id, id)?.is_none() {
        return Ok(None);
    }
    conn.execute(
        "UPDATE lesson_plans SET \
             learning_competency = ?1, learning_competency_code = ?2, \
             learning_objectives = ?3, connection_to_previous_learning = ?4, \
             learning_experiences = ?5, assessment = ?6, ways_forward = ?7, \
             updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?8 AND school_id = ?9",
        (
            fields.learning_competency,
            fields.learning_competency_code,
            fields.learning_objectives,
            fields.connection_to_previous_learning,
            fields.learning_experiences,
            fields.assessment,
            fields.ways_forward,
            id,
            school_id,
        ),
    )?;
    find_by_id_in_school(conn, school_id, id)
}

/// Materializes a pulled sync change: an `INSERT ... ON CONFLICT(id) DO
/// UPDATE` keyed on the row's own stable `id`, mirroring
/// `grading::upsert_from_sync` exactly. Bypasses `create`'s own
/// existence/duplicate-date checks and the schema's own `UNIQUE
/// (teaching_assignment_id, plan_date)` constraint entirely (that
/// validation already happened on the originating device) -- a
/// collision on that natural key (two devices independently authoring a
/// plan for the same assignment/date while both offline) surfaces as an
/// ordinary `rusqlite::Error` here, which the caller
/// (`sync_client::apply_decrypted_change`) maps to
/// `ApplyRejection::RepositoryRejected` so it never wedges the rest of
/// the pull batch -- same generic mechanism already confirmed for
/// `Subject`/`Section` (`docs/VERIFICATION-DEBT.md`, "Confirmed the
/// natural-key-collision fix is generic across entities").
pub fn upsert_from_sync(conn: &Connection, plan: &LessonPlan) -> AppResult<()> {
    conn.execute(
        "INSERT INTO lesson_plans \
             (id, school_id, teaching_assignment_id, plan_date, \
              learning_competency, learning_competency_code, learning_objectives, \
              connection_to_previous_learning, learning_experiences, assessment, \
              ways_forward, created_by_user_id, created_at, updated_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14) \
         ON CONFLICT(id) DO UPDATE SET \
             learning_competency = excluded.learning_competency, \
             learning_competency_code = excluded.learning_competency_code, \
             learning_objectives = excluded.learning_objectives, \
             connection_to_previous_learning = excluded.connection_to_previous_learning, \
             learning_experiences = excluded.learning_experiences, \
             assessment = excluded.assessment, \
             ways_forward = excluded.ways_forward, \
             updated_at = excluded.updated_at",
        (
            &plan.id,
            &plan.school_id,
            &plan.teaching_assignment_id,
            &plan.plan_date,
            &plan.learning_competency,
            &plan.learning_competency_code,
            &plan.learning_objectives,
            &plan.connection_to_previous_learning,
            &plan.learning_experiences,
            &plan.assessment,
            &plan.ways_forward,
            &plan.created_by_user_id,
            &plan.created_at,
            &plan.updated_at,
        ),
    )?;
    Ok(())
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<LessonPlan>> {
    conn.query_row(
        "SELECT id, school_id, teaching_assignment_id, plan_date, \
                learning_competency, learning_competency_code, learning_objectives, \
                connection_to_previous_learning, learning_experiences, assessment, \
                ways_forward, created_by_user_id, created_at, updated_at \
         FROM lesson_plans WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_plan,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

pub fn find_by_assignment_and_date(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
    plan_date: &str,
) -> AppResult<Option<LessonPlan>> {
    conn.query_row(
        "SELECT id, school_id, teaching_assignment_id, plan_date, \
                learning_competency, learning_competency_code, learning_objectives, \
                connection_to_previous_learning, learning_experiences, assessment, \
                ways_forward, created_by_user_id, created_at, updated_at \
         FROM lesson_plans \
         WHERE school_id = ?1 AND teaching_assignment_id = ?2 AND plan_date = ?3",
        (school_id, teaching_assignment_id, plan_date),
        row_to_plan,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// Every lesson plan under one teaching assignment, most recent first --
/// scoped to `school_id` directly in the query, matching
/// `assessment_item::list_by_class_record`'s own isolation convention.
pub fn list_by_assignment(
    conn: &Connection,
    school_id: &str,
    teaching_assignment_id: &str,
) -> AppResult<Vec<LessonPlan>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, teaching_assignment_id, plan_date, \
                learning_competency, learning_competency_code, learning_objectives, \
                connection_to_previous_learning, learning_experiences, assessment, \
                ways_forward, created_by_user_id, created_at, updated_at \
         FROM lesson_plans \
         WHERE school_id = ?1 AND teaching_assignment_id = ?2 \
         ORDER BY plan_date DESC",
    )?;
    let rows = stmt.query_map((school_id, teaching_assignment_id), row_to_plan)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_plan(row: &rusqlite::Row) -> rusqlite::Result<LessonPlan> {
    Ok(LessonPlan {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teaching_assignment_id: row.get(2)?,
        plan_date: row.get(3)?,
        learning_competency: row.get(4)?,
        learning_competency_code: row.get(5)?,
        learning_objectives: row.get(6)?,
        connection_to_previous_learning: row.get(7)?,
        learning_experiences: row.get(8)?,
        assessment: row.get(9)?,
        ways_forward: row.get(10)?,
        created_by_user_id: row.get(11)?,
        created_at: row.get(12)?,
        updated_at: row.get(13)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::{school, section, subject, teaching_assignment, user};
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

    fn sample_fields() -> LessonPlanFields<'static> {
        LessonPlanFields {
            learning_competency: "Add and subtract fractions with unlike denominators",
            learning_competency_code: "M7NS-Ig-1",
            learning_objectives: "Add fractions with unlike denominators\nSubtract fractions with unlike denominators",
            connection_to_previous_learning: "Builds on adding fractions with like denominators",
            learning_experiences: "Think-pair-share with fraction strips, then guided practice",
            assessment: "Exit ticket: 3 addition and 2 subtraction items",
            ways_forward: "Reteach denominators via LCD if exit ticket accuracy < 70%",
        }
    }

    #[test]
    fn create_then_find_round_trips_all_ilaw_fields() {
        let conn = open_test_db();
        let f = seed(&conn);
        let fields = sample_fields();

        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &fields,
        )
        .unwrap()
        .unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &created.id).unwrap();

        assert_eq!(found, Some(created.clone()));
        assert_eq!(created.learning_competency, fields.learning_competency);
        assert_eq!(
            created.learning_competency_code,
            fields.learning_competency_code
        );
        assert_eq!(created.learning_objectives, fields.learning_objectives);
        assert_eq!(
            created.connection_to_previous_learning,
            fields.connection_to_previous_learning
        );
        assert_eq!(created.learning_experiences, fields.learning_experiences);
        assert_eq!(created.assessment, fields.assessment);
        assert_eq!(created.ways_forward, fields.ways_forward);
        assert_eq!(created.plan_date, "2026-09-07");
    }

    #[test]
    fn create_rejects_a_teaching_assignment_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = create(
            &conn,
            &other_school.id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_second_plan_for_the_same_assignment_and_date() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        let second = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        assert_eq!(
            second, None,
            "one plan per (teaching_assignment_id, plan_date) -- use update instead"
        );
    }

    #[test]
    fn update_edits_every_ilaw_field_and_leaves_identity_untouched() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        let revised = LessonPlanFields {
            learning_competency: "Revised competency",
            learning_competency_code: "M7NS-Ig-2",
            learning_objectives: "Objective A\nObjective B\nObjective C",
            connection_to_previous_learning: "Revised connection",
            learning_experiences: "Revised experiences",
            assessment: "Revised assessment",
            ways_forward: "Revised ways forward",
        };

        let updated = update(&conn, &f.school_id, &created.id, &revised)
            .unwrap()
            .unwrap();

        assert_eq!(updated.id, created.id);
        assert_eq!(
            updated.teaching_assignment_id,
            created.teaching_assignment_id
        );
        assert_eq!(updated.plan_date, created.plan_date);
        assert_eq!(updated.learning_competency, "Revised competency");
        assert_eq!(updated.learning_competency_code, "M7NS-Ig-2");
        assert_eq!(
            updated.learning_objectives,
            "Objective A\nObjective B\nObjective C"
        );
        assert_eq!(
            updated.connection_to_previous_learning,
            "Revised connection"
        );
        assert_eq!(updated.learning_experiences, "Revised experiences");
        assert_eq!(updated.assessment, "Revised assessment");
        assert_eq!(updated.ways_forward, "Revised ways forward");
    }

    #[test]
    fn update_rejects_a_plan_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let created = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let result = update(&conn, &other_school.id, &created.id, &sample_fields()).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn list_by_assignment_only_returns_that_assignments_plans_ordered_by_date_desc() {
        let conn = open_test_db();
        let f = seed(&conn);
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();
        create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-08",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap();

        let plans = list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();

        assert_eq!(plans.len(), 2);
        assert_eq!(plans[0].plan_date, "2026-09-08");
        assert_eq!(plans[1].plan_date, "2026-09-07");
    }

    #[test]
    fn authorize_own_assignment_allows_the_assignments_own_teacher() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_own_assignment_denies_a_different_teacher() {
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

        let result =
            authorize_own_assignment(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_own_assignment_denies_an_unresolvable_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);

        let result = authorize_own_assignment(&conn, &f.teacher_id, &f.school_id, "does-not-exist");

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_allows_a_school_head_who_does_not_own_the_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);
        let head =
            user::create_user(&conn, "head.a", "correct horse battery staple", "Head A").unwrap();
        user::add_school_membership(&conn, &head.id, &f.school_id).unwrap();
        role::grant(&conn, &head.id, &f.school_id, role::SCHOOL_HEAD).unwrap();

        let result = authorize_view(&conn, &head.id, &f.school_id, &f.assignment_id);

        assert!(result.is_ok());
    }

    #[test]
    fn authorize_view_denies_a_teacher_who_neither_owns_the_assignment_nor_is_school_head() {
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

        let result = authorize_view(&conn, &other_teacher.id, &f.school_id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn authorize_view_denies_a_school_head_from_a_different_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let head =
            user::create_user(&conn, "head.a", "correct horse battery staple", "Head A").unwrap();
        user::add_school_membership(&conn, &head.id, &other_school.id).unwrap();
        role::grant(&conn, &head.id, &other_school.id, role::SCHOOL_HEAD).unwrap();

        let result = authorize_view(&conn, &head.id, &other_school.id, &f.assignment_id);

        assert!(matches!(result, Err(AppError::Unauthorized)));
    }

    #[test]
    fn upsert_from_sync_inserts_a_lesson_plan_this_device_has_never_seen() {
        let conn = open_test_db();
        let f = seed(&conn);
        let incoming = LessonPlan {
            id: Uuid::now_v7().to_string(),
            school_id: f.school_id.clone(),
            teaching_assignment_id: f.assignment_id.clone(),
            plan_date: "2026-09-07".to_string(),
            learning_competency: "Add fractions".to_string(),
            learning_competency_code: "M7NS-Ig-1".to_string(),
            learning_objectives: "Add fractions with unlike denominators".to_string(),
            connection_to_previous_learning: "Builds on like denominators".to_string(),
            learning_experiences: "Think-pair-share".to_string(),
            assessment: "Exit ticket".to_string(),
            ways_forward: "Reteach if needed".to_string(),
            created_by_user_id: f.teacher_id.clone(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        };

        upsert_from_sync(&conn, &incoming).unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &incoming.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.learning_competency, "Add fractions");
        assert_eq!(found.plan_date, "2026-09-07");
    }

    #[test]
    fn upsert_from_sync_updates_an_existing_row_in_place_without_a_duplicate() {
        let conn = open_test_db();
        let f = seed(&conn);
        let original = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        let updated = LessonPlan {
            ways_forward: "Revised ways forward".to_string(),
            ..original.clone()
        };
        upsert_from_sync(&conn, &updated).unwrap();

        let found = find_by_id_in_school(&conn, &f.school_id, &original.id)
            .unwrap()
            .unwrap();
        assert_eq!(found.ways_forward, "Revised ways forward");
        let all = list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();
        assert_eq!(all.len(), 1, "an upsert must never insert a second row");
    }

    /// The natural-key-collision scenario this entity is actually
    /// exposed to: two devices, both offline, each authoring a plan for
    /// the SAME `(teaching_assignment_id, plan_date)` before either has
    /// synced. Each mints its own `id`, so pulling the other device's
    /// row can never collide on `id` (the `ON CONFLICT(id)` target) --
    /// it instead trips the schema's own `UNIQUE (teaching_assignment_id,
    /// plan_date)` constraint. Proves `upsert_from_sync` surfaces this as
    /// an ordinary `Err`, never panics and never silently drops one
    /// plan's data -- the generic `ApplyRejection::RepositoryRejected`
    /// skip-and-advance handling in `sync_client` depends on this
    /// resulting in a normal `Result::Err`, per
    /// `docs/VERIFICATION-DEBT.md`'s "Confirmed the natural-key-collision
    /// fix is generic across entities" entry.
    #[test]
    fn upsert_from_sync_returns_an_error_on_a_natural_key_collision_distinct_from_id() {
        let conn = open_test_db();
        let f = seed(&conn);
        let existing = create(
            &conn,
            &f.school_id,
            &f.assignment_id,
            "2026-09-07",
            &f.teacher_id,
            &sample_fields(),
        )
        .unwrap()
        .unwrap();

        // A second device's own plan for the exact same assignment/date,
        // minted with its own fresh id (never seen locally before).
        let colliding = LessonPlan {
            id: Uuid::now_v7().to_string(),
            ..sample_incoming(&f, "2026-09-07")
        };
        assert_ne!(colliding.id, existing.id);

        let result = upsert_from_sync(&conn, &colliding);

        assert!(
            result.is_err(),
            "a natural-key collision must surface as an Err, not silently succeed or panic"
        );
        // The original row is untouched, and no phantom second row for
        // the colliding id was ever materialized.
        let all = list_by_assignment(&conn, &f.school_id, &f.assignment_id).unwrap();
        assert_eq!(all.len(), 1);
        assert_eq!(all[0].id, existing.id);
        assert!(find_by_id_in_school(&conn, &f.school_id, &colliding.id)
            .unwrap()
            .is_none());
    }

    fn sample_incoming(f: &Fixture, plan_date: &str) -> LessonPlan {
        LessonPlan {
            id: Uuid::now_v7().to_string(),
            school_id: f.school_id.clone(),
            teaching_assignment_id: f.assignment_id.clone(),
            plan_date: plan_date.to_string(),
            learning_competency: "Add fractions".to_string(),
            learning_competency_code: "M7NS-Ig-1".to_string(),
            learning_objectives: "Add fractions with unlike denominators".to_string(),
            connection_to_previous_learning: "Builds on like denominators".to_string(),
            learning_experiences: "Think-pair-share".to_string(),
            assessment: "Exit ticket".to_string(),
            ways_forward: "Reteach if needed".to_string(),
            created_by_user_id: f.teacher_id.clone(),
            created_at: "2026-01-01T00:00:00.000Z".to_string(),
            updated_at: "2026-01-01T00:00:00.000Z".to_string(),
        }
    }
}
