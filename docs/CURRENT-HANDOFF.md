# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-15
Canonical repository: `312810-spec/likha-sis-0.2`
Canonical development version: **LIKHA-SIS 0.2**

This file is intentionally compact. It is a current-state handoff, not a transcript.
Historical implementation detail belongs in ADRs, product/research docs, Git history, and `docs/PROJECT-MEMORY.md`.

## 1. Authority order for every fresh session

1. Inspect current repository `main`, open PRs, and working branch state.
2. Read `HARNESS.md` / `AGENTS.md` if present and relevant.
3. Read this file.
4. Read `docs/ACTIVE-PLAN.md`.
5. Read `docs/PROJECT-MEMORY.md` only for durable facts needed by the task.
6. Read `docs/SOURCE-REGISTRY.md` and relevant ADRs only when the task needs them.
7. Code, migrations, tests, and current CI evidence override stale prose.

Do not restart completed milestones because an older document mentions them.
Do not infer that a test passed in the current session merely because a handoff says it passed previously.

## 2. Current verified repository checkpoint

Current `main` at this handoff:

`18560051d51e7e68f944c10d3c1447bcb76b036c`

Latest merged product slice:

- PR #71 — class-context entry into the real Class Record workspace.
- The reconciled implementation requires the teacher to explicitly choose the grading period/term and DepEd grading weighting before the class record is opened.
- Golden Journey now supports:
  `Today → Class Workspace → Subject Attendance → learner context → Class Record/scoring → return to exact class`.

Recent project/harness decisions already merged:

- PR #72 — `docs/CURRENT-HANDOFF.md` compacted from transcript scale into this bounded live-state handoff.
- PR #68 — feature branches no longer duplicate Quality Gate on push; the PR is the authoritative Quality run. Security remains independent.
- PR #66 — school logo bytes are validated against PNG/JPEG/WebP signatures at the trusted boundary.
- PR #65 — PR #55 mega-branch retired as a merge candidate; selective recovery only.

Superseded work:

- PR #70 is closed without merge. Its broader GJ-6 implementation was superseded by the smaller reconciled #71 path.

## 3. Active work right now

Canonical active product PR:

- **PR #73 — `feat(ux): continue Golden Journey into Creation Studio`**
- Branch: `feat/golden-journey-assessment-authoring`
- Purpose: continue GJ-6 from the already-opened class record into the existing Assessment Creation Studio and back without losing class/term/weighting context.
- Reuses the already-validated `classRecordId`; no new authorization path is introduced.
- Returning from Creation Studio remounts the existing Class Record workspace so newly-authored assessment items can be refreshed.
- Do not merge until the exact current head has a green authoritative Quality run and green Security run.

## 4. Exact next action

Continue PR #73.

1. Inspect the exact current PR head and its Quality/Security checks.
2. Fix only evidence-backed failures with the smallest reversible change.
3. Preserve explicit grading period/term selection.
4. Preserve explicit DepEd grading weighting selection; never infer from subject name.
5. Preserve assignment revalidation below UI before class-record access.
6. Keep Creation Studio scoped to the validated `classRecordId`.
7. Run one authoritative PR Quality workflow plus independent Security.
8. If both are green and the exact head is mergeable, squash-merge #73.
9. After merge, refresh this handoff and continue the Golden Journey on a fresh branch.

Likely next slice after #73: **grade-state continuity inside the preserved class context**, unless a verified P0/P1 security, data-loss, grading-correctness, or compliance defect interrupts.

## 5. Golden Journey product spine

North Star:

> LIKHA should feel like a calm digital teacher’s desk that already knows what work belongs here.

Product thesis:

> LIKHA is not an SIS with teacher features. It is the teacher’s operating workspace for school work, backed by a secure SIS.

Target journey:

`Sign in → Today → class → attendance → learner → class record/assessment → grade state → offline save → reconnect → Adviser Room → appropriate form → return tomorrow and continue.`

Completed journey slices:

- GJ-1/2: Today/My Day can open a class once and preserve bounded class context.
- GJ-3/4: class context survives Subject Attendance and is revalidated before return.
- GJ-5: learner context uses the assignment-owned Subject Attendance monitor path and does not broaden access through a raw section id.
- GJ-6a: Class Record/scoring opens from preserved class context with explicit term + weighting selection.

Current:

- GJ-6b: Assessment Creation Studio continuity from the validated class record.

Likely next:

- grade-state continuity;
- explicit local-save/offline state;
- reconnect/sync continuation;
- then Adviser Room/form continuation according to release priority.

Do not jump to unrelated backlog features unless a verified P0/P1 security, data-loss, grading-correctness, or compliance defect interrupts the journey.

## 6. Locked product and architecture constraints

Priority order:

`privacy/security > correctness > DepEd compliance > teacher usability > offline reliability > maintainability > zero billing > performance > speed`

Architecture:

`UI → Application Services → Domain → Repository Ports → Local DB/Platform Adapters → SyncProvider → Cloud`

Rules:

- SQLite is the device working database.
- Offline writes save locally immediately.
- Sync is a separate subsystem.
- UI/domain must not directly depend on cloud providers.
- Provider/native implementations remain replaceable.
- Authorization must be enforced at a trusted boundary, not by UI hiding.
- School A must never access School B data.
- No real learner PII in development, tests, screenshots, fixtures, demos, or AI prompts.
- No paid infrastructure/API without explicit owner approval.
- Official forms must preserve authoritative template fidelity.
- Preferred Windows official-form path remains Tauri → scoped local sidecar → Java → Apache POI/HSSF → official `.xls` template.

## 7. Teacher experience constraints

Major workflows support Efficient, Comfortable (default), and Guided with functional parity.
Never infer mode from age, role, years of service, or device.

Design from the teacher’s job:

- reduce repeated selection and typing;
- preserve class context across connected work;
- avoid unnecessary dialogs/navigation;
- Windows should feel like desktop productivity software;
- Android should be intentionally mobile, not a shrunken desktop UI.

## 8. Academic correctness guardrails

For Class Records / grading:

- grading period/term is explicit unless a future verified domain rule defines a safe unambiguous current period;
- grading weighting is explicit and policy-driven;
- never infer weighting from subject name;
- grade formulas remain in domain/application/repository logic, never duplicated in UI;
- stale or unauthorized class context fails closed;
- `TeacherClassWorkContext` is navigation state only and never an authorization source.

Known correctness debt that may interrupt feature work if independently re-verified:

- Grade 12 SY 2026–2027 transmutation behavior has prior research suggesting a hybrid rule: legacy component weights with the newer DO 015 transmutation table. Treat this as unresolved until verified against a sufficiently authoritative source and current code path.

## 9. PR #55 selective-recovery rule

PR #55 is archived source, not a merge source. Tracking issue: #64.
Recover only small current-main-compatible slices after verifying the need still exists. Current `main` wins.

Priority recovery classes:

- P0: trusted-boundary authorization/security defects, migration/data-loss protections;
- P1: backup/DR, sync reliability, transfers, required compliance features;
- gated: M365/SharePoint adapter, expanded review workflows, optional modules;
- reject: stale `.claude` control plane, provider-specific harness dependency, superseded duplicate implementations.

## 10. CI / harness operating rule

For ordinary feature work:

- feature branch push: no duplicate Quality run;
- PR: one authoritative affected-work Quality workflow;
- Security: independent and fail-closed;
- merge only on current-head evidence;
- `main` verifies integrated state after merge.

Do not rerun expensive checks merely for reassurance if the exact current head already has authoritative green evidence.

## 11. Autonomous continuation protocol

The owner has explicitly asked for an autonomous development loop.

After opening a PR:

1. ensure the LIKHA PR continuation schedule remains active and targets the canonical PR;
2. inspect current-head Quality + Security;
3. fix evidence-backed failures with the smallest reversible change;
4. merge when the exact head is green and mergeable;
5. start the next highest-value Golden Journey slice;
6. stop and ask the owner only for a real product/policy/security decision or an external blocker that cannot be resolved safely.

Do not create competing implementations of the same active slice. If another agent opens an overlapping PR, compare them, choose one canonical path, preserve useful ideas, and close/supersede the duplicate.

## 12. Durable references

Read only when relevant:

- `docs/ACTIVE-PLAN.md`
- `docs/PROJECT-MEMORY.md`
- `docs/SOURCE-REGISTRY.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/product/OFFLINE-CONTRACT.md`
- `docs/product/SCHOOL-YEAR-LIFECYCLE-CONTRACT.md`
- `docs/product/PR55-RECOVERY-POLICY.md`
- `docs/product/PR55-RECOVERY-ORDER.md`
- `docs/adr/0059-golden-journey-work-context.md`
- `docs/adr/0060-golden-journey-app-class-context.md`
- `docs/adr/0070-golden-journey-class-learner-context.md`
- `docs/adr/0071-golden-journey-class-record-context.md`

## 13. Handoff maintenance rule

Keep this file under roughly 250 lines and focused on live state.

When a slice completes:

- replace stale current-state text instead of appending a transcript;
- move durable decisions into ADRs/project memory;
- move research into research/source-registry docs;
- keep only active blockers, current checkpoint, and exact next action here.
