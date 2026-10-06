# CTOS State

**Updated:** 2026-10-06
**Program:** CTOS v3 / FORGE-UHF  
**Repository:** 312810-spec/likha-sis-0.2

## Current execution state

- Execution branch: ctos/integration (created from main 659fb0d)
- Source branch: main
- Current milestone: M04 — Today
- Last completed milestone: M03 (PASS — see docs/ctos/checkpoints/m03.md)
- Last pushed CTOS execution checkpoint: M03 (tag `ctos-m03-complete`, f0432da)
- Next action: execute M04 — one-action next-class entry, no schedule, stale
  offline schedule, changed schedule, no classes today, pending assignment,
  unfinished attendance, returned review
- Risk tier: M01/M02 High-Fidelity closed PASS; M03 was a design-system milestone,
  not High-Fidelity, and closed PASS on the UI gate plus a static token guard
- Open implementation PRs to reconcile: #103 (salvage source, classified), #100 (M13 resume-pointer)
- Windows native evidence: prior evidence exists in project history; must be revalidated on the exact CTOS source before release claims
- Android native evidence: unsupported as a release claim until M14 acceptance passes; Android SDK absent from this runtime
- Dirty/unpushed warning: none; M03 is committed and pushed at the
  `ctos-m03-complete` tag

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
