# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-18

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

Current code, tests, migrations, PR state, and CI override stale prose.

## Current verified checkpoint

Current main: `ac05aff81f91ad27dd7fd0ee26f2c91c949cc449` (PR #97).

PR #96 completed the trusted Adviser Room SF2-inspired monthly export boundary. PR #97 established durable **Issue → Workaround → Record** troubleshooting memory. Earlier Adviser Room daily attendance remains separate from Subject Attendance; Subject Attendance is read-only signal data and must never become official attendance or SF2.

GJ-7 software recovery evidence from PR #90 remains valid. Real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows proof remain verification debt.

## Current slice

Branch: `feat/adviser-monthly-ui` (PR #98).

Build the smallest TypeScript seam needed to expose the already-authorized monthly preview/export capability in My Advisory without weakening the trusted Rust boundary:

- add a narrow monthly adviser repository port and application service;
- validate section/year/month for teacher feedback before IPC, while native Rust remains authoritative;
- add a Tauri adapter for `adviser_monthly_attendance_summary` and `adviser_export_section_monthly_sf2`;
- do not pre-compose/export the monthly service until the visible My Advisory slice introduces its first production consumer, preserving the dead-code contract;
- classify those adviser-authorized commands as action-specific permission boundaries so an unrelated-teacher denial does not masquerade as global session expiry;
- preserve the export's returned `FieldDisclosure` unchanged;
- synthetic application/adapter tests only in this slice;
- no schema, sync, official-template, daily-attendance, or Subject Attendance changes.

After this seam is exact-head verified and merged, the next bounded slice is the visible My Advisory monthly preview/export panel. That slice should compose the monthly service centrally when the first real runtime consumer is added.

## Continuation policy

Each run must inspect live main, open PRs, this handoff/plan, and exact-head CI. Maintain one canonical slice/PR. Merge only when Quality and independent Security are successful on the exact unchanged head, the PR is mergeable/not draft, and no real review blocker exists. Never weaken protections or gates.

When an issue occurs: **Issue → Workaround → Record**. Diagnose from evidence, apply the smallest safe workaround, verify it, record it durably, and consult the log before repeating investigation.

## Golden Journey

North Star: **LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.**

Completed through current main: class/learner context, class record/scoring, local-save truth, clean encrypted reopen recovery evidence, real advisory context, adviser-only official daily attendance, separate read-only Subject Attendance signals, trusted monthly preview, trusted SF2-inspired monthly export wrapper, and durable troubleshooting memory.

Current: TypeScript monthly Adviser Room application seam. Next: visible context-aware monthly preview/export panel. Then continue safe resume/recovery and school-year lifecycle. Official-template work begins only with sufficient authoritative form/layout evidence.

## Locked constraints

Priority: `privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`.

- SQLite is the device working database; offline writes save locally immediately; sync is separate.
- Authorization is enforced at trusted boundaries, never by UI hiding.
- School A must never access School B data.
- No real learner PII in development/tests/screenshots/fixtures/demos/AI prompts.
- No paid infrastructure/API without explicit owner approval.
- `AdvisoryWorkContext` is navigation state only, never authorization evidence.
- Subject teaching-assignment authority and advisory authority remain separate.
- Monthly CSV remains SF2-inspired, not submission-ready official SF2; preserve `FieldDisclosure`.
- Official forms require authoritative template fidelity.

## Offline/sync truthfulness

`Saved on this device` requires local persistence evidence; `Waiting to sync` requires durable queued-change evidence; `Synced` requires acknowledgment from the relevant school sync boundary; `Needs review` requires stored unresolved-conflict evidence; `Access changed` requires trusted authorization/scope evidence. Never infer sync state from connectivity alone.

## Durable references

- `docs/ACTIVE-PLAN.md`
- `docs/ISSUE-WORKAROUND-LOG.md`
- `docs/VERIFICATION-DEBT.md`
- `docs/PROJECT-MEMORY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/adr/0009-sf2-export-and-official-form-engine.md`
- `docs/adr/0056-section-advisory-foundation.md`
