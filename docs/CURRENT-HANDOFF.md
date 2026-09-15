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

Current `main` at this handoff is `ab5957ccc90d25cfc24501392019ba01db8f9979`.

Latest merged product slice: PR #73, GJ-6 Assessment Creation Studio continuity.

- Exact PR #73 head `598cef071cbb52b0f3a1c59215ff69ad3c6e2a3d` passed authoritative Quality and Security before squash merge.
- The teacher can enter the real Class Record from preserved class context.
- Grading period and DepEd weighting remain explicit choices.
- Creation Studio uses the validated class record and returns to the same class, term, and weighting context.
- Assignment revalidation remains below UI.

Current `ClassRecordWorkspace` already computes term grades through `learnerScoreService.computeTermGrade`. It does not use UI formulas. Incomplete grades fail closed. A successful score correction refreshes the affected learner's computed term grade. The selected DepEd weighting is visibly disclosed.

Do not create a duplicate grade-calculation implementation. Grade-state work must improve continuity and clarity around trusted recomputation.

Recent harness decisions:

- PR #72 compacted this handoff.
- PR #68 removed duplicate feature-branch Quality runs.
- PR Quality is authoritative and Security remains independent.
- PR #55 remains selective-recovery source only; tracking issue #64.

## Active work

Branch: `feat/golden-journey-grade-state`

Purpose: identify the smallest safe grade-state continuity improvement after GJ-6 without duplicating the existing grade engine.

Guardrails:

- preserve validated class-record context;
- recompute only through `LearnerScoreApplicationService` and trusted domain logic;
- never cache or calculate an authoritative grade in navigation or UI state;
- retain explicit grading period and weighting disclosure;
- stale or unauthorized class context fails closed.

If grade-state continuity is already sufficiently covered, advance directly to explicit local-save and offline state.

## Exact next action

1. Inspect grade-state tests and the Creation Studio return path.
2. Identify the smallest user-visible continuity gap, if any.
3. Add a focused regression test first where practical.
4. Implement only bounded continuity behavior.
5. Do not change formulas, transmutation, grading policy, schema, or authorization.
6. Run one authoritative PR Quality workflow plus independent Security.
7. Merge only on exact-current-head green evidence.
8. Continue to explicit local-save and offline state on a fresh branch.

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

Current: grade-state continuity using existing trusted term-grade computation.

Next: explicit local-save and offline state, reconnect and sync continuation, then Adviser Room and form continuation according to release priority.

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
2. Inspect exact-head Quality and Security.
3. Fix only evidence-backed failures with the smallest reversible change.
4. Merge when the exact head is green and mergeable.
5. Start the next highest-value Golden Journey slice.
6. Stop only for a real product, policy, security, or external blocker.

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
