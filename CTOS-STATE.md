# CTOS State

**Updated:** 2026-10-06
**Program:** CTOS v3 / FORGE-UHF  
**Repository:** 312810-spec/likha-sis-0.2

## Current execution state

- Execution branch: ctos/integration (created from main 659fb0d)
- Source branch: main
- Current milestone: M06 — Classroom Mode
- Last completed milestone: M05 (PASS — see docs/ctos/checkpoints/m05.md)
- Last pushed CTOS execution checkpoint: M05 (tag `ctos-m05-complete`, 0d45ee1)
- Next action: execute M06 — start/finish session, actual occurrence state,
  attendance, current learning target, quick evidence, notes, learner follow-up
  marker, summary/review; planned, changed, cancelled, and delivered occurrences
  must remain distinguishable
- Risk tier: M01/M02 High-Fidelity closed PASS; M03 was a design-system milestone,
  not High-Fidelity, and closed PASS on the UI gate plus a static token guard;
  M04 closed PASS as a screen-and-read-model milestone; M05 closed PASS as a
  session-state-retention milestone in the web layer
- Open implementation PRs to reconcile: #103 (salvage source, classified), #100 (M13 resume-pointer)
- Windows native evidence: prior evidence exists in project history; must be revalidated on the exact CTOS source before release claims
- Android native evidence: unsupported as a release claim until M14 acceptance passes; Android SDK absent from this runtime
- Dirty/unpushed warning: none; M05 is committed and pushed at the
  `ctos-m05-complete` tag

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

- current Mandaue form-checking evidence
- current anonymized LIS SF1–SF4 samples
- official West 1 TANAW indicator dictionary
- TANAW Lock authority
- current eSF7 official details
- SF8 health workflow/rules
- actual school production roster/offerings/schedules
- final real-device/printer/user acceptance

## Rule

This file is intentionally compact. Historical detail belongs in Git and docs/ctos/checkpoints/.
