# CTOS State

**Updated:** 2026-10-06  
**Program:** CTOS v3 / FORGE-UHF  
**Repository:** 312810-spec/likha-sis-0.2

## Current execution state

- Execution branch: ctos/integration (created from main 659fb0d)
- Source branch: main
- Current milestone: M01 — Academic trust (grading, completeness, historical integrity)
- Last completed milestone: M00
- Last pushed CTOS execution checkpoint: M00 (see docs/ctos/checkpoints/m00.md)
- Next action: execute M01 — verify grading/transmutation thresholds, edge attainable scores, blank≠zero≠excused, provisional vs complete, grading policy applicability/version, historical issued snapshot stability, correction/amend behavior
- Risk tier: High-Fidelity for M01 (grading/finality)
- Open implementation PRs to reconcile: #103 (salvage source, classified), #100 (M13 resume-pointer)
- Windows native evidence: prior evidence exists in project history; must be revalidated on the exact CTOS source before release claims
- Android native evidence: unsupported as a release claim until M14 acceptance passes; Android SDK absent from this runtime
- Dirty/unpushed warning: none at the M00 checkpoint

## M00 baseline truth (source commit 659fb0d)

- Frontend quality: 132 files / 1,233 tests pass; typecheck, lint, format:check,
  architecture, deadcode all pass (1 pre-existing lint warning in App.tsx)
- Native Rust tests: result recorded in docs/ctos/checkpoints/m00.md
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
