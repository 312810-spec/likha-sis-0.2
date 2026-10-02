# Current task

Updated: 2026-10-02. Baseline main: `3e7a2508da0f82c662b133e28117a9be4f0f06e6`.

## Objective

Replace development bureaucracy and establish a researched Windows/Android
delivery path. Preserve the implemented Windows app and school data behavior.

## Completed in this branch

- Five independent expert proposals plus a challenge round.
- Current platform and GitHub workflow research, with popularity limits disclosed.
- New AGENTS/HARNESS/bootstrap; old hooks, certifications and process/policy
  skills retired from automatic discovery. Useful engineering skills retained.
- Separate release checklist; legal-policy prerequisites removed from development.

## Next implementation

Build one Tauri Android feasibility slice: Android Keystore-backed local DB key,
SQLCipher opening, offline attendance + atomic outbox, process-death recovery,
foreground sync against the existing school hub, backup export/restore and
signed upgrade. See `docs/ACTIVE-PLAN.md` and the study for acceptance criteria.

## Concrete limitations

`src-tauri/src/db/mod.rs` currently rejects non-Windows database startup. Android
is not implemented by this harness replacement. No Windows installer or Android
APK has been built/tested by this study; this executor has no Rust toolchain.
Current native/hardware recovery debt remains open. Do not infer production
readiness from the research or the removal of development gates.
