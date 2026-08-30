use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{section, user};

/// One span of "this teacher advised this section" -- see
/// `docs/adr/0056-section-advisory-foundation.md`. Mirrors
/// `section_membership::SectionMembership`'s half-open-interval shape
/// exactly: `ends_on: None` means still active.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SectionAdvisory {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub teacher_user_id: String,
    pub starts_on: String,
    pub ends_on: Option<String>,
    pub created_at: String,
}

/// Outcome of [`assign`]. A non-`Assigned` variant means nothing was
/// written -- the caller (Tauri command -> UI) maps each to a distinct
/// message, without exposing SQL or ids. Mirrors
/// `schedule_meeting::CreateMeetingOutcome`'s established shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum AssignAdviserOutcome {
    Assigned {
        advisory: SectionAdvisory,
    },
    UnknownSection,
    UnknownTeacher,
    /// The section already has an open advisory row -- the caller must
    /// end it (`end`) before assigning a new one. Backed by
    /// `idx_one_active_adviser_per_section`, not merely this pre-check
    /// (this app's single `Mutex<Connection>` serializes every write, so
    /// there is no race for the pre-check to lose to -- see
    /// `schedule_meeting::create`'s identical reasoning).
    AlreadyHasAnActiveAdviser,
}

/// Assigns `teacher_user_id` as the adviser of `section_id`, effective
/// `starts_on`. `starts_on` is caller-supplied, never defaulted to
/// "today" in this layer -- matching every other date parameter in this
/// codebase (`section_membership::enroll`, `open_or_get_session`).
pub fn assign(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    teacher_user_id: &str,
    starts_on: &str,
) -> AppResult<AssignAdviserOutcome> {
    if section::find_by_id_in_school(conn, school_id, section_id)?.is_none() {
        return Ok(AssignAdviserOutcome::UnknownSection);
    }
    if !user::is_member_of_school(conn, teacher_user_id, school_id)? {
        return Ok(AssignAdviserOutcome::UnknownTeacher);
    }
    let has_active: bool = conn.query_row(
        "SELECT EXISTS(SELECT 1 FROM section_advisories \
         WHERE school_id = ?1 AND section_id = ?2 AND ends_on IS NULL)",
        (school_id, section_id),
        |row| row.get(0),
    )?;
    if has_active {
        return Ok(AssignAdviserOutcome::AlreadyHasAnActiveAdviser);
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO section_advisories (id, school_id, section_id, teacher_user_id, starts_on) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, section_id, teacher_user_id, starts_on),
    )?;
    let advisory = find_by_id_in_school(conn, school_id, &id)?
        .expect("just-inserted advisory must be readable back");
    Ok(AssignAdviserOutcome::Assigned { advisory })
}

/// Outcome of [`end`]. Mirrors
/// `section_membership::EndMembershipOutcome`'s established shape.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EndAdvisoryOutcome {
    Ended {
        advisory: SectionAdvisory,
    },
    /// No open advisory with this `(id, school_id, section_id)` triple
    /// exists -- a forged/cross-school id, an already-ended row, or a
    /// wrong section, is indistinguishable from the caller's point of
    /// view; all are refused the same way.
    NotFound,
}

/// Closes the open advisory row `advisory_id` for `section_id`, effective
/// `ends_on`.
pub fn end(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    advisory_id: &str,
    ends_on: &str,
) -> AppResult<EndAdvisoryOutcome> {
    let updated = conn.execute(
        "UPDATE section_advisories SET ends_on = ?1 \
         WHERE id = ?2 AND school_id = ?3 AND section_id = ?4 AND ends_on IS NULL",
        (ends_on, advisory_id, school_id, section_id),
    )?;
    if updated == 0 {
        return Ok(EndAdvisoryOutcome::NotFound);
    }
    let advisory = find_by_id_in_school(conn, school_id, advisory_id)?
        .expect("just-updated advisory must be readable back");
    Ok(EndAdvisoryOutcome::Ended { advisory })
}

pub fn find_by_id_in_school(
    conn: &Connection,
    school_id: &str,
    advisory_id: &str,
) -> AppResult<Option<SectionAdvisory>> {
    conn.query_row(
        "SELECT id, school_id, section_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM section_advisories WHERE id = ?1 AND school_id = ?2",
        (advisory_id, school_id),
        row_to_advisory,
    )
    .optional_app_result()
}

/// The section's adviser active on `as_of_date`, if any -- the same
/// half-open-interval comparison `section_membership::is_active_member`
/// already established (`starts_on <= as_of_date AND (ends_on IS NULL OR
/// as_of_date < ends_on)`), so a future-dated assignment is not treated
/// as current before it takes effect.
pub fn current_adviser_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<Option<SectionAdvisory>> {
    conn.query_row(
        "SELECT id, school_id, section_id, teacher_user_id, starts_on, ends_on, created_at \
         FROM section_advisories \
         WHERE school_id = ?1 AND section_id = ?2 \
           AND starts_on <= ?3 AND (ends_on IS NULL OR ?3 < ends_on)",
        (school_id, section_id, as_of_date),
        row_to_advisory,
    )
    .optional_app_result()
}

/// Whether `teacher_user_id` is the adviser of `section_id` on
/// `as_of_date` -- the read this domain's own authorization gate,
/// `auth::authorize_adviser_of_section`, is built on.
pub fn is_current_adviser(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    teacher_user_id: &str,
    as_of_date: &str,
) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM section_advisories \
         WHERE school_id = ?1 AND section_id = ?2 AND teacher_user_id = ?3 \
           AND starts_on <= ?4 AND (ends_on IS NULL OR ?4 < ends_on)",
        (school_id, section_id, teacher_user_id, as_of_date),
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn row_to_advisory(row: &rusqlite::Row) -> rusqlite::Result<SectionAdvisory> {
    Ok(SectionAdvisory {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        teacher_user_id: row.get(3)?,
        starts_on: row.get(4)?,
        ends_on: row.get(5)?,
        created_at: row.get(6)?,
    })
}

/// Turns `rusqlite::Error::QueryReturnedNoRows` into `Ok(None)` -- the
/// same "no row = legitimately absent" idiom this codebase always uses
/// for a single-row lookup, kept local to this module rather than
/// importing a shared helper (no existing shared helper for this exists
/// in the codebase; each module currently repeats the same three-line
/// match, e.g. `teaching_assignment::find_by_id_in_school`).
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
    use crate::repository::{school, section, user};
    use std::path::Path;

    fn open_test_db() -> Connection {
        db::open(Path::new(":memory:"), &crate::crypto::generate_key()).unwrap()
    }

    struct Fixture {
        school_id: String,
        section_id: String,
        teacher_id: String,
    }

    fn seed(conn: &Connection) -> Fixture {
        let school = school::create(conn, "School A").unwrap();
        let sec = section::create(conn, &school.id, "2026-2027", "7", "Mabini").unwrap();
        let teacher = user::create_user(conn, "teacher.a", "password", "A Teacher").unwrap();
        user::add_school_membership(conn, &teacher.id, &school.id).unwrap();
        Fixture {
            school_id: school.id,
            section_id: sec.id,
            teacher_id: teacher.id,
        }
    }

    #[test]
    fn assigning_an_adviser_makes_them_the_current_adviser() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        assert!(matches!(outcome, AssignAdviserOutcome::Assigned { .. }));
        let current = current_adviser_for_section(&conn, &f.school_id, &f.section_id, "2026-08-29")
            .unwrap()
            .unwrap();
        assert_eq!(current.teacher_user_id, f.teacher_id);
        assert!(current.ends_on.is_none());
    }

    #[test]
    fn assigning_returns_unknown_section_for_a_section_that_does_not_exist_in_this_school() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            "not-a-real-section",
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        assert_eq!(outcome, AssignAdviserOutcome::UnknownSection);
    }

    #[test]
    fn assigning_returns_unknown_teacher_for_a_user_not_in_this_school() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = assign(
            &conn,
            &f.school_id,
            &f.section_id,
            "not-a-real-user",
            "2026-06-01",
        )
        .unwrap();

        assert_eq!(outcome, AssignAdviserOutcome::UnknownTeacher);
    }

    #[test]
    fn a_section_cannot_have_two_active_advisers_at_once() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let other = user::create_user(&conn, "teacher.b", "password", "B Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();

        let outcome = assign(&conn, &f.school_id, &f.section_id, &other.id, "2026-06-02").unwrap();

        assert_eq!(outcome, AssignAdviserOutcome::AlreadyHasAnActiveAdviser);
    }

    #[test]
    fn ending_an_advisory_clears_the_current_adviser_and_a_new_one_can_be_assigned() {
        let conn = open_test_db();
        let f = seed(&conn);
        let assigned = match assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap()
        {
            AssignAdviserOutcome::Assigned { advisory } => advisory,
            other => panic!("expected Assigned, got {other:?}"),
        };

        let end_outcome = end(
            &conn,
            &f.school_id,
            &f.section_id,
            &assigned.id,
            "2026-08-01",
        )
        .unwrap();
        assert!(matches!(end_outcome, EndAdvisoryOutcome::Ended { .. }));

        assert!(
            current_adviser_for_section(&conn, &f.school_id, &f.section_id, "2026-08-29")
                .unwrap()
                .is_none()
        );
        let other = user::create_user(&conn, "teacher.b", "password", "B Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();
        let reassigned =
            assign(&conn, &f.school_id, &f.section_id, &other.id, "2026-08-01").unwrap();
        assert!(matches!(reassigned, AssignAdviserOutcome::Assigned { .. }));
    }

    #[test]
    fn ending_an_unknown_advisory_id_returns_not_found() {
        let conn = open_test_db();
        let f = seed(&conn);

        let outcome = end(
            &conn,
            &f.school_id,
            &f.section_id,
            "not-a-real-id",
            "2026-08-01",
        )
        .unwrap();

        assert_eq!(outcome, EndAdvisoryOutcome::NotFound);
    }

    #[test]
    fn current_adviser_for_section_ignores_an_advisory_that_has_not_started_yet() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2027-06-01",
        )
        .unwrap();

        let current =
            current_adviser_for_section(&conn, &f.school_id, &f.section_id, "2026-08-29").unwrap();

        assert!(current.is_none());
    }

    #[test]
    fn is_current_adviser_is_true_only_for_the_active_adviser() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();
        let other = user::create_user(&conn, "teacher.b", "password", "B Teacher").unwrap();
        user::add_school_membership(&conn, &other.id, &f.school_id).unwrap();

        assert!(is_current_adviser(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-08-29"
        )
        .unwrap());
        assert!(
            !is_current_adviser(&conn, &f.school_id, &f.section_id, &other.id, "2026-08-29")
                .unwrap()
        );
    }

    #[test]
    fn a_second_school_never_sees_the_first_schools_advisory() {
        let conn = open_test_db();
        let f = seed(&conn);
        assign(
            &conn,
            &f.school_id,
            &f.section_id,
            &f.teacher_id,
            "2026-06-01",
        )
        .unwrap();

        let school_b = school::create(&conn, "School B").unwrap();
        let result =
            current_adviser_for_section(&conn, &school_b.id, &f.section_id, "2026-08-29").unwrap();

        assert!(result.is_none());
    }
}
