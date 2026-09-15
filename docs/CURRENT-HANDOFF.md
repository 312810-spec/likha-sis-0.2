# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-15

Canonical repository: `312810-spec/likha-sis-0.2`

Canonical development version: **LIKHA-SIS 0.2**

This is a bounded current-state handoff, not a transcript. Historical detail belongs in ADRs, product and research docs, Git history, and `docs/PROJECT-MEMORY.md`.

## Authority order

1. Inspect current `main`, open PRs, and branch state.
2. Read `HARNESS.md` and `AGENTS.md` when relevant.
3. Read this file and `docs/ACTIVE-PLAN.md`.
4. Read project memory, source registry, and ADRs only as needed.
5. Current code, migrations, tests, and CI evidence override stale prose.

## Current verified checkpoint

Current `main` before PR #77 is `14072f9a213853666d1fb8d4f4d90fec9b37c1f8`.

Latest merged product slices:

- PR #75 established the evidence-bounded `Saved on this device` vocabulary.
- PR #76 added the Class Record local-save adapter seam and focused adapter tests.

Canonical open PR: #77 — `feat(offline): show truthful save state in Class Record`.

Current PR #77 exact head: `be3016f6c06341f3fb0b4aa7cec821ca875eb661`.

PR #77 integrates `ClassRecordLocalSaveStatus` into actual Class Record score rows after a successful persisted write. It replaces the ambiguous `Saved HH:MM` note and still deliberately does not claim `Synced`, `Waiting to sync`, `Needs review`, or `Access changed` without owning-boundary evidence.

The repeatedly failing standalone integration-test file was removed as redundant after three exact-head Quality runs showed only Prettier disagreement. Coverage remains split across:

- existing `ClassRecordWorkspace.test.tsx` score-save path tests; and
- already-merged `ClassRecordLocalSaveStatus.test.tsx` truthfulness tests.

No product, sync, authorization, grading, schema, or cloud behavior was weakened to work around the formatter issue.

## Active work

Branch: `feat/gj-class-record-local-save-ui`

Purpose: finish PR #77 and merge only after the exact current head passes authoritative Quality and independent Security.

Guardrails:

- local persistence evidence may claim only `Saved on this device`;
- do not invent `Waiting to sync`, `Synced`, `Needs review`, or `Access changed` without their owning boundary evidence;
- do not add cloud dependency to normal saves or duplicate sync logic;
- preserve `LearnerScoreApplicationService` write and grade-computation ownership;
- preserve explicit grading period and DepEd weighting;
- preserve assignment revalidation below UI;
- never move grade formulas into UI or navigation state.

## Exact next action

1. Recheck PR #77 exact head `be3016f6c06341f3fb0b4aa7cec821ca875eb661` Quality and Security.
2. If both are green and the head is unchanged/mergeable, squash-merge #77.
3. If Quality fails, inspect the exact failing job/log and fix only evidence-backed issues.
4. After merge, inspect `docs/product/OFFLINE-CONTRACT.md` and existing sync subsystem for the first reconnect/sync state with a proven owning boundary.
5. Create one fresh canonical PR for that next Golden Journey slice and schedule its exact-head check about 15 minutes later.

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
- Grade-state continuity: existing trusted computation remains current after successful score correction.
- Offline-save primitive: `LocalSaveStatus` truthfully identifies a locally committed write.
- Class Record adapter: reusable save-state presentation is covered independently and wired by PR #77.

Current: finish exact-head verification and merge of the Class Record local-save UI integration.

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
- No paid infrastructure or API without explicit owner approval.
- Official forms preserve authoritative template fidelity.

## Academic correctness guardrails

- grading period and term stay explicit unless a verified domain rule makes them unambiguous;
- grading weighting stays explicit and policy-driven;
- never infer weighting from subject name;
- grade formulas remain in domain, application, or repository logic;
- stale or unauthorized class context fails closed;
- `TeacherClassWorkContext` is navigation state only, never an authorization source;
- after a transition that may change assessment inputs, do not present an old computed grade as current without trusted recomputation.

Known correctness debt: Grade 12 SY 2026–2027 transmutation has prior research suggesting a hybrid legacy-weight/new-transmutation rule. Treat it as unresolved until verified against sufficiently authoritative evidence and the current code path.

## CI and autonomous loop

For ordinary feature work:

- feature branch push: no duplicate Quality run;
- PR: one authoritative affected-work Quality workflow;
- Security: independent and fail-closed;
- merge only on exact-current-head evidence.

After opening a PR:

1. Keep one canonical continuation schedule targeted to that PR.
2. Schedule the next exact-head check about 15 minutes after a new PR/head rather than condition monitoring.
3. Inspect exact-head Quality and Security.
4. Fix only evidence-backed failures with the smallest reversible change.
5. Merge when the exact head is green and mergeable.
6. Start the next highest-value Golden Journey slice.
7. Stop only for a real product, policy, security, or external blocker.

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

Keep this file under roughly 250 lines. Replace stale live-state text instead of appending history. Move durable decisions to ADR or project memory, and research to source-registry or research docs.
