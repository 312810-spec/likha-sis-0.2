use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{schedule_meeting, section, subject, user};

/// Who teaches what, for a whole school year. Stores no `school_year` of
/// its own -- derived from `sections.school_year` via `section_id`, the
/// same single-source-of-truth reasoning `class_record` already uses
/// (see `docs/adr/0039-teacher-load-class-schedule-foundation.md`).
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeachingAssignment {
    pub id: String,
    pub school_id: String,
    pub teacher_user_id: String,
    pub section_id: String,
    pub subject_id: String,
    pub created_at: String,
}

/// A teaching assignment joined with the names a load/schedule screen
/// needs, without a separate round trip per row.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeachingAssignmentDetail {
    pub id: String,
    pub school_id: String,
    pub teacher_user_id: String,
    pub section_id: String,
    pub section_name: String,
    pub school_year: String,
    pub subject_id: String,
    pub subject_name: String,
    pub created_at: String,
}

/// Three independent numbers, never balanced into one -- see
/// `docs/product/PRODUCT-CONTRACT.md` §6's explicit requirement to track
/// both classroom teaching time and distinct preparation count.
/// `weekly_instructional_minutes` is 0 whenever no `schedule_meetings`
/// exist yet for any of the teacher's assignments -- an assignment can
/// legitimately exist before it is scheduled.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeacherLoad {
    pub assignment_count: i64,
    pub distinct_subject_count: i64,
    pub weekly_instructional_minutes: i64,
}

/// Creates a teaching assignment, validating `section_id`/`subject_id`
/// resolve within `school_id` and `teacher_user_id` is a member of
/// `school_id` -- not role-gated to `teacher` specifically, matching how
/// `class_record::create` validates its own referenced section/subject
/// by existence-in-school rather than by role. Returns `Ok(None)` for
/// any invalid reference (same convention as `class_record::create`);
/// the schema's own `UNIQUE (section_id, subject_id)` constraint
/// surfaces as an `Err`, never a `None`, matching migration 7's
/// duplicate-class-record precedent.
pub fn create(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    section_id: &str,
    subject_id: &str,
) -> AppResult<Option<TeachingAssignment>> {
    if section::find_by_id_in_school(conn, school_id, section_id)?.is_none() {
        return Ok(None);
    }
    if subject::find_by_id_in_school(conn, school_id, subject_id)?.is_none() {
        return Ok(None);
    }
    if !user::is_member_of_school(conn, teacher_user_id, school_id)? {
        return Ok(None);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO teaching_assignments (id, school_id, teacher_user_id, section_id, subject_id) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, teacher_user_id, section_id, subject_id),
    )?;

    find_by_id_in_school(conn, school_id, &id)
}

/// Removes an existing assignment for `(section_id, subject_id)` (if
/// any) and creates a new one for `new_teacher_user_id` -- an explicit
/// reassignment, never a silent overwrite. Not wrapped in an explicit
/// transaction: if the create step fails after the remove step
/// succeeds, the section+subject is simply left unassigned, the same
/// safe, recoverable state as "not yet assigned" -- not a correctness
/// violation.
pub fn replace_teacher(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    subject_id: &str,
    new_teacher_user_id: &str,
) -> AppResult<Option<TeachingAssignment>> {
    conn.execute(
        "DELETE FROM teaching_assignments \
         WHERE school_id = ?1 AND section_id = ?2 AND subject_id = ?3",
        (school_id, section_id, subject_id),
    )?;
    create(conn, school_id, new_teacher_user_id, section_id, subject_id)
}

/// Removes an assignment, scoped to `school_id` -- a caller can only
/// ever remove their own school's assignment. Cascades to any
/// `schedule_meetings` for it (`ON DELETE CASCADE`). Returns whether a
/// row was actually removed, so a caller can distinguish "already gone"
/// from "removed just now" if it matters.
pub fn remove(conn: &Connection, school_id: &str, id: &str) -> AppResult<bool> {
    let affected = conn.execute(
        "DELETE FROM teaching_assignments WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
    )?;
    Ok(affected > 0)
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    id: &str,
) -> AppResult<Option<TeachingAssignment>> {
    conn.query_row(
        "SELECT id, school_id, teacher_user_id, section_id, subject_id, created_at \
         FROM teaching_assignments WHERE id = ?1 AND school_id = ?2",
        (id, school_id),
        row_to_assignment,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

const DETAIL_SELECT: &str = "SELECT ta.id, ta.school_id, ta.teacher_user_id, \
     ta.section_id, sec.name, sec.school_year, ta.subject_id, sub.name, ta.created_at \
     FROM teaching_assignments ta \
     JOIN sections sec ON sec.id = ta.section_id \
     JOIN subjects sub ON sub.id = ta.subject_id \
     WHERE ta.school_id = ?1";

/// Every assignment held by `teacher_user_id` within `school_id` -- the
/// data a teacher's own "what do I teach" view and the load calculation
/// below are both built from.
pub fn list_by_teacher_in_school(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let mut stmt = conn.prepare(&format!(
        "{DETAIL_SELECT} AND ta.teacher_user_id = ?2 ORDER BY sec.school_year DESC, sec.name, sub.name"
    ))?;
    let rows = stmt.query_map((school_id, teacher_user_id), row_to_detail)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Every assignment for `section_id` within `school_id` -- who teaches
/// this section, subject by subject.
pub fn list_by_section_in_school(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
) -> AppResult<Vec<TeachingAssignmentDetail>> {
    let mut stmt = conn.prepare(&format!(
        "{DETAIL_SELECT} AND ta.section_id = ?2 ORDER BY sub.name"
    ))?;
    let rows = stmt.query_map((school_id, section_id), row_to_detail)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// True if `teacher_user_id` holds a teaching assignment for exactly this
/// `section_id`/`subject_id` pair within `school_id` — the authorization
/// primitive `auth::authorize_teacher_of_class_record` is built on. A
/// class record's own `section_id`/`subject_id` is what's checked, not
/// the class record's own `id` directly, since a teaching assignment is
/// about who teaches a subject to a section for the whole school year,
/// independent of how many grading-period class records exist under it.
pub fn is_assigned_to_section_subject(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    section_id: &str,
    subject_id: &str,
) -> AppResult<bool> {
    conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM teaching_assignments \
         WHERE school_id = ?1 AND teacher_user_id = ?2 AND section_id = ?3 AND subject_id = ?4)",
        (school_id, teacher_user_id, section_id, subject_id),
        |row| row.get(0),
    )
    .map_err(Into::into)
}

/// `assignment_count`/`distinct_subject_count` are plain aggregates over
/// `teaching_assignments`; `weekly_instructional_minutes` sums every
/// `schedule_meeting` duration across all of the teacher's assignments
/// -- always derived fresh from the underlying rows, never a stored
/// running total (see the ADR: no `teacher.total_load` column exists).
pub fn teacher_load(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
) -> AppResult<TeacherLoad> {
    let (assignment_count, distinct_subject_count): (i64, i64) = conn.query_row(
        "SELECT COUNT(*), COUNT(DISTINCT subject_id) FROM teaching_assignments \
         WHERE school_id = ?1 AND teacher_user_id = ?2",
        (school_id, teacher_user_id),
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let weekly_instructional_minutes =
        schedule_meeting::total_weekly_minutes_for_teacher(conn, school_id, teacher_user_id)?;
    Ok(TeacherLoad {
        assignment_count,
        distinct_subject_count,
        weekly_instructional_minutes,
    })
}

fn row_to_assignment(row: &rusqlite::Row) -> rusqlite::Result<TeachingAssignment> {
    Ok(TeachingAssignment {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teacher_user_id: row.get(2)?,
        section_id: row.get(3)?,
        subject_id: row.get(4)?,
        created_at: row.get(5)?,
    })
}

fn row_to_detail(row: &rusqlite::Row) -> rusqlite::Result<TeachingAssignmentDetail> {
    Ok(TeachingAssignmentDetail {
        id: row.get(0)?,
        school_id: row.get(1)?,
        teacher_user_id: row.get(2)?,
        section_id: row.get(3)?,
        section_name: row.get(4)?,
        school_year: row.get(5)?,
        subject_id: row.get(6)?,
        subject_name: row.get(7)?,
        created_at: row.get(8)?,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{db, repository::school};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    /// A school, one member (`teacher_user_id`), one section, one subject
    /// -- the happy-path fixture most tests build on.
    fn setup(conn: &Connection) -> (String, String, String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "Teacher A").unwrap();
        user::add_school_membership(conn, &teacher.id, &s.id).unwrap();
        let sec = section::create(conn, &s.id, "2026-2027", "7", "Mabini").unwrap();
        let sub = subject::create(conn, &s.id, "Mathematics").unwrap();
        (s.id, teacher.id, sec.id, sub.id)
    }

    #[test]
    fn create_then_find_round_trips() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);

        let created = create(&conn, &school_id, &teacher_id, &section_id, &subject_id)
            .unwrap()
            .unwrap();
        let found = find_by_id_in_school(&conn, &school_id, &created.id).unwrap();

        assert_eq!(found, Some(created));
    }

    #[test]
    fn create_rejects_a_teacher_who_is_not_a_member_of_the_school() {
        let conn = open_test_db();
        let (school_id, _teacher_id, section_id, subject_id) = setup(&conn);
        let outsider = user::create_user(&conn, "outsider", "password", "Outsider").unwrap();

        let result = create(&conn, &school_id, &outsider.id, &section_id, &subject_id).unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_section_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, teacher_id, _section_id, subject_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2026-2027", "7", "Bonifacio").unwrap();

        let result = create(
            &conn,
            &school_id,
            &teacher_id,
            &other_section.id,
            &subject_id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_subject_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, _subject_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_subject = subject::create(&conn, &other_school.id, "Science").unwrap();

        let result = create(
            &conn,
            &school_id,
            &teacher_id,
            &section_id,
            &other_subject.id,
        )
        .unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn create_rejects_a_second_teacher_for_the_same_section_and_subject() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();

        let result = create(
            &conn,
            &school_id,
            &other_teacher.id,
            &section_id,
            &subject_id,
        );

        assert!(result.is_err());
    }

    #[test]
    fn replace_teacher_reassigns_without_leaving_a_duplicate() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();
        let other_teacher = user::create_user(&conn, "teacher.b", "password", "Teacher B").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &school_id).unwrap();

        let replaced = replace_teacher(
            &conn,
            &school_id,
            &section_id,
            &subject_id,
            &other_teacher.id,
        )
        .unwrap()
        .unwrap();

        assert_eq!(replaced.teacher_user_id, other_teacher.id);
        let all = list_by_section_in_school(&conn, &school_id, &section_id).unwrap();
        assert_eq!(
            all.len(),
            1,
            "reassigning must not leave the old assignment behind"
        );
    }

    #[test]
    fn remove_is_scoped_to_the_callers_school() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        let created = create(&conn, &school_id, &teacher_id, &section_id, &subject_id)
            .unwrap()
            .unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();

        let removed_from_wrong_school = remove(&conn, &other_school.id, &created.id).unwrap();
        assert!(!removed_from_wrong_school);
        assert!(find_by_id_in_school(&conn, &school_id, &created.id)
            .unwrap()
            .is_some());

        let removed = remove(&conn, &school_id, &created.id).unwrap();
        assert!(removed);
        assert!(find_by_id_in_school(&conn, &school_id, &created.id)
            .unwrap()
            .is_none());
    }

    #[test]
    fn list_by_teacher_in_school_only_returns_that_teachers_assignments_in_that_school() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();
        user::add_school_membership(&conn, &teacher_id, &other_school.id).unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2026-2027", "7", "Rizal").unwrap();
        let other_subject = subject::create(&conn, &other_school.id, "Science").unwrap();
        create(
            &conn,
            &other_school.id,
            &teacher_id,
            &other_section.id,
            &other_subject.id,
        )
        .unwrap();

        let assignments = list_by_teacher_in_school(&conn, &school_id, &teacher_id).unwrap();

        assert_eq!(assignments.len(), 1);
        assert_eq!(assignments[0].subject_name, "Mathematics");
    }

    #[test]
    fn teacher_load_counts_assignments_and_distinct_subjects_with_zero_minutes_before_any_schedule()
    {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();
        let other_section =
            section::create(&conn, &school_id, "2026-2027", "8", "Bonifacio").unwrap();
        // Same subject, a different section -- two assignments, one prep.
        create(
            &conn,
            &school_id,
            &teacher_id,
            &other_section.id,
            &subject_id,
        )
        .unwrap();

        let load = teacher_load(&conn, &school_id, &teacher_id).unwrap();

        assert_eq!(load.assignment_count, 2);
        assert_eq!(
            load.distinct_subject_count, 1,
            "same subject in two sections is one preparation"
        );
        assert_eq!(
            load.weekly_instructional_minutes, 0,
            "no schedule_meetings exist yet"
        );
    }

    #[test]
    fn is_assigned_to_section_subject_is_true_once_the_assignment_exists() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();

        assert!(is_assigned_to_section_subject(
            &conn,
            &school_id,
            &teacher_id,
            &section_id,
            &subject_id
        )
        .unwrap());
    }

    #[test]
    fn is_assigned_to_section_subject_is_false_with_no_matching_assignment() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);

        assert!(!is_assigned_to_section_subject(
            &conn,
            &school_id,
            &teacher_id,
            &section_id,
            &subject_id
        )
        .unwrap());
    }

    #[test]
    fn is_assigned_to_section_subject_is_false_for_a_different_subject() {
        let conn = open_test_db();
        let (school_id, teacher_id, section_id, subject_id) = setup(&conn);
        create(&conn, &school_id, &teacher_id, &section_id, &subject_id).unwrap();
        let other_subject = subject::create(&conn, &school_id, "Science").unwrap();

        assert!(!is_assigned_to_section_subject(
            &conn,
            &school_id,
            &teacher_id,
            &section_id,
            &other_subject.id
        )
        .unwrap());
    }
}
