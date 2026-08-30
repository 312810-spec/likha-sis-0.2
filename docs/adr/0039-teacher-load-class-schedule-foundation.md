# ADR-0039 — Teacher Load / Class Schedule Foundation

Status: Accepted

## Context

`docs/product/PRODUCT-CONTRACT.md` §6 already set the direction: Teacher
Load is a foundational school-organization record, not merely an SF7
field, and a future schedule-generator/optimizer is an explicit
**hypothesis**, not something to build now. Repository truth confirmed
before designing anything: `class_records` has **no teacher/owner
column at all** (`section_id`, `subject_id`, `grading_period_id`,
`weight_policy_id`, `curriculum_version_id` — never who teaches it).
There is no `teachers` table, no schedule table, no assignment concept
anywhere in this codebase. "Teacher" is already fully represented by
the existing `users` + `user_school_memberships` + `user_school_roles`
(`teacher` role) — no new identity table is needed.

## Research (verified, not assumed)

- **RA 4670 (Magna Carta for Public School Teachers)** and **DepEd
  Order No. 005, s. 2024** ("Implementation Guidelines on Rationalizing
  Teachers' Workload and Overload Compensation," supplemented by DepEd
  Memorandum No. 053, s. 2024): a public school teacher's 8-hour
  workday splits into **at most 6 hours of actual classroom teaching**
  plus 2 hours of ancillary tasks; exceeding 6 hours of classroom
  teaching triggers overload compensation eligibility. **CONFIRMED
  requirement**: teaching load is fundamentally a **time** metric
  (hours/minutes), not merely a count of classes.
- **CONFIRMED**: DO 005 s.2024 explicitly classifies **class-advising
  ("advisory") as an ancillary task**, separate from the 6-hour
  classroom-teaching load. Advisory assignment must **not** be modeled
  as, or counted toward, instructional teaching load in this
  foundation.
- **UNRESOLVED (deliberately not guessed)**: the exact numeric overload
  threshold is authoritative and long-standing (6 hours/day), but this
  milestone does not encode automatic overload enforcement — see
  Decision below.
- **Triangulated, not primary-source-verified this session** (search
  results, not a downloaded DepEd Order PDF — recorded honestly, same
  disclosure standard as prior milestones): the general shape above.
  `docs/SOURCE-REGISTRY.md` records the exact sources.

## Decision

**Three separate concepts, two new tables, load always derived —
Recommended over 9 other internally-scored designs** (class-record-
centered, course-offering model, teacher-centric JSON blob,
schedule-first/no-assignment-identity, a polymorphic "assignment type"
table covering teaching+advisory+ancillary together, and others):

1. **`teaching_assignments`** — _who teaches what, for how long a
   period_. `(id, school_id, teacher_user_id, section_id, subject_id,
created_at)`, `UNIQUE (section_id, subject_id)` — at most one
   teacher per section+subject at a time (matches the documented job
   "avoid duplicate/conflicting assignments"; a reassignment is an
   explicit remove-then-create, not a silent overwrite). Deliberately
   stores **no `school_year`** of its own — derived from
   `sections.school_year` via `section_id`, the exact same
   single-source-of-truth reasoning ADR-0011 already established for
   `class_records`. `teacher_user_id` is validated to be a member of
   `school_id` (via the existing `user::is_member_of_school`) — not
   role-gated to `teacher` specifically, matching how `class_record::create`
   validates its own referenced section/subject by existence-in-school
   rather than by role.
2. **`schedule_meetings`** — _when/where an assignment occurs_, one row
   per recurring weekly slot. `(id, school_id, teaching_assignment_id,
weekday 0-6, starts_at "HH:MM", ends_at "HH:MM", room nullable,
created_at)`. Local wall-clock time as plain `HH:MM` text — the
   Philippines is a single timezone; storing UTC timestamps would add
   pure incidental complexity for zero benefit and real bug risk (a
   recurring Monday 8am class is not a moment in time, it is a
   standing local-clock rule). An exceptional one-off date override is
   explicitly deferred (see Not Built below), but this shape does not
   block adding one later (a nullable `specific_date` column or a
   separate override table, neither designed now).
3. **Teacher Load — always derived, never stored.** No
   `teacher.total_load` column. A load query joins
   `teaching_assignments` → `schedule_meetings` for one teacher and
   returns three independent numbers per PRODUCT-CONTRACT §6's own
   explicit requirement to "track both classroom teaching time and
   distinct preparation count" — never balance on one number alone:
   assignment count, distinct-subject (preparation) count, and total
   weekly instructional minutes. The 6-hour/day RA 4670 threshold is
   **not enforced** this milestone (no reject, no warning) — the
   metric this milestone produces is exactly what a future
   overload-flagging feature would need, but deciding whether to hard
   block, warn, or merely report an overload is a product-policy
   question with no repository evidence yet, not guessed at here.

**Explicitly NOT the same entity as `class_records`, and no FK between
them this milestone.** A class record is scoped to one grading period
(proliferates ~3×/year per subject as terms are set up) and requires a
grading period to already exist; a teaching assignment is a school-year-
long relationship that must be able to exist before any grading period
or class record does (the documented job: assign, then eventually
schedule, then eventually grade). Forcing a link now would mean either
retrofitting `class_records` (an already-stable, four-ADR-deep table)
for a benefit nothing yet needs, or blocking assignment on a class
record existing — a real regression on the documented job. A future
milestone may choose to derive a class record's owning teacher by
matching `(section_id, subject_id, school_year)` against
`teaching_assignments`, entirely without a schema change here.

**Advisory and ancillary duties are explicitly out of scope** — DO 005
s.2024 itself classifies advisory as non-instructional; conflating it
into `teaching_assignments` would misrepresent DepEd's own workload
categories, not just be premature scope.

## Authorization

New `Capability::ManageTeachingAssignments`, **School Head only** —
deliberately not `ManageSchoolMembership` (per this milestone's own
instruction not to reuse it merely because School Head currently owns
it — assigning teachers to classes is a distinct scheduling-authority
decision, not a membership-onboarding one) and not `ManageLearners`
(Registrar's scope is enrollment/records, not staffing). Gates create/
remove of both `teaching_assignments` and `schedule_meetings`.

**Viewing is a separate, narrower rule, not a capability**: a session
may view a teacher's own load/schedule (`teacher_user_id == session's
own user_id`) OR any teacher's load/schedule if the session holds
`ManageTeachingAssignments`. A Teacher must not be able to view (let
alone modify) another teacher's load without School Head authority —
implemented as `auth::authorize_view_teacher_load`, a new small gate
function (not a `Capability` match arm, since it depends on which
teacher is being viewed, not a fixed role set) — mirrors this
codebase's existing pattern of small, purpose-built `authorize_*`
functions rather than forcing everything through one shape.

Every write path derives `school_id` from the session only, never a
client-supplied parameter — the same non-negotiable already established
for every other command in this codebase.

## Consequences

- `src-tauri/src/db/migrations.rs` — migration #18: `teaching_assignments`,
  `schedule_meetings`.
- `src-tauri/src/repository/teaching_assignment.rs` (new) — create,
  remove, replace, list-by-teacher, list-by-section, teacher-load
  derivation.
- `src-tauri/src/repository/schedule_meeting.rs` (new) — create (with
  teacher/section/room conflict detection), remove, list-by-teacher,
  list-by-section.
- `src-tauri/src/auth/mod.rs` — `Capability::ManageTeachingAssignments`;
  `authorize_view_teacher_load`.
- `src-tauri/src/commands/teaching_assignment.rs` (new) — thin command
  wrappers, session-derived `school_id` only.
- **No UI this milestone.** The documented vertical slice ("School Head
  assigns one teacher, sees it reflected in load") is proven at the
  repository/command layer with tests, the same zero-UI proof shape
  RBAC Foundation and Curriculum Foundation both already used
  successfully this program. Inventing a first-ever "Teachers/Personnel"
  screen from nothing is a bigger step than "one thin vertical slice,"
  and the milestone explicitly prohibits building the scheduling
  workspace itself.
- Not built this milestone (explicit non-goals): any timetable
  optimizer/solver; advisory/ancillary duty tracking; personnel
  qualifications/position/designation; availability/constraints;
  relief/substitute suggestion; SF7 export; "My Day" integration; any
  UI; automatic overload enforcement (metric only, no policy decision);
  one-off exceptional-date schedule overrides (shape left open, not
  designed); any change to `class_records`.

## Addendum (Wave 2Y, 2026-08-29): first UI increment — Teaching Assignments

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-2Y-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Why this slice, chosen autonomously**: with Subject Attendance (Wave
2V) and Today's Classes (Wave 2X) both built on `teaching_assignments`,
a real deployed school had no way to actually create one — the
commands existed (`create_teaching_assignment`, `remove_teaching_assignment`,
`list_teaching_assignments_by_section`) since this ADR's original
milestone, but zero UI ever called them, and they had zero test
coverage at the command boundary (only `repository::teaching_assignment`'s
own unit tests exercised them directly, bypassing
`auth::authorize_capability`'s gate entirely). Without this, every
downstream Subject Attendance/Today's Classes screen was only usable
against dev-fixture or test data, never a real school's own setup —
a genuine, foundational teacher-usability gap, the highest-priority
viable candidate recorded at the end of Wave 2X.

**Scope**: one new screen, `TeachingAssignmentsScreen.tsx` — a School
Head assigns and unassigns which teacher teaches which subject for one
section. Reached from `SectionsScreen` via a new "Manage assignments"
per-section action, mirroring the existing "Open roster" →
`SectionRosterScreen` handoff exactly. Deliberately **not** the full
Teacher Load/Class Schedule UI this ADR always envisioned:
`replace_teacher_assignment` (an atomic reassignment convenience),
`create_schedule_meeting` (the weekly schedule builder), and
`get_teacher_load` (the derived-load view) all remain unwired,
carried forward as the next candidates. Reassignment in this slice is
the explicit remove-then-create this ADR's own Decision section already
called out as the intended shape, not a new one invented for the UI.

**New backend surface: `list_school_members`.** Assigning a teacher
requires picking one from a list — this codebase had no command
anywhere that enumerated a school's own members before this wave (only
`user::is_member_of_school`, a boolean check). Added
`repository::user::list_members_in_school` (school-scoped, ordered by
display name, includes each member's role set) and the
`list_school_members` command, gated the same "reference data any
authenticated school member may read" way as
`list_teaching_assignments_by_section` — usernames/display names/roles
within one's own school carry no more sensitivity than what
`AuditLogScreen` already shows. The teacher picker filters client-side
to members holding the `teacher` role; the backend's own `create`
remains intentionally not role-gated (an existing, unchanged decision
from this ADR's original text), so a School Head could in principle
target a non-teacher member through a different client — the UI-level
filter is a usability guard, not a security boundary, consistent with
"security must not rely on UI hiding."

**Security must not rely on UI hiding, applied literally**: any
authenticated school member can view this screen and its assignment
list (matching `list_teaching_assignments_by_section`'s own reference-
data convention), but only a School Head can actually assign or remove
— enforced exclusively by the backend's existing
`Capability::ManageTeachingAssignments` gate. The screen shows the same
form to everyone and surfaces a generic error if the backend declines,
the same convention `SectionsScreen`'s own "Create a section" form
already established; `CurrentSession` still carries no role field, so
there was no client-side way to hide the form even if that had been
wanted.

**Closed a real, pre-existing test gap**: `create_teaching_assignment`/
`remove_teaching_assignment`/`list_teaching_assignments_by_section` had
never been proven at the command boundary in the ~4 waves since this
ADR's original milestone. New `tests/teaching_assignment_management.rs`
(9 tests) proves: a School Head can create/list/remove; a Teacher is
denied on both create and remove; no session is rejected; any school
member can list (reference data); a duplicate `(section_id,
subject_id)` is rejected by the schema's own `UNIQUE` constraint; and
`list_school_members` requires a session and never leaks a different
school's members.

**Verification**: `npm run quality` 658/658 vitest (+21: `SchoolMemberRepository`
adapter + `SchoolMemberApplicationService` tests, 4 more
`TeachingAssignmentRepository` adapter tests, 6
`TeachingAssignmentApplicationService` tests, 8 `TeachingAssignmentsScreen`
tests incl. 2 axe passes, 1 more `SectionsScreen` test for the new
"Manage assignments" action). `npx tsc -b --noEmit` / `eslint` /
`prettier --check` / `check:architecture` all clean. `cargo test`:
**568 lib tests** (+4: `list_members_in_school`'s own unit tests) plus
the new `tests/teaching_assignment_management.rs` (9/9) — zero
regression to any existing suite. `cargo fmt --check` / `cargo clippy
--all-targets -- -D warnings` clean. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged.

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X); no `replace_teacher_assignment`
wiring (an explicit remove-then-create is this ADR's own intended
reassignment shape, not a gap); no schedule-meeting create/edit UI; no
teacher-load view; no independent (non-self) review dispatched for this
bounded slice — retained as debt, consistent with the same pattern
Waves 2V/2W/2X already established.

## Addendum (Wave 2Z, 2026-08-29): Class Schedule — the weekday convention's first write path

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-2Z-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Why this slice**: Wave 2Y let a School Head create teaching
assignments, but a real school still had no way to schedule _when_
those classes meet — `create_schedule_meeting` and
`list_schedule_meetings_by_assignment` existed since this ADR's
original milestone, but no screen ever called them, and (like Wave 2Y's
own commands before it) they had **zero test coverage at the command
boundary**. Building this closes the loop this ADR always intended
("assign, then eventually schedule, then eventually grade") and, not
incidentally, is the first place in this codebase that _writes_ a
`schedule_meetings.weekday` value — completing the round trip the Wave
2X addendum's weekday convention (0 = Sunday … 6 = Saturday, matching
`Date.getDay()`) always needed to be verified against, closing that
wave's own recorded verification debt.

**Scope**: one new screen, `ScheduleMeetingsScreen.tsx` — a School Head
schedules and unschedules one class's weekly meeting times (weekday,
start/end time, optional room). Reached from
`TeachingAssignmentsScreen`'s new per-row "Manage schedule" action,
the same handoff pattern as every prior contextual sub-screen in this
app. The weekday picker's options come from a single new exported
constant, `WEEKDAY_LABELS` (`src/domain/schedule-meeting.ts`), so the
0=Sunday convention is never hand-duplicated at a second call site.
Deliberately **not** the full Teacher Load/Class Schedule UI:
`get_teacher_load` (the derived-load view) remains unwired, carried
forward.

**New backend surface: `remove_schedule_meeting`.** Unlike
`create_schedule_meeting`, no `remove` function existed anywhere for
`schedule_meetings` before this wave — only `create`/`find`/`list`/
`total_weekly_minutes_for_teacher`. Added
`repository::schedule_meeting::remove` (mirroring
`teaching_assignment::remove`'s exact shape: a scoped delete, `true`
iff a row existed) with 3 new unit tests, plus the
`remove_schedule_meeting` command, gated the same School-Head-only
`ManageTeachingAssignments` capability `create_schedule_meeting`
already uses.

**Typed conflict outcomes reach the UI unchanged.** `CreateMeetingOutcome`'s
eight variants (`Created`/`UnknownAssignment`/`InvalidWeekday`/
`InvalidTime`/`TeacherConflict`/`SectionConflict`/`RoomConflict`/
`Duplicate`) were designed at this ADR's original milestone specifically
so a caller could show a specific message — but nothing before this
wave ever consumed them past the repository layer. The new TS
`CreateMeetingOutcome` discriminated union
(`src/domain/schedule-meeting.ts`) mirrors the Rust
`#[serde(tag = "outcome", content = "meeting")]` shape exactly, and
`ScheduleMeetingsScreen` shows a distinct, specific message per
conflict type (a `CONFLICT_MESSAGES` lookup), proving the outcome type
was designed correctly and not merely theoretically complete.

**Closed a second pre-existing test gap**: like Wave 2Y's discovery
about the teaching-assignment commands, `create_schedule_meeting`/
`list_schedule_meetings_by_assignment` had never been proven at the
command boundary. New `tests/schedule_meeting_management.rs` (9 tests)
proves: a School Head can create/list/remove; a Teacher is denied on
create and remove; no session is rejected; a duplicate meeting returns
the typed `Duplicate` outcome at the command boundary (not just the
repository layer); and — the narrower rule
`list_schedule_meetings_by_assignment` actually uses, distinct from
Wave 2Y's open reference-data rule — a teacher can list their own
schedule, cannot list a colleague's, and a School Head can list any
teacher's.

**Verification**: `npm run quality` 678/678 vitest (+20: 3 more
`TeachingAssignmentRepository` adapter tests, 8
`TeachingAssignmentApplicationService` tests for
`listMeetings`/`createMeeting`/`removeMeeting` incl. weekday/time
validation, 8 `ScheduleMeetingsScreen` tests incl. 2 axe passes, 1 more
`TeachingAssignmentsScreen` test for the new "Manage schedule" action).
`npx tsc -b --noEmit` / `eslint` / `prettier --check` /
`check:architecture` all clean. `cargo test`: **571 lib tests** (+3:
`schedule_meeting::remove`'s own unit tests) plus the new
`tests/schedule_meeting_management.rs` (9/9) — zero regression to any
existing suite. `cargo fmt --check` / `cargo clippy --all-targets -- -D
warnings` clean. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X/2Y); no `get_teacher_load` view; no
one-off exceptional-date schedule overrides (this ADR's own long-
standing non-goal, unchanged); no independent (non-self) review
dispatched for this bounded slice — retained as debt, consistent with
the pattern Waves 2V/2W/2X/2Y already established.

## Addendum (Wave 3A, 2026-08-30): Teacher Load — the derived numbers finally have data to show

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-3A-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Why this slice**: `get_teacher_load` and its three independent
numbers (assignment count, distinct-subject/preparation count, weekly
instructional minutes) were designed and implemented at this ADR's
original milestone, but had nothing real to compute from until
Teaching Assignments (Wave 2Y) and Class Schedule (Wave 2Z) gave real
schools a way to create assignments and schedule them. This wave
closes the Teacher Load/Class Schedule track's last remaining unbuilt
read surface.

**Scope**: one new screen, `TeacherLoadScreen.tsx` -- a teacher views
their own derived load: assignment count, distinct subjects, and
weekly instructional time (formatted as "Xh Ym", not raw minutes),
plus the list of assignments counted toward it (reusing
`SubjectAttendanceApplicationService.listMyAssignments`, already
built and tested in Wave 2W, rather than inventing a second "my
assignments" read). Reachable as a normal top-level "My Teaching Load"
nav tab under Daily Teaching -- unlike every other Wave 2Y/2Z/3A
screen, this one needs no contextual handoff, since a teacher always
views their own load with no selection to make first.

**Deliberately self-view only.** `get_teacher_load` is gated by
`auth::authorize_view_teacher_load` (self, or a School Head viewing a
colleague) -- this wave wires only the self path.
`TeacherLoadScreen` is given the signed-in teacher's own
`session.userId`, never a client-supplied target id, so there is no
new surface for a Teacher to probe a colleague's load. A School Head
viewing another teacher's load (the same picker problem Wave 2Y
already solved once for assignment creation, via `list_school_members`)
is a deferred candidate, not attempted here.

**Zero new backend surface.** `get_teacher_load` already existed,
already gated, already unit-tested at the repository level since this
ADR's original milestone. This wave adds no Rust code at all --
confirmed by `git status` touching only TypeScript files. The only new
surface is a `getLoad` method threaded through the already-shared
`TeachingAssignmentRepository` port (the same port Waves 2W/2X/2Y/2Z
already extended) and its `TeachingAssignmentApplicationService`
wrapper.

**Verification**: `npm run quality` 686/686 vitest (+8: 1 more
`TeachingAssignmentRepository` adapter test, 2
`TeachingAssignmentApplicationService.getLoad` tests, 5
`TeacherLoadScreen` tests incl. 1 axe accessibility pass and a
retryable-error case). `npx tsc -b --noEmit` / `eslint` / `prettier
--check` / `check:architecture` all clean. **Zero Rust files touched**
-- confirmed by `git status`; `cargo test` reconfirmed 571/571
unchanged as part of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged.

**Deliberately not built**: no School-Head-views-a-colleague's-load
UI (deferred, see above); no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X/2Y/2Z); no overload-threshold
warning/enforcement (this ADR's own long-standing, deliberate non-goal
-- the metric this wave finally displays is exactly what a future
overload-flagging feature would need, but whether to warn or block on
RA 4670's 6-hour/day threshold remains an unanswered product-policy
question, unchanged from this ADR's original text); no independent
(non-self) review dispatched for this bounded slice -- retained as
debt, consistent with the pattern Waves 2V/2W/2X/2Y/2Z already
established.
