# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-17

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

This is a bounded current-state handoff. Current code, tests, migrations, PR state, and CI override stale prose.

## Current verified checkpoint

Current main: `69474fc341004dcfc6d791114f481daf0539b0fa` (PR #96).

PR #96 completed the trusted Adviser Room SF2-inspired monthly export boundary:

- `adviser_export_section_monthly_sf2` revalidates advisory authority at the same month-end trusted Rust boundary as monthly preview;
- active adviser or same-school School Head only;
- existing monthly attendance grid and SF2-inspired formatter are reused;
- existing `FieldDisclosure` remains truthful and unchanged;
- invalid months and non-advisers fail closed before export data is built;
- the export remains explicitly SF2-inspired, not a submission-ready official SF2.

Earlier Adviser Room daily attendance remains separate from Subject Attendance. Subject Attendance is read-only signal data and must never be converted into official attendance or SF2.

GJ-7 software recovery evidence remains valid from PR #90. Real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows proof remain verification debt.

## Current slice

Branch: `docs/issue-workaround-memory`.

Establish the owner-required **Issue → Workaround → Record** troubleshooting memory before the next functional slice. `docs/ISSUE-WORKAROUND-LOG.md` records concrete failure evidence, the smallest safe workaround, verification, and reuse conditions so recurring failures are not repeatedly rediscovered.

The first entry records PR #96's rustfmt-only native Quality failure and its verified formatter-only recovery. This documentation must never be used to bypass Quality, Security, branch protections, or hardware-only verification debt.

## Continuation policy

Each run must inspect live main, open PRs, current handoff/plan, and exact-head CI. Maintain one canonical slice/PR. Merge only when Quality and independent Security are successful on the exact unchanged head, the PR is mergeable/not draft, and no real review blocker exists. Never weaken protections or gates.

When an issue occurs: **Issue → Workaround → Record**. Diagnose from evidence, apply the smallest safe workaround, verify it, record it durably, and consult the log before repeating investigation.

Astra Max is preferred for substantial planning/review and may implement when available. If unavailable, continue through the available coding/review path rather than waiting.

## Golden Journey

North Star:

> LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.

Completed through current main:

- class context, learner context, class record/scoring, local-save truth, and clean encrypted reopen recovery evidence;
- My Advisory rooted in real `section_advisories` with stale-context failure closed;
- adviser-only official daily attendance writes using existing local persistence/sync transaction;
- separate read-only Subject Attendance signals;
- trusted month-end-authorized monthly attendance preview;
- trusted adviser-authorized truthful SF2-inspired monthly export wrapper.

Next after this documentation slice: connect the already-authorized monthly preview/export capability into the live Adviser Room as the smallest context-aware form/export journey, without treating `AdvisoryWorkContext` as authorization evidence. Preserve truthful SF2-inspired labeling and `FieldDisclosure`. Official-template work begins only with sufficient authoritative form/layout evidence.

## Locked constraints

Priority:

`privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`

Rules:

- SQLite is the device working database; offline writes save locally immediately.
- Sync is separate from local persistence.
- Authorization is enforced at trusted boundaries, never by UI hiding.
- School A must never access School B data.
- No real learner PII in development, tests, screenshots, fixtures, demos, or AI prompts.
- No paid infrastructure/API without explicit owner approval.
- `AdvisoryWorkContext` is navigation state only, never authorization evidence.
- Subject teaching-assignment authority and advisory authority remain separate.
- The existing monthly CSV is SF2-inspired, not submission-ready official SF2; preserve `FieldDisclosure` and do not overclaim fidelity.
- Official forms require authoritative template fidelity.

## Offline/sync truthfulness

- `Saved on this device` requires local persistence evidence.
- `Waiting to sync` requires durable queued-change evidence.
- `Synced` requires acknowledgment from the relevant school sync boundary.
- `Needs review` requires stored unresolved-conflict evidence.
- `Access changed` requires trusted authorization/scope evidence.
- Never infer sync state from connectivity alone.

## Durable references

Read only when relevant:

- `docs/ACTIVE-PLAN.md`
- `docs/ISSUE-WORKAROUND-LOG.md`
- `docs/VERIFICATION-DEBT.md`
- `docs/PROJECT-MEMORY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/adr/0009-sf2-export-and-official-form-engine.md`
- `docs/adr/0056-section-advisory-foundation.md`

Keep this handoff bounded and replace stale live-state text instead of appending transcript history.
