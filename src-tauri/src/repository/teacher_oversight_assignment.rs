//! Teacher Oversight Assignment (Batch 17) -- the permanent Master
//! Teacher review-hierarchy design that supersedes ADR-0073's interim
//! School-Head-as-approver substitution. See
//! `docs/adr/0073-interim-grade-review-pipeline.md`'s superseding
//! addendum and `docs/product/OWNER-DECISIONS-NEEDED.md` item 1.
//!
//! Mirrors `repository::section_advisory` exactly: a half-open-interval,
//! time-scoped, school-scoped assignment table with "at most one active
//! row per teacher" enforced by a real partial unique index
//! (`idx_one_active_overseer_per_teacher`), not an application
//! check-then-act race. `ends_on: None` means still active.

use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{role, user};

/// One span of "this Master Teacher oversees this teacher." Mirrors
/// `section_advisory::SectionAdvisory`'s shape exactly, substituting
/// `master_teacher_user_id`/`teacher_user_id` for `teacher_user_id`/
/// `section_id`.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TeacherOversightAssignment {
    pub id: String,
    pub school_id: String,
    pub master_teacher_user_id: String,
    pub teacher_user_id: String,
    pub starts_on: String,
    pub ends_on: Option<String>,
    pub created_at: String,
}

/// Outcome of [`assign`]. Mirrors
/// `section_advisory::AssignAdviserOutcome`'s established shape: a
/// non-`Assigned` variant means nothing was written -- the caller (Tauri
/// command -> UI) maps each to a distinct message, without exposing SQL
/// or ids.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssignOversightOutcome {
    Assigned {
        assignment: TeacherOversightAssignment,
    },
    UnknownMasterTeacher,
    UnknownTeacher,
    /// `master_teacher_user_id` is a real member of this school but does
    /// not currently hold the `master_teacher` role there -- assigning
    /// them as an overseer anyway would make "who can approve this
    /// teacher's submissions" depend on a person who could lose the
    /// ability to log in as a Master Teacher at all without this
    /// assignment ever being explicitly ended. School Head must grant
    /// the role first (`auth::grant_school_member_role`).
    NotAMasterTeacher,
    /// A person cannot be their own overseer -- this is a structural
    /// guard here (in addition to the self-approval check the decision
    /// pipeline itself performs), so a bad assignment can never be
    /// created in the first place, not merely blocked later at decision
    /// time.
    CannotOverseeSelf,
    /// The teacher already has an open oversight row -- the caller must
    /// end it before assigning a new one. Backed by
    /// `idx_one_active_overseer_per_teacher`, not merely this pre-check
    /// (this app's single `Mutex<Connection>` serializes every write, so
    /// there is no race for the pre-check to lose to -- see
    /// `section_advisory::assign`'s identical reasoning).
    AlreadyHasAnActiveOverseer,
}

/// Assigns `master_teacher_user_id` as the overseer of `teacher_user_id`,
/// effective `starts_on`. `starts_on` is caller-supplied, never defaulted
/// to "today" in this layer -- matching every other date parameter in
/// this codebase (`section_advisory::assign`, `section_membership::enroll`).
pub fn assign(
    conn: &Connection,
    school_id: &str,
    master_teacher_user_id: &str,
    teacher_user_id: &str,
    starts_on: &str,
) -> AppResult<AssignOversightOutcome> {
    if !user::is_member_of_school(conn, teacher_user_id, school_id)? {
        return Ok(AssignOversightOutcome::UnknownTeacher);
    }
    if !user::is_member_of_school(conn, master_teacher_user_id, school_id)? {
        return Ok(AssignOversightOutcome::UnknownMasterTeacher);
    }
    if master_teacher_user_id == teacher_user_id {
        return Ok(AssignOversightOutcome::CannotOverseeSelf);
    }
    if !role::has_any_role(
        conn,
        master_teacher_user_id,
        school_id,
        &[role::MASTER_TEACHER],
    )? {
        return Ok(AssignOversightOutcome::NotAMasterTeacher);
    }
    let has_active: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM teacher_oversight_assignments \
         WHERE school_id = ?1 AND teacher_user_id = ?2 AND ends_on IS NULL)",
        (school_id, teacher_user_id),
        |row| row.get(0),
    )?;
    if has_active {
        return Ok(AssignOversightOutcome::AlreadyHasAnActiveOverseer);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO teacher_oversight_assignments \
            (id, school_id, master_teacher_user_id, teacher_user_id, starts_on) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (
            &id,
            school_id,
            master_teacher_user_id,
            teacher_user_id,
            starts_on,
        ),
    )?;
    let assignment = find_by_id_in_school(conn, school_id, &id)?
        .expect("just-inserted oversight assignment must be readable back");
    Ok(AssignOversightOutcome::Assigned { assignment })
}

/// Outcome of [`end`]. Mirrors `section_advisory::EndAdvisoryOutcome`'s
/// established shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EndOversightOutcome {
    Ended {
        assignment: TeacherOversightAssignment,
    },
    /// No open oversight row with this `(id, school_id, teacher_user_id)`
    /// triple exists -- a forged/cross-school id, an already-ended row,
    /// or a wrong teacher, is indistinguishable from the caller's point
    /// of view; all are refused the same way.
    NotFound,
}

/// Closes the open oversight row `assignment_id` for `teacher_user_id`,
/// effective `ends_on`.
pub fn end(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    assignment_id: &str,
    ends_on: &str,
) -> AppResult<EndOversightOutcome> {
    let updated = conn.execute(
        "UPDATE teacher_oversight_assignments SET ends_on = ?1 \
         WHERE id = ?2 AND school_id = ?3 AND teacher_user_id = ?4 AND ends_on IS NULL",
        (ends_on, assignment_id, school_id, teacher_user_id),
    )?;
    if updated == 0 {
        return Ok(EndOversightOutcome::NotFound);
    }
    let assignment = find_by_id_in_school(conn, school_id, assignment_id)?
        .expect("just-updated oversight assignment must be readable back");
    Ok(EndOversightOutcome::Ended { assignment })
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    assignment_id: &str,
) -> AppResult<Option<TeacherOversightAssignment>> {
    conn.query_row(
        "SELECT id, school_id, master_teacher_user_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM teacher_oversight_assignments WHERE id = ?1 AND school_id = ?2",
        (assignment_id, school_id),
        row_to_assignment,
    )
    .optional_app_result()
}

/// The teacher's currently-assigned Master Teacher on `as_of_date`, if
/// any -- the same half-open-interval comparison
/// `section_advisory::current_adviser_for_section` already established.
/// This is the read `auth`'s grade-submission decision gate is built on:
/// `None` here is the intentional "no MT assigned yet" fallback signal
/// that routes a submission directly to School-Head approval (see
/// `repository::grade_submission`'s two-tier decision functions).
pub fn current_overseer_for_teacher(
    conn: &Connection,
    school_id: &str,
    teacher_user_id: &str,
    as_of_date: &str,
) -> AppResult<Option<TeacherOversightAssignment>> {
    conn.query_row(
        "SELECT id, school_id, master_teacher_user_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM teacher_oversight_assignments \
         WHERE school_id = ?1 AND teacher_user_id = ?2 \
           AND starts_on <= ?3 AND (ends_on IS NULL OR ?3 < ends_on)",
        (school_id, teacher_user_id, as_of_date),
        row_to_assignment,
    )
    .optional_app_result()
}

/// Whether `master_teacher_user_id` is the current overseer of
/// `teacher_user_id` on `as_of_date`.
pub fn is_current_overseer(
    conn: &Connection,
    school_id: &str,
    master_teacher_user_id: &str,
    teacher_user_id: &str,
    as_of_date: &str,
) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM teacher_oversight_assignments \
         WHERE school_id = ?1 AND master_teacher_user_id = ?2 AND teacher_user_id = ?3 \
           AND starts_on <= ?4 AND (ends_on IS NULL OR ?4 < ends_on)",
        (
            school_id,
            master_teacher_user_id,
            teacher_user_id,
            as_of_date,
        ),
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

/// Every teacher currently overseen by `master_teacher_user_id` on
/// `as_of_date`, always constrained to `school_id`. Used to populate a
/// Master Teacher's own review queue/management screen.
pub fn list_teachers_overseen_by(
    conn: &Connection,
    school_id: &str,
    master_teacher_user_id: &str,
    as_of_date: &str,
) -> AppResult<Vec<TeacherOversightAssignment>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, master_teacher_user_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM teacher_oversight_assignments \
         WHERE school_id = ?1 AND master_teacher_user_id = ?2 \
           AND starts_on <= ?3 AND (ends_on IS NULL OR ?3 < ends_on) \
         ORDER BY teacher_user_id",
    )?;
    let rows = stmt.query_map(
        (school_id, master_teacher_user_id, as_of_date),
        row_to_assignment,
    )?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// Every active (and past, for audit purposes) oversight assignment in
/// the school, newest first -- the School-Head-facing management screen
/// this batch's UI checkpoint reads.
pub fn list_for_school(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Vec<TeacherOversightAssignment>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, master_teacher_user_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM teacher_oversight_assignments WHERE school_id = ?1 ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map((school_id,), row_to_assignment)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

fn row_to_assignment(row: &rusqlite::Row) -> rusqlite::Result<TeacherOversightAssignment> {
    Ok(TeacherOversightAssignment {
        id: row.get(0)?,
        school_id: row.get(1)?,
        master_teacher_user_id: row.get(2)?,
        teacher_user_id: row.get(3)?,
        starts_on: row.get(4)?,
        ends_on: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Turns `rusqlite::Error::QueryReturnedNoRows` into `Ok(None)` -- the
/// same "no row = legitimately absent" idiom this codebase always uses,
/// kept local to this module exactly like `section_advisory`'s own copy
/// (no shared helper for this exists in the codebase yet).
trait OptionalAppResult<T> {
    fn optional_app_result(self) -> AppResult<Option<T>>;
}

impl<T> OptionalAppResult<T> for rusqlite::Result<T> {
    fn optional_app_result(self) -> AppResult<Option<T>> {
        match self {
            Ok(value) => Ok(Some(value)),
            Err(rusqlite::Error::QueryReturnedNoRows) => Ok(None),
            Err(err) => Err(err.into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;
    use crate::repository::school;
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        master_teacher_id: String,
        teacher_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let school = school::create(conn, "School A").unwrap();
        let mt = user::create_user(conn, "mt.a", "password", "MT A").unwrap();
        user::add_school_membership(conn, &mt.id, &school.id).unwrap();
        role::grant(conn, &mt.id, &school.id, role::MASTER_TEACHER).unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "A Teacher").unwrap();
        user::add_school_membership(conn, &teacher.id, &school.id).unwrap();
        Fixture {
            school_id: school.id,
            master_teacher_id: mt.id,
            teacher_id: teacher.id,
        }
    }

    #[test]
    fn assigning_an_overseer_makes_them_the_current_overseer() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        assert!(matches!(outcome, AssignOversightOutcome::Assigned { .. }));
        let current =
            current_overseer_for_teacher(&conn, &f.school_id, &f.teacher_id, "2026-08-29")
                .unwrap()
                .unwrap();
        assert_eq!(current.master_teacher_user_id, f.master_teacher_id);
        assert!(current.ends_on.is_none());
    }

    #[test]
    fn assigning_returns_unknown_teacher_for_a_user_not_in_this_school() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            "not-a-real-user",
            "2026-06-01",
        )
        .unwrap();

        assert_eq!(outcome, AssignOversightOutcome::UnknownTeacher);
    }

    #[test]
    fn assigning_returns_unknown_master_teacher_for_a_user_not_in_this_school() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            "not-a-real-user",
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        assert_eq!(outcome, AssignOversightOutcome::UnknownMasterTeacher);
    }

    #[test]
    fn assigning_rejects_a_member_who_does_not_hold_the_master_teacher_role() {
        let conn = open_test_db();
        let f = seed(&conn);
        let not_mt = user::create_user(&conn, "teacher.b", "password", "B Teacher").unwrap();
        user::add_school_membership(&conn, &not_mt.id, &f.school_id).unwrap();

        let outcome = assign(&conn, &f.school_id, &not_mt.id, &f.teacher_id, "2026-06-01").unwrap();

        assert_eq!(outcome, AssignOversightOutcome::NotAMasterTeacher);
    }

    #[test]
    fn assigning_rejects_a_teacher_being_their_own_overseer() {
        let conn = open_test_db();
        let f = seed(&conn);
        // f.master_teacher_id already holds MASTER_TEACHER; overseeing
        // themselves must still be rejected regardless.
        let outcome = assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.master_teacher_id,
            "2026-06-01",
        )
        .unwrap();

        assert_eq!(outcome, AssignOversightOutcome::CannotOverseeSelf);
    }

    #[test]
    fn a_teacher_cannot_have_two_active_overseers_at_once() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let other_mt = user::create_user(&conn, "mt.b", "password", "MT B").unwrap();
        user::add_school_membership(&conn, &other_mt.id, &f.school_id).unwrap();
        role::grant(&conn, &other_mt.id, &f.school_id, role::MASTER_TEACHER).unwrap();

        let outcome = assign(
            &conn,
            &f.school_id,
            &other_mt.id,
            &f.teacher_id,
            "2026-06-02",
        )
        .unwrap();

        assert_eq!(outcome, AssignOversightOutcome::AlreadyHasAnActiveOverseer);
    }

    #[test]
    fn ending_an_assignment_clears_the_current_overseer_and_a_new_one_can_be_assigned() {
        let conn = open_test_db();
        let f = seed(&conn);
        let assigned = match assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap()
        {
            AssignOversightOutcome::Assigned { assignment } => assignment,
            other => panic!("expected Assigned, got {other:?}"),
        };

        let end_outcome = end(
            &conn,
            &f.school_id,
            &f.teacher_id,
            &assigned.id,
            "2026-08-01",
        )
        .unwrap();
        assert!(matches!(end_outcome, EndOversightOutcome::Ended { .. }));

        assert!(
            current_overseer_for_teacher(&conn, &f.school_id, &f.teacher_id, "2026-08-29")
                .unwrap()
                .is_none()
        );
        let other_mt = user::create_user(&conn, "mt.b", "password", "MT B").unwrap();
        user::add_school_membership(&conn, &other_mt.id, &f.school_id).unwrap();
        role::grant(&conn, &other_mt.id, &f.school_id, role::MASTER_TEACHER).unwrap();
        let reassigned = assign(
            &conn,
            &f.school_id,
            &other_mt.id,
            &f.teacher_id,
            "2026-08-01",
        )
        .unwrap();
        assert!(matches!(
            reassigned,
            AssignOversightOutcome::Assigned { .. }
        ));
    }

    #[test]
    fn ending_an_unknown_assignment_id_returns_not_found() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = end(
            &conn,
            &f.school_id,
            &f.teacher_id,
            "not-a-real-id",
            "2026-08-01",
        )
        .unwrap();

        assert_eq!(outcome, EndOversightOutcome::NotFound);
    }

    #[test]
    fn current_overseer_for_teacher_ignores_an_assignment_that_has_not_started_yet() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2027-06-01",
        )
        .unwrap();

        let current =
            current_overseer_for_teacher(&conn, &f.school_id, &f.teacher_id, "2026-08-29").unwrap();

        assert!(current.is_none());
    }

    #[test]
    fn is_current_overseer_is_true_only_for_the_active_overseer() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let other_mt = user::create_user(&conn, "mt.b", "password", "MT B").unwrap();
        user::add_school_membership(&conn, &other_mt.id, &f.school_id).unwrap();
        role::grant(&conn, &other_mt.id, &f.school_id, role::MASTER_TEACHER).unwrap();

        assert!(is_current_overseer(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-08-29"
        )
        .unwrap());
        assert!(!is_current_overseer(
            &conn,
            &f.school_id,
            &other_mt.id,
            &f.teacher_id,
            "2026-08-29"
        )
        .unwrap());
    }

    #[test]
    fn a_second_school_never_sees_the_first_schools_assignment() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        let school_b = school::create(&conn, "School B").unwrap();
        let result =
            current_overseer_for_teacher(&conn, &school_b.id, &f.teacher_id, "2026-08-29").unwrap();

        assert!(result.is_none());
    }

    #[test]
    fn list_teachers_overseen_by_returns_only_active_assignments_in_that_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let other_teacher = user::create_user(&conn, "teacher.c", "password", "C Teacher").unwrap();
        user::add_school_membership(&conn, &other_teacher.id, &f.school_id).unwrap();
        let other_mt = user::create_user(&conn, "mt.b", "password", "MT B").unwrap();
        user::add_school_membership(&conn, &other_mt.id, &f.school_id).unwrap();
        role::grant(&conn, &other_mt.id, &f.school_id, role::MASTER_TEACHER).unwrap();
        assign(
            &conn,
            &f.school_id,
            &other_mt.id,
            &other_teacher.id,
            "2026-06-01",
        )
        .unwrap();

        let overseen =
            list_teachers_overseen_by(&conn, &f.school_id, &f.master_teacher_id, "2026-08-29")
                .unwrap();

        assert_eq!(overseen.len(), 1);
        assert_eq!(overseen[0].teacher_user_id, f.teacher_id);
    }

    #[test]
    fn list_for_school_returns_every_assignment_in_the_school() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.master_teacher_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        let all = list_for_school(&conn, &f.school_id).unwrap();

        assert_eq!(all.len(), 1);
    }
}
