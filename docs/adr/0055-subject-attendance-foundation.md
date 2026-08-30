# ADR-0055: Subject Attendance Foundation (Wave 2V)

Status: Accepted
Date: 2026-08-29

## Context

The user (owner) supplied a full product specification,
`docs/product/SUBJECT-ATTENDANCE-SPEC.md`, for a new feature: **Subject
Attendance** — a per-subject, session-based attendance check a subject
teacher uses to record whether their own students attended a specific
scheduled class period. It is explicitly and permanently **not** School
Form 2 (the official daily attendance record) and must never be able to
become SF2 by sharing storage, authorization, or workflow with it.

This is a genuinely new domain, the same class of decision as RBAC
(ADR-0036), Curriculum/Key-Stage Versioning (ADR-0037), and Teacher
Load/Class Schedule (ADR-0039) — it gets its own ADR rather than folding
into an existing one.

## Decision

### Schema: session-centered, not columns on `attendance_records`

`subject_attendance_sessions` (one row per class-meeting-per-day) +
`subject_attendance_entries` (one row per learner-per-session), migration 22. Two independent invariants enforced as real database constraints, not
application-level check-then-act:

- `UNIQUE (teaching_assignment_id, session_date)` — one session per class
  per day.
- `UNIQUE (session_id, membership_id)` — one entry per learner per
  session.

`session.status` is intentionally two-valued (`held`/`no_class`). The
spec's third state, "not checked," is deliberately **not stored** — it
is the absence of any row for a given `(teaching_assignment_id,
session_date)`, reusing the "no row = not yet recorded" idiom
`attendance_records` already established (see the M12b note in
`docs/PROJECT-MEMORY.md`). This means "not checked" cannot drift from
reality — there is nothing to keep in sync.

`entries.membership_id` (not a bare `learner_id`) references the exact
enrollment span, the same discipline `section_membership::current_roster`
already established for Section Roster — this is what prevents a
stale-roster mistake if a learner transfers out between when a session
opens and when it is marked.

### Domain: `repository::subject_attendance`, reusing existing queries

`open_or_get_session`/`mark_no_class` are idempotent
(`INSERT ... ON CONFLICT DO NOTHING` then a `SELECT`) — a duplicate save
or a sync retry can never create a second session, closing the spec's own
explicit requirement without a check-then-insert race. `roster_for_session`
reuses `section_membership::current_roster` unchanged — the authoritative
"who was actually enrolled that day" query Section Roster (Wave 2O)
already proved — rather than a second, competing roster query.
`mark_all_present` reuses the same "never overwrite an existing mark"
idiom `attendance::bulk_mark_present` (M18) already established.

`record_entry` returns a typed `RecordEntryOutcome`
(`Recorded`/`SessionNotFound`/`SessionIsNoClass`/`MembershipNotInSession`)
rather than a raw DB error or a silent `None` — a `NoClass` session and a
membership that doesn't belong to the session's own section are both
refused explicitly, proven by dedicated tests, not merely asserted.

### Authorization: own-assignment, not a school-wide `Capability`

A new `subject_attendance::authorize_own_assignment(conn, user_id,
school_id, teaching_assignment_id)` gate, deliberately **not** a
`Capability` match arm. Every existing `Capability` (`ManageLearners`,
`ManageSchoolMembership`, `ManageTeachingAssignments`) authorizes a fixed
role across the _whole school_; whether Subject Attendance's write is
authorized depends on _which_ assignment is targeted, not on a fixed role
set — the same reasoning `auth::authorize_view_teacher_load`'s "self"
branch already used for exactly this shape of check. Placed in
`repository::subject_attendance` itself (not `auth::mod`) since the rule
is specific to this one domain, not a general session/role primitive.

Every command in `commands::subject_attendance` calls this gate before
touching any data. Where a command also takes a `session_id`, the
resolved session's own `teaching_assignment_id` is cross-checked against
the caller-supplied one — a caller cannot pass a real assignment they own
alongside a `session_id` that actually belongs to a different one.

### Scope: domain/repository/command layer only, no UI this wave

Matches this project's established zero-UI-first precedent for a new
domain (RBAC, Curriculum, Teacher Load, Wave 2A all shipped their first
increment with full test coverage and no screen). The spec's own
"Recommended implementation order" lists domain rules and the roster
lookup as steps 1-2, before any screen; this wave delivers exactly that.
Today's Classes / Attendance Check / Subject Monitor / Adviser View are
explicitly deferred to a future wave, once this foundation is proven.

## Deliberately not built this wave

- No UI screen — see above.
- No adviser or School-Head read access to another teacher's Subject
  Attendance records — the spec's "Adviser View" is explicitly a later
  step (step 6 of the recommended order); building it now would mean
  designing a second authorization shape (an adviser viewing _someone
  else's_ subject data) without a screen to prove it against.
- No amendment/audit-trail columns beyond `created_by_user_id` /
  `updated_by_user_id` / `updated_at` — the spec's fuller "actor, device,
  time, prior value, new value, reason" audit trail is a real requirement
  for a later wave once amendment (not just record-then-amend-via-upsert)
  is itself designed.
- No sync/offline-conflict handling beyond what SQLite/the existing
  `Mutex<Connection>` serialization already provides — this schema is
  offline-write-ready (stable UUIDv7 ids, idempotent session creation),
  but no cloud sync exists anywhere in this codebase yet to test against.
- No export or Subject Monitor aggregation queries.
- Zero change to `attendance_records`, `AttendanceStatus`, SF2 export, or
  any existing attendance code path — confirmed by `git diff --stat`
  touching only new files plus three registration lines
  (`repository/mod.rs`, `commands/mod.rs`, `lib.rs`).

## Verification

`cargo test`: 564 lib tests (+18 — 14 new `repository::subject_attendance`
unit tests + 4 new migration tests), all integration binaries green
including the new `tests/subject_attendance.rs` (7/7 command-boundary
tests: own-assignment success; a different teacher denied; no session
denied; cross-teacher entry-write denied; `mark_all_present` never
overwrites; cross-school session listing denied; idempotent re-open).
`cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` clean.
`npm run quality` 600/600 vitest unchanged (Rust-only wave, zero
frontend files touched). `npm run quality:security` clean, no new
dependency. `npm run harness:verify` exactly 100/100, unchanged — not
reopened. `npm run build` + `check:dev-preview-isolation` pass.

## Review

Self-review covered: the two `UNIQUE` constraints actually reject a
duplicate (proven by migration tests, not assumed); `authorize_own_assignment`
denies a different teacher at the same school (proven);
`record_entry`/`mark_all_present`/`roster_for_session` all resolve
`school_id`-scoped queries only, never leaking a different school's data
(proven — `list_sessions_for_assignment_never_leaks_a_different_schools_sessions`,
`a_second_school_never_sees_the_first_schools_sessions`); a session
marked `NoClass` refuses further entry writes (proven); a membership from
a different section, or one not yet enrolled on the session's date, is
refused (both proven with dedicated tests, not merely reasoned about). No
independent (non-self) review was dispatched for this bounded foundation
slice — retained as debt in `docs/VERIFICATION-DEBT.md`, consistent with
several recent waves' own pattern.

## Addendum (Wave 2W, 2026-08-29): first UI increment

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-2W-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Scope**: a single new screen, `SubjectAttendanceScreen.tsx`, covering
the spec's own recommended-order steps 3-4 (local/offline session
creation + the Attendance Check screen) in one slice, since they're
inseparable in practice — a session must exist before there's a roster
to check. Today's Classes (a full schedule-driven list of a teacher's
classes) and Subject Monitor/Adviser View remain deferred, matching the
spec's own later steps.

**A real design question surfaced and was resolved before writing any
UI code**: should selecting a class+date eagerly call
`open_or_get_session` (creating a `Held` row) just from browsing? No —
that would silently convert every visited date into "checked" and
destroy the "not checked" (no row) signal a future Today's Classes list
needs to be meaningful. Resolved by calling the existing, already-tested
`list_subject_attendance_sessions` command first (no session-creating
side effect) and only showing the roster once a session already exists
for that date; two explicit teacher-initiated actions, "Check
attendance" (opens a `Held` session) and "No class today" (marks
`NoClass`), are shown instead when none exists yet — matching the
spec's own "Session-level controls" section literally. **Zero backend
change was needed** for this — `list_subject_attendance_sessions`
already existed from Wave 2V.

**Architecture**: a new narrow port, `TeachingAssignmentRepository`
(one method, `listMine(teacherUserId)`), deliberately reuses the
already-built, already-tested `list_teacher_assignments` command
(Teacher Load/Class Schedule Foundation) rather than building any part
of the still-deferred Teaching Assignment/Class Schedule UI — this is
not that UI, only enough for a teacher to pick which of their own
classes they're checking. `SubjectAttendanceRepository` (six methods)
mirrors the six Wave 2V commands directly. Both flow through a new
`SubjectAttendanceApplicationService` (shape/non-empty/date-format
validation only, matching every other `*ApplicationService`'s
convention) wired in `composition.ts`, and a new `subject-attendance`
tab under the existing "Daily Teaching" nav group.

**UI pattern reuse**: the screen's roster/mark/mark-all-present
structure directly mirrors `AttendanceScreen.tsx` (per-learner write-
generation guard against out-of-order responses, `role="group"`
status-button clusters, the same "Mark all present never overwrites"
copy and disabled-state logic) — no new interaction pattern was
invented for this screen.

**Deliberately not done**: the new screen was **not** wired into the
dev-preview fixture (`src/dev-preview/fixtures.ts`), so it has no real
browser-rendered (Playwright/axe) screenshot coverage this wave, only
jsdom + axe-core — the same disclosed gap Wave 2U's own new UI left
open, judged an acceptable, consistent tradeoff rather than expanding
this wave's scope further. Recorded as debt, not silently skipped.

**Verification**: `npm run quality` 625/625 vitest (+25: 8 application-
service tests, 6 `TauriSubjectAttendanceRepository` adapter tests, 1
`TauriTeachingAssignmentRepository` adapter test, 9 screen tests
including 2 axe accessibility passes — not-checked-yet state and a
populated roster). `npx tsc -b --noEmit` / `eslint` / `prettier --check`
/ `check:architecture` all clean. Zero Rust files touched — confirmed by
`git status`; `cargo test` reconfirmed 564/564 unchanged as part of
`npm run quality:full`. `npm run build` + `check:dev-preview-isolation`
pass. `npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

## Addendum (Wave 2X, 2026-08-29): Today's Classes and the weekday convention

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-2X-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Scope**: a single new screen, `TodaysClassesScreen.tsx` — the spec's
own "Today's Classes" main screen — listing every class the signed-in
teacher meets today, in schedule order, each with its Subject Attendance
status (Not checked / Checked / No class) and a "Check attendance"
action that hands off to `SubjectAttendanceScreen` with the class (and
today's date, already `SubjectAttendanceScreen`'s own default)
preselected. Subject Monitor and Adviser View remain deferred, matching
the spec's own later steps.

**A real correctness question, not a design preference, surfaced and
was resolved before writing any UI code**: `schedule_meetings.weekday`
(`i64`, `CHECK BETWEEN 0 AND 6`, added by Teacher Load/Class Schedule
Foundation, ADR-0039) has never had a documented calendar meaning
anywhere in this codebase — confirmed by an exhaustive search of
`src-tauri/src/`, its migration tests, and ADR-0039 itself, none of
which assign a specific day to any of the six integers, and nothing
before this wave ever read the column outside its own table. This
screen is the first code to give it real-world meaning, and needed one
to compare against JavaScript's `Date.getDay()`. Rather than guess or
silently pick one, the convention is now established and documented at
its single point of use, `src/domain/schedule-meeting.ts`: **0 = Sunday
… 6 = Saturday**, chosen because it matches `Date.prototype.getDay()`
exactly (no conversion table needed in the screen). This binds any
future schedule-creation UI to the same numbering — recorded here as
the durable decision, not merely as a code comment, per `CLAUDE.md`'s
ADR requirement.

**Architecture**: `TeachingAssignmentRepository` gained one more read
method, `listMeetings(teachingAssignmentId)`, reusing the existing,
already-tested `list_schedule_meetings_by_assignment` command
(Teacher Load/Class Schedule Foundation) — zero new backend surface.
`SubjectAttendanceApplicationService` gained a thin validated
passthrough, `listMeetings`. The screen itself computes today's
occurrences client-side: for each of the teacher's assignments, fetch
its meetings, keep only those on today's weekday, and for any that
match, fetch that assignment's sessions and look up today's date the
same "no row = not checked" way `SubjectAttendanceScreen` already does
— no new backend query, no new "today's classes" command.

**Handoff pattern**: `SubjectAttendanceScreen` gained one new optional
prop, `initialAssignmentId`, verified against the loaded assignment list
before use and applied only as a mount-time default — the same shape as
`AttendanceScreen`'s existing `initialSectionId` and
`MonthlySummaryScreen`'s `initialSectionId`/`initialYearMonth`, not a
new pattern. `App.tsx` gained one more narrowly-typed handoff variable,
`subjectAttendanceAssignmentId`, set only by
`TodaysClassesScreen`'s `onCheckAttendance` callback.

**A lint rule caught a real (if minor) issue**: the project's `eslint`
config includes `react-hooks/set-state-in-effect`, which flagged the
screen's mount effect for calling `load()` (itself calling `setLoading`
synchronously) directly in the effect body. Suppressed with the same
`// eslint-disable-next-line react-hooks/set-state-in-effect` pattern
already used in `SectionRosterScreen.tsx` and `MonthlySummaryScreen.tsx`
for the identical load-on-mount-or-service-change shape — a deliberate,
already-precedented pattern, not a bug.

**Deliberately not done**: no new dev-preview fixture wiring (same
disclosed, consistent tradeoff as Waves 2U and 2W); no change to
`TeacherWorkspaceScreen` to link into Today's Classes — left for a
future wave once the whole daily-teaching entry-point flow is
reconsidered together, rather than adding an ad hoc link now.

**Verification**: `npm run quality` 637/637 vitest (+12: 2 new
`SubjectAttendanceApplicationService.listMeetings` tests, 1 new
`TauriTeachingAssignmentRepository.listMeetings` adapter test, 1 new
`SubjectAttendanceScreen` `initialAssignmentId` test, 8
`TodaysClassesScreen` tests including 2 axe accessibility passes).
`npx tsc -b --noEmit` / `eslint` / `prettier --check` /
`check:architecture` all clean. Zero Rust files touched — confirmed by
`git status`; `cargo test` reconfirmed 564/564 unchanged, `cargo fmt
--check` / `cargo clippy --all-targets -- -D warnings` clean, all as
part of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean
(gitleaks + `cargo deny check` + OSV-Scanner), no new dependency. `npm
run harness:verify` still exactly 100/100, unchanged.

## Addendum (Wave 3D, 2026-08-30): Subject Monitor, and splitting it from Adviser View

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-3D-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Scope**: the spec's own "Subject Monitor" (recommended-order step 6,
half of what earlier addenda listed together as "Subject Monitor /
Adviser View") — a per-learner attendance report for one teaching
assignment: present/absent/late/excused counts across every `held`
session recorded so far, plus the learner's current consecutive-absence
streak. A new screen, `SubjectMonitorScreen.tsx`, reachable directly
from the Daily Teaching nav group (`subject-monitor` tab), mirroring
`SubjectAttendanceScreen`'s own class-picker/date-field shape.

**Splitting Subject Monitor from Adviser View was a deliberate scoping
decision, made before writing any code, not an oversight.** Every prior
addendum bundled the two under one heading because the spec does, but
they need fundamentally different authorization shapes:

- **Subject Monitor** reads data the caller already owns — the exact
  same `authorize_own_assignment` gate every other Subject Attendance
  command already uses. Zero new authorization design.
- **Adviser View** (a colleague or adviser viewing _someone else's_
  Subject Attendance data) requires an "adviser of a section"
  relationship that **does not exist anywhere in this codebase's
  schema** — confirmed by an exhaustive grep across `src-tauri/src/`,
  every migration, and every ADR: not a column on `sections`, not a
  role, not enforced anywhere. Even SF2's own `commands/attendance.rs`
  — informally called "adviser-facing" in `PRODUCT-CONTRACT.md` as a UX
  label only — gates purely on `require_active_school_scope`, with no
  adviser-specific check at all. Building Adviser View now would mean
  inventing that relationship for the first time, cross-cutting SF2,
  SF5, SF9, and general RBAC, with no existing pattern to extend —
  exactly this project's own bar (`.claude/rules/autonomous-development.md`)
  for a decision warranting the established 10-scenario evaluation
  process, not a quick implementation piggybacked on this wave. It
  remains deferred, recorded as a real next-slice candidate, not
  quietly dropped.

**A real correctness bug was caught by TDD before shipping, not found
in review.** The first implementation of the consecutive-absence streak
walked only the `subject_attendance_entries` rows that exist for a
learner (an inner join against `subject_attendance_sessions`). A `held`
session the teacher opened but never marked for one particular learner
produces no entry row at all for that learner — so that gap session was
invisible to the streak calculation instead of breaking it, silently
bridging two non-adjacent absences into a false "consecutive" streak. A
dedicated test,
`monitor_for_assignment_streak_stops_at_an_unmarked_session_never_counting_it`,
written before the fix, caught this (expected streak `1`, got `2`). The
fix walks the complete ordered list of every `held` session id for the
assignment (not merely ones with an entry), looking up
`(session_id, membership_id)` in a map built from the actual entries —
a session with no entry for that learner now explicitly breaks the
streak, matching `SubjectAttendanceMonitorRow::currentConsecutiveAbsences`'s
own documented contract ("an unmarked session never counts as absent
and always breaks the streak").

**Deliberately no automatic flag or threshold** beyond the raw streak
number — the spec explicitly defers configurable school thresholds for
follow-up as a later, separately-designed enhancement; guessing at one
here would mean inventing a DepEd-adjacent policy this project has no
authority to invent.

**Architecture**: one new Rust function,
`subject_attendance::monitor_for_assignment`, and one new command,
`subject_attendance_monitor`, gated identically to every other command
in `commands/subject_attendance.rs`. Rows are scoped to
`section_membership::current_roster` as of the requested date — the
same "current roster" convention every other Subject Attendance screen
already uses — so a learner who has since transferred out no longer
appears, confirmed by a dedicated test. Frontend gained
`SubjectAttendanceMonitor`/`SubjectAttendanceMonitorRow` domain types
mirroring the Rust types exactly, one new port/adapter/service method
(`monitor`), and the new screen.

**Deliberately not built this wave**: Adviser View (see above); no
dev-preview-fixture wiring (same disclosed, consistent tradeoff recent
waves' new UI left open); no configurable absence-streak threshold or
automatic flag (see above).

**Verification**: `npm run quality` 705/705 vitest, up from Wave 3C's
696/696 (+9: 1 `TauriSubjectAttendanceRepository.monitor` adapter test,
2 `SubjectAttendanceApplicationService.monitor` tests, 6
`SubjectMonitorScreen` tests including 1 axe accessibility pass).
`npx tsc -b --noEmit` / `eslint` / `prettier --check` /
`check:architecture` all clean. `cargo test`: 579 lib tests (+8: the
monitor repository tests, including the streak/gap-handling test
above) and all existing integration binaries green, including 2 new
`tests/subject_attendance.rs` command-boundary tests
(`a_teacher_can_view_the_monitor_for_their_own_assignment`,
`a_teacher_cannot_view_the_monitor_for_an_assignment_they_do_not_own`).
`cargo fmt --check` / `cargo clippy --all-targets -- -D warnings`
clean, all as part of `npm run quality:full` (exit 0). `npm run build`

- `check:dev-preview-isolation` pass. `npm run quality:security` clean
  (gitleaks + `cargo deny check` + OSV-Scanner), no new dependency. `npm
run harness:verify` still exactly 100/100, unchanged.

## Addendum (Wave 3F, 2026-08-30): Adviser View

Full delivery report: `../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-3F-FINAL-REPORT.md`
(kept outside tracked source, per `CLAUDE.md`).

**Scope**: the spec's own "Adviser View" (recommended-order step 6,
the other half of "Subject Monitor / Adviser View" split apart back in
the Wave 3D addendum above) — read-only Subject Attendance signals
across every subject taught in one section, for that section's
adviser. This wave was unblocked entirely by Wave 3E's Section Advisory
Foundation (`docs/adr/0056-section-advisory-foundation.md`), which
built and fully tested `auth::authorize_adviser_of_section` but
deliberately left it uncalled by any command. This wave is the first
to actually wire that gate to real functionality.

**Backend**: one new function,
`subject_attendance::adviser_monitor_for_section(conn, school_id,
section_id, as_of_date) -> AppResult<Vec<AdviserAssignmentMonitor>>`,
placed directly after `monitor_for_assignment` since it's a thin
aggregation over it — for every teaching assignment in the section
(`teaching_assignment::list_by_section_in_school`), it calls the
existing, already-TDD-proven `monitor_for_assignment` and collects the
results with enough identity (`subjectName`, `teacherUserId`) for an
adviser to tell which subject and colleague each row belongs to. This
function does no authorization of its own — matching this codebase's
established layering, it trusts `school_id`/`section_id` as already
verified by its caller. One new command,
`adviser_section_monitor`, gated by
`auth::authorize_adviser_of_section` and using only the `school_id`
that gate returns (never a client-supplied one) to call the repository
function — the same "authorize first, then use only the
gate-returned, session-derived school_id" shape every other
authorization-gated command in this codebase already follows.

**Frontend**: `AdviserAssignmentMonitor` domain type mirroring the
Rust struct; one new port/adapter/service method
(`adviserSectionMonitor`); a new screen, `AdviserViewScreen.tsx`, with
a section picker and an "as of" date field, rendering each subject's
own Subject Monitor table grouped under a heading. The picker lists
**every** section in the school (reusing the existing, already-reviewed
`list_sections_by_school` command — session-scoped reference data, no
capability), the same "security must not rely on UI hiding" pattern
`TeachingAssignmentsScreen`'s teacher picker and `TeacherLoadScreen`'s
colleague picker already established: picking a section the caller
doesn't advise (and isn't School Head for) surfaces the backend's own
denial as a local permission message, never a client-side guess about
who is allowed to see what.

**Independent review, dispatched and completed this wave, zero issues
found**: Wave 3E's own retained debt explicitly flagged this exact
moment — the first command to actually call
`authorize_adviser_of_section` — as the priority point to get the
outstanding independent review. A `security-reviewer` agent was
dispatched, scoped to the new command's use of the gate-returned
`school_id`, the new repository aggregation function's own scoping, the
"show every section" picker pattern, and the frontend passthrough
layer. Unlike the Wave 3E review attempt, this one's findings were
successfully retrieved in full (after one retry requesting a complete
restatement, per this project's established reviewer-failure protocol
— the first response summarized as empty). The review traced
`adviser_section_monitor`'s `school_id` provenance directly to
`authorize_adviser_of_section`'s own `section_repo::find_by_id_in_school`
check (confirming a cross-school `section_id` is rejected before
`school_id` is ever available to misuse), confirmed
`adviser_monitor_for_section`'s assignment list is independently
double-scoped by `school_id` AND `section_id` before its per-assignment
loop runs, confirmed the frontend's "show every section" picker has no
caching or client-side allow-list that could serve a stale or
wrong-section response after switching sections (a fresh request always
clears prior results before the new one resolves), confirmed all new
SQL is parameterized, and confirmed the `invoke.ts` exemption addition
is pure post-decision UX routing with no effect on any real check. **No
issues of any severity were found.** This corroborates (though does not
by itself fully substitute for a dedicated re-review of) Wave 3E's own
self-reviewed gate logic — Wave 3E's independent-review debt is
therefore downgraded from "review attempted, unretrieved" to
"substantially corroborated by a successful review of its first real
consumer," recorded in `docs/VERIFICATION-DEBT.md`.

**Deliberately not built this wave**: any change to Subject Monitor
itself or the existing `authorize_own_assignment`-gated commands —
confirmed by `git diff --stat` touching only the expected new/aggregate
files; no dev-preview-fixture wiring (same disclosed, consistent
tradeoff recent waves' new UI left open); no configurable
absence-streak threshold (unchanged spec deferral); no "which sections
do I advise" convenience query for the picker to auto-select — the
picker deliberately shows every section and lets the backend gate
decide, rather than adding a second query whose own correctness would
then need separate verification.

**Verification**: `npm run quality` 715/715 vitest, up from Wave 3D's
705/705 (+10: 1 adapter test, 2 application-service tests, 6
`AdviserViewScreen` tests including 1 axe accessibility pass, 1 new
`invoke.test.ts` representative-gate-shape case for
`adviser_section_monitor`). `npx tsc -b --noEmit` / `eslint` /
`prettier --check` / `check:architecture` all clean. `cargo test`: 598
lib tests (+4: the `adviser_monitor_for_section` repository tests) and
all integration binaries green, including 4 new command-boundary tests
in `tests/subject_attendance.rs`. `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean
(gitleaks + `cargo deny check` + OSV-Scanner), no new dependency. `npm
run harness:verify` still exactly 100/100, unchanged.
