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

Current `main` at this handoff is `1ffc5e2223c467b6dfe0de212ce92036ba167f6b`.

Latest merged product slice: PR #75, explicit local-save status primitive.

- Exact PR #75 head `e8f86103c2976048ff5bacda737b0cf2078d0c9e` passed authoritative Quality and Security before squash merge.
- `LocalSaveStatus` now provides the evidence-bounded teacher-facing state `Saved on this device`.
- It deliberately does not claim `Synced` or `Waiting to sync` without sync-boundary evidence.
- GJ-6 remains intact: validated class context, explicit grading period and DepEd weighting, trusted grade computation, and assignment revalidation below UI.

Current `ClassRecordWorkspace` still renders the older ambiguous `Saved HH:MM` score-row note after a successful local write. The next bounded product step is to integrate the proven `LocalSaveStatus` component there without changing write ownership or academic logic.

Recent harness decisions:

- PR #75 established the reusable local-save vocabulary.
- PR #74 was the bounded handoff checkpoint after GJ-6.
- PR #68 removed duplicate feature-branch Quality runs.
- PR Quality is authoritative and Security remains independent.
- PR #55 remains selective-recovery source only; tracking issue #64.

## Active work

Branch: `feat/gj-local-save-class-record`

Purpose: replace the ambiguous Class Record score-row `Saved HH:MM` presentation with the proven `LocalSaveStatus` primitive after a successful local write.

Guardrails:

- local persistence evidence may claim only `Saved on this device`;
- do not invent `Waiting to sync`, `Synced`, `Needs review`, or `Access changed` without their owning boundary evidence;
- do not add cloud dependency to normal saves or duplicate sync logic;
- preserve `LearnerScoreApplicationService` write and grade-computation ownership;
- preserve explicit grading period and DepEd weighting;
- preserve assignment revalidation below UI;
- never move grade formulas into UI or navigation state.

## Exact next action

1. Add a focused Class Record regression test for the local-save wording where practical.
2. Import and render `LocalSaveStatus` from `ClassRecordWorkspace` using the row's proven `updatedAt` after successful persistence.
3. Remove only the now-redundant local `formatSavedTime` helper and ambiguous `Saved HH:MM` rendering.
4. Do not change score-write, grade-computation, sync, schema, authorization, or cloud behavior.
5. Run one authoritative PR Quality workflow plus independent Security.
6. Fix only evidence-backed failures.
7. Merge only on exact-current-head green evidence.
8. Continue to the next offline/reconnect state only where its evidence boundary is proven.

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

Current: integrate explicit local-save state into Class Record score rows.

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

1. Keep the LIKHA continuation schedule targeted to one canonical PR.
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
