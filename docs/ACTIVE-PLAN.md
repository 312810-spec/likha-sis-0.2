# ACTIVE PLAN

## Wave 3m Reconciliation (added 2026-09-01) — complete

GitHub issue #16, branch `claude/issue-16-20260901-1208`. Full record:
`docs/adr/0060-wave-3m-reconciliation.md`; per-form ADRs
`docs/adr/0057-sf5-promotion-foundation.md`,
`docs/adr/0058-sf6-school-promotion-summary.md`,
`docs/adr/0059-sf4-monthly-attendance-consolidation.md`.

**Scope**: reconcile `main` (restored Claude Code harness +
independently-built Adviser View/Section Adviser Management, through
Wave 3H) against the separately-developed
`antigravity/likha-sis-wave3m-sf4-monthly-attendance-foundation`
lineage (SF2 adviser-byline integration, SF5, SF6, SF4), both diverged
from the same Wave 3E checkpoint. Not a blind merge — every changed
file classified and reconciled by hand; see the ADR for the full
file-by-file record and the reasoning for keeping `main`'s own Adviser
View implementation over Wave 3m's parallel one.

**Files touched this wave**: new —
`src-tauri/src/export/{sf4,sf5,sf6}.rs`; extended —
`src-tauri/src/{lib.rs,commands/export.rs}`,
`src-tauri/tests/export.rs`, `src/{App.tsx,domain/export.ts,
domain/ports/export-repository.ts,application/export-service.ts(.test),
infrastructure/tauri/{export-repository.ts(.test),invoke.ts},
ui/{SectionsScreen.tsx(.test),SectionRosterScreen.tsx(.test),
ClassRecordWorkspace.test.tsx,ClassRecordsScreen.test.tsx,
LearnerListScreen.test.tsx,MonthlySummaryScreen.test.tsx},
dev-preview/{DevPreviewApp.tsx,fixtures.ts}}`; new ADRs
`docs/adr/{0057,0058,0059,0060}-*.md`.

**Verification actually run**: `npm run quality` (typecheck, eslint,
`prettier --check`, `check:architecture`, `vitest run`) — all clean,
**777/777 tests passing**. `cargo fmt --check` clean (one `cargo fmt`
pass first, reconciling pure whitespace drift between the two
lineages' formatting — no semantic change). `git diff --check` clean.
Every non-trivial Rust type/function signature the ported code calls
was hand-verified against the actual current repository source (see
ADR-0060's "Verification" section for the full list) since `cargo
build`/`cargo test`/`cargo clippy` could not run in this sandbox
(missing Tauri/GTK system libraries, `sudo apt-get` install needed
interactive approval unavailable here) — recorded as verification debt
in `docs/VERIFICATION-DEBT.md`, closed once the GitHub Actions Quality
Gate (which has the GTK packages, per ADR-0041) confirms it, or a
future session with working Rust tooling does.

**Not done this wave, deliberately**: SF4 has no UI trigger yet (see
ADR-0059 — matches this project's zero-UI-first precedent for new
exports); the reconciliation PR's GitHub Actions gates had not yet been
dispatched/confirmed at the point this entry was written (see
`docs/CURRENT-HANDOFF.md` for the exact next action once they are).

**Gate decision**: WAVE 3m RECONCILIATION LOCALLY COMPLETE. Next: push
→ open/update the reconciliation PR → dispatch and confirm GitHub
Actions Quality + Security gates green → merge. Recommended next
product slice after merge: wire an "Export SF4" trigger into
`MonthlySummaryScreen.tsx` (see `docs/CURRENT-HANDOFF.md`).

## Wave 3H: Fresh Roadmap Survey and Next-Slice Selection (added 2026-08-31) — complete

Planning-only wave (GitHub issue #6), branch
`claude/issue-6-20260831-1042`, `HEAD` `9ff7c09` (verified exactly the
issue's expected checkpoint). No product/Rust/test/dependency/migration/
workflow/harness-metadata file touched.

**Full record**: `docs/product/WAVE-3H-DECISION.md` — 11 candidates
evaluated against the live repository (not assumed from memory),
scored against LIKHA's priority order, recommended slice + runner-up +
exact Wave 3I scope/non-goals/risks/acceptance-checks, completion-
percentage and mock-pilot-readiness estimates, and a copy-ready Wave 3I
prompt.

**Recommended next slice**: Admin-Assisted Password Reset (School Head
resets a colleague's LIKHA password within their own school) — newly
unblocked because RBAC (ADR-0036) has shipped since this candidate was
last scored low for lacking exactly that. **Runner-up**: the Adviser
View dev-preview/Playwright verification-debt closure already named as
this project's own prior "recommended next slice."

**Verification**: doc-only wave; `npm run harness:verify`, `npm run
quality`, `git diff --check` run as this wave's gate (see
`docs/CURRENT-HANDOFF.md`'s top entry and this session's final report
for actual results).

**Next**: Wave 3I (Admin-Assisted Password Reset), per the issue's
explicit instruction, deliberately not started in this wave.

## Wave 3G: Section Adviser Management UI (added 2026-08-31) — complete

Full record: `docs/PROJECT-MEMORY.md` Wave 3G entry;
`docs/CURRENT-HANDOFF.md` top entry. Continued on this session's
designated branch `claude/continue-working-v7xzb3`, reset onto Wave 3F's
exact checkpoint `0c62884` (the most-advanced, CI-verified line of
development — see the memory entry for why).

**Scope**: the exact next slice Wave 3F's own report named — wire the
already-shipped `assign_section_adviser`/`end_section_adviser`/
`current_section_adviser` commands (Wave 3E) into the School Head's
Sections workflow. Zero Rust changes; UI-only, reusing every existing
authorization gate unchanged.

**What shipped**: `src/domain/section-advisory.ts`,
`src/domain/ports/section-advisory-repository.ts`,
`src/application/section-advisory-service.ts`,
`src/infrastructure/tauri/section-advisory-repository.ts` (mirroring
Wave 2Y's Teaching Assignments pattern exactly); a new
`SectionAdviserScreen` reached from `SectionsScreen`'s new "Manage
adviser" button; a new contextual `section-adviser` tab in `App.tsx`
(same pattern as `teaching-assignments`). Reassignment is explicit
end-then-assign, not a one-step replace — the assign form only appears
once the current adviser has been ended, preserving advisory history.

**Verification, all actually run this session**: `npm run quality`
735/735 (up from 714 — 21 new tests across application/infrastructure/UI
layers); typecheck/lint/format/architecture all clean; `npm run build`
clean; `npm run check:dev-preview-isolation` clean; `npx knip` unchanged
from the pre-existing baseline; `cargo fmt --check` clean (no Rust
touched). GitHub Actions CI not yet re-run on this push at the time this
was recorded.

**Not done this milestone**: a fresh independent security review — not
required by this slice's own risk (no new authorization logic added,
every command reused unchanged from Wave 3E), but the project's general
independent-review debt is not closed by that alone; still tracked in
`docs/VERIFICATION-DEBT.md`.

**Next**: no candidate pre-selected — evaluate fresh once this
checkpoint's CI is confirmed green.

## Wave 3F: Adviser View (added 2026-08-30) — complete

Full record: `docs/adr/0056-section-advisory-foundation.md` Wave 3F
addendum; `docs/CURRENT-HANDOFF.md` top entry;
`docs/PROJECT-MEMORY.md` Wave 3F entry; `docs/VERIFICATION-DEBT.md`
Wave 3F entry. Branch `codex/likha-sis-wave3f-adviser-view` was created
from Wave 3E's final checkpoint `4de3973` without modifying Wave 3E or
`main`.

**Scope**: the actual read-only Adviser View recorded by Wave 3E. New
section-wide repository projection, two commands, TypeScript contracts/
service/adapter, and a dedicated Daily Teaching screen. The picker
returns only the caller's active advisory section(s), while a School
Head may choose any section in their own school. The overview command
independently re-runs `authorize_adviser_of_section`; picker filtering
is never treated as the security boundary.

**What teachers can now finish**: an adviser can review raw Present,
Absent, Late, and Excused totals across every subject in their advisory
class, see which subjects contain absences, and see the highest current
subject-specific absence streak. The screen is explicitly labeled
**Subject attendance — not SF2**, contains no edit/conversion control,
and never changes another teacher's entry, SF2, a grade, or conduct/
discipline record. School Heads retain the same read-only review path.

**Correctness fix included**: Subject Monitor previously interpreted
"as of" only for the roster; future-dated held sessions were still
counted. Both session and entry queries now enforce
`session_date <= as_of_date`, with a dedicated regression test.

**Security review**: rigorous self-review confirmed the selected section
is re-authorized on every read; cross-school School Heads and unrelated
teachers fail closed; queries remain school-scoped and parameterized;
no notes/write path are exposed; and the new resource-gated command is
exempt from the known false session-expiry classification. No blocker
found. A fresh independent review remains owed.

**Verification**: `npm run quality` 714/714 Vitest; TypeScript, ESLint,
Prettier, architecture, production build, `cargo fmt --check`, and
harness 100/100 green. GitHub Security Gate `33317574476` and Quality
Gate `33317574392` are both completed/success. Ubuntu: 598 Rust lib
tests, all integration binaries, clippy, and Playwright/axe green.
Windows: 602 Rust lib tests, all integration binaries, clippy, and the
native Tauri application build green.

**Next**: Wave 3G — Section Adviser Management UI. Wire the already-
shipped assign/end commands into the School Head's Sections workflow
with a teacher picker, effective dates, explicit history-preserving
reassignment, three-mode parity, and trusted-boundary tests.

## Wave 3E: Section Advisory Foundation (added 2026-08-30) — complete

Full record: `docs/adr/0056-section-advisory-foundation.md`;
`docs/CURRENT-HANDOFF.md` top entry; `docs/PROJECT-MEMORY.md` Wave 3E
entry; `docs/VERIFICATION-DEBT.md` Wave 3E entry. **New branch**
`claude/likha-sis-wave3e-section-advisory-foundation`, created from
`00b4040` (Wave 3D's own final, CI-confirmed checkpoint).

**Scope**: the 10-scenario evaluation process applied to "how is the
adviser of a section represented and authorized" — Adviser View's own
missing foundation, deferred from Wave 3D. Decision: `section_advisories`,
a half-open temporal interval table mirroring `section_memberships`,
over a bare `sections.adviser_user_id` column (loses history on
reassignment). New `Capability::ManageSectionAdvisories`, a new
`auth::authorize_adviser_of_section` gate (not yet called by any
command), and three commands (assign/end, capability-gated;
current-adviser read, session-only-gated). Zero UI, zero change to any
existing Subject Attendance code path — foundation only, matching this
project's zero-UI-first precedent for a new domain.

**A real cross-school isolation bug, caught by TDD before shipping**:
the first `authorize_adviser_of_section` implementation never verified
`section_id` actually belonged to the caller's own school before
authorizing a School Head via the capability path. A dedicated test
caught it on first run; fixed by resolving the section against the
caller's school before either authorization path.

**Deliberately not built**: the actual Adviser View read of Subject
Attendance data (next slice); no UI (foundation-only, see above); no
seed/migration path from prior data (correct — no history exists to
migrate).

**Verification, all actually run this session**: `cargo test` 594 lib
tests (+15) and all integration binaries green, including 7 new
command-boundary tests; `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean; `npm run quality`
705/705 vitest, unchanged; `npm run harness:verify` still exactly
100/100, unchanged.

**Next**: the actual Adviser View read (repository function + command

- UI screen), reusing `authorize_adviser_of_section`; or the native
  NVDA/Narrator pass. No candidate pre-selected.

## Wave 3D: Subject Monitor (added 2026-08-30) — complete

Full record: `docs/adr/0055-*` Wave 3D addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 3D entry;
`docs/VERIFICATION-DEBT.md` Wave 3D entry. **New branch**
`claude/likha-sis-wave3d-subject-monitor`, created from `f7d7029`
(Wave 3C's own final, CI-confirmed checkpoint).

**Scope**: `subject_attendance::monitor_for_assignment` (Rust) —
per-learner present/absent/late/excused counts and a current
consecutive-absence streak, scoped to one teaching assignment's roster
as of a requested date. New `subject_attendance_monitor` command,
gated identically to every other Subject Attendance command
(`authorize_own_assignment` — zero new authorization shape). New
frontend `SubjectMonitorScreen`, reachable directly from the Daily
Teaching nav group.

**Deliberately split from Adviser View** (the other half of the "Subject
Monitor / Adviser View" candidate carried since Wave 2V): Adviser View
needs an "adviser of a section" relationship that doesn't exist
anywhere in this codebase's schema — real, cross-cutting design work
(SF2, SF5, SF9, RBAC), properly warranting the project's own
10-scenario evaluation process rather than a quick implementation
piggybacked on this wave.

**A real bug, caught by TDD before shipping**: the first streak
implementation only walked entries that exist (inner join), so an
unmarked `held` session was invisible to the streak instead of
breaking it — a dedicated failing test caught it before the fix
shipped. Fixed by walking every `held` session id and looking up each
learner's entry by `(session_id, membership_id)`, so a missing entry
explicitly breaks the streak.

**Deliberately not built**: Adviser View (see above); no
dev-preview-fixture wiring (same disclosed gap recent waves' new UI
left open); no configurable absence-streak threshold or automatic flag
(the spec explicitly defers this).

**Verification, all actually run this session**: `npm run quality`
705/705 vitest (+9 net from Wave 3C's 696/696);
typecheck/eslint/format/architecture clean. `cargo test`: 579 lib tests
(+8) and all integration binaries green, including 2 new command-
boundary tests. `cargo fmt --check` / `cargo clippy --all-targets -- -D
warnings` clean, all as part of `npm run quality:full` (exit 0). `npm
run build` + `check:dev-preview-isolation` pass. `npm run
quality:security` clean, no new dependency. `npm run harness:verify`
still exactly 100/100, unchanged.

**Next**: Adviser View (needs real new authorization-shape design
work, per ADR-0055's own Wave 2V/3D addenda); or the native
NVDA/Narrator pass. No candidate pre-selected.

## Wave 3C: School Head views a colleague's Teacher Load (added 2026-08-30) — complete

Full record: `docs/adr/0039-*` Wave 3C addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 3C entry;
`docs/VERIFICATION-DEBT.md` Wave 3C entry. **New branch**
`claude/likha-sis-wave3c-teacher-load-colleague-view`, created from
`72fc3cc` (Wave 3B's own final, CI-confirmed checkpoint).

**Scope**: `TeacherLoadScreen` gained a "View" picker
(`list_school_members`, filtered to the `teacher` role) letting a
School Head view a colleague's derived load. Zero new backend
surface — `get_teacher_load` already supported any authorized target
id; this is a pure UI extension, safe now that Wave 3B closed the
false-positive-logout bug this exact path would otherwise have
triggered.

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X/2Y/2Z); no overload-threshold
warning/enforcement (ADR-0039's own long-standing non-goal).

**Verification, all actually run this session**: `npm run quality`
696/696 vitest (+4 net); typecheck/eslint/format/architecture clean.
Zero Rust files touched; `cargo test` reconfirmed 571/571 unchanged as
part of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged.

**Next**: Subject Monitor / Adviser View (needs real new
authorization-shape design work, per ADR-0055's own Wave 2V addendum);
or the native NVDA/Narrator pass. No candidate pre-selected.

## Wave 3B: Session-Expiry False-Positive Fix (added 2026-08-30) — complete

Full record: `docs/adr/0022-*` Wave 3B addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 3B entry;
`docs/VERIFICATION-DEBT.md` Wave 3B entry. **New branch**
`claude/likha-sis-wave3b-session-expiry-fix`, created from `e465a42`
(Wave 3A's own final, CI-confirmed checkpoint).

**Discovered while planning the original Wave 3B candidate**
(School-Head views a colleague's load): `AppError::Unauthorized`
serializes identically for "session genuinely invalid" and "session
valid but not permitted for this action," and the frontend's
session-expiry wrapper (ADR-0022) could only see the string, not the
reason. Every `Capability`/`authorize_view_teacher_load`/
`authorize_own_assignment`-gated command (31 total, already shipped
across Sections, Learners, SF1 Import, Teaching Assignments, Class
Schedule, and Subject Attendance) was silently force-logging out any
session that got a legitimate permission denial.

**Fix**: extended `invoke.ts`'s exemption set from `login` alone to
all 31 gated commands, enumerated explicitly and cross-checked against
every `pub fn authorize_*` in `auth/mod.rs`. Not a security change —
no Rust `authorize_*` gate touched, only which frontend mechanism
reports an already-correct refusal.

**Deliberately not built**: the deeper Rust-side `Forbidden`/
`Unauthorized` type split — properly needs independent security
review, out of proportion to this bounded fix. Recorded as debt.

**Verification, all actually run this session**: `npm run quality`
692/692 vitest (+6); typecheck/eslint/format/architecture clean. Zero
Rust files touched; `cargo test` reconfirmed 571/571 unchanged as part
of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged.

**Next**: the School-Head-views-a-colleague's-load extension to
Teacher Load (now safe to build); Subject Monitor / Adviser View; or
the native NVDA/Narrator pass. No candidate pre-selected.

## Wave 3A: Teacher Load (added 2026-08-30) — complete

Full record: `docs/adr/0039-*` Wave 3A addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 3A entry;
`docs/VERIFICATION-DEBT.md` Wave 3A entry. **New branch**
`claude/likha-sis-wave3a-teacher-load`, created from `62c58e0`
(Wave 2Z's own final, CI-confirmed checkpoint).

**Scope**: one new screen, `TeacherLoadScreen.tsx` — a teacher views
their own derived load (assignment count, distinct subjects, weekly
instructional time as "Xh Ym") plus the assignments counted toward
it, reusing the already-built `listMyAssignments`. Reachable as a
normal top-level "My Teaching Load" nav tab, needing no contextual
handoff. **Zero new backend surface**: `get_teacher_load` already
existed, gated, and unit-tested since ADR-0039's original milestone.

**Deliberately self-view only**: the screen is given the signed-in
teacher's own `session.userId`, never a client-supplied target id. A
School Head viewing a colleague's load is a deferred candidate.

**Verification, all actually run this session**: `npm run quality`
686/686 vitest (+8); typecheck/eslint/format/architecture clean. Zero
Rust files touched; `cargo test` reconfirmed 571/571 unchanged as part
of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged.

**Next**: Subject Monitor / Adviser View; the School-Head-views-a-
colleague's-load extension; or the native NVDA/Narrator pass. No
candidate pre-selected.

## Wave 2Z: Class Schedule (added 2026-08-29) — complete

Full record: `docs/adr/0039-*` Wave 2Z addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2Z entry;
`docs/VERIFICATION-DEBT.md` Wave 2Z entry. **New branch**
`claude/likha-sis-wave2z-class-schedule`, created from `cbc3f74`
(Wave 2Y's own final, CI-confirmed checkpoint).

**Scope**: one new screen, `ScheduleMeetingsScreen.tsx` — a School
Head schedules/unschedules a class's weekly meeting times, reached
from `TeachingAssignmentsScreen`'s new "Manage schedule" action. Wires
`create_schedule_meeting`/`list_schedule_meetings_by_assignment`
(existed since ADR-0039, never reachable from any screen, never proven
at the command boundary). New backend surface:
`remove_schedule_meeting` + `repository::schedule_meeting::remove` —
no removal function existed for schedule meetings at all before this
wave. Also completes the Wave 2X weekday convention's write-side
verification (0=Sunday..6=Saturday via the new `WEEKDAY_LABELS`
constant).

**Architecture**: `TeachingAssignmentRepository` gained
`createMeeting`/`removeMeeting`; `TeachingAssignmentApplicationService`
gained validated passthroughs (weekday range, HH:MM time-format
checks). New TS `CreateMeetingOutcome` discriminated union mirrors
Rust's eight-variant enum exactly, letting the screen show a distinct
message per conflict type (teacher/section/room double-booking,
duplicate, invalid weekday/time).

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X/2Y); no `get_teacher_load` view; no
one-off exceptional-date schedule overrides (ADR-0039's own
long-standing non-goal).

**Verification, all actually run this session**: `npm run quality`
678/678 vitest (+20); typecheck/eslint/format/architecture clean.
`cargo test` 571 lib tests (+3) plus new
`tests/schedule_meeting_management.rs` (9/9, closing a second
pre-existing command-boundary test gap); `cargo fmt --check` / `cargo
clippy --all-targets -- -D warnings` clean, as part of `npm run
quality:full`. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

**Next**: `get_teacher_load`; Subject Monitor / Adviser View; or the
native NVDA/Narrator pass. No candidate pre-selected.

## Wave 2Y: Teaching Assignments (added 2026-08-29) — complete

Full record: `docs/adr/0039-*` Wave 2Y addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2Y entry;
`docs/VERIFICATION-DEBT.md` Wave 2Y entry. **New branch**
`claude/likha-sis-wave2y-teaching-assignments`, created from `361a2ba`
(Wave 2X's own final, CI-confirmed checkpoint).

**Scope**: one new screen, `TeachingAssignmentsScreen.tsx` — a School
Head assigns/unassigns which teacher teaches which subject for a
section, reached from `SectionsScreen`'s new "Manage assignments"
action. Wires `create_teaching_assignment`/`remove_teaching_assignment`/
`list_teaching_assignments_by_section` (existed since ADR-0039, never
reachable from any screen before this wave, and never proven at the
command boundary — only unit-tested in the repository layer,
bypassing the authorization gate). New backend surface:
`list_school_members` + `repository::user::list_members_in_school`,
needed so the teacher picker has something to pick from — no command
anywhere previously enumerated a school's own members.

**Architecture**: `TeachingAssignmentRepository` gained `listBySection`/
`create`/`remove`; a new `TeachingAssignmentApplicationService` wraps
them (validated passthroughs). New `SchoolMemberRepository` port +
`SchoolMemberApplicationService`, wired in `composition.ts`. New
`teaching-assignments` tab (nav-invisible, reached only via
`SectionsScreen`'s handoff, mirroring `section-roster`).

**Security must not rely on UI hiding, applied literally**: any
authenticated school member can view this screen; only a School Head
can write, enforced solely by the backend's existing
`Capability::ManageTeachingAssignments` gate. The screen shows the same
form to everyone and surfaces a generic error on backend refusal —
`SectionsScreen`'s own established convention, not a new one.

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W/2X); no `replace_teacher_assignment`
wiring (explicit remove-then-create is ADR-0039's own intended
reassignment shape); no schedule-meeting create/edit UI; no
teacher-load view.

**Verification, all actually run this session**: `npm run quality`
658/658 vitest (+21); typecheck/eslint/format/architecture clean.
`cargo test` 568 lib tests (+4) plus new
`tests/teaching_assignment_management.rs` (9/9, closing a pre-existing
command-boundary test gap); `cargo fmt --check` / `cargo clippy
--all-targets -- -D warnings` clean, all as part of `npm run
quality:full`. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

**Next**: `create_schedule_meeting` (the weekly schedule builder, which
also lets the Wave 2X weekday convention be verified end-to-end);
`get_teacher_load`; Subject Monitor / Adviser View; or the native
NVDA/Narrator pass. No candidate pre-selected.

## Wave 2X: Today's Classes (added 2026-08-29) — complete

Full record: `docs/adr/0055-*` Wave 2X addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2X entry;
`docs/VERIFICATION-DEBT.md` Wave 2X entry. **New branch**
`claude/likha-sis-wave2x-todays-classes`, created from `bde802f`
(Wave 2W's own final, CI-confirmed checkpoint).

**Scope**: one new screen, `TodaysClassesScreen.tsx` — the spec's
"Today's Classes" main screen. Lists every class the teacher meets
today in schedule order, with each one's Subject Attendance status, and
hands off to `SubjectAttendanceScreen` with the class preselected on
"Check attendance". No new backend command — reuses
`list_schedule_meetings_by_assignment` and
`list_subject_attendance_sessions` unchanged.

**Weekday convention established, not assumed**:
`schedule_meetings.weekday` had no documented calendar meaning anywhere
in this codebase before this wave (confirmed by exhaustive search — no
Rust code, test, or ADR ever assigned it one). Documented at its single
point of use, `src/domain/schedule-meeting.ts`: **0 = Sunday … 6 =
Saturday**, matching JavaScript's `Date.getDay()` exactly. Recorded as
a durable decision in the ADR-0055 Wave 2X addendum, binding for any
future schedule-creation UI.

**Architecture**: `TeachingAssignmentRepository` gained one more read
method, `listMeetings`, reusing the existing
`list_schedule_meetings_by_assignment` command. `SubjectAttendanceApplicationService`
gained a thin validated passthrough. `SubjectAttendanceScreen` gained
one optional prop, `initialAssignmentId` (verified against the loaded
assignment list, mount-time-only default — same shape as
`AttendanceScreen`'s `initialSectionId`). `App.tsx` gained one more
narrowly-typed handoff variable, `subjectAttendanceAssignmentId`.

**Deliberately not built**: no dev-preview-fixture wiring (same
disclosed gap as Waves 2U/2W); no `TeacherWorkspaceScreen` entry point
into Today's Classes; no Subject Monitor/Adviser View.

**Verification, all actually run this session**: `npm run quality`
637/637 vitest (+12: 2 `listMeetings` service tests, 1 `listMeetings`
adapter test, 1 `initialAssignmentId` screen test, 8
`TodaysClassesScreen` tests incl. 2 axe passes);
typecheck/eslint/format/architecture clean. Zero Rust files touched;
`cargo test` reconfirmed 564/564 unchanged, `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean, as part of `npm run
quality:full`. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

**Next**: the carried Teaching Assignment/Class Schedule UI; Subject
Monitor / Adviser View; or the native NVDA/Narrator pass. No candidate
pre-selected.

## Wave 2W: Subject Attendance first UI increment (added 2026-08-29) — complete

Full record: `docs/adr/0055-*` Wave 2W addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2W entry;
`docs/VERIFICATION-DEBT.md` Wave 2W entry. **New branch**
`claude/likha-sis-wave2w-subject-attendance-ui`, created from `4a7629e`
(Wave 2V's own final, CI-confirmed checkpoint).

**Scope**: one new screen, `SubjectAttendanceScreen.tsx`, covering the
spec's recommended-order steps 3-4 in one slice (a session must exist
before there's a roster to check, so these two steps are inseparable in
practice). Today's Classes, Subject Monitor, and Adviser View remain
deferred.

**Design resolution before writing UI code**: selecting a class+date
does **not** eagerly call `open_or_get_session` (which would silently
convert every browsed date into "checked" and destroy the "not checked"
signal a future Today's Classes list needs). Instead, the existing,
non-mutating `list_subject_attendance_sessions` command is called first;
the roster only shows once a session already exists for that date, and
two explicit teacher-initiated actions ("Check attendance" / "No class
today") appear otherwise. Zero backend change was needed.

**Architecture**: new narrow `TeachingAssignmentRepository` port
(`listMine`) reuses the already-built `list_teacher_assignments`
command — deliberately not the deferred full Teaching Assignment/Class
Schedule UI. `SubjectAttendanceRepository` (six methods) mirrors the six
Wave 2V commands. Both flow through a new
`SubjectAttendanceApplicationService`, wired in `composition.ts`, with a
new `subject-attendance` nav tab. Roster/mark/mark-all-present UI
directly mirrors `AttendanceScreen.tsx`'s existing pattern — no new
interaction pattern invented.

**Deliberately not built**: no dev-preview-fixture wiring (jsdom+axe
coverage only, same disclosed gap Wave 2U's new UI left open); no
Today's Classes list; no Subject Monitor/Adviser View.

**Verification, all actually run this session**: `npm run quality`
625/625 vitest (+25: 8 application-service, 6 adapter, 1
teaching-assignment-adapter, 9 screen incl. 2 axe passes);
typecheck/eslint/format/architecture clean. Zero Rust files touched;
`cargo test` reconfirmed 564/564 unchanged as part of `npm run
quality:full`. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged.

**Next**: Today's Classes (closes the "not checked" state's real UI
purpose); the carried Teaching Assignment/Class Schedule UI; or the
native NVDA/Narrator pass. No candidate pre-selected.

## Wave 2V: Subject Attendance Foundation (added 2026-08-29) — complete

Full record: `docs/adr/0055-subject-attendance-foundation.md`;
`docs/CURRENT-HANDOFF.md` top entry; `docs/PROJECT-MEMORY.md` Wave 2V
entry; `docs/VERIFICATION-DEBT.md` Wave 2V entry. **New branch**
`claude/likha-sis-wave2v-subject-attendance-foundation`, created from
`647ba0932b2043757cd71e599fb000a7e8dfd2ec` (Wave 2U's own final,
CI-confirmed checkpoint) — Wave 2U's branch was not modified.

**Owner-directed**: mid-session the owner supplied two full product
specifications (`docs/product/SUBJECT-ATTENDANCE-SPEC.md`,
`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`) and directed
continued autonomous wave-by-wave work with a notification at each wave
boundary. Subject Attendance was selected over Official School
Repository because the latter requires external material only the
school/owner can supply (an organization-managed Microsoft 365 tenant,
consent authority) before implementation can safely begin.

**Schema (migration 22)**: `subject_attendance_sessions` +
`subject_attendance_entries`, session-centered, deliberately not columns
on `attendance_records`. `UNIQUE(teaching_assignment_id, session_date)`
and `UNIQUE(session_id, membership_id)` are real database invariants.
Session status is two-valued (`held`/`no_class`); "not checked" is the
absence of a row, reusing `attendance_records`' own idiom.

**Domain**: `repository::subject_attendance` — idempotent
`open_or_get_session`/`mark_no_class`, typed `record_entry` (refuses a
`NoClass` session or an out-of-section membership), `mark_all_present`
(never overwrites), `roster_for_session` (reuses
`section_membership::current_roster` unchanged). New
`authorize_own_assignment` gate — the caller must be exactly the
teacher on the targeted assignment, mirroring
`auth::authorize_view_teacher_load`'s "self" shape rather than a
school-wide `Capability`.

**Commands**: six new Tauri commands in `commands::subject_attendance`,
all gated on `authorize_own_assignment`; commands taking a `session_id`
also cross-check its resolved `teaching_assignment_id` against the
caller-supplied one.

**Deliberately not built**: no UI (matches RBAC/Curriculum/Teacher
Load/Wave 2A's zero-UI-first precedent for a new domain); no
adviser/School-Head read access to another teacher's records; no
amendment/audit-trail beyond actor/timestamp columns; no sync/offline-
conflict handling; zero change to `attendance_records`/SF2/any existing
attendance path.

**Verification, all actually run this session**: `cargo test` 564 lib
(+18: 14 repository unit tests + 4 migration tests) + all integration
binaries green incl. new `tests/subject_attendance.rs` 7/7; `cargo fmt
--check`/`cargo clippy --all-targets -- -D warnings` clean. `npm run
quality` 600/600 vitest, unchanged (Rust-only wave). `npm run
quality:security` clean, no new dependency. `npm run harness:verify`
still exactly 100/100, unchanged. `npm run build` +
`check:dev-preview-isolation` pass.

**Review**: bounded self-review — both `UNIQUE` invariants, own-
assignment denial for a different teacher, school-scoping on every
read, the `NoClass`-refusal, and the cross-section-membership refusal
all proven by dedicated tests. No independent review dispatched —
retained as debt.

**Next**: a scoped first UI increment (Today's Classes + Attendance
Check screens); the carried Teaching Assignment/Class Schedule UI; or
the native NVDA/Narrator pass. No candidate pre-selected.

## Wave 2U: Create Learner duplicate-candidate warning (added 2026-08-29) — complete

Full record: `docs/adr/0042-*` Wave 2U addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2U entry;
`docs/VERIFICATION-DEBT.md` Wave 2U entry. **New branch**
`claude/likha-sis-wave2u-duplicate-warning`, created from
`c51b46c209fbbf561a7b6915328e7159d06297fc` (Wave 2T's own final,
independently-verified checkpoint) — Wave 2T's branch was not modified.

**Repository truth verified first**: `main` untouched at `d9ab0368`;
`c51b46c`'s own 5-point pre-push checklist re-verified before use
(clean tree, HEAD exactly `c51b46c`, ancestry contains `820d1b2` and
`54dc8fc`, `main` untouched, diff docs-only) and pushed unmodified.

**No candidate pre-selected** — Wave 2T's own scoring table had already
named this exact candidate as **Next Best**; this wave implements it
rather than re-scoring.

**Required reconnaissance before design**: confirmed
`repository::learner::find_candidates` (Wave 2A) is already a
deterministic, school-scoped, exact-match-only query; confirmed
`import::matching::classify_row` (Wave 2C) already wraps it for SF1
import with `MatchKind::ExactLrn`/`SuspectedDuplicate`/`New`; confirmed
manual `learner::create` has no duplicate pre-check at all (a duplicate
LRN would surface as a raw DB constraint error); confirmed
`find_learner_candidates` (already-registered Tauri command) has zero
frontend caller — this wave's exact gap.

**Scope delivered**: `repository::learner::create_with_duplicate_check`
reuses `find_candidates` (no second query engine) and returns a typed
`CreateLearnerOutcome` (`Created`/`LrnConflict`/`DuplicateCandidates`).
`LrnConflict` (exact LRN match) is hard and never overridable by
`confirmed`; `DuplicateCandidates` (any other name/LRN overlap) blocks
creation until an explicit confirmed retry, which re-fetches candidates
fresh so a conflict introduced meanwhile is still caught. New command
`create_learner_with_duplicate_check` (same `ManageLearners` gate) is
what `LearnerListScreen`'s Create Learner form now calls;
`create_learner`, `import::matching::classify_row`, and `import::commit`
are unchanged. `LearnerListScreen` gained an inline `role="alert"`
warning panel (not a modal, matching the existing Transfer/End/Correct
convention) with focus management, "Create separate learner"/"Cancel"
for the soft case, and no override affordance at all for the hard case.

**Architecture**: no new port — `createWithDuplicateCheck` added to the
existing `LearnerRepository` port (list/create/updateProfile already
lived there), matching the one-port-per-concern convention without
introducing a needless second port for the same entity.

**Verification**: `cargo test` 546 lib (+7, up from 539) + all
integration binaries incl. `learner_management.rs` 13/13 (+6) — zero
regression, `tests/sf1_import.rs` unchanged at 12/12. `cargo fmt
--check`/`cargo clippy --all-targets -- -D warnings` clean. `npm run
quality` 600/600 vitest (+15: 2 adapter, 6 service, 8 UI incl. 2 new axe
passes), typecheck/eslint/format/architecture clean. `npm run
quality:security` (gitleaks/cargo-deny/OSV) clean, no new dependency.
`npm run harness:verify` still exactly 100/100, unchanged. `npm run
quality:full` green end to end, exit code 0. `npm run quality:ui`'s
Playwright browser launch hit the pre-existing, already-documented
`chromium-1237`-vs-`chromium-1194` mismatch; the documented workaround
was re-run against the existing smoke script and passed with zero axe
violations (confirms no regression to `LearnerListScreen`'s covered
flows); the new warning UI itself is unreachable through the read-only
dev-preview fixture, so it has jsdom+axe coverage only this session.

**Checkpoint**: implementation + tests in one feature commit, docs in a
following commit — see `docs/CURRENT-HANDOFF.md` for exact SHAs and CI
run ids once confirmed post-push.

**Next planned wave (not started)**: a scoped first cut of the Teaching
Assignment/Class Schedule UI (7 unwired commands) — e.g. read-only
schedule display before any assignment-editing UI, since the full
surface was already judged too large for one bounded slice. Alternatives
carried forward: the native NVDA/Narrator pass; the SF1-importer debt,
once evidence justifies it.

---

## Wave 2T: SF1/SF9 official-form generation UI (added 2026-08-28) — complete

Full record: `docs/adr/0049-*` Wave 2T addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2T entry;
`docs/VERIFICATION-DEBT.md` Wave 2T entry. **New branch**
`claude/likha-sis-wave2t-teacher-slice`, created from `49695d3a` (Wave
2S's own CI-confirmed final HEAD) — Wave 2S's branch was not modified.

**Repository truth verified first**: `main` untouched at `d9ab0368`;
`49695d3a` confirmed a genuine, non-stale ancestor of the live
`claude/likha-sis-wave2s-placement-0ixw5v` tip; final Security Gate
`33208042186` + Quality Gate `33208042221` reconfirmed
`completed/success` for that exact commit via each job's own step list;
`npm run harness:verify` reconfirmed 100/100 before any work began.

**No candidate pre-selected — evaluated from repository evidence.** All
69 registered Tauri commands cross-checked against every frontend
`invoke()` call site: 16 had zero caller. Scored at least six credible
candidates (full table + scoring in the ADR-0049 addendum):
**Recommended and built** — SF1/SF9 official-form generation UI, exposing
`generate_sf1_form`/`generate_sf9_form` (fully built and tested since
Wave 3/2I, never reachable from any screen). **Next Best** — a
duplicate-learner-candidate warning on Create Learner, using the
already-built `find_learner_candidates` command (also never wired to
any UI); switch condition: pick this instead if the SF1/SF9 fidelity
disclosure had turned out to require product-policy input this session
could not safely give itself — it did not, since the disclosure-not-
refusal stance was already independently decided and shipped repeatedly
since M10. Evaluated and correctly not selected: a Teaching Assignment/
Class Schedule UI (7 unwired commands, too large for one bounded slice);
a PSGC/address-entry UI (no evidenced consumer); the carried SF1-
importer debt (no fresh evidence justifies reopening it); the carried
native NVDA/Narrator pass (genuinely infeasible in this remote Linux
session — disclosed, not faked).

**Scope delivered**: a section-level "Generate SF1 (School Register)"
button and a per-row "Generate SF9 (Report Card)" action on
`SectionRosterScreen`. Zero Rust changes — the backend, its
session-only authorization convention, and its command-boundary tests
already existed; this wave is a new `FormGenerationRepository` port →
`TauriFormGenerationRepository` adapter → `FormGenerationApplicationService`
→ UI. No confirmation panel for either action (no membership state is
mutated, both are safely repeatable) — reuses the plain single-click
export-button pattern `MonthlySummaryScreen`'s SF2 export already
established. An always-visible (all three modes) notice discloses both
templates are synthetic/`NOT_VERIFIED`, before either button is used.

**Architecture**: `FormGenerationRepository` kept separate from
`SectionRepository`/`ExportRepository`, matching the established
one-port-per-concern convention. Both new actions and every existing
membership action on the screen now share one `anyActionInFlight` gate.

**Verification**: no Rust change; `cargo test` 539 lib + all
integration binaries incl. `tests/formgen.rs` 10/10, unchanged from
Wave 2S — zero regression. `cargo fmt --check`/`cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` 585/585 vitest
(+22), typecheck/eslint/format/architecture clean. `npm run build` +
`check:dev-preview-isolation` pass. `npm run harness:verify` still
exactly 100/100, unchanged. `npm run quality:full` green end to end.
`gitleaks`/`cargo-deny`/`osv-scanner` all clean (no new dependency).
`git diff --check` clean; `npx knip` no new findings.

**Checkpoint**: feature commit `820d1b2`; docs commit `54dc8fc` is the
pushed branch HEAD (owner-authorized push completed). **Final Security
Gate `33212130131` + final Quality Gate `33212130223`, both
`completed/success`** (Ubuntu canonical `quality:full` + Playwright/axe
UI gate; Windows canonical `quality:full` + native Tauri build).
`npm run harness:verify` reconfirmed 100/100 after the push. `main`
`d9ab0368` untouched.

**Next planned wave (not started)**: the Next Best candidate — a
duplicate-learner-candidate warning on Create Learner. Alternatives
carried forward, by LIKHA priority order: the native NVDA/Narrator pass
(now also covering SF1/SF9); a narrower first increment of the Teaching
Assignment/Class Schedule UI, if one can be bounded; the SF1-importer
debt, once evidence justifies it.

---

## Wave 2S: same-day placement correction (added 2026-08-28) — complete

Full record: `docs/adr/0042-*` Wave 2S addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2S entry;
`docs/VERIFICATION-DEBT.md` Wave 2S entry.

**Repository truth verified first:** branch/local HEAD fast-forwarded
cleanly from `d9ab036` (main) to the expected checkpoint `4282669`
(Wave 2R's close), 0 divergent commits lost. Feature Security
`33180045501` + Quality `33180045507` and final Security `33200842358` +
Quality `33200842375` all reconfirmed `completed/success` for that exact
commit; `npm run harness:verify` reconfirmed exactly 100/100, certified,
before any Wave 2S work began.

**Scope delivered:** a decision-first evaluation of 8 concrete
correction representations (silent deletion, deletion + audit event,
void + re-open, a separate ledger, in-place section correction, status
quo, correcting the start date instead, reusing `enroll`'s existing
same-day exemption), scored against LIKHA's priority order, recorded in
the ADR-0042 Wave 2S addendum. **Recommended and implemented:**
`section_membership::correct_same_day_placement` — updates a same-day
membership row's `section_id` in place, exactly once, gated on
authorization, school scope, an exact non-stale membership id, the
placement actually starting today, not already corrected, a resolvable
different destination, and no dependent attendance/grade record in the
current section. No new row, no deletion, no change to `starts_on`/
`ends_on`, no change to any existing "is this membership open" query.
**Next Best (not built, recorded with an explicit switch condition):** a
retained void/re-open representation, for if this project ever needs to
correct a placement that already has dependent records or is outside the
same-day window.

**Architecture:** migration 21 adds two nullable provenance columns
(`original_section_id`, `corrected_at`) to `section_memberships` — no
other schema change. New Rust verb + typed `CorrectPlacementOutcome`,
gated `ManageLearners`, `school_id` session-derived. New TS
`CorrectPlacementResult` mirrors it exactly; `SectionRepository` port +
Tauri adapter + `SectionApplicationService` gain
`correctSameDayPlacement`; every implementer (9) updated.
`SectionRosterScreen` gains a "Correct today's placement" row action,
visible only for a placement whose `startsOn` equals the roster's frozen
"today," reusing the existing Transfer/End inline-panel pattern with no
effective-date field. The pre-existing zero-length-interval Transfer/End
error message now points a teacher at this new action.

**Verification:** `cargo test` 539 lib (+15) and all integration
binaries incl. `enrollment.rs` 39/39 (+9); `cargo fmt --check`/`cargo
clippy --all-targets -- -D warnings` clean. `npm run quality` 563/563
vitest (+20), typecheck/eslint/format/architecture clean. `npm run
build` + `check:dev-preview-isolation` pass. `npm run harness:verify`
still exactly 100/100, unchanged, not reopened. `npm run quality:full`
green end to end. `gitleaks`/`cargo-deny`/`osv-scanner` were installed
fresh this session (none present at session start) and all three passed
clean locally — a first for this project; every prior wave disclosed
this as a per-machine gap with CI as the only authority. Feature commit
`1ca2103`; final commit + CI run ids recorded in `CURRENT-HANDOFF.md`
once green.

**Next planned wave (not started):** re-evaluate against repository
evidence at the next checkpoint — no candidate pre-selected. Candidates
by LIKHA priority order carried from prior waves: (a) the native
NVDA/Narrator pass across every accumulated interactive surface
(Enroll/Transfer/End/Correct); (b) apply the strict zero-length rule and
the `l.school_id` JOIN predicate to `enroll`/`roster_for_section*` when
the SF1 importer is next reworked; (c) a new teacher-facing production
slice built on the now-complete enrollment lifecycle.

---

## Wave 2R: read-only learner enrollment history (added 2026-08-28) — complete

Full record: `docs/adr/0042-*` Wave 2R addendum;
`docs/CURRENT-HANDOFF.md` top entry; `docs/PROJECT-MEMORY.md` Wave 2R
entry; `docs/VERIFICATION-DEBT.md` Wave 2R entry.

**Scope delivered:** from each Learner List row, load and display the
learner's retained section-placement spans, oldest first, using the
already school-scoped `list_learner_enrollment_history` command. Show
section/grade/school-year labels, start/end/current state, and complete
loading/empty/error/retry behavior. No write surface, migration, new
capability, SF1 change, cloud path, or history deletion.

**Architecture:** new narrow `EnrollmentHistoryRepository` → Tauri
adapter → `EnrollmentHistoryApplicationService` → existing
`LearnerListScreen`. The service maps raw memberships to a minimal UI
projection and resolves labels through the existing session-scoped
section directory. It preserves retained rows whose label cannot resolve
and avoids the label query entirely for an authoritative empty history.

**Verification:** local canonical frontend gate 543/543 tests; build and
dev-preview isolation green; harness 100/100; targeted history 31/31.
Feature `05ad2e85` passed Security `33180045501` and Quality
`33180045507`, including Rust, Playwright/axe, phone-width overflow,
Windows canonical, and Windows-native Tauri build.

**Next planned wave (not started): Wave 2S** — decide and prove a
narrow, authorized, auditable same-day correction path for a current
placement entered in error. It must preserve history integrity, reject
dependent-record conflicts, and must not become a general history editor
or deletion surface.

---

## Harness v2 certification (added 2026-08-28) — complete

Corrected candidate `5a4b75d3` passed Quality `33175058626` and Security
`33175058671`; deterministic harness score exactly 100/100; v2 relocked.
Operating mode is now one wave per user continuation: finish final CI,
write the wave report, record the exact next slice, and stop.

Wave 2R completed at feature `05ad2e85`; the harness remained locked.
The exact next slice is Wave 2S above.

---

## Wave 2Q: safe learner enrollment + membership-integrity closure (added 2026-08-28) — complete

Full record: `docs/adr/0042-*` Wave 2Q addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2Q entry; `docs/VERIFICATION-DEBT.md`
Wave 2Q entry. Same branch (`claude/likha-sis-wave2a-learner-core`).

**Scope**: from the Section Roster, a `ManageLearners` user places an
existing eligible same-school learner into the section safely; plus
closure of the four Wave 2P membership-correctness debts (enroll
hardening, two-connection race test, zero-length policy, backdating vs.
dependent records). Excluded (directed): learner creation, SF1 import
redesign, cloud sync, attendance/grading UI changes beyond the narrow
dependent-record check.

**Repository truth verified first**: HEAD `7807e5e` = origin, 0/0, tree
clean; `main` `d9ab036` untouched. Wave 2P CI re-confirmed
`completed/success` — `7807e5e` Quality `33049989425` + Security
`33049989470`.

**Central design calls**:

- New typed verb `enroll_membership` (mirrors Wave 2P's transfer
  choice); `section_membership::enroll` stays the create-and-place
  primitive but is hardened in place (`is_iso_date` guard + `SAVEPOINT`
  — `Connection::transaction` cannot nest inside `import::commit`).
- Zero-length interval policy: **strict** (`starts_on` strictly `<`
  `ends_on`); typed `ZeroLengthInterval` on transfer/end; `enroll`
  primitive exempted with a documented reason + closure gate.
- Dependent-record guard: bounded `dependent_records_stranded()`
  (attendance + wholly-outside grading periods), "covered by another
  retained membership" refinement so routine re-enrolment is not
  false-flagged.
- Concurrency: new file `tests/enrollment_concurrency.rs` with two real
  `db::open` connections on one SQLCipher file; deterministic
  logical-race + stale-snapshot + guarded-`UPDATE` + `Immediate`
  bounded-retry coverage.

**Verification record** (all run this session):

- `npm run quality` — **534 vitest** (58 files), typecheck (`tsc -b`),
  eslint, `prettier --check .`, `check:architecture` — all green.
- `cargo test` — **528 lib** + every integration binary; `enrollment`
  31/31 (7 new Wave 2Q command-boundary), `enrollment_concurrency` 5/5
  (new).
- `cargo nextest run` — `section_membership` 55 (19 new Wave 2Q).
- `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
  clean.
- `check:dev-preview-isolation` pass; `knip` — no new findings;
  `cargo deny check` ok (no dependency change); gitleaks + OSV not on
  this machine's PATH — CI authoritative.
- **Independent review**: five fresh reviewers (security/isolation,
  SQLite concurrency, domain/architecture, teacher-UX/parity,
  accessibility) — [outcome + fixes recorded at the review-fix commit].

**Checkpoint**: [feature commit + review-fix/docs commit SHAs and CI run
ids recorded in `CURRENT-HANDOFF.md` once green]. `main` `d9ab036`
untouched.

---

## Wave 2P: transfer learner + end enrollment (added 2026-08-27) — complete

Full record: `docs/adr/0042-*` Wave 2P addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2P entry;
`docs/VERIFICATION-DEBT.md` Wave 2P entry. Same branch
(`claude/likha-sis-wave2a-learner-core`).

**Scope**: from a Section Roster row, an authorized user transfers a
currently enrolled learner to another section, or ends their enrollment.
Both effective-dated, history-preserving (end-date, never delete),
half-open interval, enforced at the Rust command boundary,
stale-mutation- and cross-school-safe. Excluded (directed): learner
deletion, bulk transfer / bulk end, CSV/XLS import, cloud sync,
enrollment-history editor.

**Repository truth verified first**: HEAD `eabed41` = origin, 0/0, tree
clean; `main` `d9ab036` untouched. Wave 2O CI re-confirmed
`completed/success` — `8e782e4` Quality `33042106266` + Security
`33042106188`; docs `eabed41` Quality `33043125049` + Security
`33043125095`.

**Central design call**: `enroll` (closes "whatever is open",
non-transactional on `&Connection`, same-section = silent no-op) is
unsafe as a roster-driven transfer. Per the wave's own instruction,
_strengthened the authoritative implementation_ — added dedicated
transactional, stale-safe `section_membership::transfer_membership` /
`end_membership` targeting an exact `membership_id`, rather than a second
transfer path. `enroll` stays the create-and-place primitive. No new
capability (`ManageLearners`, as ADR-0042 already scoped
"transferring a learner" to). Recorded in the ADR-0042 Wave 2P addendum.

**Verification record** (all run this session):

- `npm run quality` — **514 vitest** (58 files), typecheck (`tsc -b`),
  eslint, `prettier --check .`, `check:architecture` — all green.
- `cargo test` — **509 lib** + every integration binary; `enrollment`
  24/24 (7 new for transfer/end command boundary).
- `cargo nextest run` — `section_membership` 36/36 (18 new unit tests:
  outcomes, atomicity, stale-id refusal, double-submit, cross-school /
  forged-row rejection, malformed-date rejection, same-day validity,
  one-open invariant, zero-length-range behavior), `enrollment` 24/24.
- `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
  clean.
- `check:dev-preview-isolation` pass; `knip` — no new findings.
- `quality:security`: `cargo deny check` pass (no dependency change);
  gitleaks + OSV not on this machine's PATH — CI authoritative.
- **Independent review**: 5 fresh reviewers (security, reliability,
  architecture, teacher-ux, accessibility) against `59f9440` — **no
  blocking findings**. Fixes + deferred debt in the ADR addendum and
  `VERIFICATION-DEBT.md`.

**Checkpoint**: feature `59f9440` — Quality `33046336519` + Security
`33046336518` both `completed/success`. Review-fix + docs `b3b6262` —
Quality `33048615959` + Security `33048615965` both `completed/success`.
`b3b6262` is the final Wave 2P HEAD.

---

## Wave 2O: Section Roster read-only foundation (added 2026-08-27) — complete

Full record: `docs/adr/0042-*` Wave 2O addendum; `docs/CURRENT-HANDOFF.md`
top entry; `docs/PROJECT-MEMORY.md` Wave 2O entry. Teacher-facing UI
milestone; local-first; no migration; no dependency. Verification record:

- **Repo/CI truth first**: HEAD `2bc0d7b` = origin, 0/0; `main`
  `d9ab036`; tree clean. Wave 2N CI re-confirmed `completed/success` —
  `6f1bdb5` (Quality `33033895580` / Security `33033895620`) and
  `92142c9` (Quality `33034888077` / Security `33034888093`).
- **Reused, not rebuilt**: the roster pipeline already existed
  (`section_membership::roster_for_section` + `commands::section::
section_roster`; TS `SectionRosterMember` type / port / adapter /
  `SectionApplicationService.roster()`; `AttendanceScreen` already
  consumes an equivalent). Half-open `[starts_on, ends_on)` membership
  intervals and the one-open-membership invariant (ADR-0008/0042) are
  the authoritative domain — no parallel enrollment representation
  added, no membership state duplicated in the frontend.
- **Rust**: `CurrentRosterMember` projection (identity + `lrn` + `sex`
  - `starts_on`) + `current_roster(school_id, section_id, as_of_date)`
    — one indexed `learners ⋈ section_memberships` JOIN, no N+1, `ORDER
BY family_name, given_name`, scoped by `school_id` AND `section_id`
    together. Kept separate from `roster_for_section` /
    `roster_for_section_over_range` so `formgen::sf1` + attendance
    callers are untouched. `commands::section::section_roster` rewired to
    it; session-derived `school_id`, ungated read.
- **"Current member"** = existing half-open-interval semantics
  (`starts_on <= as_of_date < ends_on`); future-dated and ended
  memberships correctly excluded; screen shows the "as of" date.
- **TS**: `SectionRosterMember` gains `lrn` / `sex` / `startsOn`;
  `SectionApplicationService.roster()` trims `sectionId` + validates
  `YYYY-MM-DD`. `SectionRosterScreen.tsx` (new) with all required
  states + Efficient/Comfortable/Guided parity + desktop→narrow
  layout. `SectionsScreen` "Open roster" per row; `App.tsx`
  `rosterSectionId` handoff; `"section-roster"` `SignedInTab` +
  `TAB_LABELS` literal (not a `NAV_GROUPS` destination).
- **Decisions**: no search (single section, tens of learners); sort =
  family-then-given (project convention, applied in SQL); `sex` dropped
  from the projection after review (no consumer); friendly `2 Jun 2025`
  dates via a screen-local formatter; `membership_id` deferred to Wave 2P.
- **Checks actually run**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` 491 lib (+7) + all
  integration incl. `tests/enrollment.rs` 17 (+4) + 0 doctests; `cargo
nextest run` 595/595 (one transient `learner_management.rs` `db::open`
  parallel-load flake on a single `cargo test` run, not reproduced,
  unrelated). `npm run quality` clean — 484 vitest tests, architecture
  check, format:check. `check:dev-preview-isolation` pass; `knip` zero
  new. `cargo-deny` clean (no dep change); gitleaks/osv not on PATH
  locally (CI Security Gate authoritative). No packaged-native Tauri run
  (standing gap).
- **Independent review**: teacher-ux + accessibility + security +
  architecture reviewers ran in parallel; all four returned complete
  findings. One BLOCKING (a11y: `@media` `display:block` strips implicit
  table ARIA roles at 400% zoom) — fixed with explicit
  `role="table|row|columnheader|rowheader|cell"`. No other blocking;
  ~15 non-blocking items acted on (see `VERIFICATION-DEBT.md` Wave 2O +
  ADR-0042 addendum). Owed: native NVDA/Narrator pass at 400% zoom.
- **Scope guard held**: no transfer / end-enrollment / bulk / import /
  SF1 export / learner edit-delete / history editor; no dead buttons;
  no migration; no new dependency; synthetic data only.
- **Next**: Wave 2P — Transfer learner + End enrollment (see
  `CURRENT-HANDOFF.md`).

## Wave 2N: SF10 Evidence Closure (added 2026-08-27) — complete

Full record: `docs/adr/0053-*` Wave 2N addendum,
`docs/form-evidence/sf10/README.md`. DEPED_OFFICIAL_FORM /
COMPLIANCE_SENSITIVE / TEMPLATE_EVIDENCE / HISTORICAL_DATA_COMPATIBILITY.
Verification record:

- **Repo/CI truth first**: HEAD `0c6aaf8` = origin, tree clean; Wave 2M
  gates `33031801131`/`33031801110` re-confirmed `completed/success`.
- **DM 020, s. 2026** official PDF: page 2 extracted verbatim with
  `pdftotext -layout` (bundled with Git for Windows; pre-existing, not
  new harness tooling). Pages 1/3/4 = scanned images, no text layer.
  Para 5(b) names `SSHS SF 10 v2026.xlsx`; para 4 = SSHS-pilot-only
  scope. DepEd Order No. 010, s. 2024 primary page confirmed; Joint
  Memorandum STR-250331-0910-PS national PDF NOT obtained (secondary +
  Quezon DM 306 s. 2025 only).
- **Provenance promotion**: `SF10_SSHS_V2026_CANDIDATE_EVIDENCE` →
  `AuthoritativeSourceConfirmed`, `authoritative_issuance` = DM 020
  para 5(b) citation. Test asserts `confirm_authoritative_source`
  itself would allow it (guard-satisfying). Test asserts fidelity
  stayed `NotVerified`. Test asserts the JHS record stays unpromotable.
- **Model changes**: `track: None` for SSHS now evidence-backed (one
  template per DM 020); JHS `grade_levels` narrowed `["7","8","9","10"]`
  → `["7"]` (per-grade MATATAG phase-in); id/version strings tidied
  (pre-persistence, no stamp exists yet).
- **Checks actually run**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` 483 lib + all
  integration + 0 doctests pass. `npm run quality` — [record at
  commit].
- **Independent review**: security + architecture dispatched per
  frozen-harness rules; results/debt in `VERIFICATION-DEBT.md`.
- **Readiness**: SF10 = PARTIALLY READY. SF10 research stopped; no
  generator/import/UI/persistence/migration (Part G/H). Next slice:
  Section Roster + Enrollment Management (Wave 2O) — see
  `CURRENT-HANDOFF.md`.

## Wave 2M: SF10 Authoritative Template Intake & Version Applicability (added 2026-08-27) — complete

Full record: `docs/adr/0053-sf10-template-applicability-and-versioning.md`,
`docs/form-evidence/sf10/README.md`. Compliance-sensitive; DEPED_OFFICIAL_FORM
/ TEMPLATE_EVIDENCE / HISTORICAL_DATA_COMPATIBILITY. Synthetic data only.
Verification record:

- **Repo/CI truth first**: HEAD `ce15a2e` = origin, tree clean; Wave 2L
  `e04f64f` gates `33028634953`/`33028634929` both `completed/success`
  re-confirmed via `gh`.
- **Candidate acquisition**: 4 SF10 `.xlsx` from
  `support.lis.deped.gov.ph` (HTTP 200, valid OOXML). SHA-256 + size +
  HTTP Last-Modified/ETag recorded. Bytes kept in scratchpad OUTSIDE
  the repo (redistribution judgment deferred, per ADR-0051); only
  hashes/URLs/structure committed (`docs/form-evidence/sf10/`).
- **Intake tool run** against all 4 + regression against the SF1
  fixture (reproduces known hash/structure). Tool extended with
  per-sheet structural evidence — umya API only, no new dependency;
  `cargo build/clippy --example` clean.
- **`formgen::evidence`**: 2 SF10 candidate records added, both
  `CandidateUnverified`/`NotVerified`; promotion guard confirmed to
  refuse them (no `authoritative_issuance`).
- **`formgen::template_version`** (new): resolver + 10 tests — exact
  match, wrong grade band, pre-era → `NoApplicableTemplate` (NOT
  newest), `FidelityInsufficient`, `AmbiguousTemplates`,
  `ProvenanceUnusable`, registry conservatism.
- **Governing issuance**: DM 020 s.2026 confirmed to exist on
  deped.gov.ph (SSHS SF10, SY 2025-2026 pilot); body unreadable
  (scanned PDF, no OCR). DO 69 s.2016, DO 4 s.2014 = prior generations.
  JHS revision issuance not pinned. All recorded as leads, none used
  to promote.
- **10-scenario decision** (ADR-0053): Recommended = evidence-backed
  version registry + applicability resolver; Next Best = per-record
  frozen template-version stamp (adopt when SF10 records persist).
- **Checks actually run**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` 478 lib + all
  integration + 0 doctests pass (13 new). One transient post-`cargo
fmt` rustc ICE, non-reproducing on clean rebuild — recorded, not a
  defect. `npm run quality` — clean (462/462 TS tests, architecture check, format:check).
- **Independent review**: security + architecture reviewers dispatched
  per frozen-harness rules; results/debt in `VERIFICATION-DEBT.md`.
- **Scope guard held**: no SF10 generation/import/UI/persistence/
  migration.

## Wave 2L: Final Harness Consolidation + Production Harness v1.0 + ProjectForge (added 2026-08-27) — complete

Full record: `docs/adr/0052-wave2l-production-harness-v1.md`,
`docs/CURRENT-HANDOFF.md` top entry, `docs/VERIFICATION-DEBT.md` top
entry, `docs/SOURCE-REGISTRY.md` top entry, `docs/harness/`.
Harness/developer-infrastructure milestone — **no product code, tests,
migrations, or dependencies touched.** Verification record:

- **Repository/CI truth verified first**: branch/HEAD `27dc534` = `origin`,
  0 ahead/behind; `main` = `d9ab036`; tree clean. Wave 2K code
  checkpoint `10d5efc` re-confirmed via `gh run view`: Quality Gate
  `33026121743` + Security Gate `33026121791` both `completed/success`.
  HEAD `27dc534` Security Gate `33027657317` green; Quality Gate
  `33027657304` `in_progress` at start (docs-only, non-blocking).
- **Every harness component dispositioned** — full table in ADR-0052.
  Only change: removed the dead `security-guidance@claude-plugins-official`
  line from `.claude/settings.json`.
- **40-architecture rubric review + 4 elimination rounds** — Recommended
  S1 (92/100), Next Best S3 with switch condition. Compressed appendix
  in ADR-0052.
- **Runtime checks executed**: `node scripts/memory/health.mjs` (all
  HEALTHY), `recall.mjs` smoke (grep retrieval working), `claude plugin
list` (4 official plugins enabled; claude-mem disabled;
  security-guidance absent → dead config confirmed then removed), `npx
knip --version` (6.32.2), `cargo-deny` present
  (`gitleaks`/`osv-scanner` absent this machine — per-machine, CI
  authoritative), MCP config inspection (no `.mcp.json`; one user-scope
  `codebase-memory-mcp`).
- **Independent review**: `architecture-reviewer` dispatched for harness
  structure (also discharging the owed Wave 2J review) — hit the
  recurring reviewer-retrieval bug; rigorous self-review substituted;
  independent-review debt retained in `docs/VERIFICATION-DEBT.md`.
- **`npm run quality`** re-run after the doc/config edits — [record
  result at commit time].
- **ProjectForge v0.1** extracted to private repo
  `312810-spec/projectforge` — core + Claude Code adapter + 11 profile
  recipes + portable templates + independent memory + provenance.
- **Harness experimentation frozen** (ADR-0052 §freeze; `CLAUDE.md`
  updated). Exact next product action: SF10 template intake (see
  `docs/CURRENT-HANDOFF.md`).

## Wave 2K: Official-Form Template Evidence & Provenance Registry (added 2026-08-27) — complete

Full record: `docs/adr/0051-official-form-template-evidence-registry.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/CURRENT-HANDOFF.md`'s top
entry. Compliance/evidence-architecture milestone — no learner-facing
change, no UI. Verification record:

- **Mandatory checkpoint gate verified first**: repository truth
  confirmed clean at Wave 2J's `fb07797`; both its CI runs
  (`33015766489`, `33015766459`) re-confirmed genuinely
  `completed`/`success` — Quality Gate briefly re-showed `in_progress`
  on a re-check (likely a stale/cached `gh` read) and work was
  correctly held until it resolved.
- **Research**: two new authoritative-source angles tried (issuance-
  attached templates; official subdomain mirrors). No SF1/SF9
  authoritative template found (unchanged debt). Found a genuine SF10
  lead on `support.lis.deped.gov.ph` (official subdomain,
  container-format personally verified) — not registered as evidence
  this wave, since no SF10 generator exists and none was built merely
  to exercise the framework. Full detail and disclosed gaps in
  ADR-0051 and `docs/VERIFICATION-DEBT.md`.
- **Architecture**: `formgen::evidence` — `ProvenanceState` and
  `FidelityState` as two independent enums on `TemplateEvidence`, never
  collapsed into one status field. `confirm_authoritative_source`
  is the only citation-gated promotion path.
  `examples/inspect_template_candidate.rs` — dev-only intake tool
  (hash + structural inspection + suggested classification only; never
  self-registers, never fetches a URL, refuses files over 25MB before
  parsing).
- **Test suite**: 11 new Rust tests in `formgen::evidence`, covering the
  required-test categories: promotion-guard rejection (no citation,
  blank citation, already-rejected source) and acceptance (real
  citation); provenance/fidelity independence (both directions);
  SF1/SF9 debt-preservation defaults; no-PII-required field check;
  honest gap reporting.
- **Verification**: `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `cargo test` — all Rust tests
  pass (formgen::evidence's 11 new + all pre-existing, no regression).
  `npm run quality` clean, 462/462 TS tests (unchanged — no TS files
  touched this wave). Manual smoke test of the intake tool against the
  SF1 fixture (correct hash/structure), a non-spreadsheet file (handled
  as a gap, no panic), and an oversized file (refused pre-parse).
- **Independent review**: security-reviewer and architecture-reviewer
  dispatched in parallel, both closed, **no BLOCKING findings from
  either**. Security: 2 non-blocking items, both accepted as reasonable
  for dev-only tooling with no runtime/security-boundary role.
  Architecture: 6 non-blocking items, 5 fixed this wave (Superseded
  re-promotion guard added with a regression test; ADR wording
  corrected from "only function permitted" to "only sanctioned path";
  intake example now prints real enum values instead of hardcoded
  strings; unused `EvidenceKind` enum removed; `mod.rs` comment
  placement fixed), 1 accepted as an expected, not-yet-a-defect state
  (zero external consumers of `formgen::evidence` yet). Full detail in
  ADR-0051's "Independent review" section. Verification re-run after
  fixes: `cargo fmt --check`/`cargo clippy -D warnings` clean, `cargo
test` all passing (11 `formgen::evidence` tests, net +1).
- **Scope guards held**: no SF10 (or other) form generator added merely
  to exercise the framework; no template-intake directory created with
  nothing to put in it; no automatic compliance-judgment path built;
  no PII in any evidence field; no new npm/cargo dependency added.
- **Committed and pushed**: `10d5efc`. **CI confirmed green**: Quality
  Gate `33026121743` and Security Gate `33026121791`, both
  `completed`/`success` for this exact commit.

## Wave 2J: Resilient Zero-Cost Memory Observer + Project-Brain Hardening (added 2026-08-27) — complete

Full record: `docs/adr/0050-resilient-zero-cost-memory-observer.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 2J section, `docs/CURRENT-HANDOFF.md`'s top entry. Harness/
developer-infrastructure milestone — no learner-facing change.
Verification record:

- **Mandatory checkpoint gate verified first**: repository truth
  confirmed clean at Wave 2I's `287a0f2`; both its CI runs
  (`33011365970`, `33011365972`) re-confirmed genuinely
  `completed`/`success` — Quality Gate was caught mid-run on first
  check and work was correctly held until it finished, not merely
  assumed from local tests.
- **Incident + empirical finding**: claude-mem (third-party,
  inference-backed, OPTIONAL plugin) exhausted its trial allowance;
  this repository's own durable memory was never affected across the
  entire multi-wave outage, confirmed by reviewing every prior wave's
  successful docs updates during the outage window.
- **Ten-scenario decision**: repository-brain-authoritative + new
  deterministic local journal; claude-mem disabled entirely (data
  preserved) rather than circuit-breaker-wrapped, since no external
  call exists in the new code's path for a breaker to protect.
  `d2a8k3u/claude-code-memory` evaluated, classified REFERENCE. Full
  scoring in ADR-0050.
- **Architecture**: `scripts/memory/journal.mjs` (deterministic,
  replay-safe SHA-256-id capture) → `.claude/memory/journal/*.jsonl`
  (gitignored) ← `scripts/memory/capture-session-stop.mjs` (new `Stop`
  hook, git-metadata-only capture, secret-path filtering).
  `scripts/memory/recall.mjs` (grep-based, verbatim) and
  `scripts/memory/health.mjs` (`/memory-health` skill) both zero-cost,
  zero-network. Global claude-mem plugin flipped to disabled
  (machine-wide change, disclosed).
- **Highest-value test**: `recall.test.mjs`'s NOT_VERIFIED-preservation
  suite, run against the real `docs/VERIFICATION-DEBT.md` — proves SF1/
  SF9 fidelity and Windows packaging remain recoverable as
  `NOT_VERIFIED` and cannot be recalled as fabricated "PASSED" claims.
- **Verification (re-run after review fixes)**: `npx vitest run
scripts/memory` 24/24 (22 + 2 new regression tests for the failure-
  mode review's findings). `npm run quality` clean, 462 TS tests (438 +
  24 new, no regression). No Rust changes this wave.
- **Independent review**: security review + failure-mode review
  dispatched in parallel (correcting Wave 2I's sequential/incomplete
  dispatch pattern) — both closed, no blocking findings. Security: 3
  non-blocking items, all fixed/corrected. Failure-mode: 2 REAL bugs
  found and fixed with new regression tests (truncated-JSONL data-loss
  gap; `computeHealth()` not crash-safe on directory-level read
  failure). Full detail in ADR-0050. Architecture/harness review role
  NOT dispatched — retained as debt explicitly, not omitted, per the
  brief's instruction not to repeat Wave 2I's under-recording.
- **Scope guards held**: no learner-facing functionality; no paid
  provider/payment method introduced; no existing claude-mem data
  deleted; no new npm dependency added (Node built-ins only).

## Wave 2I: Multi-Form Official-Form Contract + SF9 Readiness (added 2026-08-27) — complete

Full record: `docs/adr/0049-multi-form-official-form-contract.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/CURRENT-HANDOFF.md`'s top
entry. Verification record:

- **Repository truth verified first**: `git fetch` clean; branch/HEAD
  at Wave 3's checkpoint `313ac0f`; `main` unchanged at `d9ab036`;
  working tree clean; both Wave 3 CI runs re-confirmed
  `completed`/`success` for that exact commit before any implementation
  began.
- **SF9 evidence gate**: no authoritative DepEd SF9 template found in
  this repository or obtainable from `deped.gov.ph` directly. Official
  SF9 fidelity remains `NOT_VERIFIED` — built against a synthetic
  fixture, per the brief's own explicit Option B permission.
- **Ten-scenario decision**: kept SF1's `OfficialFormGenerator` port
  as-is; added a separate `Sf9FormGenerator` trait rather than one
  generic multi-form method, to keep an SF9 field from ever silently
  compiling as SF1 data through a shared request type. Generalized only
  `TemplateDescriptor` (added `workbook_format`, widened two fields from
  fixed arrays to slices). Full scoring in ADR-0049.
- **Architecture**: `formgen::sf9` (domain contract) →
  `formgen::Sf9FormGenerator` (port) → `formgen::umya_adapter::
UmyaSf9Generator` → a SHA-256-hash-pinned bundled SYNTHETIC template.
  `formgen::sf9_projection` builds SF9's grade data by calling the
  EXISTING `grading_computation::compute_term_grade` — no grading rule
  reimplemented. Same atomic-write/no-caller-path discipline as SF1.
- **Multi-form adapter policy made concrete**: `umya_adapter::
reject_unsupported_format` rejects a `WorkbookFormat::LegacyXls`
  descriptor before any parsing — proven by a dedicated test — so
  "`.xlsx` does not imply Java, `.xls` does not imply Rust" is a checked
  fact, not only prose.
- **Verification**: `cargo nextest run` 557/557 (SF1's own suite
  unchanged and still green). `cargo test`/`cargo fmt --check`/`cargo
clippy -D warnings`/`cargo deny check` all clean. `npm run quality`
  clean, 438 TS tests, no frontend regression (no UI added this wave).
- **Independent review**: one security review dispatched (SF9
  authorization parity, atomic-write correctness, projection-query
  isolation, format-rejection ordering, PII-in-logs) — CLOSED, no
  blocking findings. One should-fix, fixed: `sf9_projection` now
  independently verifies `learner_id` belongs to `school_id` rather
  than relying solely on the caller. Three of the brief's four named
  review roles not dispatched this wave — retained as debt in
  `docs/VERIFICATION-DEBT.md`, per the established reviewer-harness
  fallback rule, not dropped.
- **Scope guards held**: no SF10, no cloud sync, no full SF9 UI, no live
  learner PII, no paid infrastructure, no unrelated file changes.

## Wave 3: Authoritative-Template SF1 Form Engine (added 2026-08-26) — complete

Full record: `docs/adr/0048-official-form-engine-sf1.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 3 section, `docs/CURRENT-HANDOFF.md`'s top entry. Verification
record:

- **Repository truth verified first**: `git fetch` clean; branch/HEAD
  at Wave 2G's checkpoint `c23cf16`; `main` unchanged at `d9ab036`;
  working tree clean; both Wave 2G CI runs re-confirmed
  `completed`/`success` for that exact commit before any implementation
  began.
- **Authoritative-template evidence gate**: no official SF1 template
  found anywhere in this repository or obtainable from this
  environment. Official SF1 fidelity remains `NOT_VERIFIED` — the
  engine was built against a synthetic fixture instead, per the
  brief's own explicit permission to do so.
- **Ten-scenario architecture decision**: departed from the brief's own
  named working hypothesis (Java + Apache POI/HSSF sidecar) on the
  strength of this repo's own prior evidence (a real DepEd `CONSO SF
v2025.xlsx` workbook is `.xlsx`, not legacy `.xls`). Adopted
  `umya-spreadsheet` (pure Rust, zero new runtime/packaging/process
  surface); Java/POI retained as documented Next Best with an explicit
  switch condition. Full scoring in ADR-0048.
- **Architecture**: `formgen::sf1` (domain contract) →
  `formgen::OfficialFormGenerator` (port) → `formgen::umya_adapter`
  (only production module coupled to `umya-spreadsheet`) → a
  SHA-256-hash-pinned bundled template resource. Atomic write (sibling
  `.tmp` + rename, cleaned up on any failure). No caller-supplied
  output path. No new migration. No UI screen (deliberately deferred).
- **Three independent reviews, all CLOSED, no blocking findings** (form
  fidelity, security/native-boundary, architecture/maintainability —
  all three hit this project's recurring reviewer-retrieval bug,
  recovered via the established protocol). Fixed: a genuine temp-file-
  cleanup gap (rename failures weren't cleaned up), four
  test-name-vs-behavior mismatches, an inaccurate "only module" doc
  claim, an unimplemented "defined names" fidelity claim, two dangling
  ADR-section citations. Newly disclosed: unencrypted generated files
  as a deliberate data-exposure boundary; the generation authorization
  gate matches sibling export commands' existing convention. Full
  detail: `docs/VERIFICATION-DEBT.md`.
- Full regression re-run, unaffected: `cargo nextest run` 546/546 (up
  from 521); plain `cargo test` (incl. doctests) green; `cargo fmt
--check`/`cargo clippy --all-targets -D warnings` clean; `cargo deny
check` clean; `npm run quality` 438/438 clean (no frontend files
  touched); `npm run build` (production) PASS. `npm run quality:security`:
  `cargo-deny` clean locally; `gitleaks`/`osv-scanner` not installed on
  PATH this session (disclosed, not new — CI's Security Gate is
  authoritative).
- **Remaining verification debt**: official SF1 fidelity
  `NOT_VERIFIED` (no real template available); Windows packaged-
  installer resource resolution `NOT_VERIFIED` (no `tauri build`
  installer produced in this sandboxed environment); genuine SF9/SF10
  reuse would need new domain-contract/port code, not just a new
  `TemplateDescriptor`.
- **Next**: no candidate pre-selected — select the next highest-value
  work at the start of the next session using current evidence, per
  `.claude/rules/autonomous-development.md`.

## Wave 2G: External API & Government Reference-Data Foundation (added 2026-08-26) — complete

Full record: `docs/adr/0047-psgc-reference-data-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 2G section, `docs/CURRENT-HANDOFF.md`'s top entry. Verification
record:

- **Repository truth verified first**: `git fetch` clean; branch/HEAD
  at Wave 2F's checkpoint `c00bc15`; `main` unchanged at `d9ab036`;
  working tree clean; both Wave 2F CI runs re-confirmed
  `completed`/`success` for that exact commit before any implementation
  began.
- **Ten-scenario architecture decision**: Recommended = local-file PSGC
  importer (no live PSA network call), explicitly the brief's own
  "Next Best" hypothesis — taken because PSA's own API site returned
  HTTP 403 from this environment. Full scoring in ADR-0047.
- **Schema**: migration 20, `reference_geo_snapshots`/
  `reference_geo_units` — global (no `school_id`), append-only/versioned,
  self-referencing FK plus a schema-level partial unique index
  (`WHERE is_current = 1`) enforcing exactly one current snapshot per
  source.
- **Code**: `import::psgc` (parse/validate), `repository::reference_geo`
  (transactional commit + reads), `commands::reference_geo` (3
  commands). Zero new dependencies — `src-tauri/Cargo.toml` unchanged.
- **Three independent reviews, all CLOSED, one blocking finding fixed**
  (converged on independently by two of three reviewers): hardcoded
  `"PSA PSGC"` read literal vs. unvalidated `source_name` write field —
  a mismatched import silently succeeded then became permanently
  invisible to every read. Fixed with an `EXPECTED_SOURCE_NAME`
  constant plus a schema-level backstop. Also fixed: two overstated
  test claims (a rollback test that never called `record_snapshot`; a
  "reconnect" test that never reconnected — both replaced with genuine
  versions), a level-adjacency validation gap, missing actor
  attribution, zero command-layer test coverage (added
  `tests/reference_geo.rs`), and a misleading `unit_count: 0` on no-op
  re-imports. Both reviewers hit this project's recurring
  reviewer-retrieval bug and were recovered via the established
  raw-transcript-then-retry protocol. Full detail:
  `docs/VERIFICATION-DEBT.md`.
- Full regression re-run, unaffected: `cargo nextest run` 521/521
  (up from 501); plain `cargo test` (incl. doctests) green; `cargo fmt
--check`/`cargo clippy --all-targets -D warnings` clean; `npm run
quality` 438/438 clean (no frontend files touched); `npm run build`
  (production) PASS. `npm run quality:security`: `cargo-deny` clean
  locally; `gitleaks`/`osv-scanner` not installed on PATH this session
  (disclosed, not new — CI's Security Gate is authoritative for this
  zero-new-dependency diff).
- 12 external providers researched and classified (only PSGC
  implemented) — full table in `docs/SOURCE-REGISTRY.md`.
- **Next**: Wave 3 — Authoritative-Template SF1 Form Engine. Not
  started this session, per the milestone's own explicit instruction.

## Wave 2F: Harness Closure + Security CI Gate (added 2026-08-26) — complete, not a LIKHA feature milestone, read this section first

Full record: `docs/adr/0045-claude-code-harness-audit.md`'s Wave 2F
addendum, `docs/adr/0046-security-ci-gate.md`,
`docs/VERIFICATION-DEBT.md`'s top entries. Does not change the LIKHA
feature track below — Wave 2E remains the most recently completed
product milestone. Verification record:

- **LSP verification**: closed for real, not just re-asserted. Root
  cause of the original gap found (`claude plugin install` needed, not
  just `enabledPlugins: true`) and fixed. Rust (`rust-analyzer`):
  `workspace/symbol`, `findReferences`, `hover` all demonstrated on
  real symbols (`authorize_capability_with_actor`, `commit_import`),
  every result cross-checked against `grep -n` and matched exactly.
  TypeScript (`typescript-language-server`): `workspaceSymbol`,
  `documentSymbol`, `findReferences`, `hover` demonstrated on
  `Sf1ImportApplicationService`/`commitImport`, every result
  cross-checked and matched exactly.
- **MCP pilot**: 5 candidates evaluated (Context7, GitHub, Playwright,
  Cloudflare Docs/Workers Bindings, Semgrep) — 0 installed. Full
  reasoning in `docs/SOURCE-REGISTRY.md`'s "Wave 2F — controlled MCP
  pilot" entry.
- **Security CI gate**: `.github/workflows/security.yml` created (3
  jobs: gitleaks, cargo-deny, osv-scanner, all `contents: read` only).
  Actions pinned to exact commit SHAs verified via `gh api`; osv-scanner
  uses a direct checksum-verified binary rather than the marketplace
  action (see ADR-0046 for why).
- Full regression re-run before/around this work, unaffected: `cargo
nextest run` 501/501; plain `cargo test` (incl. doctests) green;
  `cargo fmt --check`/`cargo clippy --all-targets -D warnings` clean;
  `npm run quality` 438/438 (typecheck/lint/format/architecture/test
  all clean); `npm run build` (production) PASS.
- Security tools re-confirmed clean locally via
  `scripts/check-security.mjs` immediately before wiring CI: `3 ok, 0
failed, 0 missing` (gitleaks 60 commits/no leaks; cargo-deny
  advisories/bans/licenses/sources all ok; osv-scanner no issues found,
  18 pre-accepted advisories correctly filtered).
- Independent security + architecture/reliability reviews of the new
  workflow dispatched; outcome recorded once retrieved (see
  `docs/VERIFICATION-DEBT.md` and the relevant ADR).
- `.claude/settings.json`'s plugin enablement changes from the prior
  harness-audit session (uncommitted at the start of this session) were
  reconciled and carried forward, not lost or overwritten.

**Not done this wave, deliberately (non-goals stated up front, held
to)**: no SF1 import contract redesign; no cloud sync work begun; no
merge to `main`; no SARIF/Code-Scanning upload wiring (a separate,
deliberately deferred decision — would need `security-events: write`);
no scheduled/cron security scan.

## Wave 2E: SF1 Import Operational Hardening & Auditability (added 2026-08-26) — complete, read this section first

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Verification record:

- New Rust module tests: `import::fingerprint` (7 tests — identical
  content/different filename matches, different content differs, a
  single-byte difference differs, `safe_filename` strips a Windows-style
  path AND a forward-slash path AND falls back to a placeholder for a
  trailing separator — the forward-slash and trailing-separator cases
  were added after a real CI-only bug, see below — fails closed for a
  missing file), `repository::sf1_import_history` (6 tests — record/list
  round-trip, ordering+limit, school isolation, fingerprint lookup
  hit/miss/cross-school).
- `import::commit` gained 5 new tests: an empty plan is rejected server-
  side and writes no phantom history row (added after independent
  architecture review found the original code had no server-side guard,
  only a client-side one); a successful commit records one history row
  with backend-computed counts; a failed commit leaves no history row
  (the atomicity proof this milestone specifically required);
  re-importing the same file twice records two separate history rows;
  history from one school is never visible when listing another.
- `import::preview` gained 3 new tests: no notice for a never-seen
  file; a previously-recorded import of identical content surfaces the
  advisory notice; the same content under a different filename still
  matches (filename is never used as a content-identity proxy).
- `tests/sf1_import.rs` (integration) gained 5 new tests: a teacher
  cannot list history; a registrar can list their own committed
  imports; a registrar never sees another school's history; history
  persists across a real close-and-reopen of the encrypted database
  file (not just an in-memory connection); the existing re-import/
  authorization/school-scope tests were updated for the new
  `commit_sf1_import` signature without changing their assertions.
- Full `cargo test` (plain, the stable-checkpoint command, includes
  doctests) — PASS, all passing (501 via `cargo nextest run`, the fast
  inner-loop runner, immediately before and after `cargo fmt`).
- `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` —
  PASS, clean.
- **A real, non-transient CI failure was caught on the `Quality
(Ubuntu)` job after the first push and fixed before declaring this
  milestone done** — see `docs/VERIFICATION-DEBT.md`'s top entry for
  full root-cause detail (a platform-dependent `Path::file_name()`
  separator bug, not a flake/infra/formatting issue).
- Native `cargo build` (debug, full binary) — PASS. `cargo build
--release` failed in this session's shell on a local Perl/OpenSSL gap
  unrelated to this milestone's code — see `docs/VERIFICATION-DEBT.md`.
- Frontend: 46 new/updated tests across `Sf1ImportScreen.test.tsx`
  (advisory banner shown/not-shown, commit called with the same file
  path preview used, view/empty-state/no-raw-content for the history
  panel), `sf1-import-service.test.ts`, `sf1-import-repository.test.ts`.
  Full `npm run test` — PASS, 438/438 (up from ~429, reflecting the
  Wave 2E-specific additions net of pre-existing counts).
- `tsc -b --noEmit` / `eslint .` / `prettier --check .` /
  `npm run check:architecture` — all clean. `npm run build` (production
  Vite build) — PASS.
- `gitleaks`/`cargo-deny`/`osv-scanner` re-run against the changed
  dependency graph (new `sha2` direct dependency) — all clean; see
  `docs/VERIFICATION-DEBT.md` for exact output.
- Independent security + architecture reviews dispatched; outcome
  recorded once retrieved (see `docs/VERIFICATION-DEBT.md` and this
  ADR addendum).

**Not done this session, deliberately**: wiring the three security
tools into CI (a concrete, named plan recorded instead — see the ADR
addendum); an actual process-kill-mid-transaction reproduction (relied
on SQLite/WAL's documented rollback-on-reopen guarantee instead, per
this milestone's own instruction not to claim untested behavior);
cloud sync, Android key store, SF10, or any unrelated attendance/
grading work (explicit non-goals).

## Wave 2D: Local Data Security Verification (added 2026-08-26) — complete, read this section first

Full record: `docs/adr/0044-local-data-security-verification.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Verification record:

- New test `wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`
  (`src-tauri/src/db/mod.rs`) — PASS.
- Full `cargo test` — PASS, 394 lib tests (up from 393) + all
  integration binaries.
- `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` —
  PASS, clean.
- Native `cargo build` — PASS.
- `npm run quality` — PASS (unaffected, no frontend changes).
- Primary-evidence manual verification: real `sqlite3.org` CLI (v3.53.4)
  against a genuine encrypted database file with synthetic data —
  `.tables` empty, raw `SELECT` fails ("file is not a database"), raw
  byte-level grep finds zero plaintext matches for the synthetic
  name/LRN/school-name.
- `gitleaks` v8.30.1: 55 commits scanned, no leaks.
- `cargo-deny` v0.20.2: `advisories ok, bans ok, licenses ok, sources
ok`, exit 0.
- `osv-scanner` v2.4.0: no unaccounted-for issues (17 known advisories,
  all pre-documented/accepted); `calamine`/`tauri-plugin-dialog` not
  flagged.
- Independent security + architecture reviews dispatched; outcome
  recorded once retrieved (see `docs/VERIFICATION-DEBT.md`).

**Not done this session, deliberately**: wiring the three security
tools into CI (cross-platform install logic is untested, real risk to
a currently-green pipeline); a full-codebase PII-in-logs audit beyond
`crypto`/`db`; reproducing an actual Windows password reset against
DPAPI; any cross-device key-recovery mechanism (deliberately deferred
to future authenticated sync, not solved with an insecure workaround).

## Wave 2C: SF1 Import Preview + Duplicate Review UX (added 2026-08-26) — complete, read this section first

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2C
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Verification record:

- 25 new tests: `sf1-import-service.test.ts` (application logic —
  `buildCommitPlan`/`unresolvedReviewCount`), `sf1-import-repository.test.ts`
  - `file-picker.test.ts` (infrastructure adapters), `Sf1ImportScreen.test.tsx`
    (22 component tests — file selection, parsing state, classification
    counts, duplicate comparison/decisions, mode parity, keyboard
    reachability, 2 accessibility checks). All passing.
- Full `npm run test` — PASS, 429/429 (up from 404).
- `tsc -b --noEmit` / `eslint .` / `prettier --check .` /
  `check:architecture` — all clean.
- `cargo fmt --check` / `cargo test` (393 lib tests, unchanged) /
  `cargo clippy --all-targets -- -D warnings` — all PASS.
- Native `cargo build` and `npm run build` — both succeed.
- Independent teacher-UX review (premium-design + teacher-comfort) —
  4 NEEDS-FIX findings, all fixed this session (multi-candidate
  duplicate selection, all-mode safety reassurance, `import_error`-
  specific failure copy, consistent birthdate-field wording).
- Wave 2B's own CI run was found to have actually failed (Prettier
  drift on docs edited after the local gate ran) — fixed and confirmed
  green before any Wave 2C work began.

**Deliberately not covered**: a human visual/screen-reader pass on the
compiled native Tauri binary — no browser/screenshot tool available for
it in this environment (standing gap, `docs/VERIFICATION-DEBT.md`).
Android intentionally out of scope — no Android build target exists in
this codebase yet.

## Wave 2B: SF1 Bulk Import Engine (added 2026-08-26) — engine checkpoint complete, UI deferred, read this section first

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Verification record:

- 43 new `src-tauri/src/import/*` unit tests — PASS (workbook: 8,
  normalize: 10, validate: 12, matching: 6, preview: 3, commit: 6).
- 8 new `tests/sf1_import.rs` integration tests — PASS (authorized
  Registrar/School Head succeed; Teacher and no-session denied on both
  commands with zero mutation; school-scope cannot be overridden by
  workbook content or a foreign section; re-import + `UseExisting`
  resolution enrolls without duplicating).
- Full `cargo test` — PASS, 393 lib tests (up from 350) + all
  integration binaries.
- `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` —
  PASS, clean.
- `npm run quality` — PASS (390 vitest tests, typecheck, lint,
  format:check, architecture check — all unaffected, no frontend
  changes this milestone).
- A dedicated failure-injection test proves whole-batch transactional
  rollback: a later row's LRN-uniqueness violation leaves zero rows
  from earlier in the same batch committed, not just the failing row.
- One independent `security-reviewer` dispatch, narrow scope +
  numbered questions (this project's one reliably-retrievable review
  pattern) — outcome recorded in `docs/VERIFICATION-DEBT.md`'s top
  entry once resolved.
- `gitleaks`/`cargo-deny`/`osv-scanner` confirmed still unavailable —
  `calamine`'s supply-chain check has not run, honestly disclosed in
  `docs/VERIFICATION-DEBT.md`, not silently skipped.

**Deliberately not built this checkpoint**: the import-preview UI
screen (New/Existing/Needs Review/Errors, Efficient/Comfortable/Guided
mode parity). The engine + full authorized command-layer vertical
slice is a stable, independently useful checkpoint — matching this
project's established zero-or-minimal-UI-first precedent (RBAC,
Curriculum Foundation, Teacher Load, Wave 2A). Next actionable step:
build the import-preview screen on top of this already-tested contract.

## Wave 2A.1: Authorization Closure (added 2026-08-26) — complete, read this section first

**Complete.** Full record: `docs/adr/0042`'s Addendum,
`docs/VERIFICATION-DEBT.md`'s top entry. Verification record:

- 6 new `enrollment.rs` authorization tests — PASS (13/13 total in
  that file, up from 7).
- Full `cargo test` — PASS, 350 lib tests (unchanged — pure gate
  change) + all integration binaries.
- `cargo fmt --check` / `cargo clippy --all-targets -- -D warnings` —
  PASS, clean.
- Native `cargo build` — PASS.
- `npm run quality:full` — PASS end-to-end.
- `git diff --check` — PASS, clean.
- `gitleaks`/`cargo-deny`/`osv-scanner` — confirmed still unavailable
  (`node scripts/check-security.mjs`: 0 ok, 3 missing), not installed,
  same disclosed gap. Manual secret grep of the diff: clean.
- Codex Pilot — BLOCKED (`codex login status`: not logged in, same
  condition as prior sessions; not re-probed).
- Independent `security-reviewer` — dispatched, **returned real,
  retrievable findings this time**: 5/6 adversarial questions
  FALSE-POSITIVE (with citations), one non-security SHOULD-FIX
  (document the `ManageLearners`/`ManageTeachingAssignments` capability
  split as deliberate — done, ADR-0042's addendum). No BLOCKING
  findings. **Debt closed**, not carried forward.

**Fix**: `commands::section::create_section` now requires
`Capability::ManageTeachingAssignments` (School Head only) — closing
the same class of gap Wave 2A found and fixed in
`enroll_learner_in_section`. Reuses the existing Teacher Load
capability rather than inventing a new one.

**Bounded mutation-surface audit**: all 11 Wave 2A-surface commands
inventoried (capability/scope-source/mutation/test-coverage table in
the session's own report). Every write is now capability-gated, every
read is correctly session-scoped-only, no client-supplied `school_id`
anywhere, no IDOR. No further defect found; scope was not expanded
beyond this bounded surface.

**Explicit non-goals honored**: no new authorization mechanism
invented; no repository-wide RBAC redesign; no SF1 import work begun.

**Per explicit instruction: do not begin Wave 2B (SF1 Bulk Import
Engine) automatically.** Not started — this session stops here and
waits for approval.

## Wave 2A: Learner Core + Enrollment Domain Foundation (added 2026-08-26) — complete, read this section first

**Complete.** Full decision record:
`docs/adr/0042-learner-core-enrollment-domain-foundation.md`.
Verification record:

- 10 new `section_membership::`/`learner::` unit tests — PASS.
- New `src-tauri/tests/enrollment.rs` integration suite — PASS, 7/7,
  including the adversarial proof that a Teacher session is now
  rejected by `enroll_learner_in_section` where it previously would
  have succeeded.
- Full `cargo test` — PASS, 350 lib tests (up from 342) + all
  integration binaries including the new one.
- `cargo fmt --check` — PASS.
- `cargo clippy --all-targets -- -D warnings` — PASS, 0 warnings.
- Native `cargo build` — PASS (harmless pre-existing PDB linker
  warning only).
- `npm run quality:full` — PASS end-to-end.
- `git diff --check` — PASS, clean.
- Independent `security-reviewer` — dispatched, hit the recurring
  agent-resume/retrieval failure on both the dispatch and the one
  permitted retry; rigorous self-review substituted (full record in
  `docs/VERIFICATION-DEBT.md`), no BLOCKING/SHOULD-FIX findings.

**Domain decision**: no new table, no migration. `learners` (identity)
and `section_memberships` (enrollment/placement, already
history-preserving via a half-open interval and a DB-level "one
current placement" invariant) already correctly implement the
Learner/Enrollment separation the milestone brief hypothesized as a
new schema — confirmed by direct inspection before assuming the
brief's default hypothesis was correct. Full 10-scenario evaluation in
the ADR.

**A real authorization gap was found and closed**:
`commands::section::enroll_learner_in_section` had no capability check
at all (any Teacher could enroll/transfer any learner) — fixed to
reuse `Capability::ManageLearners`. `create_section`'s identical gap
was spawned as a separate follow-up task, not fixed in this milestone.

**Added**: `section_membership::list_by_learner_in_school`/
`current_membership_for_learner_in_school` (enrollment history/current
placement), `learner::find_candidates` (duplicate-candidate lookup,
exact-match only, never auto-merges), and the three commands wiring
them (`list_learner_enrollment_history`, `get_current_enrollment` —
both ungated reads; `find_learner_candidates` — gated same as
`create_learner`).

**Explicit non-goals honored**: no SF1 bulk import; no learner photo;
no large enrollment UI (repository/command layer only, matching the
zero-UI proof shape RBAC/Curriculum/Teacher Load all used); no cloud
sync; no provenance/source-tracking schema (deferred — not yet
justified until Wave 2B's actual importer design is known, see ADR-0042);
no enrollment status/reason taxonomy (deferred to Wave 3's Form
Engine, which will need SF1's exact field requirements); no
cross-school transfer representation; no fuzzy/phonetic duplicate
matching.

**Per explicit instruction: do not begin Wave 2B (SF1 Bulk Import
Engine) automatically.** Not started — this session stops here and
waits for approval.

## Minimal CI Foundation (added 2026-08-26) — complete, read this section first

**Complete.** Full decision record: `docs/adr/0041-minimal-ci-foundation.md`.
Verification record — every line actually run, not claimed:

- Repository truth verified: branch `claude/likha-sis-ux03-plan-plv80c`,
  HEAD `62e0948` matching expected checkpoint, `origin` in sync,
  working tree clean.
- Teacher Load review-debt: reconciled as STALE, CORRECTED (see
  `docs/VERIFICATION-DEBT.md`'s top entries) — no reviewer re-dispatch
  performed, per instruction not to duplicate a completed review.
- GitHub Actions billing: verified from official `docs.github.com`
  billing documentation — this repository is public, standard-runner
  minutes (including Windows) are free/unmetered. Zero-billing gate
  passed unconditionally.
- 10 CI scenarios evaluated; selected two jobs (Ubuntu, Windows), both
  running `npm run quality:full` verbatim, on
  `push`/`pull_request`/`workflow_dispatch`, `permissions: contents:
read` only, concurrency-cancel per ref, no third-party actions beyond
  official `actions/checkout@v5`/`actions/setup-node@v5`.
- `npx js-yaml` — PASS, workflow YAML syntax valid (no `actionlint`
  available in this environment, disclosed rather than skipped
  silently).
- `git diff --check` — PASS, no whitespace errors.
- `npm run quality:full` (local, before every push) — PASS, matching
  the exact command CI runs.
- **First real GitHub Actions run (32915080360)**: Ubuntu job
  **FAILED** — `gobject-sys`/`glib-sys` `pkg-config` build-script
  failures, root-caused to `ubuntu-latest` missing Tauri's Linux
  GTK/glib system dependencies (confirmed against Tauri's own official
  prerequisites docs, not guessed). Windows job **PASSED** —
  `npm run quality:full` green end-to-end on the actual Windows target
  on the first attempt.
- Fixed: added the exact `apt-get install` package list from
  `v2.tauri.app/start/prerequisites/` to the Ubuntu job, before the
  Rust toolchain check step.
- **Second real GitHub Actions run (32916282825)**: **both jobs
  green** — Ubuntu `success` in 6m9s, Windows `success` in 17m17s.
- `main` remains a strict ancestor of this branch (`git merge-base
--is-ancestor main HEAD`, 27 commits ahead, 0 behind) — not touched,
  fast-forwarded, or merged.

**Explicit non-goals honored**: no product feature work; `main`
untouched; no installer/`tauri build` bundle step; no Android CI; no
new secret-scanning tooling adopted (evaluated implicitly — `gitleaks`
remains the disclosed unavailable-locally gap, not expanded this
milestone); no dependency caching added (deliberately deferred, first
workflow kept simple).

**Per explicit instruction: do not begin the next milestone
automatically.** Recommended next milestone, awaiting approval:
**Integration Review + `main` Fast-Forward Decision** — not started.

## Native Rust Verification Recovery (added 2026-08-25) — complete, read this section first

**Complete.** Full decision record:
`docs/adr/0040-windows-only-dependency-target-gating.md`. This closes
the "Rust toolchain cannot compile in this environment" debt every
milestone since before this session's visible window had to work
around. Verification record — every line actually run, not claimed:

- `cargo check --lib` — PASS, 0 warnings, 0 errors (first success this
  session).
- `cargo test --lib auth::` (targeted RBAC/authorization) — PASS, 57/57.
- `cargo test --lib teaching_assignment::` / `schedule_meeting` (targeted
  Teacher Load) — PASS, 9/9 + 13/13.
- Full `cargo test` — PASS, 338 lib tests + all integration test
  binaries, 0 failed, 0 ignored.
- `cargo clippy --all-targets -- -D warnings` — PASS, 0 warnings.
- `npm run quality` — PASS, 390/390, typecheck/lint/format/architecture
  all green.
- `cargo fmt --check` — run for the first time this session (never part
  of `quality:full`); found ~264 pre-existing formatting diffs across
  most of the crate, unrelated to this fix. Not corrected here (out of
  scope for a targeted dependency-recovery milestone) — recorded as new
  debt in `docs/VERIFICATION-DEBT.md`.
- `git diff --stat` — 6 files changed, 71 insertions, 10 deletions
  (`Cargo.toml`, `crypto/mod.rs`, `db/mod.rs`, plus 3 files touched only
  to fix bugs the restored compiler/test signal revealed). `Cargo.lock`
  byte-identical to before the fix — zero lockfile churn.
- Independent `security-reviewer` — dispatched for the crypto/key-store
  boundary change; outcome recorded in `docs/VERIFICATION-DEBT.md`.
- Codex — not touched this milestone, per explicit instruction (this
  dependency milestone did not need it). Remains PILOT.

**Root cause** (Category E — platform/target-specific dependency
problem, confirmed with `cargo tree` reverse-dependency evidence, not
guessed): LIKHA's own `windows = "0.62.2"` dependency in
`src-tauri/Cargo.toml` was declared unconditionally, with no
`[target.'cfg(windows)'.dependencies]` gate, forcing `windows-future`'s
Windows-only COM/async code to compile on every host including this
Linux sandbox. Tauri's own Windows-only webview backend dependencies
were already correctly target-gated in the same lockfile — proof the
fix pattern was already proven, just never applied to LIKHA's own
declaration.

**Three genuine pre-existing bugs fixed**, all revealed only once real
compilation succeeded for the first time: a type-inference ambiguity in
`class_record::find_detail_by_id_in_school`; dead code in
`schedule_meeting::create` where `CreateMeetingOutcome::Duplicate` could
never actually be returned; and four `assessment_item` tests that had
never validly passed (a hardcoded `"teacher-1"` string could never
satisfy a real foreign-key constraint). None of these were introduced
by this milestone — all pre-date it, none had ever been compiler/test-
verified before.

**Gate decision: RUST VERIFICATION RECOVERED — READY TO RESUME PRODUCT
WAVE.** Per explicit instruction, the recommended next milestone is not
started — see `docs/CURRENT-HANDOFF.md` for the recommendation and full
report.

## Teacher Load / Class Schedule Foundation (added 2026-08-25) — complete, read this section first

**Complete.** Full decision record:
`docs/adr/0039-teacher-load-class-schedule-foundation.md`. Verification
record:

- `npm run quality` — PASS, 390/390, unaffected (Rust-only change).
- `npx knip` — PASS, same pre-existing findings, zero new.
- `npm run check:dev-preview-isolation` — PASS.
- `git diff --check` — PASS, no whitespace errors.
- `cargo check --lib` — **BLOCKED**, reconfirmed once (not repeatedly
  retried, per instruction): fails at the pre-existing `windows-future`
  dependency-compile stage before this crate's own new source is even
  type-checked — zero compiler signal exists on this milestone's Rust,
  not even partial.
- Independent `security-reviewer` — dispatched for an adversarial pass;
  outcome recorded in `docs/VERIFICATION-DEBT.md`.
- Codex — `codex login status` checked once (still "Not logged in," no
  change from last session); not re-probed against the network beyond
  that, per explicit instruction not to repeatedly chase a known
  environmental condition. Remains PILOT.

**Two real bugs caught by this session's own TDD/adversarial self-review
before any independent review ran**: a School Head-role-only check in
`authorize_view_teacher_load` would have let a School Head "view" a
teacher belonging to a different school entirely (fixed: added a
same-school membership check on the target); `schedule_meeting::create`
used `INSERT OR IGNORE` with no Rust-side weekday validation, the same
class of bug as RBAC's `role::grant` mistake (fixed: explicit validation
plus `ON CONFLICT ... DO NOTHING`). Both fixed and test-pinned before
this checkpoint, not left as debt.

**Explicit non-goals honored**: no timetable optimizer/solver; no
advisory/ancillary/personnel/qualifications tracking; no availability
constraints; no relief/substitute suggestion; no SF7 export; no "My
Day" integration; no UI; no automatic overload enforcement (metric
only); no link from `class_records` to `teaching_assignments`; no
Curriculum Versioning, Learner Core/SF1, cloud sync, or official-form
work.

## Codex Delegation Harness (added 2026-08-25) — complete, read this section first

**Complete, harness-only, PILOT classification.** Full record:
`docs/adr/0038-codex-delegation-harness.md`. Verification record:

- Repository truth: `git fetch`/`status`/`log` all confirmed clean, in
  sync, HEAD `a8c71f6` at start of this milestone.
- Plugin reality check: `claude plugin marketplace add
openai/codex-plugin-cc` — PASS (real `git clone` succeeded).
  `claude plugin install codex@openai-codex` — PASS. `claude plugin
details codex@openai-codex` — PASS, reported real component inventory.
- Live pilot task: **BLOCKED** — `codex login status` reported "Not
  logged in" (no credentials exist in this environment, none
  provisioned, per the explicit no-paid-infra rule); a harmless probe
  (`codex exec --skip-git-repo-check "say hello"`) confirmed a second,
  independent, structural blocker: this environment's network egress
  proxy returns `HTTP 403` for `wss://api.openai.com/v1/responses`.
  Process was killed after confirming the failure mode, not left
  running.
- `npm run quality`/`check:architecture`/`check:dev-preview-isolation`/
  `knip` — not re-run this milestone (no product/application code
  touched at all — confirmed via `git status`/`git diff --stat` showing
  only `.claude/`/`docs/` files). `git status`/`git diff --stat` — PASS,
  actually inspected.
- No independent review dispatch needed — no product code, no new
  authorization surface, no security-sensitive change; this is
  documentation/harness-config only, reviewed by the same care as any
  other durable-doc milestone.

**Explicit non-goals honored**: no product feature work; no
Curriculum/Learner-Core/sync/encryption/attendance/class-record/
official-form/UI work; no paid API infrastructure enabled or
provisioned; no fabricated pilot success.

## Curriculum / Key-Stage Versioning Foundation (added 2026-08-25) — complete, read this section first

**Complete.** Full decision record: `docs/adr/0037-curriculum-key-stage-versioning.md`.
Verification record:

- `npm run quality` — PASS, 390/390 (typecheck, lint, format:check,
  `check:architecture`, vitest), unaffected since this milestone's
  application changes are Rust-only.
- `npx knip` — PASS, same pre-existing findings, zero new.
- `npm run check:dev-preview-isolation` — PASS.
- `cargo check --lib` / `cargo test --lib` — **BLOCKED**, reconfirmed
  identical to every prior session's reproduction (`windows-future`
  0.3.2 vs. `windows-core` 0.62.2, unchanged root cause — see
  `docs/VERIFICATION-DEBT.md`). This milestone's new migration
  (`key_stages`/`curriculum_versions`/`curriculum_learning_areas`,
  `class_records.curriculum_version_id`), `repository/curriculum.rs`,
  and `class_record.rs`'s new tests are written and manually reviewed
  against established conventions, not compiler-verified.
- `cargo clippy`/`cargo nextest` — NOT RUN, same blocker.
- Independent `architecture-reviewer` — dispatched for architecture/
  data-integrity review; outcome recorded in `docs/VERIFICATION-DEBT.md`.
- `deped-researcher` — dispatched for MATATAG/Key-Stage research; hit
  this project's recurring agent-resume failure on both the initial
  attempt and one retry (now confirmed on this agent type too); direct
  `WebSearch`/`WebFetch` substituted successfully, with one real
  limitation disclosed (`deped.gov.ph` itself unreachable — network
  egress blocked in this environment) — see `docs/SOURCE-REGISTRY.md`.

**Explicit non-goals honored**: no curriculum administration UI; no
required relationship forced onto `subjects`; no grade-level
normalization or automatic curriculum selection by grade level; no
school-level curriculum activation (no repository evidence this
milestone showed it was required); no Teacher Load/Schedule, SF1, sync,
or other Wave 1+ item.

## Wave 1A: RBAC Foundation (added 2026-08-25) — complete, read this section first

**Complete.** Full decision record: `docs/adr/0036-rbac-foundation.md`.
Verification record:

- `npm run quality` — PASS, 390/390 (typecheck, lint, format:check,
  `check:architecture`, vitest), unaffected since this milestone's
  application changes are Rust-only.
- `npx knip` — PASS, same pre-existing findings as before this milestone
  (`userService`, `LEARNER_SCORE_STATUSES`, `OmittedField`/
  `FieldDisclosure`), zero new.
- `cargo check --lib` / `cargo test --lib` — **BLOCKED**, reproduced this
  milestone (not merely cited): `windows-future` 0.3.2 fails to compile
  against the `windows-core` 0.62.2 pair it's locked to. Traced further
  than prior sessions: `windows` and `crypto/dpapi.rs` are both compiled
  unconditionally (no `cfg(windows)` anywhere in the manifest or the
  module), so this crate cannot compile on any non-Windows host at all
  today, independent of the specific version pairing. A real fix is a
  genuine architecture decision, not made this milestone — see
  `docs/VERIFICATION-DEBT.md`.
- All new/changed Rust (migration 16, `repository::role`,
  `auth::Capability`/`authorize_capability`, `commands::learner`/
  `commands::user`) was written and reviewed by hand against the
  established `authorize_*`/schema-enum conventions, then independently
  security-reviewed (see below) — not compiled, per the blocker above.
- `cargo clippy`/`cargo nextest` — NOT RUN, same blocker.
- Mutation testing (`cargo-mutants`) on the new authorization logic —
  **NOT WARRANTED / BLOCKED**: `cargo` cannot compile in this
  environment at all, so there is nothing to mutate-test against.
- Independent `security-reviewer` — dispatched, returned real findings
  (found and fixed a real bug: `role::grant()`'s `INSERT OR IGNORE`
  silently swallowed `CHECK` constraint violations, independently
  reproduced against real SQLite before trusting the claim, fixed to
  `ON CONFLICT (...) DO NOTHING`; recorded one pre-existing, non-blocking,
  currently-UI-unreachable gap in `add_user_to_school`'s authorization
  scope as debt rather than expanding this milestone to fix it) before
  hitting a session-limit API error mid-follow-up. Full detail in
  `docs/VERIFICATION-DEBT.md`.

**Explicit non-goals honored**: no account/role-management UI; no second
`Capability` variant; no `Session` shape change; no cloud/sync,
curriculum versioning, SF1, Teacher Load/schedule, SMEA, or ILAWCraft
work; no new harness tooling adopted (see `docs/SOURCE-REGISTRY.md`'s
Wave 1A audit — ast-grep/dependency-cruiser/repomix/cargo-mutants all
evaluated and rejected for now against real repository evidence).

## Post-UX-04 Roadmap Reconciliation (added 2026-08-25) — read this section first

Immediately after UX-04 completed, the user directed a full roadmap
reconciliation before any further implementation: verify repository
truth, capture a substantially expanded product definition, and replace
the flat UX-05..UX-08 queue below with an evidence-based execution plan.
**No feature code changed in this reconciliation.**

Full record:

- `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md` — the
  durable architecture/sequencing decision (Wave 0-7, supersedes the
  "UX-05 through UX-08 — Queued" section below).
- `docs/product/PRODUCT-CONTRACT.md` — durable product facts (school
  isolation, RBAC, curriculum versioning, School Forms relationships,
  Teacher Load, branding, cloud direction, etc.), each marked BUILT /
  DIRECTION SET / HYPOTHESIS against actual repository state.
- `docs/product/ROADMAP-RECONCILIATION-DECISION.md` — the scenario-
  scoring pass that chose the execution strategy.

The "UX-05 through UX-08 — Queued" section below is left intact as
historical record (per this file's own established "repair, don't
erase" convention — see the UI-First Tranche note just below) but is no
longer the active plan; ADR-0035's Wave table is authoritative going
forward. **Per explicit instruction, Wave 1 has not been started** —
see `docs/CURRENT-HANDOFF.md` for the recommended next milestone
(RBAC Foundation), which is not yet approved or begun.

## UI-First Tranche (added 2026-08-25) — current work, read this section first

**Drift repair note**: this file previously listed only M0 onward in
chronological order and had not kept pace with `docs/PROGRESS-MAP.md`,
`docs/CURRENT-HANDOFF.md`, or ADR-0021 through ADR-0029 (all of which
cover real, completed work this file never recorded: Authentication
Audit Log, Global Session Expiry Handling, Learner Search, Teacher
Workspace, Learner Roster CSV Export, Idle-Timeout Warning, the
audit-timestamp/ARIA self-review fixes, the Workspace grading-period
status, and the proptest lockout pilot). Per the directing prompt for
this UI-first program ("Known planning drift... Repair this at the
first UI milestone; do not propagate the inconsistency"), this section
is the repair: `docs/PROGRESS-MAP.md` and `docs/adr/*` are the
authoritative record for that already-completed work going forward,
not this file's stale M-number listing below (left intact as historical
record — see "Historical M0-M20 detail" further down, unchanged).

Full direction and Impeccable/visual-verification decisions:
`docs/adr/0030-ui-first-program-and-ux00.md`.

### UX-00 — Progress Map Repair + Impeccable Pilot + Visual Baseline

Teacher outcome: none directly yet — this establishes the reliable
design/verification foundation the rest of the UI program depends on.

Baseline SHA (verified via `git log`/`git fetch`, matched the user's
own supplied checkpoint exactly): `5b6e4d1`.

Checklist:

- [x] Verify git state (fetch, compare local/origin, confirm clean
      fast-forward-able tree) before any action.
- [x] Read `CLAUDE.md`, `docs/PROJECT-MEMORY.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/PROGRESS-MAP.md`,
      `docs/SOURCE-REGISTRY.md`, `docs/VERIFICATION-DEBT.md`, the
      autonomous-development/architecture/security-privacy/testing
      rules, and the `premium-teacher-ui`/`accessibility` skills.
- [x] Verify the `impeccable` npm package is real before installing
      (registry check: maintainer, repo, license — matches
      `pbakaus/impeccable`).
- [x] Install Impeccable project-local; catch and correct the
      installer's unrequested hook write (see ADR-0030).
- [x] Investigate the visual-verification path: found and fixed a real
      bug (`.claude/launch.json` port `5173` → actual `1420`); confirmed
      Browser-pane DOM/text/console verification now genuinely works;
      confirmed pixel screenshot capture is blocked by a client-side
      pane-display state, disclosed rather than worked around; formally
      selected the three-layer strategy in ADR-0030.
- [x] Repair `docs/PROGRESS-MAP.md`: add the UI-First Tranche table,
      mark UX-00 in progress, UX-01–UX-08 queued.
- [x] Repair `docs/ACTIVE-PLAN.md` (this section).
- [x] Put the active task at the top of `docs/CURRENT-HANDOFF.md`.
- [x] Create `PRODUCT.md` — via `/impeccable init`'s own playbook,
      synthesized from the directing prompt's exhaustive brief plus
      `CLAUDE.md`/`PROJECT-MEMORY.md` rather than a redundant interview
      round (substitution disclosed in the file itself and in the
      milestone report). Platform recorded as `adaptive` (Windows now,
      Android a named future target, one product whose design language
      genuinely adapts per OS).
- [x] Create `DESIGN.md` — selected "Calm Civic Classroom" (the
      directing prompt's own recommended thesis) with rationale against
      LIKHA's priority order; documents the incumbent token system
      (`src/ui/theme/styles.css`) as the evolution baseline (refinement,
      not a from-scratch replacement) and names the concrete token/
      typography/motion/accessibility targets UX-01 implements.
- [x] Inventory every current screen: 13 screens/components in
      `src/ui/*.tsx` (`AppShell`, `AttendanceScreen`, `AuditLogScreen`,
      `ClassRecordWorkspace`, `ClassRecordsScreen`, `FirstRunSetupScreen`,
      `GradingPeriodsScreen`, `IdleTimeoutWarning`, `LearnerListScreen`,
      `LoginScreen`, `MonthlySummaryScreen`, `SectionsScreen`,
      `TeacherWorkspaceScreen`). Shared CSS lives entirely in
      `src/ui/theme/styles.css` (442 lines, no per-screen stylesheets).
      Full token/component/pattern inventory recorded in `DESIGN.md`'s
      "Composition and Components" section.
- [x] Capture a visual baseline to the extent this session's
      verification path allows: found and fixed a real bug
      (`.claude/launch.json`'s wrong dev-server port) that had been
      silently breaking Browser-pane verification; confirmed DOM/text/
      console verification against the real `vite dev` server now
      genuinely works (`LoginScreen` renders correctly with the
      expected, already-documented "no Tauri IPC bridge" console
      errors — not a new bug); pixel-level screenshot capture is
      blocked this session by a client-side Browser-pane-display state,
      disclosed, not worked around — see ADR-0030.
- [x] Establish measurable UI baselines (grepped directly from source,
      not estimated): loading state (`role="status"`) present in 10/13
      screens; error state (`role="alert"`) in 12/13; a distinct empty-
      state message in 8/13 (the other 5 either always have data by
      construction or are pure banners/warnings with no list to be
      empty); `useTeacherMode` (Guided-hint capability) wired in 12/13.
      316/316 TS tests passing across 43 test files is the existing
      structural/accessibility baseline (`axe-core` via
      `expectNoAccessibilityViolations`) every later UX milestone's own
      test changes are compared against.
- [x] Run `npm run quality` (316/316), `npm run build`, `npx knip`
      (same 5 pre-existing findings, zero new) as the milestone's
      baseline checks.
- [x] Push the UX-00 completion commit; verify remote sync.

### UX-01 — Design Tokens, Shared Components, and App Shell

Teacher outcome: opening LIKHA-SIS, a teacher immediately understands
where they are, where each major task lives, which school/account and
interface mode are active, which actions are primary, and whether
something is loading/saved/successful/warning/failed — one coherent
teacher workbench, not screens sharing a stylesheet.

Baseline SHA: `fcf26ca` (UX-00's completion commit).

Scope:

- Evolve `src/ui/theme/styles.css`'s existing token mechanism to the
  Calm Civic Classroom palette (warm paper neutrals, deep ink/navy
  structural color, restrained teal/jade productive state, sunrise/
  amber attention, red reserved for error/destructive), recomputing
  contrast for the actual final hex values.
- Select and locally bundle one permissively-licensed typeface suited
  to long sessions and tabular data (names, LRNs, dates, grades);
  record source/license in `docs/SOURCE-REGISTRY.md`. No runtime
  webfont fetch.
- New shared components backed by real, already-repeated markup:
  Button (variants), Alert/Banner (error/confirmation/warning/info
  tones, consolidating the existing three near-identical banner
  patterns without weakening ARIA semantics), Loading state, Empty
  state, Status chip, Page header, Nav item. Migrate enough real call
  sites to prove reuse — not a big-bang rewrite of every screen.
- Redesign `AppShell`'s navigation from the flat 8-button row into an
  intentional teacher workbench: LIKHA-SIS identity, clear current
  location, logical grouping (daily teaching / learner records /
  grading / security-audit), teacher name + school, accessible mode
  switcher, sign-out, session warnings — every existing destination
  preserved, none renamed away silently.
- One restrained "ledger continuity" motion treatment (CSS only, no
  new dependency), full `prefers-reduced-motion` behavior.

Non-goals (explicitly out of scope, belong to UX-02 through UX-06):
Workspace/Attendance/Gradebook/Learner/Section/Auth/Audit screens' own
focused redesigns. Only shared/app-shell-level elements migrate here.

Affected: `src/ui/theme/styles.css` (and new token additions),
`src/ui/AppShell.tsx`, `src/App.tsx` (nav composition only), new
`src/ui/components/` (or equivalent) shared component files, `LoginScreen`/
`IdleTimeoutWarning`/error-banner call sites where migrating to the new
Alert component.

Acceptance criteria: functional (no regression in auth/session/nav
routing, every tab still reachable, all three teacher modes retain full
capability), visual (inspected, not inferred — see verification below),
accessibility (WCAG 2.2 AA contrast recomputed for new colors, focus
visible, no color-only meaning, touch targets ≥44px on narrow layouts),
responsive (1366×768, 1024×768, 390×844 all intentional, not just
"doesn't overflow"), motion (timing/easing policy honored, reduced-
motion preserves confirmation), architecture (no new UI framework/
animation/icon dependency without a 10-scenario decision; `src/ui/**`
still only receives services via props; only `src/composition.ts`
imports concrete Tauri adapters).

Known risks: pixel-screenshot verification depends on the Browser pane
being visibly displayed client-side (per the user's own instruction
this time — confirmed required, not optional); native Tauri WebView2
verification remains a separate, still-unbuilt path — a 10-scenario
decision this milestone must make explicitly (native pilot vs.
dev-only synthetic fixture) rather than deferring again.

- [x] Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`,
      `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`,
      `docs/ACTIVE-PLAN.md`, `docs/PROGRESS-MAP.md`,
      `docs/VERIFICATION-DEBT.md`, `docs/SOURCE-REGISTRY.md`,
      `docs/adr/0030-ui-first-program-and-ux00.md`.
- [x] Inspect `src/App.tsx`, `src/ui/AppShell.tsx`,
      `src/ui/theme/styles.css`, teacher-mode implementation
      (`ModeContext.tsx`/`modes.ts`/`useTeacherMode.ts`), and repeated
      screen patterns across all 13 screens.
- [x] Push the UX-01 start checkpoint (`cb644ef`).
- [x] Impeccable `shape` pass for the app-shell/navigation composition
      (context.mjs + one `shape` invocation; informed the nav-grouping
      decision directly, no separate artifact).
- [x] Compare fonts; select one; record in `docs/SOURCE-REGISTRY.md`
      (Public Sans, over Atkinson Hyperlegible Next and Inter).
- [x] Evolve tokens to the Calm Civic Classroom palette; recompute
      contrast for real hex values (full ratio table in ADR-0031).
- [x] Build shared components (Alert, Loading, EmptyState, StatusChip,
      PageHeader, NavItem — Button deliberately not wrapped, see
      ADR-0031 §3); migrate real call sites (full list in ADR-0031).
- [x] Redesign `AppShell`/`App.tsx` navigation/identity/session-status
      into 4 grouped clusters; every destination preserved.
- [x] One ledger-continuity motion treatment (active-nav-item selection
      rule); reduced-motion handling (one shared `:root` token-collapse
      rule).
- [x] 10-scenario decision: native `@wdio/tauri-service` pilot (3.65)
      vs. dev-only synthetic visual fixture (5.30) — B selected in a
      safety-hardened form, construction deliberately deferred to
      whichever of UX-02–06 first needs it (see ADR-0031 §6 for the
      full reasoning on why building it now, under time pressure,
      wasn't the safer choice).
- [x] Visual inspection: `LoginScreen` at 1366×768, 1024×768, 390×844;
      light/dark; all 3 teacher modes; screenshotted and inspected via
      the Browser pane (now working after the port fix). Authenticated
      screens (grouped nav, `AppShell` header) not pixel-inspected this
      session — no live Tauri IPC bridge in the browser dev server; see
      the 10-scenario decision above and `docs/VERIFICATION-DEBT.md`.
      Reduced motion verified by code inspection, not visually toggled
      (no emulation control in this session's Browser-pane tooling).
- [x] `npm run quality` (339/339), `npm run build`,
      `npm run check:architecture` (also run directly, passed). `npx knip`
      clean (5 pre-existing findings after 2 new ones triaged/fixed).
      `npm run quality:security`: not run — its tools (gitleaks/
      cargo-deny/OSV-Scanner) remain the same disclosed per-machine
      PATH gap noted in every prior session this project, not new.
- [x] Impeccable mechanical detector (`detect.mjs --json`) run against
      every touched file — zero findings. Deeper interactive `critique`/
      `polish` conversational passes not run to completion this session
      (time budget); self-review substituted, full checklist in
      ADR-0031's "Independent review" section.
- [x] Update `DESIGN.md`, `docs/PROGRESS-MAP.md`, `docs/ACTIVE-PLAN.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/PROJECT-MEMORY.md`,
      `docs/SOURCE-REGISTRY.md`, `docs/VERIFICATION-DEBT.md`,
      ADR-0031.
- [x] Push the UX-01 completion checkpoint; verify remote sync.

### UX-02 — Teacher Workspace Polish

Teacher outcome: within seconds of signing in, a teacher understands
what needs attention today (which sections still need attendance,
which are partial/complete, which grading period is open per section),
sees learner/section counts as useful context, can review recent
sign-in activity, and can begin the next real task with one click —
without a second dashboard being invented alongside the existing
Workspace.

Baseline SHA: `826bf7d` (UX-01's completion commit).

Scope:

- Restructure `TeacherWorkspaceScreen`'s data loading into two
  independent paths (critical: sections/attendance/grading/learner
  count; secondary: recent sign-in activity) so a secondary-data
  failure never erases valid attendance information, plus a retry
  affordance for each.
- Sort sections by a documented, deterministic attention rank (not
  started → partial → complete → no learners enrolled, tie-broken by
  name) — the "Today's priority" rail.
- Give each section a direct, one-click action: open Attendance with
  that section pre-selected (verified against the loaded section list,
  safe fallback if it no longer exists), or "Manage sections" when a
  section has no learners enrolled yet.
- "View all sign-in activity" action to the existing Sign-in Activity
  destination; "Create a section" action on the no-sections empty
  state.
- One authored focal treatment: a ledger-row priority list (left accent
  bar by status, not a card), plus a status-transition motion cue.
- **First implementation slice**: a safety-hardened, development-only
  synthetic visual fixture (ADR-0031's selected approach) so
  authenticated screens can finally be pixel-inspected — built before
  claiming any visual-quality result for this milestone.

Non-goals: no new domain features, no duplicate forms inside Workspace,
no changes to attendance rules/grading calculations/auth/authorization/
school isolation/database schema/Rust commands/exports/PII fields, no
router/global-state package/URL-param mechanism for section
preselection (narrowly-typed props/callbacks only), no fabricated
online/offline indicator.

Affected: `src/ui/TeacherWorkspaceScreen.tsx` (+ test), `src/App.tsx`,
`src/ui/AttendanceScreen.tsx` (+ test, for safe section preselection),
new `src/dev-preview/` fixture entry point (isolated, never imported by
production code), `src/ui/theme/styles.css` (priority-rail styling).

Acceptance criteria: functional (every new action navigates correctly,
section preselection falls back safely when the section no longer
exists, no regression to existing Workspace behavior), visual
(inspected via the new fixture at 1366×768/1024×768/390×844, light/
dark, all 3 modes — real screenshots, not inferred), accessibility
(heading hierarchy, keyboard operability, focus after actions, 44px
narrow targets, non-color status meaning, screen-reader names, 200%
zoom/reflow, reduced motion), fixture safety (proven: production entry
graph doesn't import it, production `dist` doesn't contain it, it
cannot reach real auth/session code), architecture (`src/ui/**` still
only receives services via props; only `src/composition.ts` imports
concrete Tauri adapters).

- [x] Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`,
      `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`,
      `docs/ACTIVE-PLAN.md`, `docs/PROGRESS-MAP.md`,
      `docs/VERIFICATION-DEBT.md`, `docs/SOURCE-REGISTRY.md`,
      ADR-0024, ADR-0028, ADR-0030, ADR-0031.
- [x] Inspect `TeacherWorkspaceScreen.tsx` + tests, `App.tsx`,
      `AppShell.tsx`, `AttendanceScreen.tsx`, UX-01 shared
      components/styles.
- [x] Push the UX-02 start checkpoint.
- [x] Build the safety-hardened dev-only fixture; prove isolation
      (production entry graph, `dist` contents, no auth/session reach).
- [x] Impeccable `shape`/`context` pass consulted (design decisions
      checked directly against the established Calm Civic Classroom
      anti-patterns — see ADR-0032 §6).
- [x] Restructure data loading (critical vs. secondary, retry).
- [x] Priority-ranked section list with direct actions.
- [x] Section preselection into Attendance (safe fallback) — verified
      interactively via the fixture, not just by test.
- [x] "View all sign-in activity" / "Create a section" actions.
- [x] One focal ledger-row treatment; one status-transition motion cue.
- [x] Visual inspection via the fixture at 3 viewports, light/dark, 3
      modes — real screenshots captured and inspected (see ADR-0032).
- [x] `npm run quality` (352/352), `npm run build`,
      `npm run check:architecture`, `npx knip` (5 pre-existing),
      `npm run quality:security` (honestly reported unavailable).
- [x] Impeccable-anti-pattern self-audit; scope-drift review (no
      attendance-rule/grading/auth/schema/export change made).
- [x] Update `DESIGN.md`, `docs/PROGRESS-MAP.md`, `docs/ACTIVE-PLAN.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/VERIFICATION-DEBT.md`,
      ADR-0032. (`docs/PROJECT-MEMORY.md`/`docs/SOURCE-REGISTRY.md`:
      no durable-fact or dependency change this milestone, left as is.)
- [x] Push the UX-02 completion checkpoint; verify remote sync.

### UX-03 — Daily Attendance + Monthly Attendance Summary Polish

Teacher outcome: a teacher can confirm the selected section/date (or
section/month) at a glance, see how many learners are marked and how
many remain, use the safe "assume Present, flag exceptions" bulk
workflow with confidence it never overwrites an existing mark, mark or
correct Present/Absent/Tardy quickly with clear per-row save feedback
and a keyboard-efficient workflow, recover cleanly from a load or save
failure without ever seeing stale data from a different section/date/
month presented as current, move from Attendance into Monthly Summary
with the same section/month already selected, and read the monthly grid
without guessing what a letter or a blank cell means.

Baseline SHA: `f02bce5` (account-transition checkpoint, one commit after
UX-02's own completion `14e7e5d` — no code changed in between).

Scope:

- Fix three confirmed correctness defects (found by direct code
  inspection during planning, not merely hypothesized): (1) a failed
  section/date/month change can leave the previous context's roster or
  monthly report rendered underneath the new error, since neither
  screen clears stale data before a new request settles; (2) two writes
  for the same learner can resolve out of order with no guard, so an
  older response can overwrite a newer one, and re-selecting the
  already-active status performs a redundant write; (3) "Mark all
  present" does not serialize against concurrent individual writes on
  the same roster. Each gets a failing regression test first (TDD),
  matching this project's testing rule for anything touching saved
  state.
- Reorder `AttendanceScreen` into section/date → completion state +
  bulk action → roster; add an "X of Y marked · Z remaining" text
  readout (not color-only); a non-color cue for the selected status;
  per-row saving/saved/failed states with a retry path; P/A/T/Up/Down
  keyboard shortcuts scoped strictly to roster focus; a mobile ledger
  layout at ~390px instead of a shrunk table.
- Add a P/A/T/— legend to `MonthlySummaryScreen` (wording matching this
  app's actual domain semantics — no invented distinction the data
  model doesn't support), a retry action on load failure, and a
  compared, recorded narrow-layout decision for the monthly grid.
- A narrowly-typed callback/state handoff (mirroring ADR-0032's
  section-preselection pattern) so opening Monthly Summary from
  Attendance preserves the current section and year/month — no router,
  no global state.
- Extend `src/dev-preview/` to wire `MonthlySummaryScreen` and the new
  transition, upgrading `FixtureAttendanceRepository`'s `record()`/
  `bulkMarkPresent()`/`monthlySummary()` (currently unwired, throwing)
  and adding a `FixtureExportRepository`, without weakening any existing
  isolation guarantee.

Non-goals: no schema/Rust/attendance-rule/export-format change unless a
verified correctness defect makes one unavoidable (none found); no
change to Present/Absent/Tardy as the only statuses; no router/global-
state package; no cloud/provider dependency; no new generic UI kit/icon/
animation dependency.

Affected: `src/ui/AttendanceScreen.tsx` (+ test), `src/ui/MonthlySummaryScreen.tsx`
(+ test), `src/App.tsx`, `src/dev-preview/DevPreviewApp.tsx`,
`src/dev-preview/fixtures.ts`, `src/ui/theme/styles.css`.

- [x] Reverify git state (fetch, branch, working tree, local/remote SHA)
      before any doc/code change.
- [x] Read `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`, `docs/PROJECT-MEMORY.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/PROGRESS-MAP.md`,
      `docs/VERIFICATION-DEBT.md`, `docs/SOURCE-REGISTRY.md`, ADR-0008,
      ADR-0009, ADR-0018, ADR-0030, ADR-0031, ADR-0032.
- [x] Inspect `AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx` (+ tests),
      `App.tsx`, shared components, `src/dev-preview/`, application
      services/domain types for attendance/section/export, `styles.css`,
      `package.json`, architecture/dev-preview-isolation scripts.
- [x] Push the UX-03 start checkpoint (`c0124f0`).
- [x] TDD: stale-context-after-failed-load fix (Attendance and Monthly
      Summary), with the Section-A/Section-B regression test named in
      this milestone's directing requirements.
- [x] TDD: overlapping-learner-writes fix (per-row generation/sequencing
      guard; skip a write when re-selecting the already-active status).
- [x] TDD: bulk-vs-individual write serialization, with an explicit,
      teacher-understandable rule, tested.
- [x] Daily Attendance hierarchy/count-readout/non-color-cue/per-row-
      state/keyboard-shortcut work.
- [x] Mobile attendance ledger layout at ~390px.
- [x] Monthly Summary legend/retry/narrow-layout-comparison work
      (comparison recorded in ADR-0033).
- [x] Attendance → Monthly Summary context-preserving transition.
- [x] Wire `src/dev-preview/` (screen, transition, fixture upgrades);
      confirm isolation checks still pass.
- [x] `npm run quality` (365/365), `npm run build`, `npm run check:architecture`,
      `npm run check:dev-preview-isolation`, `npx knip` (4 findings, down
      from 5 pre-existing — zero new), `npm run quality:security`
      (tools unavailable on this machine, honestly disclosed), `git diff
--check`, `git status --short`.
- [x] Browser-rendered visual verification via the dev-preview fixture
      at 1366×768/1024×768/390×844, light/dark, 3 modes, required states
      (loading/empty/success/write-in-progress/bulk/failure/retry/
      mobile-ledger); native Windows/WebView2 verification remains
      unavailable (disclosed, not claimed).
- [x] Independent review (`teacher-ux-reviewer`, `accessibility-reviewer`)
      dispatched, both hit the recurring agent-resume/retrieval failure
      on both the initial attempt and one permitted retry each; rigorous
      self-review substituted, found and fixed one real teacher-UX gap
      (see ADR-0033 §9); independent-review debt recorded as open in
      `docs/VERIFICATION-DEBT.md`.
- [x] Update `DESIGN.md`, `docs/PROGRESS-MAP.md`, `docs/ACTIVE-PLAN.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/VERIFICATION-DEBT.md`, ADR-0033.
      (`docs/PROJECT-MEMORY.md` updated with the durable summary;
      `docs/SOURCE-REGISTRY.md` untouched — no new dependency this
      milestone.)
- [x] Push the UX-03 completion checkpoint; verify remote sync.

### UX-04 — Class Records, Assessments, Score Entry, Grade Output

Teacher outcome: a teacher can create/select an assessment item, enter
scores rapidly with clear per-row saving/failure/retry feedback, see
"X of Y scored · Z remaining" for the item they're working on, trust
that a computed term grade never silently looks current after a score
changes, and fix a mistyped assessment item (or safely rename one that
already has scores) without being permanently stuck with a mistake.

Baseline SHA: `0634421` (UX-03 completion checkpoint).

Scope: fix four confirmed correctness defects (found by direct code
inspection during UX-04's discovery pass) — stale roster after a
failed item switch; overlapping/out-of-order score writes reachable via
two different trigger paths (the score input's commit path and the
exception-status buttons, which don't guard each other); redundant
duplicate exception writes; and term grades that stay looking current
after a score changes. Add a completion-count readout. Add assessment-
item edit/delete for unscored items, and a safe scored-item rename if
inspection proves the name doesn't participate in grading math. Bring
`ClassRecordsScreen` into the UX-01–03 shared-component/hierarchy
convention. Extend the mobile ledger pattern. Build the Class Records
dev-preview fixture from scratch (currently zero coverage).

Non-goals: no change to the DepEd weighting algorithm, transmutation
table, or category model unless a verified defect is found (none
expected); no new weight groups; no inferring a weight policy from a
subject name; no cloud/router/global-state dependency; no Android-
native work (only responsive/shared-UI preparation).

Affected (expected): `src/ui/ClassRecordsScreen.tsx` (+ test),
`src/ui/ClassRecordWorkspace.tsx` (+ test), `src/application/assessment-service.ts`,
`src/domain/assessment.ts`, `src/domain/ports/assessment-repository.ts`,
`src/infrastructure/tauri/assessment-repository.ts`,
`src-tauri/src/repository/assessment_item.rs`,
`src-tauri/src/commands/assessment_item.rs`, `src/dev-preview/fixtures.ts`,
`src/dev-preview/DevPreviewApp.tsx`, `src/ui/theme/styles.css`.

- [x] Reverify git state (fetch, branch, working tree, local/remote SHA,
      UX-03 checkpoint ancestry) before any doc/code change.
- [x] Re-read `docs/PROGRESS-MAP.md`, `docs/ACTIVE-PLAN.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/VERIFICATION-DEBT.md`, ADR-0011/
      0012/0013/0033, and the live implementation, confirming discovery
      findings still hold.
- [ ] Push the UX-04 start checkpoint.
- [x] TDD: stale assessment-context-after-failed-load fix.
- [x] TDD: overlapping learner-score-write fix covering both the
      score-input and exception-button trigger paths.
- [x] TDD: duplicate-exception-write fix.
- [x] Term-grade freshness: investigate automatic-recompute-after-write
      vs. explicit-stale-flag, decide, record in ADR-0034, implement
      with a regression test.
- [x] Completion-count readout (selected item + per-item list
      indicator), with blank/zero/exception-state tests.
- [x] Assessment-item correction: Rust repository/command layer (update/
      delete, unscored-only for meaning-changing fields; investigate
      and test whether a scored item's name can safely be renamed).
- [x] Assessment-item correction: TS domain/application/UI + tests.
- [x] Grade-completeness correctness check (blank/zero/exception/
      partial-scoring handling) — no real ambiguity found; re-verified
      against ADR-0013's already-accepted interpretation (ADR-0034 §6).
- [x] `ClassRecordsScreen` hierarchy/shared-component migration +
      per-class-record progress summary. Also fixed a real bug found
      along the way: the list didn't re-fetch after returning from a
      workspace, so the new Progress column could show stale counts.
- [x] `ClassRecordWorkspace` gradebook polish, keyboard verification
      (added missing Arrow-key-navigation and save-failure-keeps-focus
      tests; added a `:focus-within` active-row highlight), mobile
      ledger (already covered by UX-03's shared `.score-entry` pattern).
- [x] Wire `src/dev-preview/` Class Records fixtures from scratch;
      confirm isolation checks still pass.
- [x] `npm run quality`, `npm run build`, `npm run check:architecture`,
      `npm run check:dev-preview-isolation`, `npx knip`,
      `git diff --check`, `git status --short` — all green.
      `cargo test`/`cargo clippy` could **not** run this session (a
      pre-existing, unrelated `windows-future`/`windows-core` dependency
      conflict blocks compilation — see `docs/VERIFICATION-DEBT.md`);
      Rust changes were verified by careful manual review instead.
      `npm run quality:security` tooling (gitleaks/OSV-Scanner) not
      available in this environment, same as prior milestones.
- [x] Browser-rendered visual verification via the dev-preview fixture
      at 1366-wide and 390-wide, light/dark, all 3 modes, and the
      required states (empty/partial/complete workspace, locked vs.
      unlocked item edit, two-step delete, live term-grade table with a
      floored grade, the grade-freshness flash after a real edit, item
      creation). Found and fixed two real layout bugs jsdom tests could
      not catch (ADR-0034 §8). `playwright-cli` itself failed in this
      environment (browser-version mismatch); worked around by driving
      the `playwright` package directly against the pre-installed
      Chromium (see `docs/VERIFICATION-DEBT.md`). Native Windows/WebView2
      verification remains unavailable, as disclosed.
- [x] Independent review (`teacher-ux-reviewer`, `accessibility-reviewer`)
      dispatched, both hit the recurring agent-resume/retrieval failure
      on both the initial attempt and one permitted retry each; rigorous
      self-review substituted, found and fixed one real must-fix
      accessibility gap (ambiguous per-item Edit/Delete button names —
      see ADR-0034's Verification section); independent-review debt
      recorded as open in `docs/VERIFICATION-DEBT.md`.
- [x] Update `docs/PROGRESS-MAP.md`, `docs/ACTIVE-PLAN.md`,
      `docs/CURRENT-HANDOFF.md`, `docs/VERIFICATION-DEBT.md`, ADR-0034
      (`docs/PROJECT-MEMORY.md` updated with the durable summary).
- [x] Push the UX-04 completion checkpoint; verify remote sync.

### UX-05 through UX-08 — Superseded 2026-08-25, see the reconciliation section at the top of this file

**Superseded, not abandoned.** The 2026-08-25 post-UX-04 roadmap
reconciliation (see this file's top section) replaced this flat queue
with `docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`'s
Wave 0-7 sequence: UX-05's scope merges into Wave 2 (combined with SF1
Enrollment); UX-06's scope splits across Waves 1 and 5; UX-07 becomes
Wave 6; UX-08 becomes Wave 7 unchanged in substance. Do not resume
planning against this section — use ADR-0035's table instead.

## Historical M0-M20 detail (unchanged, chronological, pre-dates the UI-first direction)

## M0 Workspace Foundation — Complete

Goal: create a clean, reproducible, production-oriented development baseline before feature work.

Verified on this machine (2026-08-23):

- `npm install` — clean, 0 vulnerabilities.
- `npm run typecheck` — passes (`tsc -b --noEmit`, strict mode).
- `npm run lint` — passes (ESLint flat config, 0 issues).
- `npm run format:check` — passes (Prettier, all files).
- `npm run test` — passes (Vitest + Testing Library, jsdom).
- `npm run build` — passes (Vite production build).
- `cargo check` / `cargo build` in `src-tauri/` — both pass. Rust
  `stable-x86_64-pc-windows-msvc` toolchain and Visual Studio Build Tools
  2022 (C++ workload) were installed via winget during this session and
  produced a linked `app.exe`.

Not run: `tauri build` (installer bundling via WiX/NSIS) and `tauri dev`
(interactive window) — out of scope for a workspace-foundation checkpoint
and not needed to verify the toolchain.

## M1 Windows LocalDatabase Foundation — Complete

Goal: one reusable, provider-independent persistence pattern (Repository
Ports -> Infrastructure/Platform Adapters) proven with ordinary SQLite.
Decision record: `docs/adr/0002-local-database-foundation.md`.

Delivered: `src-tauri/src/{db,repository,commands,error}.rs` (all SQL
lives in Rust; `Learner` reads are school-scoped only; Mutex-poisoning
recoverable; IPC errors carry no internals), `src/domain/`,
`src/domain/ports/`, `src/infrastructure/tauri/` (TS types/ports/adapters
so UI never imports Tauri or SQLite directly). Independently reviewed
(architecture/security/reliability); findings fixed.

Verified: `cargo test` 14/14, `cargo clippy -D warnings` clean, `cargo
build` clean, `npm run quality` clean (5/5 TS tests).

## M2 Encryption-at-Rest & Secure Key Storage — Complete

Goal: encrypt the working database and protect its key, without changing
the M1 pattern's shape. Decision record:
`docs/adr/0003-encryption-at-rest.md`.

Delivered: SQLCipher via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`
(raw 256-bit key, `PRAGMA cipher_compatibility = 4` pinned), a `KeyStore`
trait with a `DpapiKeyStore` implementation (Windows DPAPI, atomic
create-or-load, fails closed on a corrupted/undecryptable key file, never
silently mints a replacement key), key material zeroized after use.
Independently security-reviewed; one blocking finding (a key-file-creation
TOCTOU race) and several hardening gaps (no zeroization, no
cipher-compatibility pin, DPAPI flags, null-pointer guard) fixed.

Verified: `cargo test` 22/22 — including a test that opens an encrypted
database with no key and with the wrong key and confirms SQLCipher's HMAC
check genuinely rejects both (real cryptographic proof, not just design
intent). `cargo clippy -D warnings` clean. `npm run quality` clean
(TS side unaffected — encryption is transparent below `db::open`).

New build-time dependency: Perl (Strawberry Perl, installed via winget) —
required to compile vendored OpenSSL for SQLCipher on Windows.

Not implemented (deliberately out of scope): cloud sync, authentication,
recovery path for a lost key file (intended recovery is a future cloud
sync restore, not a local escape hatch that would weaken the guarantee).

## M3 Application Services & Input Validation Foundation — Complete

Goal: put something between UI and the repository ports so validation and
multi-step business rules have a home (the M1 review had flagged school
and learner names as only NOT-NULL constrained at the SQL level, not
validated as non-empty — this was the first concrete case).

Delivered: `src/domain/errors.ts` (`ValidationError`, distinct from
infrastructure errors), `src/application/school-service.ts`
(`SchoolApplicationService.registerSchool`), `src/application/learner-service.ts`
(`LearnerApplicationService.enrollLearner`/`listLearners`) — both validate
(trim, non-empty, max length) before ever calling the repository.

Verified: `npm run quality` clean, 15/15 TS tests (10 new), including
proof that invalid input never reaches the fake repository's `create`
call — validation happens at this layer, not by trusting the database
constraint alone. Fully unit-tested without a live UI window, using fake
in-memory repository implementations — no Rust changes in this milestone,
so the Rust suite was not re-run.

## M4 Authentication & Local Session Foundation — Complete

Goal: close the "every operation was implicitly trusted" gap from M1–M3.
Product decision (from the user): shared school computers, multiple
teachers, no 1:1 Windows-account assumption; LIKHA username+password
identity; local/offline authentication; explicit session tied to
identity + school scope; fail closed; no role/permission system yet.
Decision record: `docs/adr/0004-authentication-and-local-session.md`.

Delivered: `src-tauri/src/auth/` (Argon2id hashing, timing-safe
unknown-user handling, `SessionManager` — in-memory gate that never
survives a restart, checked against both expiry and an independent DB
revocation lookup), `src-tauri/src/repository/{user,session}.rs`,
`src-tauri/src/commands/{auth,user}.rs`, `commands::learner::*` updated
so `school_id` is derived from the session and is no longer a
client-supplied parameter at all. TS mirrors: `src/domain/{user,session}.ts`,
`src/domain/ports/{auth,user}-repository.ts`,
`src/infrastructure/tauri/{auth,user}-repository.ts`,
`src/application/{auth,user}-service.ts`; `LearnerRepository`/
`LearnerApplicationService` updated to match the session-derived shape.

Independently reviewed (authentication/security, architecture boundaries,
offline behavior, session lifecycle, school isolation, test sufficiency).
One **blocking** finding, fixed: the initial design left `register_user`/
`add_user_to_school` completely unauthenticated, letting anyone with UI
access and zero credentials self-grant membership in an already-populated
school and read its real data — reproducing the exact gap M4 was meant to
close. Narrowed to: unauthenticated only for a device's very first user
account, and only for a school's very first membership; every case after
that requires an active session (scoped to the same school, for
memberships). Should-fix findings also closed: session revocation is now
checked independently against the DB (not only in-memory), plaintext
password `String`s are zeroized at the command boundary.

Verified: `cargo test` 63/63 (up from 49 pre-M4), covering — among the
security requirements explicitly required for this milestone — correct
password succeeds; wrong password fails; unknown username fails with the
_same_ error and comparable timing as wrong password; password never
stored plaintext (`$argon2id$...` only); hash is salted (two hashes of
the same password differ); session missing/expired/independently-revoked
all fail closed; logout invalidates immediately; a process restart always
requires fresh login even with an unexpired DB session row; one school's
session cannot read another school's learners (there is no parameter
through which it could even ask); the unauthenticated-bootstrap attack
scenario is explicitly reproduced and confirmed blocked.
`cargo clippy -D warnings` clean. `npm run quality` clean (30/30 TS
tests, up from 15).

Not implemented (deliberately out of scope): roles/permissions beyond
"session scoped to a school," password reset, account lockout,
idle-timeout (only fixed 8h expiry), cloud authentication, any UI.

## M5 App Shell & First Learner UI Vertical Slice — Complete

Goal: prove the full stack end-to-end (`UI -> Application Services ->
Domain -> Repository Ports -> Infrastructure/Platform Adapters`) with a
real screen, and turn Efficient/Comfortable/Guided from documented intent
into a working mechanism. Decision record:
`docs/adr/0005-app-shell-and-first-ui-slice.md`.

Delivered: `src/composition.ts` (the one file wiring concrete Tauri
adapters into Application Services), `src/ui/{AppShell,LoginScreen,LearnerListScreen}.tsx`,
`src/ui/theme/*` (mode context + CSS custom properties per mode), `App.tsx`
rewritten as the top-level checking-session/sign-in/learner-list state
machine.

Independently reviewed (design/teacher-comfort; accessibility — both
explicitly told they had no rendering/screenshot tool and instructed not
to claim visual verification). Two **blocking** findings, both fixed:
(1) `LoginScreen` was overwriting every login failure, including
validation errors, with one generic message, inconsistent with
`LearnerListScreen`'s already-correct handling; (2) `--color-border` —
used for every input/button/divider outline project-wide — measured
~1.3–1.6:1 contrast against the page/surface backgrounds (computed from
the actual hex values, not estimated), well under the 3:1 WCAG 1.4.11
minimum for UI component boundaries. Should-fix findings also closed: the
mode system was token-only (spacing/font-size only) with an unused
`.field-hint` CSS class — `Guided` mode now renders genuine contextual
help text no other mode shows; no loading state on the schools dropdown;
no confirmation after enrolling a learner; no focus management on screen
transitions; the mode switcher's pressed state relied on color alone
(WCAG 1.4.1); placeholder `<option>`s weren't `disabled`.

Verified: `npm run quality` clean, 56/56 TS tests (up from 30 — every
fix above has a dedicated test, not just "didn't break existing tests"),
including `axe-core`-based structural accessibility checks on every
screen (switched from `vitest-axe`, unmaintained at v0.1.0 with types
that don't match Vitest 4.x, to a small direct wrapper — see
`src/test/a11y.ts`). Production `npm run build` clean. Additionally,
launched the actual compiled `app.exe` directly (not just `cargo test`)
and confirmed via its log output that it opens the encrypted database and
applies both migrations successfully end-to-end — real evidence beyond
unit tests that M1–M4's wiring works in the real binary.

**Explicitly NOT verified**: this session's environment has no browser,
screenshot, or rendering tool. Nothing about actual visual layout, color
rendering, spacing rhythm, or whether the UI "feels" premium was
confirmed — only what static analysis, computed contrast ratios, and
jsdom-based component/accessibility tests can prove. A human (and
screen-reader) pass on the running app is still required and was not
substituted for.

## M6 First-Run / School Bootstrap Experience — Complete

Goal: give a fresh install an actual way to create its first school and
teacher account through the UI — M5's `LoginScreen` requires at least one
school/membership to exist, but nothing could create them. Decision
record: `docs/adr/0006-first-run-bootstrap.md`.

Delivered: `auth::bootstrap_installation` (one atomic transaction: school

- first user + membership + session, all-or-nothing),
  `repository::installation` (the one-time-only guard),
  `commands::setup::{installation_status,bootstrap_installation}`,
  migration 3 (`installation_state`), `AppError::AlreadyInitialized`. TS:
  `src/ui/FirstRunSetupScreen.tsx` (single form, "Your school"/"Your
  account" sections, shared password show/hide, teacher-facing copy — no
  jargon), `src/application/setup-service.ts`,
  `src/domain/ports/setup-repository.ts`,
  `src/infrastructure/tauri/setup-repository.ts`,
  `src/domain/password-policy.ts` (shared min-password-length constant).
  `App.tsx` now checks `installationStatus()` before anything else.

Independently reviewed (design/teacher-comfort, accessibility — both
completed; a planned independent security/reliability review hit a
session usage limit mid-run and had to be replaced with rigorous
self-review, retried once more in the background afterward). The
self-review found and fixed a real **blocking** concurrency bug: the
first version of the one-time-only guard was a `SELECT`-then-act check
inside the transaction, reasoning that SQLite's cross-process write lock
would serialize two racing processes — it doesn't; SQLite does not
invalidate an already-established read snapshot just because a
different connection committed since, so two processes racing to
bootstrap the same file could both pass that check and both succeed.
Fixed with a real `INSERT`-based singleton claim
(`installation_state`, PK-constrained to one row), which genuinely
participates in SQLite's write-lock serialization the way a `SELECT`
never does. Verified with a real multi-thread, multi-connection,
same-file concurrency test (`tests/bootstrap.rs`), not just sequential
re-calls or reasoning. Should-fix accessibility findings closed:
confirm-password field wasn't linked to the length-hint via
`aria-describedby`; checkbox/radio target size was below WCAG 2.2 SC
2.5.8's 24×24px minimum in two of three teacher modes; "administrator"
wording softened for a first-time, possibly-nervous user.

One **accepted residual risk**, documented not fixed: a narrower race
remains between `bootstrap_installation` and the older
`register_user`/`add_user_to_school` commands racing _each other_
specifically (both still use `SELECT`-based gates with the same
snapshot-staleness property) — requires two different UI flows driven by
two separate processes simultaneously, and the worst case is duplicate
accounts/schools, not a privilege escalation or data leak. See ADR-0006
Consequences.

Verified: `cargo test` 72/72 (up from 63), `cargo clippy -D warnings`
clean. `npm run quality` clean, 76/76 TS tests (up from 56) — including
proof that a mismatched-password retry succeeds cleanly without losing
already-entered data, that a generic (non-leaking) message shows on a
server-side failure, and that the setup screen's visible copy contains
none of "database/migration/credential hash/tenant/cryptography/
repository." `npm run build` clean. Relaunched the actual compiled
`app.exe` after the Rust changes and confirmed clean startup via logs
(same real-binary check used in M5).

## Claude Code Harness Upgrade — Complete (2026-08-24)

Goal: a one-time development-process infrastructure upgrade (not an
application milestone) — a lean, project-local Claude Code operating
system per the 31-section spec given for this session. Decision record:
`docs/adr/0007-claude-code-harness-architecture.md`. Full working log:
`.planning/harness-upgrade/{task_plan,findings,progress}.md`.

Delivered: `.claude/rules/*.md` (4), `.claude/skills/*/SKILL.md` (16),
`.claude/agents/*.md` (8, all read-only), `.claude/settings.json` +
`.claude/hooks/*.cjs` (3 hook scripts), `scripts/check-architecture.mjs`
(+ test), `scripts/check-security.mjs`, `.gitleaks.toml`,
`src-tauri/deny.toml`, `osv-scanner.toml`, `docs/VERIFICATION-DEBT.md`,
`docs/SOURCE-REGISTRY.md`. Installed and verified: Gitleaks 8.30.1
(winget), OSV-Scanner 2.4.0 (winget), cargo-deny (`cargo install
--locked`), `@playwright/cli@0.1.18` (npm, exact-pinned) with its
official skill. One real app-adjacent fix: `src-tauri/Cargo.toml` gained
`publish = false` (the crate is never published; this was a genuine
`cargo deny` finding, not a stylistic change).

Independently reviewed by three fresh agents (security, architecture,
reliability) against the harness itself, plus a final `evaluator` pass.
Findings and fixes: (1) `format-write-edit.cjs` used `spawnSync` with
`shell: true` on a filesystem path taken from tool input — fixed with an
explicit in-repo/safe-characters check before the path ever reaches the
shell; (2) `.claude/rules/architecture.md` didn't mention
`src/application` even though the checker script correctly restricts it
— wording fixed to match; (3) the original `quality:security` script
chained three tools with `&&`, which can't distinguish "tool not
installed" from "tool ran and found something" (both exit 1) — rewritten
as `scripts/check-security.mjs` with an explicit per-tool presence probe,
verified against both a tools-missing and a tools-present shell state.

Verified: `npm run quality` clean (17 test files / 81 tests, up from 76 —
5 new tests for the architecture checker), `npm run quality:security`
clean (Gitleaks 0 leaks, `cargo deny check` clean across
advisories/bans/licenses/sources, OSV-Scanner clean with 17 accepted
findings documented and filtered — 16 transitive unmaintained-crate
RUSTSEC ids from Tauri's own dependency tree with no upstream fix, plus
one Linux-only glib CVE not reachable on this project's Windows-only
build target), `cargo test` 72/72, `cargo clippy --all-targets -D
warnings` clean.

**Known, disclosed gap**: `.claude/settings.json` did not exist when this
session started, so its hooks were pipe-tested with synthesized stdin
(confirmed correct input/output behavior) but were not observed live in
this same session — the settings-file watcher only watches directories
that existed at session start. A `/hooks` reload or session restart
activates them.

## Graphify Code-Graph Evaluation — Rejected, No Change (2026-08-24)

Goal: evaluate `Graphify-Labs/graphify` as a possible CLI+skill
accelerator for architecture exploration, per an explicit follow-up
harness task. Full writeup: `docs/SOURCE-REGISTRY.md` and
`.planning/graphify-eval/findings.md`.

**Rejected at the security-review gate, before any installation.**
Independently verified (`gh api`, not just a research summary):
109,806 stars / 10,675 forks on a repo created 4.5 months earlier — a
~245x gap over the next most-starred same-named project, matching
documented fake-star reputation-laundering patterns — plus the
maintainers explicitly declining to fix a live, self-acknowledged PyPI
typosquat vector on their own install path (issue #280, read in full,
closed `not_planned`). A cluster of similarly-named satellite repos
appeared in the same narrow window. No code from this project was
downloaded, cloned, or executed; no dependency was added; no `.claude/`
skill/agent/hook was created for it. `npm run quality` re-verified clean
afterward (81/81 tests) — this task made no application-affecting
change.

## Windows Machine-Migration Checkpoint — Complete (2026-08-24)

Goal: verify this canonical repo (`C:\Projects\likha-sis-0.2`, matching
`origin/main` at `a70915b`) is in a working, reproducible state on a
newly-set-up Windows PC, and fix any real defects found — not an
application milestone.

Delivered: `.gitattributes` (LF-normalizes text sources; CRLF pinned for
`.cmd`/`.bat`; binaries marked `binary`), `scripts/verify-dev-environment.ps1`
(read-only doctor: Git/Node/Rust/MSVC+SDK/Perl/line-ending-policy/stale-
build-cache-regression), `scripts/setup-windows.ps1` (idempotent winget
installer for the same prerequisite list, diagnosis-first).

Two real defects found and fixed, neither an application-code change:
(1) no `.gitattributes` existed, so a Windows clone with the common
global `core.autocrlf=true` default (this machine's global setting, even
though this specific repo's local override was already `false`) would
checkout CRLF and fail `prettier --check`; (2) `src-tauri/target/`
contained cached Rust build-script output with absolute paths baked in
from a different clone directory name, breaking `cargo build`/`cargo
test` with a cryptic "plugin permissions file not found" error — fixed
by a full clean delete-and-rebuild of `target/`, done strictly
sequentially (two earlier attempts that overlapped background build
processes on the same directory did not clear it).

Independently reviewed: `security-reviewer` on the two new `.ps1` files
and `.gitattributes` — no blocking findings; two should-fix items in
`setup-windows.ps1` (pin `--source winget`; propagate install failure to
a non-zero exit instead of silently succeeding) — both fixed.
`reliability-reviewer`: two independent attempts both entered a confused
state (misinterpreting genuinely new follow-up messages as repeated
automated hook reminders, returning no usable findings) — replaced with
rigorous self-review, mirroring M6's fallback when an independent review
hit a session limit; full detail in `docs/CURRENT-HANDOFF.md`.
`architecture-reviewer` not invoked — no application code changed, only
new scripts and repo config.

Verified: `npm run quality` clean (17/17 test files, 81/81 tests — same
count as before this checkpoint, confirming no regression), `cargo test`
85/85 (up from 72 at the last recorded M6 checkpoint — the difference is
tests added by the prior harness-upgrade session, not this one),
`cargo clippy --all-targets -- -D warnings` clean (run twice: once with
the pre-existing uncommitted `Cargo.toml` diff in place, once with it
temporarily stashed out, to confirm that diff is not what fixed the
build). `scripts/verify-dev-environment.ps1` itself reports 0 FAIL, 2
WARN (cargo/perl correctly installed but not on the specific shell
session's PATH — expected and by design, not a defect), 7 PASS.

Not run: `npm run quality:security` (Gitleaks/OSV-Scanner/cargo-deny not
on this machine's PATH — disclosed gap, see `docs/PROJECT-MEMORY.md`).

Additionally launched the actual compiled `src-tauri\target\debug\app.exe`
directly (M5/M6 precedent) for several seconds: it created a real
WebView2 profile under `%LOCALAPPDATA%\org.likhasis.app\EBWebView\`
(proof the native window/webview genuinely initialized under the correct
app identifier, not just that the process started), ran without a Rust
panic or crash, and shut down cleanly with no lingering process — the
only log line was a single benign Chromium/WebView2 teardown diagnostic
("Failed to unregister class Chrome_WidgetWin_0"), a known harmless
message on WebView2 process exit, not an application error. **What this
does NOT prove**: this session has no browser/screenshot/GUI-observation
tool for the native window, so nothing about actual visual rendering,
layout, or the first-run/login screen appearing correctly was confirmed
— the WebView2 profile's existence is backend/process evidence, not a
substitute for a human visual pass. See `docs/VERIFICATION-DEBT.md`
(standing gap, unchanged by this checkpoint).

## M7 Attendance Tracking — Complete (2026-08-24)

Goal: a first attendance vertical slice — a teacher can mark each learner
in their school Present/Absent/Late/Excused for a given date, and see the
whole roster (including unmarked learners) for that date. Chosen by the
user from a candidate list after the Windows migration checkpoint (see
`docs/CURRENT-HANDOFF.md`'s prior "no M7 defined" blocker) — explicitly
scoped as attendance recording only, not an official DepEd form (SF2)
export, which remains a distinct future candidate.

Delivered, mirroring the M5 `learner` slice's layering exactly (no new
architectural decision, so no new ADR — see ADR-0002/0004/0005):

- `src-tauri/src/db/migrations.rs` migration 4: `attendance_records`
  (`school_id`/`learner_id` FKs, `UNIQUE(learner_id, attendance_date)`,
  a `CHECK` constraint on `status`).
- `src-tauri/src/repository/attendance.rs`: `record()` (verifies the
  learner belongs to the caller's school via the existing
  `learner::find_by_id_in_school` before an upsert —
  `INSERT ... ON CONFLICT (learner_id, attendance_date) DO UPDATE`, so
  re-marking the same learner/date overwrites rather than duplicates) and
  `roster_for_date()` (a `LEFT JOIN` from the full roster, so unmarked
  learners still appear — not a plain list of `attendance_records`).
- `src-tauri/src/commands/attendance.rs`: `attendance_roster_for_date`,
  `record_attendance` — `school_id` derived only from
  `sessions.require_active_school_scope`, never a parameter, matching
  every other tenant-data command in this codebase.
- TS: `src/domain/attendance.ts`, `src/domain/ports/attendance-repository.ts`,
  `src/application/attendance-service.ts` (validates learner id, date
  format/non-future, and status before ever calling the repository — a
  `now: () => Date` clock is injected for testability), `src/infrastructure/tauri/attendance-repository.ts`,
  `src/ui/AttendanceScreen.tsx` (date picker defaulting to today,
  max-today; a roster table with one status-button group per learner;
  immediate marking with no separate save step — the pressed-button state
  change is the confirmation, deliberately not a banner-per-click, since
  attendance marking is high-frequency/repetitive unlike the one-time
  learner-enrollment form). Reachable from the app via a new
  "Learners"/"Attendance" section switcher in `App.tsx`, shown once
  signed in.

Verified: `cargo test` 98/98 (up from 85 before this milestone — 7 new
repository unit tests, 6 new integration tests in
`tests/attendance_management.rs` proving cross-school isolation and
auth-required behavior at the command-equivalent layer, matching
`tests/learner_management.rs`'s pattern), `cargo clippy --all-targets -D
warnings` clean, `npm run quality` clean (20/20 test files, 99/99 tests —
up from 81 before this milestone, including a dedicated
`AttendanceScreen.test.tsx` with an `axe-core` structural accessibility
check), `npm run build` clean, `npm run check:architecture` clean.
Relaunched the compiled `app.exe`: log output confirmed
`Database migrated to version 4` (real proof the new migration applies
cleanly against a live SQLCipher-encrypted database, not just that
`cargo build` succeeded) and clean shutdown with no panic.

Independent review: `security-reviewer`, `architecture-reviewer`,
`teacher-ux-reviewer`, and `accessibility-reviewer` were all launched and
each completed substantial real work (14-23 tool calls, 42k-58k tokens),
but this session hit a harness-level issue where none of their findings
text was retrievable through the completion notification or a resumed
follow-up message (confirmed not agent-specific: it affected all four,
across two different resume attempts each) — full detail in
`docs/CURRENT-HANDOFF.md`. Replaced with rigorous self-review against the
exact same review prompts, the same fallback M6 and this session's own
Windows-migration checkpoint used when independent review didn't
complete. Self-review confirmed: `record()` checks
`learner::find_by_id_in_school` before writing and holds the same
Mutex-guarded connection for the whole command (no TOCTOU window, same
pattern as `learner::update`); all SQL is parameterized, no string
interpolation of caller input; `commands::attendance::*` never accepts
`school_id` as a parameter; `npm run check:architecture` passes and
`AttendanceScreen.tsx` only imports from `application`/`domain`, not
`infrastructure` or `@tauri-apps/*`; the pressed-status non-color cue
(`::before { content: "✓ " }`) mirrors the already-reviewed
`.mode-switcher` pattern exactly; per-learner `aria-label`s on each
status-button group are intentional repetition (necessary for a screen
reader user tabbing through many learners' buttons to know whose row
they're on), not an oversight.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of `AttendanceScreen` was not confirmed, only
structural/accessibility/behavioral testing. See
`docs/VERIFICATION-DEBT.md`.

**Update**: a single fresh re-attempt at `security-reviewer` (per this
session's one-retry escalation rule) succeeded in surfacing findings —
no blocking issues, two informational notes fixed (an unscoped re-fetch
query tightened to filter by `school_id`; a panic-on-malformed-status
path changed to a recoverable `AppError`). Re-verified: `cargo test`
98/98, `cargo clippy -D warnings` clean. `architecture-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer` still ↺ INDEPENDENT
REVIEW REQUIRED — see `docs/CURRENT-HANDOFF.md`.

## M8 Monthly Attendance Summary — Complete (2026-08-24)

Goal: a school-wide monthly attendance overview, selected as M8 via a
20-scenario evidence-based product-decision simulation (full record:
`docs/product/M8-DECISION.md`). Explicitly **not** a section-level SF2
replica — see that record's "Update 2" for the real DepEd source that
grounded this scope decision.

**Real source used**: the user provided an actual, in-use DepEd
`CONSO SF v2025.xlsx` workbook. Its structure was inspected directly
(sheet names, headers, legend) to verify SF2's real layout —
**structural facts only were extracted; the workbook's real learner/
staff names and school identity were never copied into this repository**,
per the synthetic-data-only rule. This grounded two scope corrections:
SF2 is organized per section/grade level (LIKHA-SIS has no such entity
yet — `School` has only `id`/`name`/`created_at`, checked directly), and
DepEd's actual per-day codes (blank/Present, "x"/Absent, half-shaded/
Tardy) don't include a 4th "Excused" code the way this app's model does.

Delivered, no new database migration (a pure read/aggregate over
existing `attendance_records` + `learners`):

- `src-tauri/src/repository/attendance.rs`: `monthly_grid()` — a
  `LEFT JOIN` roster query restricted to a `year`/`month`'s **school
  days only** (Mon-Fri; verified against the real SF2 source, not
  assumed), via a new dependency-free `day_of_week()` (Sakamoto's
  algorithm, unit-tested against known reference dates including a leap
  day) and `days_in_month()`. Returns per-learner day arrays plus
  present/absent/late/excused totals, school-scoped identically to
  `roster_for_date`.
- `src-tauri/src/commands/attendance.rs`: `monthly_attendance_summary` —
  `school_id` derived only from the session, same convention as every
  other command.
- TS: `MonthlyAttendanceReport`/`MonthlyLearnerAttendance` domain types,
  `AttendanceRepository.monthlySummary()`, `AttendanceApplicationService.monthlySummary()`
  (validates month 1-12, year range, and rejects a month that hasn't
  started yet — allows the current in-progress month), `TauriAttendanceRepository.monthlySummary()`,
  `src/ui/MonthlySummaryScreen.tsx` (a month picker defaulting to the
  current month, a school-day grid table with per-day status
  abbreviations and full-text `aria-label`s, monthly totals per learner,
  and an on-screen disclaimer naming both scope gaps above — not
  buried in documentation only). Reachable via a third "Monthly Summary"
  tab in the existing Learners/Attendance section switcher.

Verified: `cargo test` 107/107 (up from 98 — 6 new `monthly_grid` unit
tests including day-of-week correctness against real calendar reference
dates, a weekend-exclusion proof, a different-month-exclusion proof, and
3 new integration tests in `tests/attendance_management.rs` proving
cross-school isolation and auth-required behavior for the new command,
matching the existing pattern), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (21/21 test files, 113/113 tests — 8 new
dedicated `MonthlySummaryScreen.test.tsx` tests including an axe-core
accessibility check), `npm run build` clean, `npm run check:architecture`
clean. Relaunched the compiled `app.exe`: clean startup and shutdown, no
panic (no new migration to confirm this time — none was needed).

**Independent review**: one fresh `security-reviewer` attempt was made
(the harness-failure rule's one-retry allowance) and hit the same
agent-resume retrieval issue affecting several other agents this
session (22 tool calls / 73k tokens of real work, no retrievable
findings). Per that rule: not retried further; self-review performed
instead. Self-review confirmed via direct code read plus the passing
test suite: all SQL in `monthly_grid` is parameterized (`school_id` in
the `WHERE` clause, date range as bind parameters, never string-built
from caller input); `monthly_attendance_summary` never accepts
`school_id` as a parameter; the new cross-school-isolation integration
test (`a_teachers_monthly_summary_never_includes_another_schools_learners`)
and auth-required test both pass. **Marked ↺ INDEPENDENT REVIEW
REQUIRED** in `docs/CURRENT-HANDOFF.md` — architecture/teacher-ux/
accessibility review was not even attempted this milestone (budget
went to the one permitted security-reviewer retry instead), so those
three plus a real second security opinion are all still owed.

## M9 Section Foundation + DepEd Attendance Semantic Alignment — Complete (2026-08-24)

Goal: close the two real gaps M8's DepEd source work surfaced — no
`Section` entity (SF2 is organized per section/grade level) and an
attendance status model with an invented 4th "Excused" code DepEd does
not have. Redirected mid-session from the previously-decided "Learner
Profile Enrichment" (now the leading M10 candidate) — see
`docs/product/M9-DECISION.md` for why this wasn't a re-simulation, and
`docs/adr/0008-section-foundation-and-attendance-semantics.md` for the
full technical decision.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 5: `sections`
  (`school_id`/`school_year`/`grade_level`/`name`, unique on the
  4-tuple), `section_memberships` (half-open `[starts_on, ends_on)`
  interval per learner, `CREATE UNIQUE INDEX
idx_one_active_membership_per_learner ... WHERE ends_on IS NULL` as a
  structural — not application-level — one-open-membership guarantee),
  and a full `attendance_records` rebuild (SQLite cannot alter a `CHECK`
  constraint in place) adding `section_id` and narrowing `status` to
  `present`/`absent`/`tardy` with a tested lossless data migration
  (`late → tardy`, `excused → absent`).
- `src-tauri/src/repository/{section,section_membership}.rs`: school-
  scoped section CRUD, `enroll()` (validates section/learner both belong
  to the caller's school, transfers a learner out of any other open
  membership), `roster_for_section()`/`roster_for_section_over_range()`,
  `is_active_member()`.
- `src-tauri/src/repository/attendance.rs` reworked: `record()` now
  verifies section-then-learner-then-active-membership before writing;
  `roster_for_date` → `roster_for_section_date`; `monthly_grid` →
  `monthly_grid_for_section`. `AttendanceStatus` is the real 3-code enum.
- `src-tauri/src/commands/{attendance,section}.rs`: `section_id` is a
  client-supplied parameter (like `learner_id` already was) — isolation
  holds because every query scopes on `school_id` (session-derived) AND
  `section_id` together, so a foreign `section_id` resolves to nothing
  rather than leaking rows. New commands: `list_sections_by_school`,
  `create_section`, `enroll_learner_in_section`, `section_roster`.
- TS: `src/domain/section.ts`, `src/domain/ports/section-repository.ts`,
  `src/infrastructure/tauri/section-repository.ts`,
  `src/application/section-service.ts`, `src/ui/SectionsScreen.tsx` (new
  — create a section, enroll a learner; the minimum needed for
  Attendance/Monthly-Summary to stay reachable, not full roster
  management). `domain/attendance.ts` updated to the 3-status model
  (`tardyCount` replaces `lateCount`/`excusedCount`).
  `AttendanceScreen`/`MonthlySummaryScreen` both gained a section picker
  ahead of their date/month pickers; teacher-facing copy and
  `aria-label`s changed from Present/Absent/Late/Excused to
  Present/Absent/Tardy throughout. `App.tsx` gained a "Sections" tab.

Verified: `cargo test` 125/125 (94 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 7 learner + 4 db — up from 107 before this
milestone; includes `migration_5_converts_legacy_attendance_data_without_loss`,
`migration_5_enforces_one_active_membership_per_learner`, full
`repository::section`/`repository::section_membership` unit coverage,
and rewritten `tests/attendance_management.rs` integration tests proving
cross-school isolation for both a foreign learner AND a foreign
`section_id` specifically), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (24/24 test files, 138/138 tests — up
from 113 before this milestone), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: one `security-reviewer` attempt was made this
milestone (29 tool calls / ~90k tokens of real work over ~8 minutes,
confirmed via `ListAgents`), and hit the same agent-resume retrieval
issue affecting several other agents this session and M7/M8 before it —
the completion notification carried no findings text. Per this session's
one-retry escalation rule, it was resumed once via `SendMessage` asking
it to restate its findings; the second completion notification also
carried nothing retrievable ("No new input"). Per the rule (retry once,
don't repeatedly retry), not retried further — self-review performed
instead, the same fallback M6/M7/M8 used.

Self-review verified directly against the passing test suite and a
direct code read: (1) `record()`'s three-step gate (section-in-school,
learner-in-school, active-membership) cannot be bypassed —
`tests/attendance_management.rs`'s
`a_teacher_cannot_mark_attendance_using_another_schools_section` and
`recording_attendance_for_a_learner_not_on_the_sections_roster_is_rejected`
both pass; (2) all new SQL is parameterized (bind-parameter tuples, no
`format!`/string interpolation into query text) in
`repository::{section,section_membership,attendance}`; (3)
`commands::section::*`/`commands::attendance::*` never accept
`school_id` as a parameter, matching every other command in this
codebase — `school_id` is always `sessions.require_active_school_scope(&conn)`;
(4) the `enroll()` transfer race: two concurrent `enroll()` calls for
the same learner racing past the same `current_open` `SELECT` would both
`UPDATE` the old membership's `ends_on` (idempotent) and then both
attempt to `INSERT` a new open membership — the second `INSERT` hits
`idx_one_active_membership_per_learner`'s `UNIQUE` constraint and fails
with a real DB error (mapped to `AppError::Database`), not a silent
duplicate open membership; this is the same class of bug M4/M6 shipped
once each (a `SELECT`-then-act check with no real serialization) but
here the actual write-time uniqueness is enforced by a genuine SQL
constraint, not application logic re-checking the same stale read — so
the outcome is a failed second call, not a data-integrity violation; (5)
`npm run check:architecture` passes, confirming `SectionsScreen.tsx`/
updated `AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx` only import
from `application`/`domain`. **Still owed**: a real (non-self)
`architecture-reviewer`/`security-reviewer`/`teacher-ux-reviewer`/
`accessibility-reviewer` pass for M9, on top of the ones already owed
from M7/M8, once agent-resume behavior is confirmed working in a session
where it isn't broken.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of `SectionsScreen`/the updated section pickers was not
confirmed, only structural/accessibility/behavioral testing. See
`docs/VERIFICATION-DEBT.md`.

## M10 Local Section-Level SF2 Export + Reusable Official-Form Engine Foundation — Complete (2026-08-24)

Goal: a section-level, DepEd-SF2-inspired monthly attendance export a
teacher can actually use, plus a small reusable foundation for future
official-form exports. User-directed (not autonomously selected) — see
`docs/adr/0009-sf2-export-and-official-form-engine.md` for the full
decision, source citations, and scope boundaries.

**Research method**: two prior `security-reviewer` agent attempts this
session (recorded under M9, above) both hit the same agent-resume
retrieval issue. Rather than spend another attempt on `deped-researcher`
very likely to hit the identical harness bug, SF2's field layout was
researched inline via `WebSearch`/`WebFetch` in the main session
instead. Triangulated across three independent sources: DepEd Order No.
4, s. 2014 ("Adoption of the Modified School Forms"); two independent
web sources (depedph.com, teacherph.com); and the real
`CONSO SF v2025.xlsx` workbook inspected during M8. All three agree on
the per-day coding legend and section/month organization.

Delivered:

- `src-tauri/src/export/csv.rs`: a dependency-free RFC-4180-minimal CSV
  writer (escapes commas/quotes/newlines) — the reusable "engine" piece,
  fully unit tested.
- `src-tauri/src/export/sf2.rs`: `build_sf2_export()`, a pure function
  (no DB/auth access) that assembles the SF2-inspired CSV from an
  already-fetched `School`/`Section`/`MonthlyAttendanceReport`, plus a
  `FieldDisclosure` struct (`populated_fields`/`omitted_fields`, each
  omission with a stated reason) — the other reusable piece, meant to be
  returned by every future official-form export, not just this one.
  **No zero-filled placeholder statistics**: DepEd's enrollment/dropout/
  transfer/gender footer fields are omitted entirely rather than
  emitting a fabricated `0` for data this app has never tracked, since a
  fake zero on a form a teacher might submit is a real compliance risk,
  not an honest gap.
- `src-tauri/src/commands/export.rs`: `export_section_monthly_sf2` —
  `school_id` derived only from the session (same convention as every
  other command); `section_id` is client-supplied the same legitimate
  way established in ADR-0008, resolved via `section::find_by_id_in_school`
  before use, returning `None` for a foreign section rather than any
  data. Writes to `Documents\LIKHA-SIS\` (Tauri's core `document_dir()`
  path API, falling back to `app_data_dir()` — no new plugin, no
  capability change, zero new dependencies).
- TS: `src/domain/export.ts`, `src/domain/ports/export-repository.ts`,
  `src/infrastructure/tauri/export-repository.ts`,
  `src/application/export-service.ts`. `MonthlySummaryScreen.tsx` gained
  an "Export SF2 (CSV)" button and a result panel rendering the saved
  file path plus the full omitted-fields disclosure, rendered directly
  from the same `FieldDisclosure` the CSV's trailing comment block came
  from — no separately-maintained disclaimer text to drift out of sync.

Verified: `cargo test` 150/150 (115 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 4 export-integration + 7 learner + 4 db — up from
125 before this milestone; includes full `export::csv`/`export::sf2`
unit coverage — per-day code rendering, header-field assembly, an
explicit assertion that no dropout/enrollment/gender field ever appears
outside the disclosure comment block, that every disclosed omission is
actually named in the CSV, CSV/formula-injection neutralization, and
`sanitize_filename_component`'s full Windows-reserved-character
coverage — see "Independent review" below for the two findings that
added the last several tests), `cargo clippy --all-targets -D warnings`
clean, `npm run quality` clean (26/26 test files, 148/148 tests — up
from 138), `npm run build` clean, `npm run check:architecture` clean.
Relaunched the compiled `app.exe`: clean startup and shutdown, no panic
(no new migration this time — none was needed).

**Independent review**: one fresh `security-reviewer` attempt was made
this milestone (a new review episode, not a repeat of M9's already-used
retry) — the first completion notification came back empty (the same
agent-resume issue as M9), but a single resume-and-restate retry this
time succeeded and returned two real, actionable should-fix findings:
CSV/formula injection via a leading `=`/`+`/`-`/`@`/tab in any
teacher-entered field (learner or section name), and an unstripped `:`
in the exported filename (Windows/NTFS alternate-data-stream risk). Both
fixed — see `docs/adr/0009-sf2-export-and-official-form-engine.md`'s
"Independent review" section for full detail and the fix description.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
still not attempted for M10 — same standing debt as M7/M8/M9.

**Not verified**: same standing gap as every prior UI milestone — no
browser/screenshot tool for the native window in this session, so actual
visual rendering of the export button/result panel was not confirmed,
only structural/behavioral testing (no dedicated a11y test was added for
just the new button/panel — covered by `MonthlySummaryScreen.test.tsx`'s
existing whole-screen `expectNoAccessibilityViolations` check, which
does render with an export result present in one test case). See
`docs/VERIFICATION-DEBT.md`.

Not implemented (deliberately out of scope, see ADR-0009): a user-chosen
save location (Save As dialog), Excel/PDF output, the School ID field
(schema gap), any of the omitted DepEd footer statistics, a generic
form-definition framework for forms beyond SF2.

## M11 Grading-Period Foundation — Complete (2026-08-24)

Goal: a foundation for recording grading periods per school year, without
hardcoding DepEd's grading-period terminology — user-directed (named as
the explicit next-best alongside M10's own direction, no separate
product-decision pass needed). Full decision, source citations, and the
in-flux-policy reasoning: `docs/adr/0010-grading-period-foundation.md`.

**Research finding that shaped the design**: DepEd's grading-period
structure genuinely changed within this project's own lifetime — the
older K to 12 curriculum used four quarters; **DepEd Order No. 9, s.
2026** shifts Basic Education to a three-term structure for SY
2026-2027 onward (confirmed across six independent sources agreeing on
the order number, title, and SY 2026-2027 date range). Not confirmed:
exact per-term dates beyond the SY bookends, and whether Senior High
School follows this order or its own semester structure. **User's
explicit direction, asked directly given this ambiguity**: policy-driven/
versioned periods, defaulting to the current official three-term
structure — not a hardcoded assumption, not further research.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 6: `grading_policies`
  (versioned reference data, `is_default` structurally constrained to
  at most one row via a unique partial index — the third application of
  this project's established one-row-per-condition pattern, see
  ADR-0006/0008), `grading_policy_periods` (a policy's ordered, named
  periods — seed data: 3 terms for the default DepEd Three-Term policy,
  4 quarters for the legacy policy), `grading_periods` (school-scoped,
  `CHECK (starts_on <= ends_on)`, unique per school/school-year/period —
  dates always school-entered, never defaulted).
- `src-tauri/src/repository/grading.rs`: `list_policies`/
  `list_periods_for_policy` (reference data, no school scoping needed —
  there's no tenant data in these tables), `create`/`list_by_school_year`
  (school-scoped, matching `section`'s isolation convention).
- `src-tauri/src/commands/grading.rs`: `list_grading_policies`,
  `list_grading_policy_periods`, `list_grading_periods_by_school_year`,
  `create_grading_period` — `school_id` derived only from the session;
  `policy_period_id` is client-supplied the same legitimate way
  `section_id` already is (ADR-0008/0009), verified to exist before use.
- TS: `src/domain/grading.ts`, `src/domain/ports/grading-repository.ts`,
  `src/infrastructure/tauri/grading-repository.ts`,
  `src/application/grading-service.ts`, `src/ui/GradingPeriodsScreen.tsx`
  (new "Grading Periods" tab: policy picker showing its source citation
  inline, a school-year input, one row per policy period with an
  inline date-range form until saved). `src/ui/theme/styles.css` gained
  a `.visually-hidden` utility (standard clip-rect pattern).

Verified: `cargo test` 168/168 (128 lib + 12 attendance-integration + 7
auth + 1 bootstrap + 4 export-integration + 5 grading-integration + 7
learner + 4 db — up from 150 before this milestone; includes 6 dedicated
`db::migrations::tests::migration_6_*` tests directly proving the seed
data, the default-policy uniqueness constraint, and the
`starts_on <= ends_on` check against a real migration run, plus full
`repository::grading` unit coverage — cross-school isolation, duplicate-
period rejection, unknown-policy-period rejection), `cargo clippy
--all-targets -D warnings` clean, `npm run quality` clean (29/29 test
files, 168/168 tests — up from 148), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: one `security-reviewer` episode, succeeded on
the first attempt this time (no resume-retry needed — this session's
agent-resume issue has been inconsistent: failed twice for M9, succeeded
on retry for M10, succeeded immediately for M11). **No findings** — the
reviewer verified directly against source that `school_id` is derived
exclusively from the session everywhere in `commands::grading::*`,
`policy_period_id` is existence-checked before use with the write itself
scoped to the session-derived `school_id`, `grading_policies`/
`grading_policy_periods` genuinely carry no `school_id` column (confirmed
non-tenant reference data, not merely assumed), all queries are
parameterized, `list_by_school_year` filters by `school_id` in its literal
SQL, and the schema-level `CHECK`/`UNIQUE` constraints are real and
propagate violations through `AppResult` rather than panicking or
silently succeeding.
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M11 — same standing debt as M7/M8/M9/M10.

**Verification gap, disclosed**: the usual compiled-`app.exe` relaunch
check for the new migration was attempted three times and was
inconclusive (process ran without crashing, stderr stayed empty, but
stdout log capture returned 0 bytes each time — most likely a
PowerShell/pipe-buffering artifact of force-terminating a GUI process,
not a real defect). Not treated as a blocker given the six dedicated,
passing migration-6 tests running the actual migration SQL against a
real SQLite connection — see ADR-0010 for full detail.

Not implemented (deliberately out of scope, see ADR-0010): grade
computation/weighting, a gradebook, editing/deleting a saved grading
period, Senior High School's separate semester structure, any UI for
adding a third grading policy.

## M12a Gradebook/Class Record Foundation — Complete (2026-08-24)

Goal: the workspace foundation M12b's assessment items/scores will attach
to — one section + one subject + one grading period — without
committing to a schema M13's grade-computation research will likely
force a rework of. User directed the full M12/M13/M14 roadmap in one
message; per advisor consultation before implementation, M12 was split
into phases (M12a this milestone, M12b assessment items/scores, M12c
keyboard/mobile/audit polish) rather than built as one pass. Full
decision: `docs/adr/0011-gradebook-class-record-foundation.md`.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 7: `subjects` (school-scoped
  reference data, `UNIQUE (school_id, name)`), `class_records` (joins
  `section_id`/`subject_id`/`grading_period_id`, `UNIQUE (section_id,
subject_id, grading_period_id)` — a structural no-duplicate-combination
  guard, not check-then-act).
- `src-tauri/src/repository/subject.rs`: mirrors `section.rs`'s
  `create`/`find_by_id_in_school`/`list_by_school` shape exactly.
- `src-tauri/src/repository/class_record.rs`: `create` verifies
  `section_id`/`subject_id`/`grading_period_id` all resolve within the
  caller's school, **and** that the section's `school_year` matches the
  grading period's `school_year` — `ClassRecord` stores no `school_year`
  of its own precisely so there's one source of truth, not two values
  that could drift. All four rejection reasons collapse into `Ok(None)`,
  matching `section_membership::enroll`'s established convention.
  `list_by_school` returns a joined `ClassRecordDetail` (section/subject/
  grading-period names) so a list screen needs no extra round trips.
  `grading::find_by_id_in_school` changed from private to `pub` so this
  module could reuse it.
- `src-tauri/src/commands/subject.rs`, `commands/class_record.rs`:
  `school_id` derived only from the session; `section_id`/`subject_id`/
  `grading_period_id` are client-supplied the same legitimate way
  `section_id` already is in `enroll_learner_in_section`.
- TS: `src/domain/subject.ts`, `src/domain/class-record.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (all mirroring `Section`'s existing pattern), `src/ui/ClassRecordsScreen.tsx`
  (new "Class Records" tab: picking a section loads that section's own
  `school_year`'s grading periods, steering a teacher away from
  constructing a mismatched combination before submission; inline
  "add a subject" mini-form; lists existing class records).

Verified: `cargo test` 141 lib tests (includes this milestone's new
`repository::subject`/`repository::class_record` unit tests) + 5
new `tests/class_record.rs` integration tests (cross-school section/
subject/grading-period rejection, "requires a session" for both new
commands, own-school create-then-list round trip) — all green, plus 1
new `db::migrations::tests::migration_7_*` test proving the
no-duplicate-combination constraint against a real migration run.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(34/34 test files, 189/189 tests — up from 168), `npm run build` clean,
`npm run check:architecture` clean.

**Independent review**: `architecture-reviewer` was dispatched for this
milestone (owed since M7 — the first of that standing debt actually run
this session), but its findings text was not retrievable through the
normal completion-notification/resume path on either the initial run or
one resume-retry (real work confirmed via token/tool-use counts — 17
tool uses, ~61K tokens total — but no usable output either time). Per
this session's established escalation rule (attempt once more, then
fall back to self-review), a careful self-review covering the same four
questions was performed instead — **no blocking findings**; full detail
in `docs/adr/0011-gradebook-class-record-foundation.md`. Re-run a real
`architecture-reviewer` for M12a once agent-resume behavior is confirmed
reliably working in a future session.
`security-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted for M12a — same standing debt as M7-M11 for the other
three review types.

Not implemented (deliberately out of scope, see ADR-0011): assessment
components/items, learner scores, missing/not-applicable states,
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a mutation-audit trail, editing/closing a class record,
Senior High School's separate semester structure, any multi-teacher/
co-teacher concept.

## M12b Assessment Items and Learner Scores — Complete (2026-08-24)

Goal: assessment items and learner scores on top of M12a's `ClassRecord`
workspace, continuing the user-directed M12/M13/M14 roadmap. Full
decision: `docs/adr/0012-assessment-items-and-scores.md`.

**Research finding that shaped the design**: this milestone's own inline
research (`WebSearch`/`WebFetch`) found that DepEd Order No. 8, s. 2015's
Written Work/Performance Task/Quarterly Assessment classroom-assessment
terminology has been **repealed** by DepEd Order No. 015, s. 2026, which
renames the categories to Written Works/Performance Tasks/Examinations
(the third category now comprising Summative Tests plus a Term
Examination). Triangulated across two independent secondary sources;
per-category weighting percentages were not found and are explicitly
**not** modeled here — that is M13's own research scope. Per advisor
guidance (consistent with M11's own precedent), category names are
versioned reference data, not a hardcoded enum.

Delivered:

- `src-tauri/src/db/migrations.rs` migration 8: `assessment_category_sets`
  (versioned reference data, `is_default` structurally constrained to at
  most one row — the fourth application of the one-row-per-condition
  index pattern), `assessment_categories` (a set's ordered, named
  categories — seed data: DO 015 s. 2026 default with Written
  Works/Performance Tasks/Examinations; legacy DO 8 s. 2015 explicitly
  marked repealed in its own citation), `assessment_items`
  (school+class-record scoped, `max_score REAL NOT NULL CHECK (max_score
  > 0)`), `learner_scores`(school-scoped,`status`CHECK-paired with`score`null-ness,`UNIQUE (assessment_item_id, learner_id)`, absence of
a row meaning "not yet recorded" — the same idiom
`attendance_records` already established).
- `src-tauri/src/repository/assessment_category.rs`: reference-data
  listing, no school scoping needed (matches `grading`'s policy listing).
- `src-tauri/src/repository/assessment_item.rs`: `create` verifies
  `class_record_id` resolves in-school and `category_id` exists;
  `list_by_class_record` scopes by `school_id` AND `class_record_id`.
- `src-tauri/src/repository/learner_score.rs`: `record` verifies the
  item resolves in-school, the learner held an active section membership
  at any point in the class record's grading-period date range (via
  `section_membership::roster_for_section_over_range`, reused from M8),
  and the status/score pairing including the `[0, max_score]` bound —
  the one check that can't be a SQL `CHECK` (cross-table). Every
  rejection collapses to `Ok(None)`, matching `enroll`'s convention.
  `roster_for_item` returns the scoreable roster via `LEFT JOIN`,
  matching `attendance::roster_for_section_date`'s shape.
- `src-tauri/src/repository/class_record.rs` gained
  `section_and_period_range_in_school`, a small helper shared by
  `assessment_item`/`learner_score`.
- `src-tauri/src/auth/mod.rs` gained `SessionManager::require_active_session`
  (returns `(user_id, school_id)`; `require_active_school_scope` now
  delegates to it) so a score's `recorded_by_user_id` can come from the
  session, never a client-supplied parameter.
- `src-tauri/src/commands/{assessment_category,assessment_item,
learner_score}.rs`: `school_id`/`recorded_by_user_id` derived only from
  the session; other ids client-supplied and verified downstream.
- TS: `src/domain/{assessment,learner-score}.ts`, matching
  `domain/ports/*`, `infrastructure/tauri/*`, `application/*-service.ts`
  (score-range validation duplicated here as a `ValidationError` with a
  specific message — a UX nicety, not the real security backstop, which
  is the Rust `None`), `src/ui/ClassRecordWorkspace.tsx` (opened via a
  new "Open workspace" action added to the Class Records list: item
  creation form, item list, and a per-item roster scoring table with
  status buttons and a score input revealed only for "Scored").

Verified: `cargo test` 163 lib tests (up from 141) + 6 new
`tests/assessment.rs` integration tests (cross-school rejection for both
items and scores, "requires a session" for both new commands, an
explicit test proving a recorded score is attributed to the session's
own `user_id` and not a client-supplied one) + 3 new
`db::migrations::tests::migration_8_*` tests (seed data, default-set
uniqueness, the `scored`-requires-non-null-score `CHECK`) — all green.
`cargo clippy --all-targets -D warnings` clean. `npm run quality` clean
(39/39 test files, 221/221 tests — up from 189/34), `npm run build`
clean, `npm run check:architecture` clean.

**Independent review**: `security-reviewer` dispatched for this
milestone, chosen over `architecture-reviewer` per advisor guidance —
M12b introduces the first mutable, teacher-attributed numeric data in
this schema, closer to the auth/persistence surface that has caught real
bugs before (M4, M6, M10) than to a layering concern. Outcome not yet
returned as of this writing; record it here (or supersede this note)
once available.

Not implemented (deliberately out of scope, see ADR-0012):
keyboard-efficient entry, mobile-specific layout beyond ordinary
responsive CSS, a full mutation-history/audit log beyond
`recorded_at`/`updated_at`, editing/deleting an assessment item once
created, per-category weighting/grade computation, a UI for adding a
third category set, an FK constraining which category set pairs with
which grading policy.

## M12c Score-Entry Keyboard, Mobile, and Audit Polish — Complete (2026-08-24)

Goal: turn M12b's assessment-item/score workspace
(`src/ui/ClassRecordWorkspace.tsx`) into a reusable, production-quality
pattern for high-frequency teacher data entry — not a prettier version of
the same interaction, a genuinely faster one. UI-only change: no
application-service, domain, repository, or Rust command changes were
needed or made, since `user_id`/`school_id` were already session-derived
(verified below) and `updated_at` already existed on `learner_scores`
(M12b) for the audit-surfacing requirement.

**Before starting**: per the handoff's own instruction, checked whether
M12b's dispatched `security-reviewer` had returned. It had not (same
agent-resume issue as every other episode this session) — the standing
self-review fallback finding was: `record_learner_score`
(`src-tauri/src/commands/learner_score.rs:31-42`) takes only
`assessment_item_id`/`learner_id`/`status`/`score` as parameters;
`user_id` and `school_id` come from `sessions.require_active_session(&conn)`,
never from the client. Re-verified directly against the current file this
session (not just trusted from the prior note) — confirmed accurate, no
change needed. No new `security-reviewer` dispatch was warranted for a
UI-only milestone that touches no authorization surface.

**Keyboard-efficient entry — redesigned interaction model:**

- The score `<input>` is now always visible and always the primary
  control for every roster row, instead of being hidden behind an
  explicit "Scored" button click (M12b's original gate). Typing a number
  always means "Scored" — this matches how the domain already treated a
  non-null score (`LearnerScoreApplicationService.recordScore` requires
  `status === "scored"` for any numeric value), so no new domain rule was
  invented, only surfaced earlier in the interaction.
- **Enter** or **ArrowDown** in a score field commits the value (if
  changed) and moves focus to the next learner's score field — spreadsheet-
  style column navigation, the single highest-leverage change for a
  teacher entering many scores down one column. **ArrowUp** does the same
  moving backward. **Escape** discards an in-progress, uncommitted edit
  and restores the last-saved value, without saving — the "recovery from
  a mistake" the milestone asked for. **Blur** (Tab away, or clicking
  elsewhere) also commits, so nothing is silently lost by moving on.
- **Safe commit semantics, two deliberate rules**: (1) a value identical
  to what's already saved is never re-sent — this avoids a no-op write
  bumping `updated_at` and showing a misleading "just saved" time; (2) an
  emptied score field is never committed as a change — clearing the box
  does not erase a previously recorded score, since "blank" isn't a real
  status in this domain (Excused/N/A must be chosen explicitly via their
  own buttons). This directly satisfies "prevention of accidental
  destructive changes."
- Excused/N/A remain explicit buttons (native `<button>`, already fully
  keyboard-operable via Tab+Enter/Space, needed no new code) — DepEd's
  attendance-status precedent (`AttendanceStatus`, ADR-0008) already
  established that exceptional states need deliberate marking, not
  inference from an empty field; the same reasoning applies here.
- **A real bug was found and fixed during this milestone, by its own test
  suite**: moving focus programmatically after Enter (to the next row)
  fires a synchronous native `blur` on the field being left, which
  re-entered the same commit function for that same learner _before_ the
  first call's cleanup had run — a naive React-state dirty-check does not
  reliably catch this, because the state update from the first commit may
  not have re-rendered by the time the synchronous blur fires. Caught by
  a new test (`saves on Enter and moves focus to the next learner's score
field`) that asserted exactly one `record` call, which failed with two
  identical calls on the first implementation. Fixed with an imperative
  `useRef<Set<string>>` in-flight guard (`committingRef`) that closes the
  re-entrancy window regardless of render timing — a plain state flag
  would not have been reliable here for the same reason the dirty-check
  wasn't.

**Mobile-aware responsive layout:**

- No responsive breakpoint existed anywhere in `src/ui/theme/styles.css`
  before this milestone (verified by grep) — this is the first
  deliberately mobile-specific CSS in the app, not an extension of an
  existing pattern.
- At `max-width: 640px`, the roster `<table>` re-flows from a grid to one
  stacked, full-width block per learner (each `<tr>` becomes a card-like
  block; the `<thead>` is visually hidden but stays in the accessibility
  tree via a standard clip-rect technique, not `display:none`, so the
  column semantics survive for screen readers) — chosen over shrinking
  the desktop table's cells, which the milestone brief explicitly warned
  against ("unusably tiny score cells... shrinking the Windows interface
  onto a phone"). Score inputs and Excused/N/A buttons grow to a 44px
  minimum touch target and larger font at this width. The keyboard
  interaction model (Enter/Arrow/Escape/blur) is unchanged at any width —
  same component, same handlers, only the CSS layout changes, so there is
  one reusable pattern, not a second mobile-specific implementation.
- **Verification limit, disclosed honestly**: this environment's Browser
  pane could load the app's `vite dev` bundle (confirmed it builds and
  serves — reached the login screen, which correctly reported "Could not
  load the list of schools" since a plain browser has no Tauri IPC
  bridge) but could not render/screenshot the page (`the Browser pane is
not displayed, so the page is not compositing frames` — an environment
  limitation, not a code issue) and, even if it could, cannot reach
  `ClassRecordWorkspace` without a real backend session behind a section/
  subject/grading-period/class-record/assessment-item chain. This is the
  same standing visual-verification gap recorded since M5 — the 640px
  breakpoint's actual rendered appearance is **not** visually confirmed
  this session; only the CSS itself and the jsdom-based interaction
  behavior (which does exercise real DOM focus/blur/keyboard semantics,
  and did catch the re-entrancy bug above) were verified. `.claude/launch.json`
  was added this session (`npm run dev`, port 5173/1420) so a future
  session with a working Browser pane, or a human, can pick this up
  immediately.

**Auditability polish:**

- Each row now shows a "Saved HH:MM" note derived from the roster entry's
  existing `updatedAt` field (already returned by `roster_for_item` since
  M12b — no new column, no new command). Hidden gracefully
  (`formatSavedTime` returns `null`) rather than showing "Invalid Date"
  for any value that doesn't parse as a real timestamp.
- Actor identity (`recordedByUserId`) was already trustworthy
  (session-derived, verified above) before this milestone; this milestone
  did not add a "last edited by [teacher name]" display, since
  `LearnerScoreRosterEntry` does not currently carry a resolved teacher
  display name (only `LearnerScore.recordedByUserId`, a raw id) — adding
  that would mean a join across `users`/`learner_scores` the roster query
  doesn't currently do, which is schema/repository-layer work, not UI
  polish, and wasn't requested with enough specificity to justify
  expanding scope here. Recorded as a candidate for a future
  audit-visibility milestone, not implemented now.

**Verification actually run this session**: `npm run typecheck` clean;
`npm run lint` clean; `npm run format:check` clean (after `prettier
--write` on the three touched files); `npm run check:architecture`
clean; `npm run test` — 39 files, 226 tests, all passing (up from 221 —
one M12b test was split into six more specific interaction tests, net
+5). `cargo test`/`cargo clippy` not re-run (no Rust files touched this
milestone — confirmed via `git status` before starting and again before
finishing). Real-browser check attempted and partially completed (see
above); did not reach pixel-level confirmation.

**Independent review**: not dispatched — this milestone touches no
authorization/persistence/tenant-isolation surface (the area this
session's agent-resume issue has made expensive to keep re-attempting),
and the one security-relevant fact (actor identity) was re-verified
directly against source rather than re-reviewed. A `teacher-ux-reviewer`
pass on the new interaction model would still be genuinely valuable and
is recorded as owed below, alongside the existing M7-M11 review debt.

Not implemented (deliberately out of scope): a full mutation-history/
audit log beyond the single "last saved" note, a resolved teacher display
name on the roster (see above), bulk score entry/paste-from-spreadsheet,
column-level (all-learners-one-item) vs. row-level (one-learner-all-items)
alternate grid orientations, offline-conflict UI (two devices editing the
same score — sync doesn't exist yet), any change to the Excused/N/A
button semantics.

## M13 DepEd Grade Computation — Complete (2026-08-24, continuation session)

Goal: compute an actual numeric term grade from the assessment items/
scores M12b built, replacing the M11/M12a/M12b placeholder note that this
was deferred pending real research. **Compliance-sensitive** — research
used the primary source directly, not a secondary summary.

**Research**: `WebSearch` found a citation for DepEd Order No. 015, s.
2026 with a direct link to the order's own PDF on `deped.gov.ph`. That
PDF (`DO_s2026_015r.pdf`, 60 pages, scanned/image-based — `pypdf` text
extraction returned only whitespace, no text layer) was downloaded
(`curl`) and read by rendering pages to PNG (`pymupdf`) and visually
transcribing the specific tables in Annex D — not trusted from a
blog/aggregator summary alone, though three independent secondary
sources (depedclub.com, depedtambayanph.net, tchersden.blogspot.com) were
also checked and agreed with the primary source on every figure. Full
findings, including what's DepEd-required vs. this app's own
interpretation vs. still-uncertain, are in
`docs/adr/0013-deped-grade-computation.md` — summarized:

- `IG = Σ(PS × weight%)` per category, `PS = pooled raw scores / pooled
max scores × 100` (points-pooled, not item-averaged — confirmed against
  the Order's own worked example).
- One weight group implemented: English, Filipino, Mathematics, Science,
  Araling Panlipunan, GMRC/Values Education (Grades 4-10) — Written Works
  20%, Performance Tasks 50%, Examinations 30%. Examinations is itself
  composed of Summative Test 1 (30%), Summative Test 2 (30%), and Term
  Examination (40%) — not a flat pooled bucket like the other two
  categories.
- SY 2026-2027 uses the Order's own 41-band Adjusted Transmutation Table
  (IG 0.00-100.00 → TG 60-100); SY 2027-2028 onward uses the Zero-Based
  Grading System (`TG = round(IG)` directly, no transmutation) — selected
  from the grading period's existing `school_year` field, no new table
  needed. A floor of 60 applies to the final reported grade either way
  (structural under transmutation; an explicit clamp under zero-based).
- Two of the Order's own worked examples (Science KS2 IG 85.8→TG 88,
  transmuted; Mathematics KS3 IG 83.6→TG 84, zero-based) are reproduced
  exactly end-to-end by `compute_term_grade` — the strongest available
  proof this implementation matches the Order, not just its transcribed
  numbers.

**10-scenario architecture decision** (the one genuinely new structural
question ADR-0010's existing versioned-policy pattern didn't already
settle): how to model Examinations' internal ST1/ST2/TE sub-structure.
Ten scenarios scored against the project rubric; **Recommended and
implemented**: a nullable self-referencing `parent_category_id` on the
existing `assessment_categories` table — ST1/ST2/TE become ordinary child
category rows, reusing 100% of M12b's `assessment_item`/`assessment_category`
machinery unchanged. **Next Best**: a separate `category_components` join
table (better if a future Order nests other categories too; not needed
for what DO 015 currently specifies). Full scoring in ADR-0013.

**Implementation**:

- Migration 10: `parent_category_id` column + 3 seeded child categories
  (Summative Test 1/2, Term Examination) under "Examinations";
  `grading_weight_policies`/`grading_weight_components` tables (same
  "at most one default" unique-partial-index pattern as migrations 5, 6, 9) with one seeded policy for the implemented weight group.
- `assessment_item::create` now rejects creating an item directly under a
  parent category (one that has children) — an item must go under a leaf.
- `assessment_category::list_categories_for_set` now excludes parent
  categories from its result, so a teacher's item-creation dropdown never
  offers a selection that would be rejected.
- `src-tauri/src/repository/grading_computation.rs` (new): the full
  algorithm, the 41-band transmutation table (Rust constant data, not
  DB-seeded — a disclosed simplification, see ADR-0013), and
  `compute_term_grade(conn, school_id, class_record_id, learner_id)`.
  Returns `None` — this app's own interpretation, not DepEd's — until
  every weighted category has at least one `Scored` item for that
  learner, rather than fabricating a grade from incomplete data (matches
  `AttendanceRosterEntry`/`FieldDisclosure`'s existing "disclose, don't
  fabricate" precedent).
- New command `compute_learner_term_grade`; new TS `ComputedTermGrade`
  domain type, port method, Tauri implementation, and application-service
  method; `ClassRecordWorkspace.tsx` gained a "Show term grades" section
  (on-demand — a per-learner Tauri round trip, not recomputed
  automatically on every keystroke/item-selection) with a Guided-mode
  disclosure of exactly which weighting is in use and which subjects
  aren't yet supported.

**Two real bugs found and fixed by the tests themselves during
development** (not present in the final code, recorded because the
process is worth remembering):

1. The zero-based worked-example test fixture used the wrong max scores
   for the ST1/ST2/TE items (20/20/40 instead of the Order's own 25/20/50)
   — caught immediately because the test failed with a `None` result
   instead of the expected grade (one item's score exceeded its declared
   max and was silently rejected by the existing `learner_score::record`
   validation).
2. `LearnerScoreApplicationService.computeTermGrade` was not declared
   `async`, so its validation `throw`s were synchronous instead of
   promise rejections — the exact same bug class already documented from
   M8's `monthlySummary`, caught here the same way, by a test asserting
   `.rejects.toBeInstanceOf(ValidationError)`.
3. (Rust side) The original floor test used the SY 2026-2027 transmutation
   regime, where the table's own lowest band already floors at 60
   structurally — meaning it could never actually exercise the separate
   `apply_minimum_floor` clamp. Split into two tests, one per regime, once
   this was understood.

**Verification actually run this session**: `cargo test` — 184 lib tests

- 51 integration tests across 9 test binaries, all green (re-run twice
  after one transient/flaky failure in an unrelated pre-existing test file,
  `learner_management.rs`, which passed cleanly both in isolation and on a
  full-suite re-run — not a regression from this milestone's changes,
  confirmed by `git status` showing no learner-related files touched).
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  typecheck, lint, format, architecture-boundary check, 233 TS tests, all
  green (up from 226). Real-browser check: same standing limitation as
  M12c (no Tauri IPC bridge in a plain browser); not re-attempted this
  session since M12c already established and documented the exact gap.

**Independent review**: not dispatched. This milestone's new command
(`compute_learner_term_grade`) follows the identical authorization
pattern every existing command already uses
(`require_active_school_scope`, resolve-within-school-first) with no new
pattern introduced, so a `security-reviewer` dispatch was judged
lower-value here than for M12b's genuinely new mutation surface. A
`teacher-ux-reviewer` pass on the new "Show term grades" UI is recorded
as owed, alongside M12c's standing one.

Not implemented (deliberately out of scope, see ADR-0013's Scope
section for the full reasoning): the EPP/TLE & MAPEH weight group, any
Senior High School (Key Stage 4) weight group, GMRC/VE's internal
Cognitive/Affective/Behavioral domain split, Key Stage 1 descriptive
grading, Grade 12's DO 8, s. 2015 carryover weights (that order's exact
percentages could not be confirmed from a primary source this session),
Subject-level or class-record-level weight-group selection UI, report
cards/official grade output (M14).

## M14 Report Card / Official Grade Output — Complete (2026-08-24, same continuation session as M13)

Goal: turn M13's `ComputedTermGrade` into a file a teacher can keep or
hand to a school head, reusing M10's `export::csv`/`FieldDisclosure`
architecture. Full research/decision record in
`docs/adr/0014-report-card-export.md`.

**Scope correction made during implementation** (recorded here because
the reasoning matters, not just the outcome): the M13 session's
end-of-turn scope proposal considered gating this export to only the one
DepEd weight group M13 implements. On inspection this isn't buildable
without new scope — `Subject` carries no DepEd weight-group
classification, and `compute_term_grade` already applies the single
seeded policy uniformly to every class record, so there is nothing to
gate on. Building a `Subject`-to-weight-group mapping would itself
require guessing how this app's free-text subject names correspond to
DepEd's own categories — exactly the inference the `deped-compliance`
rule warns against. Corrected to inherit M13's own already-accepted
choice instead: disclose prominently, don't silently refuse.

**Implementation**:

- `FieldDisclosure`/`OmittedField` relocated from `export::sf2` to the
  shared `export::mod` (non-breaking — `sf2.rs` re-imports them, its own
  9 tests unchanged and still passing) — the reusable "official-form
  engine" piece `sf2.rs`'s own doc comment already anticipated a second
  export would need.
- New `src-tauri/src/export/report_card.rs`: one CSV row per learner on
  the class record's section roster (composed from
  `section_membership::roster_for_section_over_range` +
  `grading_computation::compute_term_grade`, the same composition
  `learner_score::record` already uses), an explicit "Not yet available"
  row for a learner whose grade isn't computable yet rather than a
  silent drop.
- New `class_record::find_detail_by_id_in_school` (the single-record
  counterpart to the existing `list_by_school`, same join) and
  `export_class_record_report_card` command — `class_record_id`
  client-supplied the same legitimate way `section_id` already is for
  the SF2 export; `school_id` from the session only; writes to
  `<Documents>/LIKHA-SIS/ReportCard_<section>_<subject>_<period>.csv`,
  reusing `sanitize_filename_component` (same NTFS-ADS/reserved-character
  hardening the SF2 export already has, not re-implemented).
- New TS: `ReportCardExportResult`,
  `ExportRepository.exportClassRecordReportCard`,
  `ExportApplicationService.exportClassRecordReportCard`;
  `exportService` threaded through `App.tsx` → `ClassRecordsScreen` →
  `ClassRecordWorkspace` (new prop on both). `ClassRecordWorkspace.tsx`
  gained an "Export report card (CSV)" button beside "Show term grades,"
  with an **always-visible** (not Guided-mode-only) warning that the
  export assumes core K-10 weighting for every subject — deliberately
  not gated behind Guided mode since it's correctness-affecting for
  every teacher mode.
- Also newly disclosed as omitted, more conservatively than strictly
  required by this milestone's own scope: DepEd's Qualitative Descriptor
  table (Order Table 11), since M13's research only read it at low
  resolution during the initial contact-sheet scan, not the same
  full-resolution rigor as the tables actually implemented (Tables 4, 9, 10) — omitted rather than risk exporting a wrong label.

**Verification actually run this session**: `cargo test` — 192 lib tests
(up from 184; +8 new in `export::report_card` and
`class_record::find_detail_by_id_in_school`) + 51 integration tests, all
green. `cargo clippy --all-targets -- -D warnings` clean. `npm run
quality` — typecheck, lint, format, architecture-boundary check, 239 TS
tests (up from 233; +6 new), all green. `npm run build` succeeds. Visual
verification not attempted — same standing gap as M12c/M13 (no Tauri IPC
bridge in a plain browser).

**Independent review**: not dispatched. This milestone's new command
follows the identical authorization pattern every existing
export/read command already uses, with no new pattern and no new
file-write surface beyond what `export_section_monthly_sf2` already
established and was reviewed for (CSV/formula-injection and NTFS-ADS
hardening, both reused verbatim). A `teacher-ux-reviewer` pass on the
new "Export report card" button is recorded as owed, alongside M12c's
and M13's standing ones.

Not implemented (deliberately out of scope, see ADR-0014): per-subject
gating (not currently buildable without new `Subject` schema — see
Scope Correction above), Qualitative Descriptors, Grade 12 DO 8
carryover, General Average/multi-subject aggregation, an
official-template-exact `.xlsx` reproduction, printing/PDF rendering, a
user-chosen save location.

## M15 Expand DepEd Grading Policy Coverage — Complete (2026-08-24, same continuation session as M13/M14)

Goal: close the specific architectural gap M14 identified (a class record
had no way to say which DepEd weight group applies to it — every one
silently shared whichever policy was marked default) and use the newly
explicit mechanism to add a second weight group. Full record in
`docs/adr/0015-expand-grading-policy-coverage.md`. **Note this resolves
M14's "per-subject gating not currently buildable" line above**: the fix
was not a `Subject`-level classification (still not built, still would
require guessing a subject-name-to-DepEd-group mapping) but an explicit
per-_class-record_ pin, which a teacher sets when opening the class
record — the same "explicit, not inferred" pattern already used for
`grading_period_id`/`category_set`.

No new 10-scenario process — ADR-0010/0013's versioned-reference-data
pattern already settled "how to represent a policy a teacher picks from";
this milestone applies it to a field it hadn't reached yet.

**Implementation**:

- Migration 11: `class_records.weight_policy_id` (nullable — an existing
  class record predating this migration is left `NULL`, preserving its
  exact prior "use the default" behavior rather than guessing which
  policy it should retroactively have; `class_record::create`'s new
  parameter is required for every record created since, validated to
  exist, `None` on an unknown id). A second seeded policy: EPP/TLE &
  MAPEH (20%/60%/20%, DO 015 s.2026 Table 9's second row) — reuses the
  _same_ Examinations/ST1/ST2/TE category structure migration 10 already
  seeded (no new category rows, only new weight rows against existing
  categories).
- `class_record::resolved_weight_policy_id_in_school`: the
  COALESCE-to-default lookup — the class record's own pinned policy if
  it has one, the current default otherwise. `grading_computation::compute_term_grade`
  now calls this instead of unconditionally querying `is_default = 1` —
  the one behavioral change that makes the new column matter. Proven
  with two dedicated tests, not just inspection: one confirming the
  pinned (non-default) policy is actually used, and one giving
  _identical_ raw scores to both policies and asserting the computed
  grades differ (60 under K-10's 20/50/30 vs. 70 under EPP/TLE & MAPEH's
  20/60/20, for the same inputs) — the strongest available proof the
  pinned policy is genuinely applied, not silently ignored.
- New `GradingWeightPolicy` type + `list_weight_policies`/
  `list_grading_weight_policies` (repository/command), mirroring
  `grading::list_policies`'s exact shape.
- UI: `ClassRecordsScreen`'s create form gained a required "DepEd grading
  weighting" picker, always shown (never hidden or auto-submitted),
  defaulting to the current default policy but requiring the teacher to
  see and confirm it — the create button stays disabled until a policy
  is selected, same disabled-until-complete pattern the section/subject/
  grading-period fields already use. The class-records list table gained
  a "Weighting" column. `ClassRecordWorkspace` now receives the resolved
  `weightPolicyName` from `ClassRecordsScreen` (which already holds the
  joined detail) and shows it in the term-grades section and the report-
  card export warning, replacing M14's hardcoded (and, once this
  milestone shipped, inaccurate) "assumes core K-10 weighting for every
  subject" text with the actual policy in effect plus an honest note that
  SHS/Grade 12/KS1 subjects still have no correct option in the picker at
  all.

**Correction to the record, found while scoping this milestone**:
ADR-0013 and ADR-0014 both listed "GMRC/VE's internal Cognitive/
Affective/Behavioral domain split" as an unimplemented gap affecting
grade _correctness_. Re-reading Table 9: GMRC/Values Education is already
inside the K-10 core weight group (identical 20/50/30 to English/
Filipino/Math/Science/AP) — the domain split (Table 3) is a within-item
assessment-_design_ guideline for how a teacher should distribute WWs/
PTs/EXs items across Cognitive/Affective/Behavioral aspects, not a
different weighting formula. GMRC/VE grades computed by this app have
been DepEd-compliant on the weighting front since M13; only the domain-
_tagging_ feature (marking which aspect an item addresses) remains
unimplemented, and it does not affect any grade already computed. This
correction is recorded in ADR-0015, not silently absorbed — the prior
ADRs' gap lists should be read with this correction applied.

**Verification actually run this session**: `cargo test` — 201 lib tests
(up from 192; +9: 2 migration tests, `resolved_weight_policy_id_in_school`
coverage, `list_weight_policies` + the two policy-differentiation proofs)

- 51 integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 242 TS tests (up from 239, +3),
  typecheck/lint/format/architecture-boundary all clean. `npm run build`
  succeeds.

**Independent review**: not dispatched. The new command
(`list_grading_weight_policies`) follows the identical pattern every
existing reference-data command already uses; `class_record::create`'s
new parameter is validated the same way its existing three already are.
No new authorization surface. A `teacher-ux-reviewer` pass on the new
picker/column/display text is recorded as owed, alongside M12c's,
M13's, and M14's standing ones.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0014): all Senior High School (Key Stage 4) weight groups, Key Stage 1
descriptive grading, Grade 12's DO 8 carryover (still no primary source
located), GMRC/VE's domain-tagging UI (does not affect grade
correctness — see Correction above), a `Subject`-level default-weight-
group suggestion (would require guessing a subject-name-to-DepEd-group
mapping).

## M16 SHS + Exceptional Grading Policies — Complete (2026-08-24, same continuation session as M13-M15)

Goal: per the user's directed roadmap (M15 → M16 → M17 → M18 → Roles &
Permissions, stated in one message this session), close the SHS/Key
Stage 4 weight-group gap ADR-0015 left explicitly deferred — and, in
doing so, empirically test ADR-0015's own prediction that every further
DepEd weight group would now be purely additive. Full record in
`docs/adr/0016-shs-and-exceptional-grading-policies.md`.

**Research**: no re-fetch of the primary-source PDF — Table 10 (Key
Stage 4) and Annex D paragraphs 46-47/49 were already transcribed and
verified at full resolution during M13's original reading (recorded in
that session's context and ADR-0013), and were cross-checked once more
against this session's own record before writing migration 12.

**Six weight groups, three structural shapes**:

- Full three-part Examinations (ST1/ST2/TE 30/30/40, identical shape to
  both K-10 policies): Core Subjects & Other Academic Electives
  (20/50/30), Arts/Sports/Health and Wellness Electives (20/60/20),
  TechPro Electives (15/65/20).
- Examinations present but composed of a Term Examination only (Annex D
  paragraph 46a) — no Summative Tests: Field Exposure/Arts
  Apprenticeship/Creative Production and Innovation (15/70/15). Modeled
  as a single child weight row (Term Examination at 100% within
  Examinations) instead of three; `compute_term_grade`'s existing
  "roll up whichever children a policy actually has" logic required no
  changes.
- No Examinations component at all (Annex D paragraph 46b/46c): Research
  Electives & Design and Innovation (40/60, WWs/PTs only) and Work
  Immersion (20/80, where WWs is the learner's portfolio and PTs is the
  workplace supervisor's industry evaluation — not ordinary classwork).
  Modeled by seeding no weight row for Examinations in that policy;
  `compute_term_grade`'s top-level loop simply never visits it.

Both structurally exceptional shapes are proven correct with new
end-to-end tests
(`compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only`,
`compute_term_grade_handles_a_policy_with_no_examinations_component`),
not just asserted from the migration's data.

**Zero code changes outside the migration and its own tests.** No
changes to `grading_computation.rs`'s algorithm. No TS/UI changes at
all — `ClassRecordsScreen`'s weighting picker and `ClassRecordWorkspace`'s
policy-name display are already fully data-driven from
`list_grading_weight_policies`, so all eight policies (2 from M15 + 6
from this milestone) appear automatically. This is the strongest
available confirmation of ADR-0015's "purely additive" prediction — not
just that it was theoretically true, but that implementing two genuinely
different structural shapes (TE-only, no-Examinations) still required no
algorithm changes.

**Caveats disclosed in every new policy's own citation text**: DepEd
itself defers detailed SHS item-level specifications to a separate,
not-yet-obtained "implementation guidelines of the Strengthened SHS
Curriculum" issuance (Annex D paragraph 47) — the weight percentages are
DepEd's own stated figures, not a guess, but the guidance behind
applying them item-by-item is incomplete. These six policies apply to
Grade 11 and to Grade 12 only once it adopts the Strengthened SHS
Curriculum (Annex D paragraph 49) — Grade 12 under the prior curriculum
still needs DO 8, s. 2015 weights, still unimplemented, still no primary
source located.

**Verification actually run this session**: `cargo test` — 208 lib tests
(up from 201; +7: 4 new migration tests, 3 new `grading_computation`
end-to-end tests) + 51 integration tests, all green. `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — 242 TS tests
(unchanged from M15 — confirms zero TS/UI impact), typecheck/lint/
format/architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: not dispatched. Purely additive seed data
against an already-reviewed schema and algorithm (M13/M15); no new
command, no new authorization surface, no new TS/UI code path to review.

Not implemented (deliberately out of scope, unchanged from ADR-0013/
0015): Key Stage 1 descriptive grading (a structurally different
computation — rubric evidence, not weighted numeric scores — explicitly
deferred by the user's own roadmap, not folded into M16), Grade 12's DO
8, s. 2015 carryover (still no primary source located), GMRC/VE's
domain-tagging UI (does not affect grade correctness — see ADR-0015's
correction), a `Subject`-level default-weight-group suggestion (a
teacher must still pick explicitly for SHS subjects, same as every other
policy).

## M17 Learner Profile Enrichment (LRN + Sex only) — Complete (2026-08-24, same continuation session as M13-M16)

Goal: per the user's directed roadmap, "M17 — Learner Profile Enrichment,
when required by report cards/forms." First milestone run under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user pick was
requested for scope inside M17, only evidence-based judgment against the
qualifier already given. Full record in
`docs/adr/0017-learner-reference-number-and-sex.md`.

**Scoping check, done before any schema change**: this app's own
already-shipped exports were checked for what they actually disclose as
missing. `export::report_card` (M14) discloses five gaps, none of them a
learner-profile field. `export::sf2` (M10) discloses one profile-shaped
gap, bundled into dropout/transfer statistics ("does not track learner
gender... at all"). Neither export had ever named LRN, birthdate, or
guardian contact as missing before this milestone — so the "when
required" qualifier did not automatically select the original M9-era
field list, and building that full list would have been unverified PII
expansion.

**Research**: two independent secondary sources per field (the bar
already established by M10 for SF2's own field layout, since the primary
DepEd Order PDFs were not available as machine-readable text this
session): SF2's per-learner roster requires LRN and Sex (teacherph.com's
template walkthrough + ilovedeped.net's independent guide, in agreement);
the SF9-style report card header requires LRN (openeducat.org's SF9
field inventory). Birthdate and guardian contact were checked against
the same sources and found in neither — deliberately not added.

**Decision**: add exactly `learners.lrn` (12-digit, DB `CHECK`-enforced,
partial-unique per school) and `learners.sex` ('M'/'F', DB `CHECK`-
enforced) via migration 13, both nullable — no honest default exists for
either. No new architecture decision (extends the established
"add-a-nullable-column" shape, same as M15's `weight_policy_id`).
`SectionRosterMember`/`MonthlyLearnerAttendance` both carry the new
fields through the existing roster queries so both exports can populate
them without a second query. `export::sf2` now renders LRN/Sex columns
and corrected its stale "does not track gender at all" disclosure text
(Sex is now tracked; only dropout/transfer _events_ and their by-sex
breakdown remain untracked). `export::report_card` now renders an LRN
column. `LearnerApplicationService` validates LRN format
(`/^\d{12}$/`) before calling the repository — this app can verify LRN
_shape_, never real-world correctness. `LearnerListScreen`'s enrollment
form gained optional LRN/Sex fields with a Guided-mode hint.

**Verification actually run this session**: `cargo test` — 217 lib tests
(up from 208; +9: 6 new migration tests, 3 new `learner.rs` repository
tests) + 51 integration tests, all green. `cargo clippy --all-targets --
-D warnings` clean. `npm run quality` — 249 TS tests (up from 242),
typecheck/lint/format/architecture-boundary all clean. `npm run build`
succeeds.

**Independent review**: not dispatched — no new authorization surface or
command pattern (`create_learner`/`update_learner` already existed, only
their parameter lists grew). Because LRN/Sex are new PII fields, an
inline security self-check was still performed: confirmed every new
field still resolves `school_id` only from `require_active_school_scope`,
confirmed the format `CHECK` constraints are enforced by SQLite itself
(not just the TS validation layer, which a compromised or bypassed
frontend could not evade), and confirmed no LRN/Sex value is logged,
echoed in an error, or placed in a URL/query string anywhere touched.

Not implemented (deliberately out of scope, disclosed not overlooked):
birthdate and guardian contact (no shipped export names either as
missing — revisit only if a future export's own disclosure does); a
`LearnerListScreen` edit affordance for an _existing_ learner's LRN/Sex
(`updateProfile`/`updateLearnerProfile` plumbing exists and is tested,
just unused by any screen — a learner enrolled before this migration has
no way to gain the fields until such a screen exists).

## M18 Bulk Attendance / Teacher Productivity — Complete (2026-08-24, same continuation session as M13-M17)

Goal: per the user's directed roadmap, "M18 — Bulk Attendance / Teacher
Productivity." First milestone continued fully autonomously under
Autonomous Continuous Development Mode
(`.claude/rules/autonomous-development.md`) — no fresh user instruction
was given between M17's completion and M18's start. Directly closes the
concrete example `docs/PROGRESS-MAP.md`'s own Out of Scope list had
already named: "bulk attendance actions (e.g. 'mark all present')." Full
record in `docs/adr/0018-bulk-attendance-mark-all-present.md`.

**Scoping check, done before implementing**: verified whether an
unmarked attendance day already behaves like Present anywhere in this
app, since if so the feature might be purely cosmetic.
`export::sf2::status_code` renders `None` and `Some(Present)` identically
(blank), and the SF2 export only prints Absent/Tardy totals, never a
Present total — so an unmarked day is already indistinguishable from a
marked-Present day in every export this app produces. The feature's real
value is therefore auditability (a `recorded_at` timestamp proving a
day was actually checked, not silently defaulted), and raw teacher
productivity (not clicking "Present" once per learner every day) — not
a DepEd-compliance fix.

**Decision**: `repository::attendance::bulk_mark_present` marks every
roster learner who does **not** already have a status for the date as
Present, and leaves any already-marked learner (Present, Absent, or
Tardy) untouched — a safety guarantee proven by a dedicated test
(`bulk_mark_present_does_not_overwrite_an_already_marked_learner`), not
just claimed. This matters because a teacher who already flagged one
absence before clicking "Mark all present" must never have that
overwritten back to Present. Implemented by reusing `record()` (the
same isolation-checked write every individual mark already goes
through) and `roster_for_section_date` (the same read the screen already
uses) — no new query pattern, no new architecture decision.
`AttendanceScreen` gained a "Mark all present" button, disabled once
every roster row already has a mark, with a Guided-mode hint stating the
never-overwrites guarantee explicitly (a teacher should not have to
trust that silently next to a button that writes for the whole class at
once) and a confirmation banner distinguishing "marked N learners" from
"everyone already had a mark — nothing changed."

**Verification actually run this session**: `cargo test` — 220 lib tests
(up from 217; +3: `bulk_mark_present_marks_every_unmarked_learner_present`,
`bulk_mark_present_does_not_overwrite_an_already_marked_learner`,
`bulk_mark_present_does_not_mark_a_learner_outside_the_callers_school`)

- 54 integration tests (up from 51; +3, mirroring the existing
  `record_attendance`/`roster_for_date` isolation coverage pattern
  exactly), all green. One `authorize_school_membership_grant_allows_a_session_scoped_to_the_same_school`
  failure appeared under full-suite parallel execution; passed both in
  isolation and on an immediate full-suite rerun, matching the transient
  flakiness class already documented in `docs/PROJECT-MEMORY.md`'s M12b
  note — confirmed not a regression from this change, not just assumed.
  `cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
  256 TS tests (up from 249), typecheck/lint/format/architecture-boundary
  all clean. `npm run build` succeeds.

**Independent review**: not dispatched. No new authorization surface
(`bulk_mark_attendance_present` follows the identical session-derived-
scope pattern as every existing attendance command) and no new write
path (`record()` itself was already reviewed via M7's `security-reviewer`
episode).

**Visual verification**: not attempted, same standing gap as every UI
milestone since M5/M12c — this environment has no browser/screenshot
tool for the compiled native Tauri app, and a plain `vite dev` browser
preview has no Tauri IPC bridge and cannot reach an authenticated
screen. `npm run build` confirms the bundle compiles; the button's
actual rendered appearance is not visually confirmed.

Not implemented (deliberately out of scope): a bulk action for
Absent/Tardy (no teacher-workflow justification made for it the way
"assume present, flag exceptions" has — a wrong-status bulk action is a
much larger footgun without an offsetting case); full section-roster
management UI, bulk enrollment (unrelated to attendance marking itself).

## Account Lockout After Failed Logins — Complete (2026-08-24, same continuation session as M13-M18)

Goal: the first milestone selected entirely autonomously under
Autonomous Continuous Development Mode, once Roles & Permissions was
asked about directly and resolved as "deferred, not built." Selected
from `docs/product/M8-DECISION.md`'s own pre-existing 20-scenario
candidate list (scenario #12, Security-first, ~5.8) — not disqualified
from autonomous selection the way Roles & Permissions was, since a
lockout threshold/duration is a standard security-engineering default
(OWASP's Authentication Cheat Sheet), not an organizational policy only
the user can set. Full record in `docs/adr/0019-account-lockout.md`.

**Gap confirmed before implementing**: `auth::login` had zero
brute-force mitigation beyond Argon2id's own hashing cost. Given this
app's own documented deployment model (shared school computers,
multiple teacher accounts, no 1:1 Windows-account assumption —
ADR-0004), a colleague/student at the same physical machine repeatedly
guessing a coworker's password is a real local threat this schema had
no defense against.

**Decision**: migration 14 adds `users.failed_login_attempts`/
`users.locked_until`. `repository::user::verify_credentials` now checks
lockout state before password verification for a known username (never
for an unknown one — that path is completely untouched), locks after 5
wrong attempts for 15 minutes with immediate feedback on the triggering
attempt (not a delayed reveal on the next attempt), and resets the
counter on any successful login. A locked account is rejected without
running Argon2id at all. New `AppError::AccountLocked` variant,
serialized to the same generic-category-only convention as every other
variant. `LoginScreen` shows a distinct, specific message for this case
rather than folding it into the generic failure text.

**A disclosed trade-off, not an oversight**: once locked, the response
does reveal the username exists (distinguishable from
`AuthenticationFailed`) — but only after 5 wrong guesses already
targeted at that specific username, a real cost paid first. This exact
trade-off exists in effectively every real lockout system; recorded
explicitly in code comments and ADR-0019 rather than left implicit.

**Verification actually run this session**: `cargo test` — 226 lib
tests (up from 220; +6 new `repository::user` tests covering
lock-after-threshold, locked-rejects-even-correct-password,
successful-login-resets-counter, unknown-username-never-locks,
lock-expires-and-a-fresh-attempt-succeeds; +1 new migration test) + 54
integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 262 TS tests (up from 259; +3,
including a new `LoginScreen` test asserting the lockout message is
visibly distinct from the generic one), typecheck/lint/format/
architecture-boundary all clean. `npm run build` succeeds.

**Independent review**: dispatched, but findings not retrievable — see
"Independent-review agent-resume issue recurred" in
`docs/CURRENT-HANDOFF.md`'s Status section. A careful self-review was
performed instead (full checklist in ADR-0019's Consequences section):
confirmed lockout check precedes password verification, confirmed the
unknown-username path is byte-for-byte unchanged, confirmed lockout
state lives in the persisted `users` table (not `SessionManager`'s
in-memory state, so it survives a process restart as a lockout must
to be meaningful).

**Same-session side effect**: while self-reviewing the M12c-M18 UI
(after the same agent-resume issue affected the two reviewers
dispatched specifically for that sweep), found and fixed two real,
unrelated UX/accessibility gaps in `LearnerListScreen.tsx`'s M17/
this-session edit affordance: no focus management when entering edit
mode (focus silently fell to the document body), and clicking "Edit" on
a second learner while a first edit was in progress silently discarded
the first learner's unsaved changes. Both fixed and covered by new
tests; full detail in ADR-0019's addendum. **The broader M12c-M18 UI
sweep those two reviewers were asked to cover remains real,
undischarged review debt** — the self-review only caught what it
happened to touch while implementing something else, not a systematic
pass over the full UI surface.

Not implemented (deliberately out of scope): idle-timeout/session
hardening (a related but distinct candidate from the same
20-scenario list — a fixed-TTL session already exists per ADR-0004;
idle tracking is a separate change), an admin "unlock early"
affordance (no roles/permissions system exists yet to define who
"admin" is), a configurable threshold/duration (no evidence yet that
different schools need different policies).

## Out of Scope (current milestones)

- cloud sync
- roles/permissions beyond "session scoped to a school" — requires a
  human product decision on what roles exist (see `docs/product/M8-DECISION.md`)
- password reset, account lockout, idle-timeout, cloud authentication
- grade computation for any weight group beyond the eight M13/M15/M16
  implemented (core K-10 English/Filipino/Math/Science/AP/GMRC, EPP/TLE
  & MAPEH, and all six Senior High School groups) — Key Stage 1
  descriptive grading and Grade 12's DO 8 s. 2015 carryover are still
  unimplemented; see
  `docs/adr/0016-shs-and-exceptional-grading-policies.md`. GMRC/VE's
  Cognitive/Affective/Behavioral domain _tagging_ (not its weighting,
  which is already correct — see ADR-0015's correction) is also still
  unimplemented.
- a full mutation-history/audit log beyond "last saved HH:MM",
  editing/deleting an assessment item, Senior High School's separate
  semester structure as it applies to assessment — see
  `docs/adr/0012-assessment-items-and-scores.md`. Keyboard-efficient entry
  and mobile-aware responsive layout for score entry **are** now done —
  see M12c above.
- full section-roster management UI (removing/editing a membership,
  viewing a section's roster as its own screen), bulk enrollment. "Mark
  all present" **is** now done (M18) — see
  `docs/adr/0018-bulk-attendance-mark-all-present.md`; a bulk action for
  Absent/Tardy remains out of scope, deliberately (no teacher-workflow
  justification made for it yet).
- learner profile enrichment beyond LRN/Sex (birthdate, guardian
  contact) — M17 added exactly LRN and Sex, the two fields this app's
  shipped exports actually need (see
  `docs/adr/0017-learner-reference-number-and-sex.md`); birthdate/
  guardian remain out of scope until a shipped export discloses either
  as missing. Also out of scope: a UI affordance to add LRN/Sex to a
  learner enrolled before M17 (the repository/service plumbing exists,
  no screen calls it yet).
- Excel/PDF export, a user-chosen export save location, a generic
  form-definition framework — see `docs/adr/0009-sf2-export-and-official-form-engine.md`
- editing/deleting a saved grading period, a third grading policy beyond
  the two seeded ones, Senior High School's separate semester structure
  — see `docs/adr/0010-grading-period-foundation.md`
- Android-specific workflows
