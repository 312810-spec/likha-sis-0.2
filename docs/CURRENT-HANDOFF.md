# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-17

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

This is a bounded current-state handoff. Current code, tests, migrations, PR state, and CI override stale prose.

## Current verified checkpoint

Current main: `7f1442c28f718451d577b9a1bc220d3b82f73bd9` (PR #95).

PR #95 completed the trusted Adviser Room monthly-attendance preview boundary:

- `adviser_monthly_attendance_summary` revalidates advisory authority in native Rust;
- authorization is evaluated on the last calendar day of the requested month;
- active adviser or same-school School Head may read the existing monthly attendance grid;
- invalid months fail closed;
- the preview is explicitly not an official SF2 form.

Earlier Adviser Room daily attendance remains separate from Subject Attendance. Subject Attendance is read-only signal data and must never be converted into official attendance or SF2.

GJ-7 software recovery evidence remains valid from PR #90. Real process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows proof remain verification debt.

## Current slice

Branch: `feat/adviser-sf2-export-authorization`.

Add the smallest trusted Adviser Room wrapper around the existing SF2-inspired monthly CSV export.

Implementation scope:

- add `adviser_export_section_monthly_sf2`;
- use the same month-end `auth::authorize_adviser_of_section` boundary as the monthly preview;
- reuse the existing monthly attendance repository grid and `export::sf2::build_sf2_export` formatter;
- preserve the formatter's existing `FieldDisclosure` unchanged;
- return the disclosure with the generated file path;
- invalid month and non-adviser calls fail closed before export data is built;
- keep the output explicitly **SF2-inspired**, not submission-ready official SF2;
- synthetic tests only;
- no schema, sync, daily attendance, Subject Attendance, or official-template changes.

Tests added in the command module prove an active adviser can build the existing truthful export, a non-adviser cannot, and an invalid month fails closed. Existing monthly-preview tests remain in place.

## Continuation policy

The owner now wants hourly continuation because merge-event-only continuation did not reliably advance work without manual notice.

Each run must inspect live main, open PRs, current handoff/plan, and exact-head CI. Maintain one canonical slice/PR. Merge only when Quality and independent Security are successful on the exact unchanged head, the PR is mergeable/not draft, and no real review blocker exists. Never weaken protections or gates.

Astra Max is preferred for substantial planning/review and may implement when available. If unavailable, continue through the available coding/review path rather than waiting.

## Golden Journey

North Star:

> LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.

Completed through current main:

- class context, learner context, class record/scoring, local-save truth, and clean encrypted reopen recovery evidence;
- My Advisory rooted in real `section_advisories` with stale-context failure closed;
- adviser-only official daily attendance writes using existing local persistence/sync transaction;
- separate read-only Subject Attendance signals;
- trusted month-end-authorized monthly attendance preview.

Current: adviser-authorized truthful SF2-inspired export wrapper.

Next: after exact-head verification and merge, inspect live Adviser Room journey and choose the next smallest high-value slice. Official-template work begins only with sufficient authoritative form/layout evidence.

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
- `docs/VERIFICATION-DEBT.md`
- `docs/PROJECT-MEMORY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/adr/0009-sf2-export-and-official-form-engine.md`
- `docs/adr/0056-section-advisory-foundation.md`

Keep this handoff bounded and replace stale live-state text instead of appending transcript history.
