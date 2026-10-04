# LIKHA-SIS handoff

Updated: 4 October 2026, Asia/Manila.

## Standing rule
Save a durable development checkpoint and update this file at least every five minutes during active work. Save before long checks and before pausing. User explicitly requests continuation without repeated approval.

## Goal and branch
Implement remaining LIKHA plans, preserve earlier confirmed school decisions, verify integrated behavior, then merge authorized branches. Repository: `312810-spec/likha-sis-0.2`; branch: `codex/complete-plans-20261004`; PR103 remains draft/unmerged. Recovered source commit: `aa239416d38188f9dff1a9632b8041f2caa410ae`. This handoff is saved in the next commit on that branch.

## Recovery finding
Workspace maintenance removed the last local checkout again. The early remote checkpoint survives, including the premium UI and 72 files of draft feature source. Later integration, score CSV import, offerings, canonical source snapshots, calendar changes and many tests were not saved and must be recovered or rebuilt. Do not call them complete.

## Surviving draft
Scheduling engine/backend/TS contracts; grading integrity/completeness and assessment lifecycle; attachments/resource ledgers; form/TANAW review packets; Android plugin scaffold; resume pointer primitives. The snapshot was early and incomplete. Inspect existing files before rewriting them. App/lib/composition/module declarations and migrations need integrated wiring.

## Earlier evidence (not current-source proof)
Before pruning, a later working tree passed 1,259 frontend tests. Its full native source compiled, but final test execution was not recovered. Android AArch64 native library cross-compiled, with 16 KiB LOAD alignment. Kotlin/APK packaging was blocked at Gradle plugin resolution. No usable APK or installed-device success was established. All rebuilt source needs current verification.

## Confirmed boundaries
Empty fresh setup; assigned-teacher/advisory scope; preserve pending work during handover; School Head designates form reviewers; teachers own assessment exceptions/corrections with reasons/history; retained optional attachments included backups; SF8 inactive; named programs inactive until instructions/coordinator; explicit approved calendar changes; official eSF7/TANAW Lock/current local forms pending authoritative evidence. School hub retained.

## Exact next steps
1. Read AGENTS/TASK and inventory the surviving draft.
2. Restore wiring and lost features in isolated ownership areas; checkpoint completed edits within five minutes.
3. Run focused tests, TypeScript/lint/format/architecture/deadcode, full native tests/clippy and UI smoke.
4. Restore Android SDK/build attempt only after source is checkpointed; do not claim APK from Rust cross-compile.
5. Update PR103 with verified scope. Reconcile historical branches without restoring superseded cloud/automation/harness code; merging remains authorized after checks pass.
