# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-18

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

Current code, tests, migrations, PR state, and CI override stale prose.

## Current verified checkpoint

Current main: `f37412a70bf708e9296ab6de102e65377a3dff68` (PR #98).

PR #98 merged the TypeScript monthly Adviser Room application seam: narrow repository port, application validation, Tauri adapter, action-specific permission classification, unchanged export `FieldDisclosure`, and synthetic tests. Native Rust remains the authorization authority. Earlier official daily attendance remains separate from read-only Subject Attendance signals.

GJ-7 software recovery evidence from PR #90 remains valid. Real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows proof remain verification debt.

## Current slice

Branch: `feat/adviser-monthly-panel`.

Expose the merged monthly capability in My Advisory without weakening trusted boundaries:

- compose the monthly service only now that a real production consumer exists;
- derive preview/export year and month from the selected advisory date;
- load only for the currently selected authorized advisory section;
- invalidate stale monthly preview requests when section/month changes;
- render the school-day grid and per-learner Present/Absent/Tardy totals;
- keep Subject Attendance separate from official attendance;
- export only through the adviser-authorized monthly service;
- render the returned `FieldDisclosure` rather than reconstructing export claims;
- state explicitly that the CSV is SF2-inspired, not a submission-ready official SF2;
- synthetic UI tests only; no schema, sync, official-template, or native authorization changes.

After this panel is exact-head verified and merged, continue the documented Golden Journey with safe resume/recovery, then school-year lifecycle. Official-template work begins only with sufficient authoritative form/layout evidence.

## Continuation policy

Each run must inspect live main, open PRs, this handoff/plan, and exact-head CI. Maintain one canonical slice/PR. Merge only when Quality and independent Security are successful on the exact unchanged head, the PR is mergeable/not draft, and no real review blocker exists. Never weaken protections or gates.

When an issue occurs: **Issue → Workaround → Record**. Diagnose from evidence, apply the smallest safe workaround, verify it, record it durably, and consult the log before repeating investigation.

## Golden Journey

North Star: **LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.**

Completed through current main: class/learner context, class record/scoring, local-save truth, clean encrypted reopen recovery evidence, real advisory context, adviser-only official daily attendance, separate read-only Subject Attendance signals, trusted monthly preview, trusted SF2-inspired monthly export wrapper, TypeScript monthly application seam, and durable troubleshooting memory.

Current: visible context-aware monthly preview/export panel. Next: safe resume/recovery, then school-year lifecycle. Official-template work begins only with sufficient authoritative form/layout evidence.

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
