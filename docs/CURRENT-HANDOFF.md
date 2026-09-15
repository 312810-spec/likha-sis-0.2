# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-15
Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

This is a bounded current-state handoff, not a transcript. Historical detail belongs in ADRs, product/research docs, Git history, and `docs/PROJECT-MEMORY.md`.

## 1. Authority order

1. Inspect current `main`, open PRs, and branch state.
2. Read `HARNESS.md` / `AGENTS.md` when relevant.
3. Read this file and `docs/ACTIVE-PLAN.md`.
4. Read project memory, source registry, and ADRs only as needed.
5. Current code, migrations, tests, and CI evidence override stale prose.

## 2. Current verified checkpoint

Current `main` at this handoff:

`ab5957ccc90d25cfc24501392019ba01db8f9979`

Latest merged product slice:

- PR #73 — GJ-6 Assessment Creation Studio continuity.
- Exact PR #73 head `598cef071cbb52b0f3a1c59215ff69ad3c6e2a3d` passed authoritative Quality and Security before squash merge.
- The teacher can enter the real Class Record from preserved class context, explicitly choose grading period and DepEd weighting, open Creation Studio for that validated class record, and return to the same class/term/weighting context.
- No new authorization path was introduced; assignment revalidation remains below UI.

Also verified on current `main`:

- `ClassRecordWorkspace` already computes term grades through `learnerScoreService.computeTermGrade`, not UI formulas.
- Term grades are deliberately on-demand and incomplete grades fail closed as unavailable.
- Once term grades are shown, a successful score correction refreshes only that learner's computed term grade.
- The selected DepEd weighting is visibly disclosed with the computed grade state.

Therefore do **not** create a duplicate grade-calculation implementation. The next grade-state work must improve continuity/clarity around the existing trusted computation rather than moving formulas into UI.

Recent harness/project decisions:

- PR #72 compacted this handoff.
- PR #68 removed duplicate feature-branch Quality runs; PR Quality is authoritative and Security remains independent.
- PR #55 remains selective-recovery source only; tracking issue #64.

## 3. Active work

Branch: `feat/golden-journey-grade-state`

Purpose: scope the smallest safe **grade-state continuity** slice after GJ-6 without duplicating the existing grade engine.

Preferred bounded direction:

- preserve the validated class-record context;
- make transitions that remount/refetch the Class Record explicit to the teacher so a previously displayed computed grade is never mistaken for a still-current cached value;
- recompute only through `LearnerScoreApplicationService` / trusted domain logic;
- never cache or calculate an authoritative grade in navigation/UI state;
- retain explicit grading period and weighting disclosure.

If repository inspection shows this continuity is already sufficiently covered, advance directly to the next Golden Journey slice: explicit local-save/offline state.

## 4. Exact next action

1. Inspect current grade-state tests and the Creation Studio return path.
2. Identify the smallest user-visible continuity gap, if any.
3. Add a focused regression test first where practical.
4. Implement only the bounded continuity behavior; do not change formulas, transmutation, grading policy, schema, or authorization.
5. Run one authoritative PR Quality workflow plus independent Security.
6. Merge only on exact-current-head green evidence.
7. Then continue to explicit local-save/offline state on a fresh branch.

## 5. Golden Journey

North Star:

> LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.

Target journey:

`Sign in → Today → class → attendance → learner → class record/assessment → grade state → offline save → reconnect → Adviser Room → appropriate form → return tomorrow and continue.`

Completed:

- GJ-1/2: Today/My Day opens a class and preserves bounded class context.
- GJ-3/4: Subject Attendance preserves/revalidates class context.
- GJ-5: learner context uses assignment-owned access, not raw section authorization.
- GJ-6a: Class Record/scoring opens with explicit term + weighting.
- GJ-6b: Creation Studio opens from the validated class record and returns to the same context.

Current:

- grade-state continuity using the existing trusted term-grade computation.

Next:

- explicit local-save/offline state;
- reconnect/sync continuation;
- Adviser Room/form continuation according to release priority.

Do not jump to unrelated backlog work unless a verified P0/P1 security, data-loss, grading-correctness, or compliance defect interrupts.

## 6. Locked constraints

Priority:

`privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`

Architecture:

`UI → Application Services → Domain → Repository Ports → Local DB/Platform Adapters → SyncProvider → Cloud`

Rules:

- SQLite is the device working database; offline writes save locally immediately.
- Sync is separate from local persistence.
- UI/domain must not directly depend on cloud providers.
- Authorization is enforced at a trusted boundary, never by UI hiding.
- School A must never access School B data.
- No real learner PII in development, tests, screenshots, fixtures, demos, or AI prompts.
- No paid infrastructure/API without explicit owner approval.
- Official forms preserve authoritative template fidelity.

## 7. Academic correctness guardrails

- grading period/term stays explicit unless a verified domain rule makes it unambiguous;
- grading weighting stays explicit and policy-driven;
- never infer weighting from subject name;
- grade formulas remain in domain/application/repository logic, never duplicated in UI;
- stale or unauthorized class context fails closed;
- `TeacherClassWorkContext` is navigation state only, never an authorization source;
- after a transition that may change assessment inputs, do not present an old computed grade as current without trusted recomputation.

Known correctness debt: Grade 12 SY 2026–2027 transmutation has prior research suggesting a hybrid legacy-weight/new-transmutation rule. Treat as unresolved until verified against sufficiently authoritative evidence and the current code path.

## 8. CI / autonomous loop

For ordinary feature work:

- feature branch push: no duplicate Quality run;
- PR: one authoritative affected-work Quality workflow;
- Security: independent and fail-closed;
- merge only on exact-current-head evidence.

After opening a PR:

1. keep the LIKHA continuation schedule targeted to the one canonical PR;
2. inspect exact-head Quality + Security;
3. fix only evidence-backed failures with the smallest reversible change;
4. merge when exact head is green and mergeable;
5. start the next highest-value Golden Journey slice;
6. stop only for a real product/policy/security decision or external blocker.

Do not create competing implementations. If another agent opens overlapping work, compare, select one canonical path, preserve useful ideas, and supersede the duplicate.

## 9. Durable references

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

## 10. Maintenance rule

Keep this file under roughly 250 lines. Replace stale live-state text instead of appending history; move durable decisions to ADR/project memory and research to source-registry/research docs.