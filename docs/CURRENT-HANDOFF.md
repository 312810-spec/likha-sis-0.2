# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-15

Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

This is a bounded current-state handoff, not a transcript. Historical detail belongs in ADRs, product/research docs, Git history, and `docs/PROJECT-MEMORY.md`.

## Authority order

1. Inspect current `main`, open PRs, and branch state.
2. Read `HARNESS.md` / `AGENTS.md` when relevant.
3. Read this file and `docs/ACTIVE-PLAN.md`.
4. Read project memory, source registry, and relevant ADRs only as needed.
5. Current code, migrations, tests, and CI evidence override stale prose.

## Current verified checkpoint

Current `main`: `14072f9a213853666d1fb8d4f4d90fec9b37c1f8`.

Latest merged product slice: **PR #76 — Class Record local-save integration seam**.

- PR #75 established reusable `LocalSaveStatus` with the evidence-bounded teacher-facing state **Saved on this device**.
- PR #76 added `ClassRecordLocalSaveStatus`, which shows that state only when a durable local-write timestamp exists and suppresses it while saving or after an error.
- Neither component claims `Waiting to sync` or `Synced` without sync-boundary evidence.
- GJ-6 remains intact: validated class context, explicit grading period and DepEd weighting, trusted grade computation, Creation Studio continuity, and assignment revalidation below UI.

## Active work

Branch: `feat/gj-class-record-local-save-ui`

Purpose: complete the bounded Class Record UI integration by replacing ambiguous score-row `Saved HH:MM` text with the proven local-save adapter.

Implemented on this branch:

- focused synthetic regression coverage for a successful score write;
- `ClassRecordWorkspace` now renders `ClassRecordLocalSaveStatus` from the persisted row `updatedAt` evidence;
- the status is suppressed while saving and when a row error exists;
- legacy `formatSavedTime` / `Saved HH:MM` presentation is removed;
- no score-write, grade-computation, sync, schema, authorization, cloud, or academic-policy behavior changes.

Guardrails:

- local persistence evidence may claim only **Saved on this device**;
- do not invent `Waiting to sync`, `Synced`, `Needs review`, or `Access changed` without their owning boundary evidence;
- sync stays separate from normal local saves;
- preserve `LearnerScoreApplicationService` write and grade-computation ownership;
- preserve explicit grading period and DepEd weighting;
- preserve assignment revalidation below UI;
- never move grade formulas into UI or navigation state.

## Exact next action

1. Open one canonical PR for `feat/gj-class-record-local-save-ui`.
2. Immediately retarget the LIKHA continuation schedule to that PR and exact head.
3. Run one authoritative PR Quality workflow plus independent Security.
4. Fix only evidence-backed failures with the smallest reversible change.
5. Merge only on exact-current-head green evidence.
6. After merge, inspect `docs/product/OFFLINE-CONTRACT.md` and the existing sync subsystem for the first reconnect/sync state whose evidence boundary is already proven.
7. Do not infer sync state merely from connectivity or successful local persistence.

## Golden Journey

North Star:

> LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.

Target journey:

`Sign in → Today → class → attendance → learner → class record/assessment → grade state → offline save → reconnect → Adviser Room → appropriate form → return tomorrow and continue.`

Completed:

- GJ-1/2: Today/My Day opens a class and preserves bounded class context.
- GJ-3/4: Subject Attendance preserves and revalidates class context.
- GJ-5: learner context uses assignment-owned access, not raw section authorization.
- GJ-6a: Class Record and scoring open with explicit term and weighting.
- GJ-6b: Creation Studio opens from the validated class record and returns to the same context.
- Grade-state continuity: trusted computation stays current after successful score correction.
- Offline-save primitive and Class Record adapter: local persistence is represented truthfully as **Saved on this device**.

Current: surface that proven save state in actual Class Record score rows.

Next: evidence-backed reconnect/sync continuation, then Adviser Room and form continuation according to release priority.

Do not jump to unrelated backlog work unless a verified P0/P1 security, data-loss, grading-correctness, or compliance defect interrupts.

## Locked constraints

Priority:

`privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`

Architecture:

`UI → Application Services → Domain → Repository Ports → Local DB/Platform Adapters → SyncProvider → Cloud`

Rules:

- SQLite is the device working database; offline writes save locally immediately.
- Sync is separate from local persistence.
- UI and domain must not directly depend on cloud providers.
- Authorization is enforced at a trusted boundary, never by UI hiding.
- School A must never access School B data.
- No real learner PII in development, tests, screenshots, fixtures, demos, or AI prompts.
- No paid infrastructure/API without explicit owner approval.
- Official forms preserve authoritative template fidelity.

## Academic correctness guardrails

- grading period/term stays explicit unless a verified domain rule makes it unambiguous;
- grading weighting stays explicit and policy-driven;
- never infer weighting from subject name;
- grade formulas remain in domain/application/repository logic;
- stale or unauthorized class context fails closed;
- `TeacherClassWorkContext` is navigation state only, never an authorization source;
- after any transition that can change assessment inputs, do not present an old computed grade as current without trusted recomputation.

Known correctness debt: Grade 12 SY 2026–2027 transmutation has prior research suggesting a hybrid legacy-weight/new-transmutation rule. Treat it as unresolved until verified against sufficiently authoritative evidence and the current code path.

## CI and autonomous loop

For ordinary feature work:

- feature branch push: no duplicate Quality run;
- PR: one authoritative affected-work Quality workflow;
- Security: independent and fail-closed;
- merge only on exact-current-head evidence.

After opening a PR:

1. keep the LIKHA continuation schedule targeted to one canonical PR;
2. schedule the next exact-head check about 15 minutes after a new PR/head;
3. inspect exact-head Quality and Security;
4. fix only evidence-backed failures;
5. merge when the exact head is green and mergeable;
6. start the next highest-value Golden Journey slice;
7. stop only for a real product/policy/security decision or external blocker.

Do not create competing implementations. If another agent opens overlapping work, compare them, select one canonical path, preserve useful ideas, and supersede the duplicate.

## Durable references

Read only when relevant:

- `docs/ACTIVE-PLAN.md`
- `docs/PROJECT-MEMORY.md`
- `docs/SOURCE-REGISTRY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/product/OFFLINE-CONTRACT.md`
- `docs/adr/0059-golden-journey-work-context.md`
- `docs/adr/0060-golden-journey-app-class-context.md`
- `docs/adr/0070-golden-journey-class-learner-context.md`
- `docs/adr/0071-golden-journey-class-record-context.md`

## Maintenance rule

Keep this file under roughly 250 lines. Replace stale live-state text instead of appending history. Move durable decisions to ADR/project memory, and research to source-registry/research docs.
