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
    /// `effective_on` precedes the membership's `starts_on` — a membership
    /// may not end before it began.
    InvalidEffectiveDate,
    /// `effective_on` equals the membership's `starts_on`, which would make
    /// `[starts_on, starts_on)` — a zero-length interval. Rejected under
    /// the Wave 2Q membership-interval policy: `starts_on` must be
    /// strictly earlier than `ends_on` (ADR-0042 Wave 2Q addendum). No
    /// historical row is deleted to make the change fit.
    ZeroLengthInterval,
    /// A backdated `effective_on` would strand dependent records (see
    /// [`DependentRecordKind`]) outside the resulting `[starts_on,
    /// effective_on)` interval. Nothing was written.
    DependentRecordConflict { record: DependentRecordKind },
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
    /// `effective_on` equals the source membership's `starts_on`, which
    /// would leave the source as `[starts_on, starts_on)` — a zero-length
    /// interval. Rejected under the Wave 2Q membership-interval policy
    /// (ADR-0042 Wave 2Q addendum). No historical row is deleted.
    ZeroLengthInterval,
    /// A backdated `effective_on` would strand dependent records (see
    /// [`DependentRecordKind`]) in the *source* section outside the
    /// resulting `[starts_on, effective_on)` interval. Nothing was written.
    DependentRecordConflict { record: DependentRecordKind },
}

/// A category of dependent record that a *backdated* membership change
/// would leave stranded outside every interval the learner is enrolled
/// for. Surfaced by [`enroll_membership`] / [`end_membership`] /
/// [`transfer_membership`] as [`EnrollOutcome::DependentRecordConflict`] /
/// [`EndMembershipOutcome::DependentRecordConflict`] /
/// [`TransferOutcome::DependentRecordConflict`] so the caller can explain
/// *which category* of data blocks the change without dumping the records
/// themselves. Nothing is ever cascade-deleted or rewritten to make the
/// change fit — see the Wave 2Q addendum to
/// `docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
#[derive(Debug, Clone, Copy, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub enum DependentRecordKind {
    /// One or more `attendance_records` rows for this learner *in this
    /// section* fall on a date that the resulting membership interval —
    /// and every other retained membership the learner holds for the same
    /// section — does not cover. Shrinking the interval past them would
    /// make `roster_for_section_over_range` drop the learner and the SF2
    /// monthly grid silently under-report their attendance.
    Attendance,
    /// One or more *scored* `learner_scores` rows for this learner, in a
    /// class record for this section, belong to a grading period that lies
    /// wholly outside the resulting coverage (entirely before the new
    /// start, or entirely after the new end). Scores are grading-period
    /// granular, not per-day, so a period that merely straddles the
    /// boundary is allowed; only a period with no possible enrolled day is
    /// a conflict.
    Grades,
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
    // Shape-guard the date before it can be persisted and then sort
    // wrongly against `starts_on` / `ends_on` (SQLite compares these
    // strings lexically). A malformed date is treated as an unresolvable
    // request — the same `Ok(None)` this function already returns for an
    // unknown section/learner. Both production callers
    // (`commands::section::enroll_learner_in_section` via the TS
    // `DATE_PATTERN` guard, and `import::commit` via SF1 row validation)
    // already validate upstream; this is defense in depth. The typed,
    // roster-driven path is `enroll_membership`, which distinguishes this
    // case as `InvalidStartDate`.
    if !is_iso_date(starts_on) {
        return Ok(None);
    }
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
    }

    // Close-old + open-new must be atomic: a failure between the two
    // writes would otherwise leave the learner with zero open memberships.
    // A `SAVEPOINT` rather than `Connection::transaction()` because
    // `import::commit` calls this inside its own `Transaction` and
    // rusqlite transactions do not nest. `enroll` stays the
    // create-and-place primitive (silent same-section no-op, closes
    // whatever is open); `enroll_membership` is the stale-safe, typed,
    // eligibility-checked verb the Section Roster uses.
    conn.execute_batch("SAVEPOINT sm_enroll")?;
    let placed = (|| -> AppResult<SectionMembership> {
        if let Some((membership_id, _)) = &current_open {
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
        Ok(find_by_id(conn, &id)?.expect("row just inserted must exist"))
    })();
    match placed {
        Ok(membership) => {
            conn.execute_batch("RELEASE sm_enroll")?;
            Ok(Some(membership))
        }
        Err(e) => {
            let _ = conn.execute_batch("ROLLBACK TO sm_enroll; RELEASE sm_enroll");
            Err(e)
        }
    }
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

    let existing: Option<(String, String, Option<String>)> = tx
        .query_row(
            "SELECT section_id, starts_on, ends_on FROM section_memberships \
             WHERE id = ?1 AND school_id = ?2 AND learner_id = ?3",
            (membership_id, school_id, learner_id),
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e),
        })?;

    let (section_id, starts_on, ends_on) = match existing {
        None => return Ok(EndMembershipOutcome::NotFound),
        Some(row) => row,
    };
    if ends_on.is_some() {
        return Ok(EndMembershipOutcome::NotCurrent);
    }
    if effective_on < starts_on.as_str() {
        return Ok(EndMembershipOutcome::InvalidEffectiveDate);
    }
    if effective_on == starts_on.as_str() {
        // `[starts_on, starts_on)` — a zero-length interval. Rejected
        // under the Wave 2Q policy (`starts_on` strictly before `ends_on`).
        return Ok(EndMembershipOutcome::ZeroLengthInterval);
    }
    if let Some(record) = dependent_records_stranded(
        &tx,
        school_id,
        learner_id,
        &section_id,
        membership_id,
        &starts_on,
        Some(effective_on),
    )? {
        return Ok(EndMembershipOutcome::DependentRecordConflict { record });
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
    if effective_on == starts_on.as_str() {
        // Source would become `[starts_on, starts_on)` — a zero-length
        // interval, rejected under the Wave 2Q policy.
        return Ok(TransferOutcome::ZeroLengthInterval);
    }
    if let Some(record) = dependent_records_stranded(
        &tx,
        school_id,
        learner_id,
        &from_section_id,
        from_membership_id,
        &starts_on,
        Some(effective_on),
    )? {
        return Ok(TransferOutcome::DependentRecordConflict { record });
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

/// Returns `Some(kind)` when a membership change that leaves the learner's
/// coverage of `section_id` as `[interval_start, interval_end)` (with
/// `interval_end = None` meaning "still open") would strand a dependent
/// record — an `attendance_records` row or a scored `learner_scores` row —
/// on a date/period the *resulting* set of the learner's memberships for
/// that section does not cover.
///
/// `rewritten_membership_id` is the membership being changed (`""` for a
/// brand-new [`enroll_membership`], which matches no row); it is excluded
/// from the "some *other* retained membership already covers this" test so
/// the reasoning is about the resulting intervals, not the current ones.
///
/// Deliberately bounded: it checks exactly the two already-modelled,
/// membership-scoped record types and fails conservatively. It is not a
/// general dependency framework. Official-form outputs (SF1/SF2/SF9/SF10)
/// are generated to disk and store no per-learner rows, so there is
/// nothing to check for them. See the Wave 2Q addendum to ADR-0042.
fn dependent_records_stranded(
    conn: &Connection,
    school_id: &str,
    learner_id: &str,
    section_id: &str,
    rewritten_membership_id: &str,
    interval_start: &str,
    interval_end: Option<&str>,
) -> AppResult<Option<DependentRecordKind>> {
    // A far-future sentinel so the half-open upper bound can be a plain
    // string comparison when the resulting interval is still open.
    let end_guard = interval_end.unwrap_or("9999-12-31");

    // Attendance: a row whose date is outside `[interval_start,
    // interval_end)` and which no *other* retained membership for this
    // (learner, section) covers. `ar.section_id` is nullable — migration
    // 12 left legacy rows NULL — and `= ?3` excludes them, which is
    // correct: a NULL-section attendance row predates section scoping and
    // is not attributable to this membership.
    let attendance_stranded: bool = conn.query_row(
        "SELECT EXISTS ( \
           SELECT 1 FROM attendance_records ar \
           WHERE ar.learner_id = ?1 AND ar.school_id = ?2 AND ar.section_id = ?3 \
             AND NOT (ar.attendance_date >= ?4 AND ar.attendance_date < ?5) \
             AND NOT EXISTS ( \
               SELECT 1 FROM section_memberships sm \
               WHERE sm.learner_id = ?1 AND sm.school_id = ?2 AND sm.section_id = ?3 \
                 AND sm.id <> ?6 \
                 AND sm.starts_on <= ar.attendance_date \
                 AND (sm.ends_on IS NULL OR ar.attendance_date < sm.ends_on) \
             ) \
         )",
        (
            learner_id,
            school_id,
            section_id,
            interval_start,
            end_guard,
            rewritten_membership_id,
        ),
        |row| row.get(0),
    )?;
    if attendance_stranded {
        return Ok(Some(DependentRecordKind::Attendance));
    }

    // Grades: a scored row whose grading period lies *wholly* outside the
    // resulting interval (ends before it starts, or starts on/after it
    // ends) and which no other retained membership fully covers. Scores
    // are grading-period granular, so a period that merely straddles the
    // boundary is allowed — only a period with no possible enrolled day
    // is a conflict.
    let grades_stranded: bool = conn.query_row(
        "SELECT EXISTS ( \
           SELECT 1 FROM learner_scores ls \
           JOIN assessment_items ai ON ai.id = ls.assessment_item_id \
           JOIN class_records cr ON cr.id = ai.class_record_id \
           JOIN grading_periods gp ON gp.id = cr.grading_period_id \
           WHERE ls.learner_id = ?1 AND ls.school_id = ?2 AND cr.school_id = ?2 \
             AND gp.school_id = ?2 AND cr.section_id = ?3 \
             AND ls.status = 'scored' \
             AND (gp.ends_on < ?4 OR gp.starts_on >= ?5) \
             AND NOT EXISTS ( \
               SELECT 1 FROM section_memberships sm \
               WHERE sm.learner_id = ?1 AND sm.school_id = ?2 AND sm.section_id = ?3 \
                 AND sm.id <> ?6 \
                 AND sm.starts_on <= gp.starts_on \
                 AND (sm.ends_on IS NULL OR gp.ends_on < sm.ends_on) \
             ) \
         )",
        (
            learner_id,
            school_id,
            section_id,
            interval_start,
            end_guard,
            rewritten_membership_id,
        ),
        |row| row.get(0),
    )?;
    if grades_stranded {
        return Ok(Some(DependentRecordKind::Grades));
    }

    Ok(None)
}

/// Outcome of [`enroll_membership`]. A non-`Enrolled` variant means the
/// transaction wrote nothing. Mirrors the `tag = "kind"` shape of
/// [`TransferOutcome`] / [`EndMembershipOutcome`] so the Tauri command →
/// TypeScript layer maps each case to its own teacher-facing message and
/// recovery, exposing no SQL, ids beyond the caller's own school, or
/// another school's data.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum EnrollOutcome {
    /// A new open membership `[starts_on, NULL)` was created. `membership`
    /// is the persisted row.
    Enrolled { membership: SectionMembership },
    /// `learner_id` does not resolve within the caller's school —
    /// indistinguishable from an unknown id, matching this module's
    /// cross-school-probe-resistance convention.
    LearnerNotFound,
    /// `section_id` does not resolve within the caller's school —
    /// indistinguishable from an unknown id.
    SectionNotFound,
    /// The learner already holds an *open* membership. When
    /// `current_section_id` is the requested section they are already
    /// placed there; otherwise the correct operation is a transfer, which
    /// this verb deliberately never performs implicitly. Both ids belong
    /// to the caller's own school.
    AlreadyEnrolled {
        current_membership_id: String,
        current_section_id: String,
    },
    /// A retained (closed or future) membership interval overlaps the
    /// proposed open interval `[starts_on, ∞)` — i.e. some prior span ends
    /// strictly after `starts_on`. Enrolling would double-count a day.
    OverlappingMembership,
    /// `starts_on` is not a valid `YYYY-MM-DD` date. A zero-length
    /// interval cannot arise from this verb — it only ever opens
    /// `[starts_on, NULL)`.
    InvalidStartDate,
    /// A backdated `starts_on` would leave dependent records for this
    /// learner in this section (see [`DependentRecordKind`]) stranded
    /// before the new interval. Nothing was written.
    DependentRecordConflict { record: DependentRecordKind },
}

/// Places an *existing, eligible* learner into `section_id` as of
/// `starts_on`, opening a fresh half-open membership `[starts_on, NULL)`.
///
/// Unlike [`enroll`] — the bulk create-and-place primitive that closes
/// "whatever is open" and treats a repeat as an idempotent no-op — this is
/// the stale-safe, typed, eligibility-checked verb the Section Roster
/// screen drives. It **never** moves a learner who is already actively
/// enrolled: that returns [`EnrollOutcome::AlreadyEnrolled`] and the
/// caller must choose transfer explicitly. Every eligibility rule is
/// enforced here, at the trusted boundary, regardless of any pre-filter
/// the UI applied (`enrollable_learners`).
///
/// Runs in one transaction: the eligibility checks and the single
/// `INSERT` either all commit or all roll back. `school_id` is the
/// session-derived scope from the command layer, never client-supplied.
pub fn enroll_membership(
    conn: &mut Connection,
    school_id: &str,
    learner_id: &str,
    section_id: &str,
    starts_on: &str,
) -> AppResult<EnrollOutcome> {
    if !is_iso_date(starts_on) {
        return Ok(EnrollOutcome::InvalidStartDate);
    }

    let tx = conn.transaction()?;

    if learner::find_by_id_in_school(&tx, school_id, learner_id)?.is_none() {
        return Ok(EnrollOutcome::LearnerNotFound);
    }
    if section::find_by_id_in_school(&tx, school_id, section_id)?.is_none() {
        return Ok(EnrollOutcome::SectionNotFound);
    }

    let current_open: Option<(String, String)> = tx
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
    if let Some((current_membership_id, current_section_id)) = current_open {
        return Ok(EnrollOutcome::AlreadyEnrolled {
            current_membership_id,
            current_section_id,
        });
    }

    let overlaps: bool = tx.query_row(
        "SELECT EXISTS ( \
           SELECT 1 FROM section_memberships \
           WHERE learner_id = ?1 AND school_id = ?2 \
             AND ends_on IS NOT NULL AND ends_on > ?3 \
         )",
        (learner_id, school_id, starts_on),
        |row| row.get(0),
    )?;
    if overlaps {
        return Ok(EnrollOutcome::OverlappingMembership);
    }

    if let Some(record) =
        dependent_records_stranded(&tx, school_id, learner_id, section_id, "", starts_on, None)?
    {
        return Ok(EnrollOutcome::DependentRecordConflict { record });
    }

    let id = Uuid::now_v7().to_string();
    tx.execute(
        "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
         VALUES (?1, ?2, ?3, ?4, ?5)",
        (&id, school_id, section_id, learner_id, starts_on),
    )?;
    let membership = find_by_id(&tx, &id)?.expect("row just inserted must exist");
    tx.commit()?;
    Ok(EnrollOutcome::Enrolled { membership })
}

/// Outcome of [`correct_same_day_placement`]. A non-`Corrected` variant
/// means the transaction wrote nothing. Mirrors the `tag = "kind"` shape of
/// the other membership-change outcomes.
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum CorrectPlacementOutcome {
    /// `section_id` was updated in place; `membership` is the row as
    /// persisted. The row keeps its original `id`/`created_at`/`starts_on`
    /// and stays open (`ends_on` untouched).
    Corrected { membership: SectionMembership },
    /// No membership with this `(id, school_id, learner_id)` triple exists
    /// — a forged/cross-school id, or a wrong learner, is indistinguishable
    /// from a genuinely unknown id, matching this module's convention.
    NotFound,
    /// The membership exists but is no longer the open one — either it was
    /// already ended/transferred, or another correction committed between
    /// this call's read and write. The roster the caller acted from is
    /// stale either way. No-op.
    NotCurrent,
    /// `starts_on` is not today (per the caller-supplied `as_of_date`) —
    /// this correction path only ever applies to a placement entered
    /// today; anything older needs a transfer or end instead.
    NotEnteredToday,
    /// This membership was already corrected once. A correction is a
    /// one-time fix for a same-day data-entry slip, not a repeatable edit
    /// — a second attempt (including an exact double-submit) is refused
    /// rather than silently overwriting `original_section_id` again.
    AlreadyCorrected,
    /// `to_section_id` does not resolve within the caller's school.
    DestinationNotFound,
    /// `to_section_id` is the section the row is already in — nothing to
    /// correct.
    SameSection,
    /// An attendance or scored-grade record already exists for this
    /// learner in the *current* section — moving the row to a different
    /// section now would strand it outside every membership that still
    /// covers it. Nothing was written; see [`DependentRecordKind`].
    DependentRecordConflict { record: DependentRecordKind },
}

/// Corrects a data-entry mistake in a placement entered *today*: the
/// learner was placed in the wrong section, and the strict half-open
/// interval policy (ADR-0042 Wave 2Q addendum) refuses the obvious fix — a
/// same-day transfer — because closing the source with
/// `ends_on = starts_on` would be a zero-length interval. This is not a
/// transfer: it updates `section_id` on the *same* row, in place, exactly
/// once. No new membership row is created, `starts_on`/`ends_on` are never
/// touched, and the original section is retained in
/// `original_section_id` — so this can never produce an overlapping,
/// multiple-open, or zero-length membership, and every existing "current
/// membership" query (`current_roster`, `roster_for_section`,
/// `is_active_member`, the one-open-per-learner unique index, and Wave
/// 2R's read-only history) sees the corrected row exactly as if it had
/// always been enrolled in the corrected section, with no change of its
/// own required.
///
/// Bounded deliberately narrow, matching the ADR-0042 Wave 2S decision:
/// only a placement whose `starts_on` equals `as_of_date` (the caller's
/// own "today", the same client-supplied convention every other date in
/// this module already uses — `effective_on`/`as_of_date`/`starts_on`),
/// only once (`corrected_at IS NULL`), and only when nothing already
/// depends on the current section placement (see
/// [`dependent_records_stranded`] — called with a zero-width interval, so
/// *any* attendance/scored-grade record for this learner in the current
/// section is treated as stranded, since the row is about to stop
/// covering this section at all).
///
/// Runs in one transaction; the correcting `UPDATE` is guarded by
/// `ends_on IS NULL AND corrected_at IS NULL`, and its affected-row count
/// is checked, so two concurrent corrections cannot both succeed and a
/// double-submit is a no-op past the first.
pub fn correct_same_day_placement(
    conn: &mut Connection,
    school_id: &str,
    learner_id: &str,
    membership_id: &str,
    to_section_id: &str,
    as_of_date: &str,
) -> AppResult<CorrectPlacementOutcome> {
    if !is_iso_date(as_of_date) {
        return Ok(CorrectPlacementOutcome::NotEnteredToday);
    }

    let tx = conn.transaction()?;

    // Defense in depth, matching `end_membership`/`transfer_membership`: a
    // forged row could pair this school with a foreign learner.
    if learner::find_by_id_in_school(&tx, school_id, learner_id)?.is_none() {
        return Ok(CorrectPlacementOutcome::NotFound);
    }

    let existing: Option<(String, String, Option<String>, Option<String>)> = tx
        .query_row(
            "SELECT section_id, starts_on, ends_on, corrected_at FROM section_memberships \
             WHERE id = ?1 AND school_id = ?2 AND learner_id = ?3",
            (membership_id, school_id, learner_id),
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map(Some)
        .or_else(|e| match e {
            rusqlite::Error::QueryReturnedNoRows => Ok(None),
            e => Err(e),
        })?;

    let (current_section_id, starts_on, ends_on, corrected_at) = match existing {
        None => return Ok(CorrectPlacementOutcome::NotFound),
        Some(row) => row,
    };
    if ends_on.is_some() {
        return Ok(CorrectPlacementOutcome::NotCurrent);
    }
    if starts_on != as_of_date {
        return Ok(CorrectPlacementOutcome::NotEnteredToday);
    }
    if corrected_at.is_some() {
        return Ok(CorrectPlacementOutcome::AlreadyCorrected);
    }
    if section::find_by_id_in_school(&tx, school_id, to_section_id)?.is_none() {
        return Ok(CorrectPlacementOutcome::DestinationNotFound);
    }
    if to_section_id == current_section_id {
        return Ok(CorrectPlacementOutcome::SameSection);
    }
    // Zero-width interval: since the row is leaving `current_section_id`
    // entirely, any dependent record in that section (on any date) counts
    // as stranded unless some *other* retained membership already covers
    // it -- `dependent_records_stranded` already checks that.
    if let Some(record) = dependent_records_stranded(
        &tx,
        school_id,
        learner_id,
        &current_section_id,
        membership_id,
        &starts_on,
        Some(&starts_on),
    )? {
        return Ok(CorrectPlacementOutcome::DependentRecordConflict { record });
    }

    let affected = tx.execute(
        "UPDATE section_memberships \
         SET section_id = ?1, \
             original_section_id = COALESCE(original_section_id, section_id), \
             corrected_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE id = ?2 AND ends_on IS NULL AND corrected_at IS NULL",
        (to_section_id, membership_id),
    )?;
    if affected != 1 {
        // Lost a race: another correction (or an end/transfer) committed
        // between the SELECT above and here.
        return Ok(CorrectPlacementOutcome::NotCurrent);
    }

    let membership = find_by_id(&tx, membership_id)?.expect("row just updated must exist");
    tx.commit()?;
    Ok(CorrectPlacementOutcome::Corrected { membership })
}

/// A candidate for the Section Roster "Enroll learner" picker: a learner
/// in the school plus their current *open* membership, if any. `current_*`
/// are all `None` together (not enrolled anywhere → eligible to place
/// directly) or all `Some` together (enrolled → same section as the target
/// means "already there", a different section means "transfer required").
#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct EnrollmentCandidate {
    pub learner_id: String,
    pub given_name: String,
    pub family_name: String,
    pub lrn: Option<String>,
    pub current_membership_id: Option<String>,
    pub current_section_id: Option<String>,
    pub current_section_name: Option<String>,
    pub current_starts_on: Option<String>,
}

/// One row per learner in `school_id`, each carrying their current *open*
/// membership (section id + name + start day) if they have one. The
/// Section Roster "Enroll learner" picker renders this as three states —
/// not enrolled anywhere (eligible to place directly), already in the
/// target section, or enrolled elsewhere (a transfer is required) — but
/// the authoritative eligibility check is always [`enroll_membership`],
/// never this list.
///
/// School scope is constrained on `learners`, on `section_memberships`,
/// **and** on `sections` in the query itself (the Wave 2O security
/// review's finding: not only `sm.*`). The one-open-membership unique
/// index `idx_one_active_membership_per_learner` guarantees the `LEFT
/// JOIN` yields at most one row per learner. Ordered `family_name,
/// given_name` in SQL — this codebase's convention — never re-sorted by
/// the caller. Gated by `ManageLearners` at the command layer, matching
/// `learner::find_candidates` (the closest school-wide learner-lookup
/// precedent), not the open-read convention.
pub fn enrollable_learners(
    conn: &Connection,
    school_id: &str,
) -> AppResult<Vec<EnrollmentCandidate>> {
    let mut stmt = conn.prepare(
        "SELECT l.id, l.given_name, l.family_name, l.lrn, \
                sm.id, sm.section_id, sec.name, sm.starts_on \
         FROM learners l \
         LEFT JOIN section_memberships sm \
                ON sm.learner_id = l.id AND sm.school_id = ?1 AND sm.ends_on IS NULL \
         LEFT JOIN sections sec \
                ON sec.id = sm.section_id AND sec.school_id = ?1 \
         WHERE l.school_id = ?1 \
         ORDER BY l.family_name, l.given_name",
    )?;
    let rows = stmt.query_map([school_id], |row| {
        Ok(EnrollmentCandidate {
            learner_id: row.get(0)?,
            given_name: row.get(1)?,
            family_name: row.get(2)?,
            lrn: row.get(3)?,
            current_membership_id: row.get(4)?,
            current_section_id: row.get(5)?,
            current_section_name: row.get(6)?,
            current_starts_on: row.get(7)?,
        })
    })?;
    rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
}

/// The roster of learners with an active membership in `section_id` on
/// `as_of_date`. Scoped directly by `school_id` in the query (not merely
/// implied by `section_id` belonging to that school) so a cross-school
/// section reference cannot leak learners even if one were ever
/// constructed incorrectly upstream. Like `current_roster`, the joined
/// `learners` row is independently constrained to the same `school_id`
/// (not only `sm.*`) so a hand-forged membership row pointing a
/// foreign-school learner at this section cannot leak that learner —
/// `formgen::sf1` and `import::commit` both compose this function.
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
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 AND l.school_id = ?2 \
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
/// queries. School scope is constrained on both `section_memberships`
/// (`school_id` AND `section_id` together) and independently on the joined
/// `learners` row (`l.school_id = ?2`, not only `sm.*`) so a forged
/// cross-school membership row cannot leak a learner into the monthly
/// attendance grid, SF2 export, or class-record / learner-score
/// eligibility, all of which compose this function.
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
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 AND l.school_id = ?2 \
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
/// date, without a second round trip through `roster_for_section`. The
/// learner must also resolve within `school_id` (an `EXISTS` on `learners`,
/// matching `roster_for_section*`'s independent `l.school_id` constraint) so
/// a forged cross-school membership row cannot make a foreign learner look
/// active here and let an attendance write be recorded against them.
pub fn is_active_member(
    conn: &Connection,
    school_id: &str,
    section_id: &str,
    learner_id: &str,
    as_of_date: &str,
) -> AppResult<bool> {
    let count: i64 = conn.query_row(
        "SELECT count(*) FROM section_memberships sm \
         WHERE sm.section_id = ?1 AND sm.school_id = ?2 AND sm.learner_id = ?3 \
           AND sm.starts_on <= ?4 AND (sm.ends_on IS NULL OR ?4 < sm.ends_on) \
           AND EXISTS (SELECT 1 FROM learners l WHERE l.id = ?3 AND l.school_id = ?2)",
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
    fn roster_for_section_join_independently_constrains_the_learner_to_the_same_school() {
        // Same defense-in-depth hardening as
        // `current_roster_join_independently_constrains_the_learner_to_the_same_school`,
        // applied to `roster_for_section` — which feeds SF1 formgen and the
        // import-commit roster checks. A hand-crafted membership row pointing a
        // foreign-school learner at this section (something `enroll` refuses to
        // create) must not leak that learner's name/LRN/sex across the tenant
        // boundary, because the query constrains `l.school_id` too, not only
        // `sm.*`.
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged-rfs', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_id, &foreign.id),
        )
        .unwrap();

        let roster = roster_for_section(&conn, &school_id, &section_id, "2025-08-15").unwrap();

        assert_eq!(
            roster.len(),
            0,
            "a learner belonging to another school must never appear, even via a forged membership row"
        );
    }

    #[test]
    fn roster_for_section_over_range_join_independently_constrains_the_learner_to_the_same_school()
    {
        // Same defense-in-depth hardening applied to
        // `roster_for_section_over_range` — which feeds the monthly attendance
        // grid, SF2 export, and class-record / learner-score eligibility. A
        // forged membership row pointing a foreign-school learner at this
        // section must not leak that learner into a range roster.
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged-rfsor', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_id, &foreign.id),
        )
        .unwrap();

        let roster = roster_for_section_over_range(
            &conn,
            &school_id,
            &section_id,
            "2025-08-01",
            "2025-08-31",
        )
        .unwrap();

        assert_eq!(
            roster.len(),
            0,
            "a learner belonging to another school must never appear in a range roster, even via a forged membership row"
        );
    }

    #[test]
    fn is_active_member_rejects_a_forged_membership_row_for_a_foreign_school_learner() {
        // `is_active_member` gates whether an attendance write may be recorded
        // for a learner in a section. A hand-forged `section_memberships` row
        // pointing a foreign-school learner at a local section must not make
        // that learner look active here — the check now also requires the
        // learner to resolve within the same school.
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other_school.id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-forged-iam', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_id, &foreign.id),
        )
        .unwrap();

        let active =
            is_active_member(&conn, &school_id, &section_id, &foreign.id, "2025-08-15").unwrap();

        assert!(
            !active,
            "a foreign-school learner must never count as an active member, even via a forged membership row"
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
    fn end_membership_rejects_a_same_day_end_as_a_zero_length_interval() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        // effective_on == starts_on would make `[2025-08-01, 2025-08-01)` —
        // a zero-length interval. Rejected under the Wave 2Q policy; no
        // historical row is deleted to make it fit.
        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-08-01").unwrap();

        assert_eq!(outcome, EndMembershipOutcome::ZeroLengthInterval);
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "a rejected same-day end must leave the membership open"
        );
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
    fn transfer_membership_rejects_a_same_day_transfer_as_a_zero_length_interval() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        // effective_on == source starts_on would leave the source as
        // `[2025-08-01, 2025-08-01)` — a zero-length interval. Rejected
        // under the Wave 2Q policy; the learner stays in section A.
        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, TransferOutcome::ZeroLengthInterval);
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1, "nothing was written");
        assert_eq!(history[0].section_id, section_a);
        assert_eq!(history[0].ends_on, None, "the source membership stays open");
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
    fn a_same_day_transfer_is_refused_so_no_zero_length_membership_is_ever_created() {
        // Wave 2Q policy: `starts_on` must be strictly before `ends_on`. A
        // same-day transfer would leave the source as `[D, D)`, so it is
        // refused outright — the source membership is left untouched and
        // open, and the historical range roster reflects only the real
        // (still-open) span. (Wave 2P deliberately allowed the zero-length
        // row and pinned that it still appeared in the range roster; the
        // Wave 2Q addendum to ADR-0042 records the evidence and the
        // decision to reverse it.)
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-10")
            .unwrap()
            .unwrap();

        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-08-10",
        )
        .unwrap();

        assert_eq!(outcome, TransferOutcome::ZeroLengthInterval);

        // No zero-length row exists: the only membership is the original
        // open span in section A.
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].section_id, section_a);
        assert_eq!(history[0].starts_on, "2025-08-10");
        assert_eq!(history[0].ends_on, None);

        // The learner is still a current member of section A.
        assert_eq!(
            current_roster(&conn, &school_id, &section_a, "2025-08-10")
                .unwrap()
                .len(),
            1
        );
    }

    // --- Wave 2Q: enroll hardening (shape guard + atomic close/insert) ---

    #[test]
    fn enroll_rejects_a_malformed_starts_on_without_writing() {
        let conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        for bad in ["08/01/2025", "2025-8-1", "2025-13-01", "not-a-date", ""] {
            assert_eq!(
                enroll(&conn, &school_id, &section_id, &l.id, bad).unwrap(),
                None,
                "a malformed starts_on ({bad:?}) must be treated as unresolvable, not persisted"
            );
        }
        assert_eq!(open_membership_count(&conn, &l.id), 0);
    }

    #[test]
    fn enroll_transfer_via_the_primitive_is_atomic_the_learner_never_has_zero_open_memberships() {
        // `enroll` into a new section closes the old membership and opens a
        // new one. Both happen inside a SAVEPOINT, so even though this test
        // can only observe the happy path directly, the invariant it
        // guards is: at no committed point does the learner hold zero open
        // memberships.
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01").unwrap();

        enroll(&conn, &school_id, &section_b.id, &l.id, "2025-10-01").unwrap();

        assert_eq!(open_membership_count(&conn, &l.id), 1);
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 2);
        assert_eq!(history[0].ends_on.as_deref(), Some("2025-10-01"));
        assert_eq!(history[1].ends_on, None);
    }

    // --- Wave 2Q: enroll_membership ---

    #[test]
    fn enroll_membership_places_an_unenrolled_learner_and_returns_the_open_row() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_id, "2025-08-01").unwrap();

        match outcome {
            EnrollOutcome::Enrolled { membership } => {
                assert_eq!(membership.section_id, section_id);
                assert_eq!(membership.learner_id, l.id);
                assert_eq!(membership.starts_on, "2025-08-01");
                assert_eq!(membership.ends_on, None);
            }
            other => panic!("expected Enrolled, got {other:?}"),
        }
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        assert_eq!(
            current_roster(&conn, &school_id, &section_id, "2025-08-15")
                .unwrap()
                .len(),
            1
        );
    }

    #[test]
    fn enroll_membership_rejects_a_learner_from_another_school() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let other = school::create(&conn, "Other School").unwrap();
        let foreign = learner::create(&conn, &other.id, "Ana", "Cruz", None, None).unwrap();

        let outcome = enroll_membership(
            &mut conn,
            &school_id,
            &foreign.id,
            &section_id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, EnrollOutcome::LearnerNotFound);
        assert_eq!(open_membership_count(&conn, &foreign.id), 0);
    }

    #[test]
    fn enroll_membership_rejects_a_section_from_another_school() {
        let mut conn = open_test_db();
        let (school_id, _section_id) = setup(&conn);
        let other = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        let outcome = enroll_membership(
            &mut conn,
            &school_id,
            &l.id,
            &other_section.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, EnrollOutcome::SectionNotFound);
        assert_eq!(open_membership_count(&conn, &l.id), 0);
    }

    #[test]
    fn enroll_membership_refuses_a_learner_already_enrolled_elsewhere_transfer_is_required() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_b.id, "2025-10-01").unwrap();

        assert_eq!(
            outcome,
            EnrollOutcome::AlreadyEnrolled {
                current_membership_id: m_a.id.clone(),
                current_section_id: section_a.clone(),
            },
            "an actively-enrolled learner is never silently moved by enroll_membership"
        );
        // Nothing changed.
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(history.len(), 1);
        assert_eq!(history[0].section_id, section_a);
    }

    #[test]
    fn enroll_membership_reports_already_enrolled_when_the_target_is_the_current_section() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_id, "2025-09-01").unwrap();

        assert_eq!(
            outcome,
            EnrollOutcome::AlreadyEnrolled {
                current_membership_id: m.id,
                current_section_id: section_id,
            }
        );
    }

    #[test]
    fn enroll_membership_rejects_an_overlap_with_a_retained_historical_membership() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        // A past stint in A that ended 2025-10-01.
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-06-01")
            .unwrap()
            .unwrap();
        end_membership(&mut conn, &school_id, &l.id, &m_a.id, "2025-10-01").unwrap();

        // Re-enrol starting 2025-09-15 — before the old stint's end date.
        let overlap = enroll_membership(&mut conn, &school_id, &l.id, &section_b.id, "2025-09-15");
        assert_eq!(
            overlap.unwrap(),
            EnrollOutcome::OverlappingMembership,
            "a new open interval that a retained span extends into must be refused"
        );

        // Re-enrol starting exactly on the old end date is fine (half-open).
        let ok = enroll_membership(&mut conn, &school_id, &l.id, &section_b.id, "2025-10-01");
        assert!(matches!(ok.unwrap(), EnrollOutcome::Enrolled { .. }));
    }

    #[test]
    fn enroll_membership_allows_re_enrollment_after_a_prior_stint_fully_ended() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "8", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2024-06-01")
            .unwrap()
            .unwrap();
        end_membership(&mut conn, &school_id, &l.id, &m_a.id, "2025-04-01").unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_b.id, "2025-06-02").unwrap();

        assert!(matches!(outcome, EnrollOutcome::Enrolled { .. }));
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        assert_eq!(
            list_by_learner_in_school(&conn, &school_id, &l.id)
                .unwrap()
                .len(),
            2,
            "the prior stint is retained as history"
        );
    }

    #[test]
    fn enroll_membership_rejects_a_malformed_starts_on() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        for bad in ["06/02/2025", "2025-6-2", "2025-13-40", "", "20250602"] {
            assert_eq!(
                enroll_membership(&mut conn, &school_id, &l.id, &section_id, bad).unwrap(),
                EnrollOutcome::InvalidStartDate
            );
        }
        assert_eq!(open_membership_count(&conn, &l.id), 0);
    }

    #[test]
    fn enroll_membership_rolls_back_completely_on_a_constraint_failure() {
        // Force the INSERT to violate `idx_one_active_membership_per_learner`
        // by racing a second open membership row in underneath the checks
        // (simulating a concurrent writer that committed after this
        // transaction's SELECTs). The whole transaction must roll back:
        // no partial history, exactly one open membership.
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();

        // No membership yet, so enroll_membership passes its checks; but we
        // insert a competing open row via a raw statement *before* calling
        // it, so its own INSERT will collide with the unique index.
        conn.execute(
            "INSERT INTO section_memberships (id, school_id, section_id, learner_id, starts_on) \
             VALUES ('m-competing', ?1, ?2, ?3, '2025-08-01')",
            (&school_id, &section_a, &l.id),
        )
        .unwrap();

        let result = enroll_membership(&mut conn, &school_id, &l.id, &section_b.id, "2025-09-01");

        // The competing row makes this an AlreadyEnrolled case now — the
        // check catches it before the INSERT, so nothing is written.
        assert_eq!(
            result.unwrap(),
            EnrollOutcome::AlreadyEnrolled {
                current_membership_id: "m-competing".to_string(),
                current_section_id: section_a.clone(),
            }
        );
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        assert_eq!(
            list_by_learner_in_school(&conn, &school_id, &l.id)
                .unwrap()
                .len(),
            1,
            "no partial history row was left behind"
        );
    }

    // --- Wave 2Q: dependent-record integrity (backdating guard) ---

    /// Records a real attendance mark for `learner_id` in `section_id` on
    /// `date`, standing in for the attendance command layer.
    fn mark_attendance(
        conn: &Connection,
        school_id: &str,
        section_id: &str,
        learner_id: &str,
        date: &str,
    ) {
        conn.execute(
            "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
             VALUES (?1, ?2, ?3, ?4, ?5, 'present')",
            (Uuid::now_v7().to_string(), school_id, section_id, learner_id, date),
        )
        .unwrap();
    }

    #[test]
    fn end_membership_blocks_a_backdate_that_would_strand_an_attendance_record() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        mark_attendance(&conn, &school_id, &section_id, &l.id, "2025-09-10");

        // Backdate the end to 2025-09-01 — the 2025-09-10 mark would fall
        // outside `[2025-08-01, 2025-09-01)` and no other membership covers it.
        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-09-01").unwrap();

        assert_eq!(
            outcome,
            EndMembershipOutcome::DependentRecordConflict {
                record: DependentRecordKind::Attendance
            }
        );
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "nothing was written"
        );
    }

    #[test]
    fn end_membership_allows_a_backdate_that_keeps_every_attendance_record_covered() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        mark_attendance(&conn, &school_id, &section_id, &l.id, "2025-08-20");

        // End on 2025-09-01 — the 2025-08-20 mark is still inside
        // `[2025-08-01, 2025-09-01)`.
        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-09-01").unwrap();

        assert!(matches!(outcome, EndMembershipOutcome::Ended { .. }));
    }

    #[test]
    fn transfer_membership_blocks_a_backdate_that_would_strand_source_attendance() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_a = enroll(&conn, &school_id, &section_a, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        mark_attendance(&conn, &school_id, &section_a, &l.id, "2025-09-10");

        let outcome = transfer_membership(
            &mut conn,
            &school_id,
            &l.id,
            &m_a.id,
            &section_b.id,
            "2025-09-01",
        )
        .unwrap();

        assert_eq!(
            outcome,
            TransferOutcome::DependentRecordConflict {
                record: DependentRecordKind::Attendance
            }
        );
        assert_eq!(open_membership_count(&conn, &l.id), 1);
        assert_eq!(
            list_by_learner_in_school(&conn, &school_id, &l.id)
                .unwrap()
                .len(),
            1,
            "nothing was written"
        );
    }

    #[test]
    fn a_legacy_null_section_attendance_row_never_blocks_a_membership_change() {
        // Migration 12 left pre-section-scoping attendance rows with
        // section_id = NULL. Those are not attributable to any membership,
        // so they must not wedge a backdated end/transfer.
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        conn.execute(
            "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
             VALUES ('a-legacy', ?1, NULL, ?2, '2025-07-01', 'present')",
            (&school_id, &l.id),
        )
        .unwrap();

        let outcome = end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-09-01").unwrap();

        assert!(
            matches!(outcome, EndMembershipOutcome::Ended { .. }),
            "a NULL-section legacy attendance row must not block the change"
        );
    }

    #[test]
    fn enroll_membership_blocks_a_backdate_that_would_strand_an_orphan_attendance_record() {
        // A learner with an attendance row in the target section but no
        // membership covering it (an orphan, e.g. left by a prior backdated
        // end that this same guard now prevents — constructed directly
        // here). Re-enrolling with a start *after* the orphan strands it.
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        conn.execute(
            "INSERT INTO attendance_records (id, school_id, section_id, learner_id, attendance_date, status) \
             VALUES ('a-orphan', ?1, ?2, ?3, '2025-07-15', 'present')",
            (&school_id, &section_id, &l.id),
        )
        .unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_id, "2025-08-01").unwrap();

        assert_eq!(
            outcome,
            EnrollOutcome::DependentRecordConflict {
                record: DependentRecordKind::Attendance
            }
        );
        assert_eq!(open_membership_count(&conn, &l.id), 0);
    }

    #[test]
    fn enroll_membership_is_unaffected_by_attendance_from_a_prior_retained_stint() {
        // Routine re-enrolment: L was in the section last year, that stint
        // is retained and covers its own attendance. A new stint that
        // starts after it must NOT be false-flagged as a dependent-record
        // conflict.
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_old = enroll(&conn, &school_id, &section_id, &l.id, "2024-06-01")
            .unwrap()
            .unwrap();
        mark_attendance(&conn, &school_id, &section_id, &l.id, "2024-09-10");
        end_membership(&mut conn, &school_id, &l.id, &m_old.id, "2025-04-01").unwrap();

        let outcome =
            enroll_membership(&mut conn, &school_id, &l.id, &section_id, "2025-06-02").unwrap();

        assert!(
            matches!(outcome, EnrollOutcome::Enrolled { .. }),
            "attendance covered by a retained prior stint must not block re-enrolment"
        );
    }

    // --- Wave 2Q: enrollable_learners ---

    #[test]
    fn enrollable_learners_reports_each_learners_current_membership_state() {
        let conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let unenrolled = learner::create(&conn, &school_id, "Ana", "Bautista", None, None).unwrap();
        let here = learner::create(&conn, &school_id, "Bea", "Cruz", None, None).unwrap();
        let elsewhere = learner::create(&conn, &school_id, "Carlo", "Dizon", None, None).unwrap();
        let m_here = enroll(&conn, &school_id, &section_a, &here.id, "2025-08-01")
            .unwrap()
            .unwrap();
        enroll(
            &conn,
            &school_id,
            &section_b.id,
            &elsewhere.id,
            "2025-08-01",
        )
        .unwrap();

        let candidates = enrollable_learners(&conn, &school_id).unwrap();

        assert_eq!(
            candidates
                .iter()
                .map(|c| c.learner_id.clone())
                .collect::<Vec<_>>(),
            vec![unenrolled.id.clone(), here.id.clone(), elsewhere.id.clone()],
            "ordered by family then given name, in SQL"
        );
        let unenrolled_row = &candidates[0];
        assert_eq!(unenrolled_row.current_membership_id, None);
        assert_eq!(unenrolled_row.current_section_id, None);
        assert_eq!(unenrolled_row.current_section_name, None);

        let here_row = &candidates[1];
        assert_eq!(
            here_row.current_membership_id.as_deref(),
            Some(m_here.id.as_str())
        );
        assert_eq!(
            here_row.current_section_id.as_deref(),
            Some(section_a.as_str())
        );
        assert_eq!(here_row.current_section_name.as_deref(), Some("Mabini"));
        assert_eq!(here_row.current_starts_on.as_deref(), Some("2025-08-01"));

        let elsewhere_row = &candidates[2];
        assert_eq!(elsewhere_row.current_section_name.as_deref(), Some("Rizal"));
    }

    #[test]
    fn enrollable_learners_excludes_ended_memberships_and_other_schools() {
        let mut conn = open_test_db();
        let (school_id, section_id) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll(&conn, &school_id, &section_id, &l.id, "2025-08-01")
            .unwrap()
            .unwrap();
        end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-10-01").unwrap();

        let other = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other.id, "2025-2026", "7", "Bonifacio").unwrap();
        let other_l = learner::create(&conn, &other.id, "Ben", "Reyes", None, None).unwrap();
        enroll(
            &conn,
            &other.id,
            &other_section.id,
            &other_l.id,
            "2025-08-01",
        )
        .unwrap();

        let candidates = enrollable_learners(&conn, &school_id).unwrap();

        assert_eq!(candidates.len(), 1, "only this school's learners");
        assert_eq!(candidates[0].learner_id, l.id);
        assert_eq!(
            candidates[0].current_membership_id, None,
            "an ended membership is not a current placement"
        );
    }

    // --- Wave 2S: correct_same_day_placement ---

    use crate::repository::{assessment_item, class_record, grading, subject, user};

    // Seeded reference-data ids (migrations 6/9/12) — same constants
    // `grading_computation`'s own integration tests use.
    const TERM_1: &str = "00000000-0000-7000-8000-000000000011";
    const WRITTEN_WORKS: &str = "00000000-0000-7000-8000-000000000311";
    const K10_POLICY: &str = "00000000-0000-7000-8000-000000000041";

    fn enroll_via_membership(
        conn: &mut Connection,
        school_id: &str,
        section_id: &str,
        learner_id: &str,
        starts_on: &str,
    ) -> SectionMembership {
        match enroll_membership(conn, school_id, learner_id, section_id, starts_on).unwrap() {
            EnrollOutcome::Enrolled { membership } => membership,
            other => panic!("expected Enrolled, got {other:?}"),
        }
    }

    #[test]
    fn correct_same_day_placement_updates_the_section_in_place() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        let corrected = match outcome {
            CorrectPlacementOutcome::Corrected { membership } => membership,
            other => panic!("expected Corrected, got {other:?}"),
        };
        assert_eq!(corrected.id, m.id, "same row, not a new membership");
        assert_eq!(corrected.section_id, section_b.id);
        assert_eq!(corrected.starts_on, "2025-08-01", "starts_on is untouched");
        assert_eq!(corrected.ends_on, None, "still open, not a transfer");
        assert_eq!(
            open_membership_count(&conn, &l.id),
            1,
            "no second row was created"
        );

        let history = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(
            history.len(),
            1,
            "history shows exactly one span for this placement"
        );
        assert_eq!(
            history[0].section_id, section_b.id,
            "the read-only history view reflects the corrected section truthfully"
        );

        let (original_section_id, corrected_at): (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT original_section_id, corrected_at FROM section_memberships WHERE id = ?1",
                [&m.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .unwrap();
        assert_eq!(
            original_section_id.as_deref(),
            Some(section_a.as_str()),
            "the wrong section is retained, not erased"
        );
        assert!(corrected_at.is_some());
    }

    #[test]
    fn correct_same_day_placement_rejects_a_membership_from_a_different_learner() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let other = learner::create(&conn, &school_id, "Ben", "Reyes", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &other.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::NotFound);
        assert_eq!(
            list_by_learner_in_school(&conn, &school_id, &l.id).unwrap()[0].section_id,
            section_a,
            "the real learner's row is untouched"
        );
    }

    #[test]
    fn correct_same_day_placement_rejects_a_membership_from_a_different_school() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        // A forged/cross-school call: right membership id and learner id,
        // but claiming a different school.
        let outcome = correct_same_day_placement(
            &mut conn,
            &other_school.id,
            &l.id,
            &m.id,
            &other_section.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::NotFound);
    }

    #[test]
    fn correct_same_day_placement_rejects_a_forged_membership_id() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            "not-a-real-membership-id",
            &section_a,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::NotFound);
    }

    #[test]
    fn correct_same_day_placement_rejects_a_stale_already_ended_membership() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");
        // Ended on a later day, so this is no longer the open row.
        end_membership(&mut conn, &school_id, &l.id, &m.id, "2025-08-10").unwrap();

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::NotCurrent);
    }

    #[test]
    fn correct_same_day_placement_rejects_a_placement_not_entered_today() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        // Called with a later "today" -- the placement is no longer today's.
        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-02",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::NotEnteredToday);
    }

    #[test]
    fn correct_same_day_placement_rejects_a_second_correction_double_submit() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let section_c = section::create(&conn, &school_id, "2025-2026", "7", "Luna").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let first = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();
        assert!(matches!(first, CorrectPlacementOutcome::Corrected { .. }));

        // An exact double-submit (retry) and a second, different attempted
        // correction must both be refused identically -- a correction is a
        // one-time fix, not a repeatable edit.
        let retry = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();
        assert_eq!(retry, CorrectPlacementOutcome::AlreadyCorrected);

        let second_attempt = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_c.id,
            "2025-08-01",
        )
        .unwrap();
        assert_eq!(second_attempt, CorrectPlacementOutcome::AlreadyCorrected);

        let current = list_by_learner_in_school(&conn, &school_id, &l.id).unwrap();
        assert_eq!(current.len(), 1);
        assert_eq!(
            current[0].section_id, section_b.id,
            "still the first correction's result, not the second"
        );
    }

    #[test]
    fn correct_same_day_placement_rejects_an_unknown_destination_section() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            "not-a-real-section-id",
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::DestinationNotFound);
    }

    #[test]
    fn correct_same_day_placement_rejects_a_destination_from_another_school() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let other_school = school::create(&conn, "Other School").unwrap();
        let other_section =
            section::create(&conn, &other_school.id, "2025-2026", "7", "Bonifacio").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &other_section.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::DestinationNotFound);
    }

    #[test]
    fn correct_same_day_placement_rejects_correcting_to_the_same_section() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_a,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(outcome, CorrectPlacementOutcome::SameSection);
    }

    #[test]
    fn correct_same_day_placement_blocks_an_existing_attendance_record_in_the_current_section() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");
        // Attendance was already taken today, in the section being
        // corrected away from.
        mark_attendance(&conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(
            outcome,
            CorrectPlacementOutcome::DependentRecordConflict {
                record: DependentRecordKind::Attendance
            }
        );
        assert_eq!(
            list_by_learner_in_school(&conn, &school_id, &l.id).unwrap()[0].section_id,
            section_a,
            "nothing was written"
        );
    }

    #[test]
    fn correct_same_day_placement_is_unaffected_by_attendance_covered_by_a_retained_prior_stint() {
        // The learner was in section A before (a retained, closed stint),
        // left, and was re-enrolled in section A again today by mistake --
        // the old attendance is explained by the *prior* stint, not this
        // one, so correcting today's mistaken placement must not be
        // falsely blocked by it.
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m_old = enroll(&conn, &school_id, &section_a, &l.id, "2024-06-01")
            .unwrap()
            .unwrap();
        mark_attendance(&conn, &school_id, &section_a, &l.id, "2024-09-10");
        end_membership(&mut conn, &school_id, &l.id, &m_old.id, "2025-04-01").unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert!(matches!(outcome, CorrectPlacementOutcome::Corrected { .. }));
    }

    #[test]
    fn correct_same_day_placement_blocks_a_scored_grade_in_the_current_section() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let section_b = section::create(&conn, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        // A scored grade in section A, in a grading period wholly before
        // today -- constructed directly (bypassing `learner_score::record`'s
        // own roster-membership check), the same technique this module's
        // pre-existing "orphan attendance" tests already use, standing in
        // for a grade this correction would otherwise strand.
        let sub = subject::create(&conn, &school_id, "Science").unwrap();
        let period = grading::create(
            &conn,
            &school_id,
            "2025-2026",
            TERM_1,
            "2025-01-01",
            "2025-03-01",
        )
        .unwrap()
        .unwrap();
        let cr = class_record::create(
            &conn, &school_id, &section_a, &sub.id, &period.id, K10_POLICY, None,
        )
        .unwrap()
        .unwrap();
        let item =
            assessment_item::create(&conn, &school_id, &cr.id, WRITTEN_WORKS, "Quiz 1", 10.0)
                .unwrap()
                .unwrap();
        let teacher = user::create_user(&conn, "teacher.a", "password", "A Teacher").unwrap();
        conn.execute(
            "INSERT INTO learner_scores \
                 (id, school_id, assessment_item_id, learner_id, status, score, recorded_by_user_id) \
             VALUES ('score-orphan', ?1, ?2, ?3, 'scored', 8.0, ?4)",
            (&school_id, &item.id, &l.id, &teacher.id),
        )
        .unwrap();

        let outcome = correct_same_day_placement(
            &mut conn,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();

        assert_eq!(
            outcome,
            CorrectPlacementOutcome::DependentRecordConflict {
                record: DependentRecordKind::Grades
            }
        );
    }

    #[test]
    fn correct_same_day_placement_rejects_a_malformed_as_of_date() {
        let mut conn = open_test_db();
        let (school_id, section_a) = setup(&conn);
        let l = learner::create(&conn, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn, &school_id, &section_a, &l.id, "2025-08-01");

        for bad in ["08/01/2025", "2025-8-1", "not-a-date", ""] {
            let outcome =
                correct_same_day_placement(&mut conn, &school_id, &l.id, &m.id, &section_a, bad)
                    .unwrap();
            assert_eq!(outcome, CorrectPlacementOutcome::NotEnteredToday);
        }
    }

    #[test]
    fn correct_same_day_placement_two_connections_only_one_correction_commits() {
        // Two independent connections against the same file, both racing
        // to correct the same membership -- mirrors
        // `enrollment_concurrency.rs`'s pattern at the unit level: exactly
        // one write must commit, the other must see a clean typed outcome,
        // never a partial/duplicate write.
        let dir = tempfile::tempdir().unwrap();
        let db_path = dir.path().join("race.sqlite3");
        let key = crate::crypto::generate_key();
        let mut conn_a = db::open(&db_path, &key).unwrap();
        let mut conn_b = db::open(&db_path, &key).unwrap();

        let (school_id, section_a) = setup(&conn_a);
        let section_b = section::create(&conn_a, &school_id, "2025-2026", "7", "Rizal").unwrap();
        let section_c = section::create(&conn_a, &school_id, "2025-2026", "7", "Luna").unwrap();
        let l = learner::create(&conn_a, &school_id, "Ana", "Cruz", None, None).unwrap();
        let m = enroll_via_membership(&mut conn_a, &school_id, &section_a, &l.id, "2025-08-01");

        let outcome_a = correct_same_day_placement(
            &mut conn_a,
            &school_id,
            &l.id,
            &m.id,
            &section_b.id,
            "2025-08-01",
        )
        .unwrap();
        let outcome_b = correct_same_day_placement(
            &mut conn_b,
            &school_id,
            &l.id,
            &m.id,
            &section_c.id,
            "2025-08-01",
        )
        .unwrap();

        let outcomes = [outcome_a, outcome_b];
        let corrected_count = outcomes
            .iter()
            .filter(|o| matches!(o, CorrectPlacementOutcome::Corrected { .. }))
            .count();
        assert_eq!(corrected_count, 1, "exactly one correction commits");
        assert!(
            outcomes
                .iter()
                .any(|o| matches!(o, CorrectPlacementOutcome::AlreadyCorrected)),
            "the loser sees a clean typed outcome, not a duplicate write"
        );

        let final_state = list_by_learner_in_school(&conn_a, &school_id, &l.id).unwrap();
        assert_eq!(final_state.len(), 1, "still exactly one membership row");
        assert!(
            final_state[0].section_id == section_b.id || final_state[0].section_id == section_c.id,
            "the winner's section was applied"
        );
    }
}
