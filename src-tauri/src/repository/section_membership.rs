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

/// The Section Roster screen's row projection: identity plus the day this
/// learner's *current* placement in the section began. Deliberately a
/// separate struct from `SectionRosterMember` (which `formgen::sf1` and the
/// attendance-adjacent callers share) so adding `starts_on` for the roster
/// UI does not perturb those queries — this codebase already keeps one
/// projection per use case (`AttendanceRosterEntry`, `LearnerScoreRosterEntry`).
/// Only what the roster screen renders: `sex` is intentionally *not* here
/// (it is not shown on a "who is in my class" view); the SF2/report-card
/// path uses `SectionRosterMember`, which carries it.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CurrentRosterMember {
    /// `section_memberships.id` of *this* open membership row. Carried so the
    /// Section Roster screen can name the exact row a transfer/end acts on —
    /// `end_membership`/`transfer_membership` target this id and fail (rather
    /// than silently mutate "whatever is open") if it is no longer current,
    /// which is how a stale roster tab is made safe (Wave 2P).
    pub membership_id: String,
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    /// `section_memberships.starts_on` for the open membership — the start
    /// of the half-open interval `[starts_on, ends_on)`; see `enroll`.
    pub starts_on: String,
}

/// Outcome of [`end_membership`]. A non-`Ended` variant means nothing was
/// written — the caller (Tauri command → UI) maps each to a distinct
/// teacher-facing message and recovery, without exposing SQL or ids.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EndMembershipOutcome {
    /// The membership was closed; `membership` is the row as persisted, now
    /// carrying `ends_on = effective_on`.
    Ended { membership: SectionMembership },
    /// No membership with this `(id, school_id, learner_id)` triple exists —
    /// a forged/cross-school id, or a wrong learner, is indistinguishable
    /// from a genuinely unknown id on purpose.
    NotFound,
    /// The membership exists but is already closed (`ends_on` set) — the
    /// roster the caller acted from is stale. No-op.
    NotCurrent,
    /// `effective_on` precedes the membership's `starts_on`; a membership may
    /// not end before it began. `[starts_on, starts_on)` (same-day end) is
    /// allowed — that is a legal empty interval, matching `enroll`'s
    /// same-day transfer.
    InvalidEffectiveDate,
}

/// Outcome of [`transfer_membership`]. As with [`EndMembershipOutcome`], a
/// non-`Transferred` variant means the transaction wrote nothing.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TransferOutcome {
    /// The old membership was closed with `ends_on = effective_on` and a new
    /// open membership in `to_section_id` was opened with
    /// `starts_on = effective_on`, atomically. `membership` is the new row.
    Transferred { membership: SectionMembership },
    /// No membership with this `(from_membership_id, school_id, learner_id)`
    /// triple exists.
    MembershipNotFound,
    /// The source membership exists but is already closed — stale roster.
    NotCurrent,
    /// `to_section_id` does not resolve within the caller's school.
    DestinationNotFound,
    /// `to_section_id` is the section the learner is already in. Unlike
    /// `enroll`, which treats "enroll into the section you're already in" as
    /// an idempotent no-op (it is a bulk create-and-place primitive where a
    /// repeat is benign), an explicit teacher-initiated *transfer* to the
    /// current section is a mistake worth surfacing, so it is its own
    /// outcome rather than a silent success.
    SameSection,
    /// `effective_on` precedes the source membership's `starts_on`.
    InvalidEffectiveDate,
}

/// A dependency-free `YYYY-MM-DD` shape check. The repository layer stores
/// dates as opaque ISO strings and SQLite compares them lexically, so a
/// malformed `effective_on` arriving straight over IPC — bypassing the
/// TypeScript `DATE_PATTERN` guard in `SectionApplicationService` — could
/// otherwise be persisted and then sort incorrectly against `starts_on` /
/// `ends_on`, silently misplacing a learner on rosters and attendance.
/// This is a shape guard, not a calendar: it rejects the wrong length,
/// missing dashes, non-digits, and impossible month/day numbers, which is
/// enough to keep the lexical comparisons meaningful without adding a
/// date crate. Flagged by the Wave 2P security and reliability reviews;
/// `enroll` has the same latent gap and is tracked in
/// `docs/VERIFICATION-DEBT.md`.
fn is_iso_date(value: &str) -> bool {
    let bytes = value.as_bytes();
    if bytes.len() != 10 || bytes[4] != b'-' || bytes[7] != b'-' {
        return false;
    }
    let all_digits = |range: std::ops::Range<usize>| bytes[range].iter().all(u8::is_ascii_digit);
    if !(all_digits(0..4) && all_digits(5..7) && all_digits(8..10)) {
        return false;
    }
    let month: u32 = value[5..7].parse().unwrap_or(0);
    let day: u32 = value[8..10].parse().unwrap_or(0);
    (1..=12).contains(&month) && (1..=31).contains(&day)
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

/// Ends one *specific* open membership, effective `effective_on`, by setting
/// its `ends_on` — the row is never deleted, so the placement history stays
/// intact (`list_by_learner_in_school` still returns it) and SF-form exports
/// can still account for the days the learner was enrolled.
///
/// Unlike [`enroll`], which closes "whatever membership is currently open"
/// for the learner, this targets `membership_id` exactly and *fails* —
/// returning [`EndMembershipOutcome::NotCurrent`] — if that row is no longer
/// the open one. That is deliberate: the Section Roster screen may have been
/// left open while the placement changed in another tab/session, and acting
/// on a stale row must be refused, not applied to a different membership.
///
/// The `(id, school_id, learner_id)` triple is matched together, so a
/// forged id, another school's membership id, or the wrong learner all yield
/// [`EndMembershipOutcome::NotFound`] — indistinguishable from an unknown
/// id, matching this module's cross-school-probe-resistance convention.
///
/// Runs in a transaction; the closing `UPDATE` is guarded by
/// `ends_on IS NULL` and its affected-row count is checked, so two
/// concurrent submissions cannot both succeed.
pub fn end_membership(
    conn: &mut Connection,
    school_id: &str,
    learner_id: &str,
    membership_id: &str,
    effective_on: &str,
) -> AppResult<EndMembershipOutcome> {
    if !is_iso_date(effective_on) {
        return Ok(EndMembershipOutcome::InvalidEffectiveDate);
    }

    let tx = conn.transaction()?;

    // Defense in depth, matching `enroll`: a `section_memberships` row that
    // matched the `(id, school_id, learner_id)` triple normally guarantees
    // the learner belongs to this school, but a hand-forged row could pair
    // this school with a foreign learner. Constrain the learner too, and
    // report it as an ordinary `NotFound`.
    if learner::find_by_id_in_school(&tx, school_id, learner_id)?.is_none() {
        return Ok(EndMembershipOutcome::NotFound);
    }

    let existing: Option<(String, Option<String>)> = tx
        .query_row(
            "SELECT starts_on, ends_on FROM section_memberships \
             WHERE id = ?1 AND school_id = ?2 AND learner_id = ?3",
            (membership_id, school_id, learner_id),
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e),
        })?;

    let (starts_on, ends_on) = match existing {
        None => return Ok(EndMembershipOutcome::NotFound),
        Some(row) => row,
    };
    if ends_on.is_some() {
        return Ok(EndMembershipOutcome::NotCurrent);
    }
    if effective_on < starts_on.as_str() {
        return Ok(EndMembershipOutcome::InvalidEffectiveDate);
    }

    let affected = tx.execute(
        "UPDATE section_memberships SET ends_on = ?1 WHERE id = ?2 AND ends_on IS NULL",
        (effective_on, membership_id),
    )?;
    if affected != 1 {
        // Lost a race: the row was closed between the SELECT and here.
        return Ok(EndMembershipOutcome::NotCurrent);
    }

    let membership = find_by_id(&tx, membership_id)?.expect("row just updated must exist");
    tx.commit()?;
    Ok(EndMembershipOutcome::Ended { membership })
}

/// Moves one *specific* open membership to `to_section_id`, effective
/// `effective_on`, atomically: the source membership is closed with
/// `ends_on = effective_on` and a new open membership in the destination is
/// opened with `starts_on = effective_on`. Because validity is the half-open
/// interval `[starts_on, ends_on)`, the learner is counted in exactly one
/// section on every day — no gap, no overlap, no date arithmetic.
///
/// Like [`end_membership`], this targets `from_membership_id` exactly and
/// returns [`TransferOutcome::NotCurrent`] (writing nothing) if that row is
/// no longer open, so a stale roster tab cannot move a membership that has
/// already changed. A double submission therefore produces exactly one
/// transfer: the second call finds the source already closed.
///
/// The whole sequence — the source `SELECT`, the destination existence
/// check, the closing `UPDATE` (guarded by `ends_on IS NULL`, affected-row
/// count checked), and the destination `INSERT` — runs in one transaction,
/// so a failure at any step leaves the learner in their original section.
/// The partial unique index `idx_one_active_membership_per_learner`
/// structurally backstops the one-open-membership invariant.
#[allow(clippy::too_many_arguments)]
pub fn transfer_membership(
    conn: &mut Connection,
    school_id: &str,
    learner_id: &str,
    from_membership_id: &str,
    to_section_id: &str,
    effective_on: &str,
) -> AppResult<TransferOutcome> {
    if !is_iso_date(effective_on) {
        return Ok(TransferOutcome::InvalidEffectiveDate);
    }

    let tx = conn.transaction()?;

    // Defense in depth, matching `enroll`: constrain the learner to this
    // school independently of the membership row, so a forged row pairing
    // this school with a foreign learner cannot be moved. Reported as an
    // ordinary `MembershipNotFound`.
    if learner::find_by_id_in_school(&tx, school_id, learner_id)?.is_none() {
        return Ok(TransferOutcome::MembershipNotFound);
    }

    let existing: Option<(String, String, Option<String>)> = tx
        .query_row(
            "SELECT section_id, starts_on, ends_on FROM section_memberships \
             WHERE id = ?1 AND school_id = ?2 AND learner_id = ?3",
            (from_membership_id, school_id, learner_id),
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e),
        })?;

    let (from_section_id, starts_on, ends_on) = match existing {
        None => return Ok(TransferOutcome::MembershipNotFound),
        Some(row) => row,
    };
    if ends_on.is_some() {
        return Ok(TransferOutcome::NotCurrent);
    }
    if section::find_by_id_in_school(&tx, school_id, to_section_id)?.is_none() {
        return Ok(TransferOutcome::DestinationNotFound);
    }
    if from_section_id == to_section_id {
        return Ok(TransferOutcome::SameSection);
    }
    if effective_on < starts_on.as_str() {
        return Ok(TransferOutcome::InvalidEffectiveDate);
    }

    let affected = tx.execute(
        "UPDATE section_memberships SET ends_on = ?1 WHERE id = ?2 AND ends_on IS NULL",
        (effective_on, from_membership_id),
    )?;
    if affected != 1 {
        return Ok(TransferOutcome::NotCurrent);
    }

    let new_id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&new_id, school_id, to_section_id, learner_id, effective_on),
    )?;

    let membership = find_by_id(&tx, &new_id)?.expect("row just inserted must exist");
    tx.commit()?;
    Ok(TransferOutcome::Transferred { membership })
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

/// The roster of learners whose placement in `section_id` is open on
/// `as_of_date` — i.e. the half-open interval `[starts_on, ends_on)`
/// contains that date, the same "current member" definition
/// `idx_one_active_membership_per_learner` and `enroll` already use
/// (ADR-0042). A learner whose `starts_on` is still in the future, or whose
/// membership has already ended (`ends_on <= as_of_date`), is deliberately
/// absent — this is not a bug, it is the domain's temporal model, and the
/// Section Roster screen shows the "as of" date so a teacher can see why.
///
/// School scope is enforced in the query itself — `section_memberships` is
/// filtered by `school_id` AND `section_id` together, and the joined
/// `learners` row is independently constrained to the same `school_id` —
/// so a `section_id` (or a corrupted membership row) belonging to another
/// school yields an empty roster rather than leaking rows. It never depends
/// on the caller having pre-checked that the section belongs to the school.
///
/// One indexed JOIN, ordered `family_name, given_name` — the alphabetical
/// convention `export::report_card` / `formgen::sf1` already use — with no
/// per-learner follow-up query.
pub fn current_roster(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    as_of_date: &str,
) -> AppResult<Vec<CurrentRosterMember>> {
    let mut stmt = conn.prepare(
        "SELECT sm.id, l.id, l.given_name, l.family_name, l.lrn, sm.starts_on \
         FROM learners l \
         JOIN section_memberships sm ON sm.learner_id = l.id \
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 AND l.school_id = ?2 \
           AND sm.starts_on <= ?3 \
           AND (sm.ends_on IS NULL OR ?3 < sm.ends_on) \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map((section_id, school_id, as_of_date), |row| {
        Ok(CurrentRosterMember {
            membership_id: row.get(0)?,
            learner_id: row.get(1)?,
            given_name: row.get(2)?,
            family_name: row.get(3)?,
            lrn: row.get(4)?,
            starts_on: row.get(5)?,
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

/// The full placement history for `learner_id` -- every membership span,
/// closed or still open -- ordered oldest first. Scoped by `school_id` in
/// the query itself (not merely implied by `learner_id` belonging to that
/// school) so a caller supplying the wrong `school_id` can never see
/// another school's real enrollment history. This is the "Enrollment
/// history" view of `section_memberships`; see
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
pub fn list_by_learner_in_school(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Vec<SectionMembership>> {
    let mut stmt = conn.prepare(
        "SELECT id, school_id, section_id, learner_id, starts_on, ends_on, created_at \
         FROM section_memberships \
         WHERE school_id = ?1 AND learner_id = ?2 \
         ORDER BY starts_on ASC",
    )?;
    let rows = stmt.query_map((school_id, learner_id), row_to_membership)?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The learner's current (still-open) placement, if any -- derived from the
/// same `ends_on IS NULL` condition `idx_one_active_membership_per_learner`
/// already enforces as a database invariant, never a separate "is current"
/// flag (see ADR-0042). `None` both when the learner has never been
/// enrolled and when they belong to a different school -- the two are
/// deliberately indistinguishable, matching `learner::find_by_id_in_school`'s
/// convention.
pub fn current_membership_for_learner_in_school(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
) -> AppResult<Option<SectionMembership>> {
    conn.query_row(
        "SELECT id, school_id, section_id, learner_id, starts_on, ends_on, created_at \
         FROM section_memberships \
         WHERE school_id = ?1 AND learner_id = ?2 AND ends_on IS NULL",
        (school_id, learner_id),
        row_to_membership,
    )
    .map(Some)
    .or_else(|e| match e {
        rusqlite::Error::QueryReturnedNoRows => Ok(None),
        e => Err(e.into()),
    })
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

    #[test]
    fn list_by_learner_in_school_returns_full_history_in_start_order() {
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "8", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01").unwrap();
        enroll(&conn, &school_id, &section_b.id, &l.id, "2026-06-01").unwrap();

        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();

        assert_eq!(
            history.len(),
            2,
            "both the closed and open membership must appear"
        );
        assert_eq!(history[0].section_id, section_a);
        assert_eq!(history[0].ends_on.as_deref(), Some("2026-06-01"));
        assert_eq!(history[1].section_id, section_b.id);
        assert_eq!(history[1].ends_on, None, "the current placement stays open");
    }

    #[test]
    fn list_by_learner_in_school_returns_empty_when_queried_with_the_wrong_school_id() {
        let conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        // A real, valid membership -- but scoped to `other_school`, not the
        // `school_id` this test queries with.
        enroll(
            &conn,
            &other_school.id,
            &other_section.id,
            &l.id,
            "2025-08-01",
        )
        .unwrap()
        .expect("enroll within the learner's own school must succeed");

        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();

        assert_eq!(
            history.len(),
            0,
            "a caller supplying the wrong school_id must never see another school's real enrollment history"
        );
    }

    #[test]
    fn current_membership_for_learner_in_school_returns_only_the_open_row() {
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "8", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01").unwrap();
        enroll(&conn, &school_id, &section_b.id, &l.id, "2026-06-01").unwrap();

        let current = current_membership_for_learner_in_school(&conn, &school_id, &l.id).unwrap();

        assert_eq!(current.unwrap().section_id, section_b.id);
    }

    #[test]
    fn current_membership_for_learner_in_school_is_none_when_never_enrolled() {
        let conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let current = current_membership_for_learner_in_school(&conn, &school_id, &l.id).unwrap();

        assert_eq!(current, None);
    }

    // --- Wave 2O: current_roster (Section Roster screen projection) ---

    #[test]
    fn current_roster_includes_an_open_member_with_their_enrollment_date() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(
            &conn,
            &school_id,
            "Ana",
            "Cruz",
            Some("123456789012"),
            Some("F"),
        )
        .unwrap();
        enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01").unwrap();

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(roster.len(), 1);
        assert_eq!(roster[0].learner_id, l.id);
        assert_eq!(roster[0].family_name, "Cruz");
        assert_eq!(roster[0].lrn.as_deref(), Some("123456789012"));
        assert_eq!(
            roster[0].starts_on, "2025-08-01",
            "the roster carries the day this placement began"
        );
    }

    #[test]
    fn current_roster_join_independently_constrains_the_learner_to_the_same_school() {
        // Defense in depth: even a hand-crafted membership row pointing a
        // foreign-school learner at this section (something `enroll` itself
        // refuses to create) must not leak that learner, because the query
        // constrains `l.school_id` too, not only `sm.*`.
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_id, &foreign.id),
        )
        .unwrap();

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "a learner belonging to another school must never appear, even via a forged membership row"
        );
    }

    #[test]
    fn current_roster_excludes_a_future_dated_enrollment() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        // Enrolled to start next month; as-of "today" they are not yet a member.
        enroll(&conn, &school_id, &section_id, &l.id, "2025-09-01").unwrap();

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "a placement that has not started yet is not on the current roster"
        );
    }

    #[test]
    fn current_roster_excludes_a_membership_that_has_already_ended() {
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01").unwrap();
        // Transfer out of section A on 2025-10-01 (closes A with ends_on = that day).
        enroll(&conn, &school_id, &section_b.id, &l.id, "2025-10-01").unwrap();

        let roster = current_roster(&conn, &school_id, &section_a, "2025-10-01").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "on the transfer day the learner is no longer a current member of section A"
        );
    }

    #[test]
    fn current_roster_is_empty_for_a_section_with_no_members() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "an empty section is a normal, non-error state"
        );
    }

    #[test]
    fn current_roster_returns_empty_for_a_section_belonging_to_another_school() {
        let conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        enroll(
            &conn,
            &other_school.id,
            &other_section.id,
            &l.id,
            "2025-08-01",
        )
        .unwrap()
        .expect("enroll within the section's own school must succeed");

        // Query the other school's section id, but scoped to `school_id`.
        let roster = current_roster(&conn, &school_id, &other_section.id, "2025-08-15").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "knowing another school's section id must never leak its roster"
        );
    }

    #[test]
    fn current_roster_is_ordered_by_family_then_given_name() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let bautista = learner::create(&conn, &school_id, "Ana", "Bautista", None, None).unwrap();
        let cruz_bea = learner::create(&conn, &school_id, "Bea", "Cruz", None, None).unwrap();
        let cruz_ana = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        for id in [&cruz_bea.id, &bautista.id, &cruz_ana.id] {
            enroll(&conn, &school_id, &section_id, id, "2025-08-01").unwrap();
        }

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        let order: Vec<_> = roster.iter().map(|m| m.learner_id.clone()).collect();
        assert_eq!(
            order,
            vec![bautista.id, cruz_ana.id, cruz_bea.id],
            "Bautista, then Cruz/Ana, then Cruz/Bea"
        );
    }

    #[test]
    fn current_roster_carries_the_open_membership_id_for_each_row() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let membership = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let roster = current_roster(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(roster.len(), 1);
        assert_eq!(
            roster[0].membership_id, membership.id,
            "the roster row names the exact open membership a transfer/end will act on"
        );
    }

    // --- Wave 2P: end_membership ---

    fn open_membership_count(conn: &Connection, learner_id: &str) -> i64 {
        conn.query_row(
            "SELECT count(*) FROM section_memberships WHERE learner_id = ?1 AND ends_on IS NULL",
            [learner_id],
            |row| row.get(0),
        )
        .unwrap()
    }

    #[test]
    fn end_membership_sets_ends_on_without_deleting_the_row_or_the_learner() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-10-01").unwrap();

        match outcome {
            EndMembershipOutcome::Ended { membership } => {
                assert_eq!(membership.id, m.id);
                assert_eq!(membership.ends_on.as_deref(), Some("2025-10-01"));
            }
            other => panic!("expected Ended, got {other:?}"),
        }
        // History row still present, learner untouched.
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(
            history.len(),
            1,
            "the membership row is closed, not deleted"
        );
        assert_eq!(history[0].ends_on.as_deref(), Some("2025-10-01"));
        assert!(
            learner::find_by_id_in_school(&conn, &school_id, &l.id)
                .unwrap()
                .is_some(),
            "ending an enrollment must never remove the learner"
        );
        assert_eq!(open_membership_count(&conn, &l.id), 0);
    }

    #[test]
    fn end_membership_allows_a_same_day_end() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        // effective_on == starts_on -> legal empty interval [D, D).
        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-08-01").unwrap();

        assert!(matches!(outcome, EndMembershipOutcome::Ended { .. }));
    }

    #[test]
    fn end_membership_rejects_an_effective_date_before_the_placement_began() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-07-31").unwrap();

        assert_eq!(outcome, EndMembershipOutcome::InvalidEffectiveDate);
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "a rejected end must not touch the membership"
        );
    }

    #[test]
    fn end_membership_is_not_current_when_the_membership_is_already_closed() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        // Transfer out via `enroll`, closing m_a.
        enroll(&conn, &school_id, &section_b.id, &l.id, "2025-09-01").unwrap();

        let outcome = end_membership(&mut conn, &school_id, &l.id, &m_a.id, "2025-10-01").unwrap();

        assert_eq!(
            outcome,
            EndMembershipOutcome::NotCurrent,
            "acting on a stale roster row must be refused, not applied"
        );
    }

    #[test]
    fn end_membership_not_found_for_an_unknown_or_cross_school_membership_id() {
        let mut conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        // Unknown id.
        assert_eq!(
            end_membership(&mut conn, &school_id, &l.id, "no-such-id", "2025-10-01").unwrap(),
            EndMembershipOutcome::NotFound
        );

        // A real membership, but in another school.
        let other = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other.id, "2025-2026", "7", "Bonifacio").unwrap();
        let other_l = learner::create(&conn, &other.id, "Ben", "Reyes", None, None).unwrap();
        let other_m = enroll(
            &conn,
            &other.id,
            &other_section.id,
            &other_l.id,
            "2025-08-01",
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            end_membership(&mut conn, &school_id, &l.id, &other_m.id, "2025-10-01").unwrap(),
            EndMembershipOutcome::NotFound,
            "another school's membership id must be indistinguishable from an unknown one"
        );
        assert_eq!(
            open_membership_count(&conn, &other_l.id),
            1,
            "the other school's membership must be completely untouched"
        );
    }

    #[test]
    fn end_membership_not_found_when_the_learner_id_does_not_match_the_membership() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let other_l = learner::create(&conn, &school_id, "Ben", "Reyes", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        // Right school, right (existing) membership id, wrong learner.
        let outcome =
            end_membership(&mut conn, &school_id, &other_l.id, &m.id, "2025-10-01").unwrap();

        assert_eq!(outcome, EndMembershipOutcome::NotFound);
        assert_eq!(open_membership_count(&conn, &l.id), 1);
    }

    // --- Wave 2P: transfer_membership ---

    #[test]
    fn transfer_membership_closes_the_source_and_opens_the_destination_on_the_effective_day() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-10-01",
        )
        .unwrap();

        let new_membership = match outcome {
            TransferOutcome::Transferred { membership } => membership,
            other => panic!("expected Transferred, got {other:?}"),
        };
        assert_eq!(new_membership.section_id, section_b.id);
        assert_eq!(new_membership.starts_on, "2025-10-01");
        assert_eq!(new_membership.ends_on, None);

        // Source closed exactly on the effective day; no double-count, no gap.
        assert_eq!(
            roster_for_section(&conn, &school_id, &section_a, "2025-09-30")
                .unwrap()
                .len(),
            1
        );
        assert_eq!(
            roster_for_section(&conn, &school_id, &section_a, "2025-10-01")
                .unwrap()
                .len(),
            0,
            "learner is no longer in section A on the transfer day"
        );
        assert_eq!(
            roster_for_section(&conn, &school_id, &section_b.id, "2025-10-01")
                .unwrap()
                .len(),
            1,
            "learner is in section B from the transfer day"
        );
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "the one-open-membership invariant holds after a transfer"
        );

        // History keeps both spans.
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].section_id, section_a);
        assert_eq!(history[0].ends_on.as_deref(), Some("2025-10-01"));
        assert_eq!(history[1].section_id, section_b.id);
        assert_eq!(history[1].ends_on, None);
    }

    #[test]
    fn transfer_membership_double_submit_produces_exactly_one_transfer() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let first = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-10-01",
        )
        .unwrap();
        let second = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-10-01",
        )
        .unwrap();

        assert!(matches!(first, TransferOutcome::Transferred { .. }));
        assert_eq!(
            second,
            TransferOutcome::NotCurrent,
            "the second submit sees the source already closed"
        );
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(
            history.len(),
            2,
            "no duplicate destination membership from the repeated submit"
        );
        assert_eq!(open_membership_count(&conn, &l.id), 1);
    }

    #[test]
    fn transfer_membership_rejects_the_section_the_learner_is_already_in() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_a,
            "2025-10-01",
        )
        .unwrap();

        assert_eq!(outcome, TransferOutcome::SameSection);
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "a same-section transfer must write nothing"
        );
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].ends_on, None);
    }

    #[test]
    fn transfer_membership_destination_not_found_for_unknown_or_cross_school_section() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        assert_eq!(
            transfer_membership(
                &mut conn,
                &school_id,
                &l.id,
                &m_a.id,
                "no-such-section",
                "2025-10-01"
            )
            .unwrap(),
            TransferOutcome::DestinationNotFound
        );

        let other = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other.id, "2025-2026", "7", "Bonifacio").unwrap();
        assert_eq!(
            transfer_membership(
                &mut conn,
                &school_id,
                &l.id,
                &m_a.id,
                &other_section.id,
                "2025-10-01"
            )
            .unwrap(),
            TransferOutcome::DestinationNotFound,
            "another school's section must be indistinguishable from an unknown one"
        );
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "a rejected transfer leaves the learner in their original section"
        );
    }

    #[test]
    fn transfer_membership_membership_not_found_for_unknown_or_cross_school_source() {
        let mut conn = open_test_db();
        let (school_id, _section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        assert_eq!(
            transfer_membership(
                &mut conn,
                &school_id,
                &l.id,
                "no-such-membership",
                &section_b.id,
                "2025-10-01"
            )
            .unwrap(),
            TransferOutcome::MembershipNotFound
        );

        // A real membership belonging to another school.
        let other = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other.id, "2025-2026", "7", "Bonifacio").unwrap();
        let other_l = learner::create(&conn, &other.id, "Ben", "Reyes", None, None).unwrap();
        let other_m = enroll(
            &conn,
            &other.id,
            &other_section.id,
            &other_l.id,
            "2025-08-01",
        )
        .unwrap()
        .unwrap();

        assert_eq!(
            transfer_membership(
                &mut conn,
                &school_id,
                &l.id,
                &other_m.id,
                &section_b.id,
                "2025-10-01"
            )
            .unwrap(),
            TransferOutcome::MembershipNotFound
        );
        assert_eq!(
            open_membership_count(&conn, &other_l.id),
            1,
            "the other school's membership must be untouched"
        );
    }

    #[test]
    fn transfer_membership_rejects_an_effective_date_before_the_source_began() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-07-31",
        )
        .unwrap();

        assert_eq!(outcome, TransferOutcome::InvalidEffectiveDate);
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1, "nothing was written");
    }

    #[test]
    fn transfer_membership_allows_a_same_day_transfer() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        // effective_on == source starts_on -> source becomes a legal [D, D)
        // empty interval, destination opens at D.
        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert!(matches!(outcome, TransferOutcome::Transferred { .. }));
        assert_eq!(open_membership_count(&conn, &l.id), 1);
    }

    #[test]
    fn end_membership_rejects_a_malformed_effective_date() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        for bad in [
            "08/01/2025",
            "2025-8-1",
            "2025-13-01",
            "2025-01-32",
            "not-a-date",
            "",
        ] {
            let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, bad).unwrap();
            assert_eq!(
                outcome,
                EndMembershipOutcome::InvalidEffectiveDate,
                "a malformed effective_on ({bad:?}) arriving over IPC must be refused, not written"
            );
        }
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "nothing was written"
        );
    }

    #[test]
    fn transfer_membership_rejects_a_malformed_effective_date() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        for bad in [
            "10/01/2025",
            "2025-10-1",
            "2025-00-10",
            "2025-10-00",
            "20251001",
        ] {
            let outcome =
                transfer_membership(&mut conn, &school_id, &l.id, &m_a.id, &section_b.id, bad)
                    .unwrap();
            assert_eq!(outcome, TransferOutcome::InvalidEffectiveDate);
        }
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1, "nothing was written");
    }

    #[test]
    fn transfer_and_end_refuse_a_forged_membership_row_pointing_at_a_foreign_learner() {
        // A hand-crafted membership row pairing THIS school with a learner
        // that belongs to another school -- something `enroll` refuses to
        // create. The `(id, school_id, learner_id)` triple matches, so the
        // independent `learner::find_by_id_in_school` guard is what catches
        // it.
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_id, &foreign.id),
        )
        .unwrap();

        assert_eq!(
            transfer_membership(
                &mut conn,
                &school_id,
                &foreign.id,
                "m-forged",
                &section_b.id,
                "2025-10-01"
            )
            .unwrap(),
            TransferOutcome::MembershipNotFound
        );
        assert_eq!(
            end_membership(&mut conn, &school_id, &foreign.id, "m-forged", "2025-10-01").unwrap(),
            EndMembershipOutcome::NotFound
        );
    }

    #[test]
    fn zero_length_membership_still_appears_in_the_historical_range_roster() {
        // A same-day transfer leaves the source as a [D, D) empty interval.
        // The monthly-grid range query (`roster_for_section_over_range`) is
        // deliberately overlap-based, so a learner enrolled for zero days in
        // section A still appears in A's row set for a range containing D --
        // the grid wants historical row coverage. This test pins that
        // behavior so a future query change cannot silently drop the row.
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-10")
            .unwrap()
            .unwrap();
        transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-08-10",
        )
        .unwrap();

        let range_roster = roster_for_section_over_range(
            &conn,
            &school_id,
            &section_a,
            "2025-08-01",
            "2025-08-31",
        )
        .unwrap();

        assert_eq!(
            range_roster.len(),
            1,
            "the zero-day source membership is still counted for the historical range"
        );
        // ...but the *current* roster on any date excludes it.
        assert_eq!(
            current_roster(&conn, &school_id, &section_a, "2025-08-10")
                .unwrap()
                .len(),
            0
        );
    }
}
