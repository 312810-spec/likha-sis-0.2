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

Current `main`: `fbd3649a6e538f130038b10c87a7204cfa76abc2`.

Latest merged product slices:

- PR #75 established the evidence-bounded `Saved on this device` vocabulary.
- PR #76 added the Class Record local-save adapter seam and focused adapter tests.
- PR #77 wired truthful device-save status into actual Class Record score rows and merged after exact-head Quality + Security passed.

PR #77 merge SHA: `fbd3649a6e538f130038b10c87a7204cfa76abc2`.

The standalone `ClassRecordWorkspace.local-save.test.tsx` was deliberately removed after repeated formatter-only failures. Do not recreate it. Coverage remains through existing Class Record score-save tests plus `ClassRecordLocalSaveStatus.test.tsx` truthfulness tests.

## Active work

Branch: `fix/gj-sync-status-truthfulness`

Purpose: align the shipped Sync Status screen with `docs/product/OFFLINE-CONTRACT.md` and the actual trusted Rust sync-status evidence.

Live evidence inspected:

- `SyncStatus.pendingChangeCount` is backed by `sync_outbox::count_pending_for_school` and can truthfully support **Waiting to sync** at this-device/school scope.
- `SyncStatus.openConflictCount` is backed by unresolved conflict storage and can truthfully support **Needs review** at this-device/school scope.
- `SyncStatus.lastPullAt` means the last pull that actually applied or staged a change; it is not a generic sync-success or connectivity timestamp.
- `pendingChangeCount === 0` does **not** prove that a particular record or write is `Synced`.

Current bounded correction:

- replace `All changes are synced` with `No changes waiting to sync`;
- replace the misleading `Last synced` label with `Last received update`;
- keep `N changes waiting to sync` only when the trusted outbox count is positive;
- preserve existing conflict-review and sync-trouble behavior;
- add regression tests that reject unsupported global `Synced` claims.

No sync protocol, queue semantics, cloud provider, schema, authorization, grading, or local-save behavior changes are in this slice.

## Exact next action

1. Open one canonical PR from `fix/gj-sync-status-truthfulness`.
2. Immediately schedule its exact-head continuation about 15 minutes later.
3. Inspect authoritative Quality and independent Security for the exact current head.
4. Fix only evidence-backed failures with the smallest reversible change.
5. If both gates are green and the head is unchanged/mergeable, squash-merge.
6. Then continue GJ-7 with the next smallest proven reconnect/sync state. Do not claim per-record `Synced` until the owning acknowledgment evidence is exposed safely.

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
- Grade-state continuity: trusted computation remains current after successful score correction.
- Offline-save primitive: `LocalSaveStatus` truthfully identifies a locally committed write.
- Class Record local-save integration: actual score rows now use `Saved on this device` only after persistence evidence.

Current: GJ-7 reconnect/sync truthfulness using existing trusted queue/conflict evidence.

Next: continue evidence-backed reconnect/sync proof, then Adviser Room and form continuation according to release priority.

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

## Offline/sync truthfulness guardrails

- local persistence evidence may claim `Saved on this device` only;
- `Waiting to sync` requires durable queued-change evidence;
- `Synced` requires acknowledgment from the relevant school synchronization boundary, not merely an empty queue or working network;
- `Needs review` requires a stored unresolved conflict or equivalent trusted reconciliation evidence;
- `Access changed` requires trusted authorization/scope evidence;
- never infer sync state from connectivity alone;
- never let cloud availability determine whether an already-authorized local save succeeds.

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
