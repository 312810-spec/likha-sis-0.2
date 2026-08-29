# LIKHA-SIS 0.2 — Subject Attendance

Status: Approved product requirement; implementation not started
Added: 2026-08-29

## Purpose

Subject Attendance helps subject teachers check whether learners attended a specific scheduled class. It is an internal monitoring tool similar in speed and familiarity to attendance checking, but it is not an official School Form and is not part of SF2.

## Non-negotiable boundary

- Subject Attendance and SF2 are separate records with separate ownership.
- A subject teacher's entry must never automatically create, replace, or edit an SF2 entry.
- SF2 remains the official daily attendance record managed through its authorized workflow.
- Advisers may view subject-attendance patterns for follow-up, but any SF2 correction remains a deliberate, separately authorized action.
- Subject Attendance must not automatically change grades, conduct marks, enrollment status, or other official records.

## Teacher workflow

1. LIKHA opens the teacher's current scheduled class when the schedule is available.
2. The teacher confirms the subject, section, date, and class period.
3. The enrolled roster loads automatically.
4. Everyone starts unmarked; the teacher may use **Mark all present** and change exceptions.
5. Each learner may be marked **Present**, **Absent**, **Late**, or **Excused**.
6. The teacher saves locally even without internet.
7. The completed session shows its attendance count and last-saved time.

If there is no usable schedule, the teacher may manually choose an assigned subject and section. The app must not guess an assignment the teacher does not own.

## Session-level controls

A scheduled meeting may be marked:

- **Held** — learner attendance can be recorded.
- **No class** — for suspension, holiday, school activity, teacher leave, or another reason.
- **Not checked** — the class may have happened, but no attendance was submitted.

`No class` and `Not checked` must remain different so reports do not misrepresent missing entries as learner absences.

## Main screens

### Today's Classes

- Chronological list of the signed-in teacher's subject schedules.
- Clear states: upcoming, open, completed, no class, and not checked.
- One-tap **Check attendance** for the current class.
- Offline status and unsynced-change indicator.

### Attendance Check

- Subject, section, date, start/end time, and session state.
- Searchable roster with large tap targets.
- Mark all present, then change exceptions.
- Counts update immediately.
- Save draft locally and finish attendance.
- Reopening a finished session shows who changed it, when, and why.

### Subject Monitor

- Learner-by-learner attendance history for one subject.
- Counts and rate for Present, Absent, Late, and Excused.
- Flags for repeated or consecutive absences.
- Date/session drill-down and printable/exportable summary.
- No automatic grade deduction or disciplinary conclusion.

### Adviser View

- Read-only subject-attendance signals across the adviser's class, permission permitting.
- Shows patterns and discrepancies for follow-up.
- Clearly labeled **Subject attendance — not SF2**.
- No one-click or automatic conversion into official attendance.

## Authorization

- Subject teachers may create and amend attendance only for subject-section assignments they are authorized to teach and only within the applicable school year/term.
- Advisers may view their advisory class's subject-attendance patterns but do not silently gain edit access to another teacher's records.
- School heads or authorized administrators may review records according to school policy.
- Every record is school-scoped. School A must never read or modify School B records.
- Amendments retain an audit trail: actor, device, time, prior value, new value, and reason when required.

## Data model direction

Use a session-centered model rather than reusing SF2 tables:

- `subject_attendance_session`: school, school year, term, teaching assignment, section, subject, scheduled date/time, actual status, creator, timestamps, version.
- `subject_attendance_entry`: session, exact learner membership, status, optional short note, creator/updater, timestamps, version.
- Reference the exact enrollment membership and exact teaching assignment to prevent stale-roster and cross-school mistakes.
- Support offline local writes, stable IDs, idempotent synchronization, conflict detection, and audit history.
- Do not store this feature as columns inside an SF2 record.

## Important behavior

- Newly enrolled, transferred, or ended learners follow the roster valid for the session date.
- A stale open screen must not overwrite a newer submission without a visible conflict.
- Duplicate saves or sync retries must not create duplicate sessions or entries.
- Corrections after completion require reopening or amendment behavior, not silent replacement.
- Optional notes must remain brief and must not encourage sensitive medical or disciplinary details.
- Attendance percentages must state their denominator and exclude `No class` sessions.

## Comfort modes

- **Efficient:** dense roster, keyboard shortcuts, rapid status keys, and fast next-class navigation.
- **Comfortable:** default balanced layout with Mark all present and clear exceptions.
- **Guided:** larger controls, one clear step at a time, persistent explanations, strong save confirmation, and easy recovery.

All three modes have the same capabilities and permissions.

## Recommended implementation order

1. Domain rules and separate storage contract.
2. Authorized teaching-assignment and date-valid roster lookup.
3. Local/offline session creation and attendance entry.
4. Today's Classes and Attendance Check screens.
5. Amendment, conflict, and audit behavior.
6. Subject Monitor and adviser read-only signals.
7. Sync, export, accessibility, Windows keyboard, and Android touch verification.

## Acceptance criteria for the first usable slice

- A subject teacher can open an assigned subject-section roster and record one class session offline.
- Mark all present plus exception editing works in all three comfort modes.
- The saved subject session survives restart.
- The feature cannot alter SF2 or any official School Form record.
- An unauthorized teacher cannot access or modify another assignment.
- Transfers and ended memberships are correct for the session date.
- Duplicate save and stale-edit cases are tested.
- Windows keyboard use and Android-sized touch use are verified.

## Deferred enhancements

- Optional adviser notifications for repeated subject absences.
- Configurable school thresholds for follow-up, with no automatic punishment.
- Parent/guardian communication workflows after privacy and authorization review.
- QR, NFC, face recognition, or biometric attendance are out of scope unless separately researched and approved.
