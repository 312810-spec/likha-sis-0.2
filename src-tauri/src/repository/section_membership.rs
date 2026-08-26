use rusqlite::Connection;
use serde::Serialize;
use uuid::Uuid;

use crate::error::AppResult;
use crate::repository::{learner, section};

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SectionMembership {
    pub id: String,
    pub school_id: String,
    pub section_id: String,
    pub learner_id: String,
    pub starts_on: String,
    pub ends_on: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SectionRosterMember {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    /// See `learner::Learner::lrn`/`::sex` -- `None` when not yet recorded
    /// for this learner. Carried through the roster so exports (SF2,
    /// report card) can populate or disclose it per learner, per M17.
    pub lrn: Option<String>,
    pub sex: Option<String>,
}

/// Enrolls a learner into a section as of `starts_on`, transferring them out
/// of any other section they currently hold an open membership in.
///
/// Membership validity is treated as a half-open interval
/// `[starts_on, ends_on)` — `ends_on` is exclusive — specifically so a
/// transfer needs no date arithmetic: closing the old membership with
/// `ends_on = starts_on` of the new one guarantees no day is double-counted
/// and no day is skipped, without depending on a calendar library.
///
/// Returns `Ok(None)` if `section_id` or `learner_id` does not belong to
/// `school_id` — the two "not found" cases are deliberately indistinguishable,
/// matching `learner::find_by_id_in_school`'s convention, so a caller can
/// never use this to probe whether an id exists in another school.
pub fn enroll(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
    starts_on: &str,
) -> AppResult<Option<SectionMembership>> {
    if section::find_by_id_in_school(conn, school_id, section_id)?.is_none() {
        return Ok(None);
    }
    if learner::find_by_id_in_school(conn, school_id, learner_id)?.is_none() {
        return Ok(None);
    }

    let current_open: Option<(String, String)> = conn
        .query_row(
            "SELECT id, section_id FROM section_memberships \
             WHERE learner_id = ?1 AND school_id = ?2 AND ends_on IS NULL",
            (learner_id, school_id),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e),
        })?;

    if let Some((membership_id, current_section_id)) = &current_open {
        if current_section_id == section_id {
            return find_by_id(conn, membership_id);
        }
        conn.execute(
            "UPDATE section_memberships SET ends_on = ?1 WHERE id = ?2",
            (starts_on, membership_id),
        )?;
    }

    let id = Uuid::now_v7().to_string();
    conn.execute(
        "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, section_id, learner_id, starts_on),
    )?;
    Ok(Some(
        find_by_id(conn, &id)?.expect("row just inserted must exist"),
    ))
}

fn find_by_id(conn: &Connection, id: &str) -> AppResult<Option<SectionMembership>> {
    conn.query_row(
        "SELECT id, school_id, section_id, learner_id, starts_on, ends_on, created_at \
         FROM section_memberships WHERE id = ?1",
        [id],
        row_to_membership,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
}

/// The roster of learners with an active membership in `section_id` on
/// `as_of_date`. Scoped directly by `school_id` in the query (not merely
/// implied by `section_id` belonging to that school) so a cross-school
/// section reference cannot leak learners even if one were ever
/// constructed incorrectly upstream.
pub fn roster_for_section(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<Vec<SectionRosterMember>> {
    let mut stmt = conn.prepare(
        "SELECT l.id, l.given_name, l.family_name, l.lrn, l.sex \
         FROM learners l \
         JOIN section_memberships sm ON sm.learner_id = l.id \
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 \
           AND sm.starts_on <= ?3 \
           AND (sm.ends_on IS NULL OR ?3 < sm.ends_on) \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map((section_id, school_id, as_of_date), |row| {
        Ok(SectionRosterMember {
            learner_id: row.get(0)?,
            given_name: row.get(1)?,
            family_name: row.get(2)?,
            lrn: row.get(3)?,
            sex: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The distinct set of learners who held any active membership in
/// `section_id` overlapping `[start_date, end_date]` — used to build a
/// monthly grid's row set, since a learner transferred mid-month should
/// still appear for the days they were enrolled. Overlap, not exact-date
/// matching, so `roster_for_section(as_of)` stays the source of truth for
/// "who is on the roster right now" and this is only for historical range
/// queries.
pub fn roster_for_section_over_range(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    start_date: &str,
    end_date: &str,
) -> AppResult<Vec<SectionRosterMember>> {
    let mut stmt = conn.prepare(
        "SELECT DISTINCT l.id, l.given_name, l.family_name, l.lrn, l.sex \
         FROM learners l \
         JOIN section_memberships sm ON sm.learner_id = l.id \
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 \
           AND sm.starts_on <= ?4 AND (sm.ends_on IS NULL OR ?3 < sm.ends_on) \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map((section_id, school_id, start_date, end_date), |row| {
        Ok(SectionRosterMember {
            learner_id: row.get(0)?,
            given_name: row.get(1)?,
            family_name: row.get(2)?,
            lrn: row.get(3)?,
            sex: row.get(4)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// True if `learner_id` has an active membership in `section_id` on
/// `as_of_date`, scoped by `school_id`. Used to reject attendance for a
/// learner who is not (or is no longer) on that section's roster for that
/// date, without a second round trip through `roster_for_section`.
pub fn is_active_member(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
    as_of_date: &str,
) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM section_memberships \
         WHERE section_id = ?1 AND school_id = ?2 AND learner_id = ?3 \
           AND starts_on <= ?4 AND (ends_on IS NULL OR ?4 < ends_on)",
        (section_id, school_id, learner_id, as_of_date),
        |row| row.get(0),
    )?;
    Ok(count > 0)
}

fn row_to_membership(row: &rusqlite::Row) -> rusqlite::Result<SectionMembership> {
    Ok(SectionMembership {
        id: row.get(0)?,
        school_id: row.get(1)?,
        section_id: row.get(2)?,
        learner_id: row.get(3)?,
        starts_on: row.get(4)?,
        ends_on: row.get(5)?,
        created_at: row.get(6)?,
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

    fn setup(conn: &Connection) -> (String, String) {
        let s = school::create(conn, "Rizal Elementary").unwrap();
        let sec = section::create(conn, &s.id, "2025-2026", "7", "Mabini").unwrap();
        (s.id, sec.id)
    }

    #[test]
    fn enroll_then_roster_includes_the_learner() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .expect("enroll should succeed");
        let roster = roster_for_section(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].learner_id, l.id);
    }

    #[test]
    fn roster_excludes_the_learner_before_their_starts_on() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01").unwrap();

        let roster = roster_for_section(&conn, &school_id, &section_id, "2025-07-01").unwrap();

        assert_eq!(roster.len(), 0);
    }

    #[test]
    fn transfer_closes_the_old_membership_and_opens_a_new_one() {
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01").unwrap();

        enroll(&conn, &school_id, &section_b.id, &l.id, "2025-10-01").unwrap();

        let roster_a_before =
            roster_for_section(&conn, &school_id, &section_a, "2025-09-01").unwrap();
        let roster_a_after =
            roster_for_section(&conn, &school_id, &section_a, "2025-10-01").unwrap();
        let roster_b_after =
            roster_for_section(&conn, &school_id, &section_b.id, "2025-10-01").unwrap();

        assert_eq!(
            roster_a_before.len(),
            1,
            "learner was still in section A before the transfer"
        );
        assert_eq!(
            roster_a_after.len(),
            0,
            "learner must not double-count in section A on the transfer day"
        );
        assert_eq!(
            roster_b_after.len(),
            1,
            "learner is in section B from the transfer day onward"
        );
    }

    #[test]
    fn re_enrolling_into_the_same_section_is_idempotent() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let first = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let second = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        assert_eq!(
            first.id, second.id,
            "must not create a duplicate open membership"
        );
    }

    #[test]
    fn enroll_rejects_a_learner_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let l = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();

        let result = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01").unwrap();

        assert_eq!(
            result, None,
            "cross-school enrollment must be rejected, not just hidden"
        );
    }

    #[test]
    fn enroll_rejects_a_section_from_a_different_school() {
        let conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let result = enroll(&conn, &school_id, &other_section.id, &l.id, "2025-08-01").unwrap();

        assert_eq!(result, None);
    }

    #[test]
    fn is_active_member_reflects_roster_membership() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01").unwrap();

        assert!(is_active_member(&conn, &school_id, &section_id, &l.id, "2025-08-15").unwrap());
        assert!(!is_active_member(&conn, &school_id, &section_id, &l.id, "2025-07-01").unwrap());
    }
}
