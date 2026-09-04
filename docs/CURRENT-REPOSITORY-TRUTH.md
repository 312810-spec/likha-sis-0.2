# LIKHA-SIS Current Repository Truth

Status: authoritative snapshot for non-Claude-Code-owned work

Snapshot date: 2026-09-04

Baseline: `origin/main` at `d8ef0f5`

## How to use this snapshot

This file answers only what is present on the baseline commit. Historical
entries in `ACTIVE-PLAN.md`, `CURRENT-HANDOFF.md`, and `PROJECT-MEMORY.md`
remain useful evidence, but their older “next,” “not built,” and “commit/PR
owed” statements are not current status.

Before relying on this snapshot after `main` advances, compare the current
commit with the baseline above and refresh this file from repository evidence.
Do not silently carry its claims forward.

## Ownership boundary for this slice

This reconciliation deliberately excludes work currently owned by Claude
Code:

- SF1, SF9, and SF10 template acquisition, fidelity, generation, and related
  form-format decisions;
- the `claude/wave5-adr-0067-local-host-sync` receiver branch and all follow-on
  sync transport, conflict, status, and device-ceremony implementation;
- historical files or implementation files changed by those workstreams.

Their status must be reconciled only after the corresponding CC branch lands.
Nothing in this document claims that those branches are merged.

## Present on `main`

| Area                   | Repository evidence at `d8ef0f5`                                                                                                                     | Current classification                                                                                                      |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| Teacher Load           | Domain/application/repository support plus `TeacherLoadScreen`, School Head colleague view, assignments, and schedule-meeting foundations            | Built foundation and UI; constraint-driven generation, relief workflow, and complete personnel/SF7 chain remain future work |
| Subject Attendance     | Rust commands/repository, TypeScript port/service/adapter, `SubjectAttendanceScreen`, Today’s Classes integration, Subject Monitor, and Adviser View | Built foundation and UI; intentionally separate from official SF2 attendance                                                |
| SF4                    | Export module and UI trigger exist                                                                                                                   | Built derived CSV foundation; authoritative-template fidelity is a separate evidence question                               |
| SF5                    | Export module and section-roster UI trigger exist                                                                                                    | Built derived CSV foundation; not proof of official-template fidelity                                                       |
| SF6                    | Export module and sections-screen UI trigger exist                                                                                                   | Built derived CSV foundation; not proof of official-template fidelity                                                       |
| UI redesign            | Waves 1–6, independent architecture/teacher-UX/accessibility reviews, and follow-up fixes are merged                                                 | Built; native NVDA/Narrator and packaged-binary accessibility verification remain open                                      |
| Tenant isolation       | Learner-membership hardening and repo-wide joined-table audit are merged                                                                             | Source review and regression coverage complete; release hardware/security verification remains open                         |
| Sync client foundation | `SyncProvider` contract, local transactional outbox, and device credential enrollment/revocation foundation are on `main`                            | Foundation only; not end-to-end sync and not production-ready                                                               |

## Not present on `main`

The following must not be described as shipped at this baseline:

- a listening school-laptop hub service;
- LAN or Tailscale transport;
- production push/pull integration for ordinary domain writes;
- sync payload-key lifecycle and recovery ceremony;
- teacher/admin conflict-resolution workflow;
- honest end-user sync status and recovery UI;
- Windows installer, migration, DPAPI/SQLCipher, copied-database, backup/restore,
  and device-loss release certification;
- native NVDA/Narrator certification.

The remote commit `3c83b76` contains a hub receiver foundation, but it is not
an ancestor of this snapshot. A remote branch is not evidence that a feature
is present on `main`.

## Verification truth

The repo-wide audit at this baseline recorded:

- TypeScript type-check: passed;
- ESLint: passed;
- Prettier: passed;
- architecture boundary check: passed;
- Vitest: 92 files and 965 tests passed;
- unresolved merge-marker scan: clear;
- production `todo!()` / `unimplemented!()` scan: clear.

The same audit did not rerun Rust, Playwright, Windows-native, installer,
hardware-security, backup/restore, or screen-reader gates. Prior green runs are
historical evidence, not a substitute for a release-candidate rerun.

## Safe planning rule

When a plan conflicts with this snapshot, prefer direct repository evidence
at the current commit. Classify work as one of:

1. present on `main`;
2. present only on an explicitly named unmerged branch;
3. documented but not implemented;
4. blocked on evidence, hardware, governance, or owner approval.

Never collapse categories 1 and 2, and never describe category 3 as shipped.
