# ADR-0018 — Bulk Attendance: Mark All Present (M18)

Status: Accepted

## Context

The user's directed roadmap named M18 "Bulk Attendance / Teacher
Productivity," continued autonomously per
`.claude/rules/autonomous-development.md` once M17 was verified and
recorded. `docs/PROGRESS-MAP.md`'s own out-of-scope note had already
named the concrete example: "bulk attendance actions (e.g. 'mark all
present')" — this was real, standing scope guidance from earlier
milestones, not a fresh invention.

A real question worth checking before implementing: does an unmarked
attendance day already behave like "present" anywhere in this app? If
so, a bulk-mark feature might be cosmetic. Checked
`export::sf2::status_code` (`None | Some(Present) => ""` — an unmarked
day renders identically to an explicit Present in the exported CSV) and
`repository::attendance::monthly_grid_for_section` (an unmarked day
contributes to neither `present_count` nor `absent_count`/`tardy_count`,
and the SF2 export only ever prints the Absent/Tardy totals, not a
Present total). So the export output is unaffected either way — the
real value of an explicit Present mark is auditability: a `recorded_at`
timestamp proving the day was actually checked, and preventing a
forgotten mark from silently defaulting to "present" in every reader's
mind when nobody actually confirmed it. The productivity problem is
real: a teacher currently must click "Present" once per learner, every
day, even though most classes are fully present most days.

## Decision

Added `repository::attendance::bulk_mark_present(conn, school_id,
section_id, attendance_date)`: marks every learner on the section's
roster for that date who does **not** already have a status as Present,
and leaves every already-marked learner (Present, Absent, or Tardy)
untouched. This is a deliberate, tested guarantee — not "mark everyone
present," which would silently discard a teacher's own prior work if
they'd already flagged an absence before clicking the bulk button. No
new architecture decision: the function reuses `record()` (the same
isolation-checked write path individual marks already go through) and
`roster_for_section_date` (the same read path the screen already uses)
rather than introducing a new query pattern.

`commands::attendance::bulk_mark_attendance_present` follows the exact
convention of every other attendance command: `school_id` is
session-derived, `section_id` is a legitimate client-supplied
identifier scoped by the existing isolation-checked queries underneath.

`AttendanceScreen` gained a "Mark all present" button, disabled once
every roster row already has a mark (nothing left to do), with a
Guided-mode hint explaining the never-overwrites guarantee explicitly —
a teacher should not have to trust that silently, especially right next
to a button that writes data for the whole class at once. A confirmation
banner reports exactly how many learners were newly marked, distinct
from "everyone already had a mark — nothing changed," so the action's
effect is never ambiguous after the fact.

## Consequences

- New Rust: `repository::attendance::bulk_mark_present` (3 new tests:
  marks-the-unmarked, never-overwrites-an-existing-mark,
  never-marks-outside-the-caller's-school),
  `commands::attendance::bulk_mark_attendance_present`, registered in
  `lib.rs`. 3 new integration tests in `tests/attendance_management.rs`
  (session-required, cross-school isolation, marks-the-caller's-own-
  roster) mirroring the existing `record_attendance`/`roster_for_date`
  coverage pattern exactly.
- New TS: `AttendanceRepository.bulkMarkPresent`,
  `TauriAttendanceRepository.bulkMarkPresent`,
  `AttendanceApplicationService.bulkMarkPresent` (same date-format/
  future-date validation as `recordAttendance`), and the
  `AttendanceScreen` button/banner. Every existing
  `implements AttendanceRepository` fake across the test suite
  (`AttendanceScreen.test.tsx`, `attendance-service.test.ts`,
  `attendance-repository.test.ts`, `MonthlySummaryScreen.test.tsx`)
  updated for the new interface method.
- **Verification actually run this session**: `cargo test` — 220 lib (up
  from 217; +3) + 54 integration tests (up from 51; +3), all green
  (one `authorize_school_membership_grant_allows_a_session_scoped_to_the_same_school`
  failure appeared once under full-suite parallel execution and passed
  both in isolation and on a full-suite rerun — the same transient,
  pre-existing flakiness class already documented in
  `docs/PROJECT-MEMORY.md`'s M12b note, not a regression from this
  change). `cargo clippy --all-targets -D warnings` clean. `npm run
quality` — 256 TS tests (up from 249), typecheck/lint/format/
  architecture-boundary all clean. `npm run build` succeeds.
- **Independent review**: not dispatched. No new authorization surface
  (`bulk_mark_attendance_present` follows the identical session-derived-
  scope pattern as every existing attendance command) and no new write
  path (`record()` itself, already reviewed via M7's `security-reviewer`
  episode, is the only function that actually inserts/updates a row
  here).
- **Visual verification**: not attempted — same standing gap as every
  UI milestone since M5/M12c (this environment has no
  browser/screenshot tool for the compiled native Tauri app; a plain
  `vite dev` browser preview has no Tauri IPC bridge and cannot reach an
  authenticated screen). `npm run build` confirms the bundle compiles
  and bundles correctly; the button's actual rendered appearance and the
  confirmation banner's wording in context are not visually confirmed.
- Not implemented (deliberately out of scope): a bulk action for
  Absent/Tardy (no clear teacher-workflow justification the way
  "assume present, then flag exceptions" has — a wrong-status bulk
  action is a much larger footgun with no offsetting productivity case
  made yet); full section-roster management UI, bulk enrollment
  (unrelated to attendance marking itself, still open per
  `docs/ACTIVE-PLAN.md`'s Out of Scope list).
