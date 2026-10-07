# PR #103 Salvage Map

**Source:** codex/complete-plans-20261004
**Compared against:** current main at M00 start, 86d7ecdf5559bfdd9270a1b6c556f8ea86550ab8
**Relationship:** diverged; 6 commits ahead, 45 commits behind.

PR #103 is evidence and candidate implementation, not a merge target.

## Superseded / already represented on main

Do not re-import these merely because they appear in PR #103:

- class-folio visual direction and screenshots already delivered through merged PR #102
- shell/navigation/theme work whose current-main equivalents exist
- historical design ADR material already incorporated on main
- stale development-harness instructions superseded by CTOS/FORGE and current AGENTS.md

For every overlapping UI file, prefer current main and port only a narrowly identified missing behavior.

## Reusable candidates — verify and adapt

### M01 Academic trust
- assessment lifecycle migration and commands
- grading computation changes
- learner score correction/history support
- score import staging/history
- report-card/SF9 projection guards

Risk: High-Fidelity. Re-check grading applicability, blank/zero semantics, completeness/finality and historical snapshots before reuse.

### M02 Access/session/sync integrity
- teaching-assignment repository changes
- resume pointer/recovery primitives
- sync allowlist/routing additions

Risk: High-Fidelity. Reject UI-only authorization. Re-test account switch, reassignment, stale IDs and pending-work handover.

### M09 Scheduling / school planning
- scheduling engine
- schedule-plan repository/commands
- school-planning domain/repository/services
- teacher load / planner UI
- publication-related migrations

Risk: High-Fidelity. Preserve assignment ≠ draft schedule ≠ published schedule ≠ actual occurrence. Require an independent validity checker and atomic publication.

### M11 Reporting / review
- review workflow domain/repository/commands/UI
- attachments/evidence handling
- class summary / report-card/SF9 projection edits

Risk: High-Fidelity. Reconcile against current official-form evidence; never label generated output official without provenance.

### M12 TANAW exchange
- TANAW receipt migration/sample exchange concepts

Status: prototype/adapt only until authoritative indicator dictionary and Lock authority exist.

### M13 Recovery/resources
- attachments
- school resources / offerings
- backup command changes
- offline Windows configuration

Verify with migration/reopen and recovery scenarios before any readiness claim.

### M14 Android
- Android keystore plugin scaffold
- Android crypto adapter
- related Cargo/Gradle configuration

Status: reusable scaffold only. No release claim until actual Android Keystore + SQLCipher create/reopen, process death, upgrade, APK/AAB and device/emulator evidence pass.

## Unverified / stale evidence — do not carry forward as proof

- PR #103 handoff statements describing tests that belonged to lost/pruned working trees
- older counts such as 1,259 frontend tests unless re-run on the exact current CTOS source
- Rust cross-compilation or 16 KiB alignment as a substitute for usable Android build/device proof
- UI screenshots as evidence of current code behavior
- any local-only changes referenced in the old handoff but absent from the PR branch

## Salvage protocol

For each CTOS milestone:
1. Compare current CTOS source to the specific PR #103 files for that milestone.
2. Extract the smallest coherent candidate behavior.
3. Reject stale wiring or UI that conflicts with current main.
4. Port domain/service/storage pieces before presentation wiring when they carry the invariant.
5. Add/refresh deterministic tests.
6. Run focused validators, then applicable full gates.
7. Record exactly what was reused, adapted, replaced or rejected.
8. Never merge PR #103 wholesale.

## Initial decision

M00 itself salvages no production feature code from PR #103. It records the map and preserves useful handoff facts. Production salvage begins with M01 after a current-main academic-trust audit.
