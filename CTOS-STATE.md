# CTOS State

**Updated:** 2026-10-08
**Program:** CTOS v3 / FORGE-UHF  
**Repository:** 312810-spec/likha-sis-0.2

## Current execution state

- Execution branch: ctos/integration (created from main 659fb0d)
- Source branch: main
- Current milestone: M08 — Attention + Learning Support (COMPLETE, PASS)
- Last completed milestone: M08 (PASS — see docs/ctos/checkpoints/m08.md)
- Last pushed CTOS execution checkpoint: M08 (tag `ctos-m08-complete`)
- Next action: execute M09 — Teacher Load Maker + Smart Scheduling (CTOS.md §M09)
- Risk tier: M01/M02 High-Fidelity closed PASS; M03 was a design-system milestone,
  not High-Fidelity, and closed PASS on the UI gate plus a static token guard;
  M04 closed PASS as a screen-and-read-model milestone; M05 closed PASS as a
  session-state-retention milestone in the web layer; M06 closed PASS as the
  occurrence-semantics milestone that made the Rust stack reachable from the UI;
  M07 closed PASS as the interaction-speed milestone that made daily attendance
  and scoring one keystroke per learner and made the correction lineage visible;
  M08 closed PASS as the loop-milestone that carried learning evidence to an
  outcome and surfaced the last two §6.1 attention items
- Open implementation PRs to reconcile: #103 (salvage source, classified), #100 (M13 resume-pointer)
- Windows native evidence: prior evidence exists in project history; must be revalidated on the exact CTOS source before release claims
- Android native evidence: unsupported as a release claim until M14 acceptance passes; Android SDK absent from this runtime
- Dirty/unpushed warning: none after the M08 commit and tag are pushed
- TANAW M11/M12 evidence checkpoint: connected Drive school/district/Division consolidators and recent SMEA PPT inventoried; indicator/source registry and reconciliation risks recorded in `docs/ctos/research/tanaw-smea-dmet-source-matrix-2026-10-08.md`. **Research only**; no DMET field dictionary or production feature is claimed. Lock authority = SMEA Coordinator only (product decision); no DMET API (product decision).
- M09 research checkpoint: DepEd Mandaue site/archive, official Division seal, DO 005 s.2024, DM 053 s.2024, and eSF7 national/current operational evidence recorded in `docs/research/deped-mandaue-teacher-load-2026.md` (commit `0fef68e`); no local Mandaue memo number or deadline was invented

## M08 result (checkpoint m08.md)

- Frontend quality: 139 files / 1,321 tests pass (up from 136 / 1,301 — the delta
  is exactly 20 new tests: 9 in the new `LearningSupportScreen.test.tsx`, 4 in
  `MyDayScreen.test.tsx`, 4 in the new `learner-support-service.test.ts` and 3 in
  the new `learner-support-repository.test.ts`; two existing fixtures gained the
  two new `MyDaySummary` fields without changing any test count)
- Native Rust: 1,378 passed / 0 failed (up from M07's 1,364 — exactly 14 new
  tests: 10 in the new `learner_support` module and 4 in `my_day`), `cargo fmt
--check` clean, `cargo clippy --all-targets -- -D warnings` clean
- `npm run quality:ui` PASS: zero axe WCAG A/AA findings. The new screen is
  axe-checked in jsdom by its own a11y test, not by the browser harness — the
  synthetic dev preview renders `AssignedClassFolio` for the "Classes" tab and
  seeds no occurrences or markers, so there is no fixture path to reach it through
- CTOS.md §M08's required loop is traversable end to end. The evidence and
  follow-up ends already existed (M06/M07); M08 built the middle — the need → goal
  → intervention plan, participation, and outcome — as a persisted case anchored to
  the occurrence and the enrollment, which is what lets `authorize_own_assignment`
  protect it. The loop's one-order rule is the schema's property, not the query's:
  three cross-column CHECK constraints in migration 45, mirroring
  `OccurrenceStatus`'s M06 precedent
- The last two CTOS.md §6.1 attention items that were never surfaced now are:
  `pendingScoring` ("unfinished assessment work") and `pendingFollowups` ("learner
  follow-up due where appropriate"). Both derived, never stored — no new table and
  no status column, which is what `my_day.rs`'s docstring commits to
- Ownership is re-derived from the occurrence on every write; learner names are
  resolved at the repository by JOIN, never client-supplied. The marker is cleared
  after the plan is written, in that order, so a failed clear cannot lose the plan
- Two defects found and fixed: an `ORDER BY opened_at DESC` that was
  nondeterministic across same-millisecond cases (fixed with an `id DESC`
  tie-break, since UUIDv7's leading bytes are the generating timestamp), and a
  `getByText` that matched the marker's reason in both the drafting hint and the
  prefilled textarea — the same element-boundary trap M06 and M07 hit

## M07 result (checkpoint m07.md)

- Frontend quality: 136 files / 1,301 tests pass (up from 135 / 1,284 — the delta
  is exactly 17 new tests: 7 in the new `ScoreCorrectionHistory.test.tsx`, 4 in
  `ClassRecordWorkspace.test.tsx`, 4 in `SubjectAttendanceScreen.test.tsx` and 2 in
  `AttendanceScreen.test.tsx`; no other file changed count)
- Native Rust: 1,364 passed / 0 failed (up from M06's 1,362 — exactly the two new
  lineage tests), `cargo fmt --check` clean, `cargo clippy --all-targets --
-D warnings` clean
- `npm run quality:ui` PASS: zero axe WCAG A/AA findings. The browser harness sees
  the history panel collapsed (fetch on expand); the expanded panel is axe-checked
  by the component's own a11y test, which opens it first
- Three partial items in CTOS.md §M07 were closed: letter shortcuts plus
  success-conditional focus advance on both attendance rosters, Tab/Shift+Tab in
  the score grid, and the correction-history review surface wired to the existing
  command. The other ten verify items were already implemented and are re-verified
  and named in `capture-cases.md`
- Author names in the lineage are resolved at the repository by a double
  `LEFT JOIN users`, following the `audit_log.actor_username` precedent — never
  client-supplied. The schema's non-cascading `REFERENCES users(id)` means the join
  cannot be orphaned, proved by a test that asserts the DELETE is rejected
- Two defects found and fixed: `setState` in an effect body (rejected by
  `react-hooks/set-state-in-effect`; the reset moved to the toggle handler, which is
  also where the immediate "Loading…" feedback belongs), and `getByText` unable to
  match text spanning an element boundary — the change line renders
  `15 → <strong>19</strong>` as separate text nodes, so the tests read the
  paragraph's `textContent` instead

## M06 result (checkpoint m06.md)

- Frontend quality: 135 files / 1,284 tests pass (up from 133 / 1,261 — the delta
  is exactly 15 new cockpit tests plus 8 new adapter tests, in two new files;
  `MyDayScreen.test.tsx` and `ClassWorkspaceScreen.test.tsx` keep their pre-existing
  counts, their diffs being the `onStartClassroom` prop threading only)
- Native Rust: 1,362 passed / 0 failed (up from M04's 1,331 — exactly the 31
  occurrence tests), `cargo fmt --check` clean, `cargo clippy --all-targets --
-D warnings` clean. M05 correctly recorded no Rust touched; M06 is where that
  Rust became reachable from the UI
- `npm run quality:ui` PASS: zero axe WCAG A/AA findings
- Acceptance clause met by a test: planned, changed, cancelled and delivered
  occurrences render as four distinct status chips side by side in the history
- The occurrence stack — Rust repository, ten Tauri commands, migration 0043, and
  the TypeScript domain/port/service/adapter — was already present and uncommitted
  in the working tree, and is claimed as verified here, not built here. This
  milestone built `ClassroomModeScreen`, the navigation handoff, and the
  conformance/verification record
- Four real defects found and fixed in the new screen: an always-false
  object-identity guard looping the debounced save forever; a blank slot sent as
  `Some("")` counting as a deviation so clearing it flipped the class to `changed`;
  a throw past the first `await` escaping the load path and leaving the cockpit
  stuck on "Loading…"; and the status text rendered twice per history row
- Command-construction lesson applied: `npm run quality` and `cargo clippy` were
  run outside a `| grep` pipeline with exit statuses read directly, which is how
  the M04 `format:check` false-negative and its M05 re-occurrence were caused

## M05 result (checkpoint m05.md)

- Frontend quality: 133 files / 1,261 tests pass (up from 133 / 1,257 — the delta
  is exactly four new tests); typecheck, lint, format:check, architecture, deadcode
  all pass
- `npm run quality:ui` PASS: zero axe WCAG A/AA findings across four widths ×
  both appearances × three densities
- No Rust touched this milestone; the Rust suite's last verified state is M04's
  1,331 passed
- New: the grading period and DepEd weighting chosen for a class are held in App
  session state keyed by the assignment and recalled on the next visit, so the
  teacher is no longer re-asked for the term on every folio remount
- The recall is revalidated rather than guessed — a period the school no longer
  publishes falls back to an explicit choice rather than being clamped onto a
  different term; the class record id is still re-derived on every visit so a
  deleted record is never silently restored
- Five of M05's six required properties were already held by the PR #102 redesign
  and are named with real tests in `folio-cases.md`; only internal state retention
  needed building
- **Correction to the M04 checkpoint: `format:check` was not actually clean at the
  `ctos-m04-complete` tag.** Two M04 case files failed Prettier. The M04 code, test
  and lint gates were real, but the checkpoint's "all five gates pass" claim was
  wrong for that one gate; both files are formatted in the M05 commit. Cause was
  running `npm run quality` through a `| grep` pipeline whose exit status was
  `tail`'s

## M04 result (checkpoint m04.md)

- Native Rust tests: 1,331 passed / 0 failed (full `cargo test`), clippy clean,
  fmt clean. The delta from M02's 1,325 is exactly the six new `my_day` tests
- Frontend quality: 133 files / 1,257 tests pass (up from 133 / 1,252 — five net
  new screen/service tests); typecheck, lint, format:check, architecture, deadcode
  all pass
- `npm run quality:ui` PASS: zero axe WCAG A/AA findings across four widths ×
  both appearances × three densities
- New: `MyDaySummary.next` derived in Rust after the sort it depends on;
  `has_any_assignments` separating "not assigned" from "no classes today";
  pending unscheduled assignments computed from the absence of meeting rows
- Recorded as out of scope, not as a gap: **stale offline schedule is `Unknown`** —
  `schedule_meetings` is absent from the sync allowlist so a stale schedule has no
  transport to arrive through (M13 owns sync, M09 owns publication), and no
  freshness timestamp is shown because none exists to show honestly
- Real defect found and fixed that the item list did not name:
  `ClassWorkspaceScreen` renders inside `MyDayScreen` without a tab change, so
  returning from it never remounted and the attention rail stayed stale;
  `onBackToToday` now re-fetches, mirroring `ClassRecordsScreen.handleBackToList`
- Recorded as a remaining risk, deliberately untouched: `TodaysClassesScreen`
  re-implements the join `my_day` computes, so the two screens can disagree about
  the same day; there are three separate "what day is it" implementations

## M03 result (checkpoint m03.md)

- Frontend quality: 133 files / 1,252 tests pass (up from 132 / 1,242 — the delta
  is exactly the ten-test token guard); typecheck, lint, format:check,
  architecture, deadcode all pass
- `npm run quality:ui` PASS after the CSS refactor: zero axe WCAG A/AA findings
  across four widths × both appearances × three densities, with a
  no-horizontal-overflow assertion at every width
- No Rust touched this milestone; the Rust suite's last verified state is M02's
  1,325 passed
- Four structural gaps fixed: a type and spacing scale derived from their bases
  (density now rescales all type, not just body text), three duplicate table
  definitions consolidated into one `.ledger` primitive, six ad-hoc breakpoints
  collapsed onto three sanctioned widths, and the shared copy vocabulary in
  `src/ui/theme/copy.ts`
- The app previously had no React error boundary at all; `ErrorBoundary` now
  wraps the tab switch so a render failure is scoped to one screen
- Recorded as deliberate, not as a gap: `emptyCopy` was drafted and removed
  because all 45 `<EmptyState>` call sites carry context a generic string would
  discard, and the regression fixture is a static token guard rather than a
  pixel baseline because the repo has no image-comparison dependency

## M02 result (checkpoint m02.md)

- Native Rust tests: 1,325 passed / 0 failed (full `cargo test`), clippy clean
- Frontend quality: unchanged at 132 files / 1,242 tests; M02 was Rust-only
- One real defect fixed: `auth::login` now revokes the session it supersedes,
  so an account switch no longer leaves a zombie session row live for up to 8h
- Recorded as deliberate, not as gaps: the sync queue is school-scoped by
  design (a departed member's recorded work is the school's data), and
  handover of pending work holds by construction (scores are keyed to the
  class record, not the teacher)
- Eval registry file `access-cases.md` written from the real test names —
  the M00 registry row had claimed it was automated before it existed

## M01 result (checkpoint m01.md)

- Native Rust tests: 1,320 passed / 0 failed (18 suites, full `cargo test`)
- Frontend quality: 132 files / 1,242 tests pass; typecheck, lint,
  format:check, architecture, deadcode all pass
- `cargo clippy --all-targets -- -D warnings` clean
- New: `ComputedTermGrade.complete` — provisional grades are now visibly
  provisional on screen and in both exports
- Two M00 record corrections recorded in the M01 checkpoint: the M00 clippy
  gate did not actually pass, and the M00 eval registry listed
  `grading-cases.md` as automated before the file existed

## M00 baseline truth (source commit 659fb0d)

- Frontend quality: 132 files / 1,233 tests pass; typecheck, lint, format:check,
  architecture, deadcode all pass (1 pre-existing lint warning in App.tsx)
- Native Rust tests: 1,303 tests / 0 failed (source commit 659fb0d)
- Toolchain repairs made at M00: npm install (typescript-compiler),
  rustup to 1.99 (removed a vendored rust-src blocking the update),
  Strawberry Perl prioritized for the openssl-src vendored build

## Known source truth after M00

- main contains PR #102 class-folio redesign and the CTOS v3 planning documents
- PR #103 is draft, diverged, and classified as salvage (see
  docs/ctos/checkpoints/m00.md for the full salvage map)
- PR #103 has two structural defects that block a direct merge: a split
  migration convention (db/ vs db/sql/) and runtime execute_batch re-applying
  migration-owned SQL that is not idempotent
- PR #103's layering and server-side school-scope derivation were verified
  correct and are reusable; its verification claims are not
- PR #100 conflicts with main and overlaps PR #103's resume-pointer work

## Parked external dependencies

- current Mandaue form-checking memorandum/checking schedule (official archive verified; current 2026 register remains unreadable through the Looker Studio embed)
- current anonymized LIS SF1–SF4 samples
- official West 1 TANAW indicator dictionary
- TANAW Lock authority
- current Mandaue-specific eSF7 implementation details (national eSF7 authority and 2026 cross-division operational evidence verified)
- SF8 health workflow/rules
- actual school production roster/offerings/bell times/room constraints/schedules
- final real-device/printer/user acceptance

## Rule

This file is intentionally compact. Historical detail belongs in Git and docs/ctos/checkpoints/.
