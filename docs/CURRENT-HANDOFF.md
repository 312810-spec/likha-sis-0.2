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

Current verified main: `d8bd144a40d21f2f3f4f2f5e7489dc90803d858d` (PR #85).
PRs #79–85 are merged; #78 is closed as superseded. PR #85's exact head passed
Quality and independent Security, with no reviews or unresolved threads.

## Canonical continuation (2026-09-15)

Canonical branch: `feat/score-sync-row-display`.

The assignment-owned Class Record journey now injects the composed authorized
score-evidence service. Saved rows show persisted evidence as a last-check snapshot,
with one explicit refresh control. No connectivity-derived sync claim or polling.
The generic Class Records screen does not gain an unscoped evidence lookup.
Drafts, pending writes and row errors hide evidence. Saved-row keys and cancelled
reads discard old results; teacher/assignment/record changes remount the workspace.
A late save from a previous assessment no longer mutates the new assessment roster.
Failed evidence reads preserve successful local-save confirmation. Returning an
edited score to its original value restores evidence without another write.

Independent security/teacher-comfort review found the unchanged-draft cleanup and
service-replacement snapshot issues; both were corrected. Focused component and
workspace tests cover evidence vocabulary, absent/denied evidence, delayed results,
draft restoration, access-denied refresh, read failure after save and late old-item
writes. See the PR for actual checks. Fresh Quality and independent Security are
required before merge. No new native, packaged-Windows or hardware proof is claimed.

Next slice: offline/reconnect and changed-access journey proof, including a full
native end-to-end run when the platform is available. Snapshot status is deliberately
not live; background changes require refresh or reopening the saved row.

## Continuation execution policy

The owner explicitly rejected hourly execution. The hourly production task is
disabled. One GitHub merge-event continuation task is enabled for owner-authored
PRs in this repository, with no time-based fallback. Continue useful bounded work
within the current run during CI, and recheck once after that work.
CI completion is not a supported automation wake-up. Do not claim an uninterrupted
green-to-merge loop. Branch protection could not be read (connector 403), so do not
enable unattended auto-merge on an assumption about required checks. No chained
short schedules, recursive run-now calls, artificial events or bot-comment relays.
A real merge event resumes the next bounded slice; never duplicate an active worker.

Prior slice (merged):

Integration review found that an assignment-denied score-status lookup incorrectly
triggered the global session-expired callback. The adapter regression reproduced
this failure before the fix. Add the command to the existing permission-denial
classification list: the rejection still propagates, native authorization stays
fail-closed, and session-only reads still trigger expiration handling.

Limitation: native `unauthorized` conflates expired sessions and permission denial.
This follows the existing classification policy; this one read cannot independently
identify session expiry. A typed native error distinction remains future work.

Dependencies are now installed in the active worktree, so run local formatting and
focused tests before pushing instead of relying on CI to find avoidable failures.
See the PR for actual validation. Exact-current-head Quality and Security are still
required before merge. No UI, sync protocol, grading or authorization rules changed.

Next: composition and assignment-owned Class Record row integration. Reuse the
existing service; preserve local-save evidence independently of sync status. Hide
stale evidence on edit, item/class changes and denied access. Do not use connectivity
or an empty queue as proof of synchronization. Scope the request to the existing
ClassRecordJourneyScreen teaching assignment; the general ClassRecordsScreen has no
assignment context and must not invent one.

## Productive CI continuation

The production automation has been updated: hourly is a fallback wake-up, not a
mandatory pause between stages. Continue immediately after a verified merge.
While checks run, prepare the next bounded slice, acceptance criteria and regression
cases in isolation, or restore local verification tools. Then recheck CI once after
useful work. Publish only one canonical PR; never overwrite another worker.
If CI is still pending and useful preparation is exhausted, record the checkpoint.
Do not use busy waits, recursive automation invocations, chained schedules or relay
comments to circumvent scheduler limits. Available GitHub webhook events do not
include workflow completion, so a PR-event trigger is not a reliable CI wake-up.

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

1. Keep one canonical PR and the existing production automation.
2. Use pending-CI time for bounded preparation and local verification.
3. Recheck exact-head Quality and independent Security after useful work.
4. Fix only evidence-backed failures with the smallest reversible change.
5. Merge when the exact head is green, reviewed and mergeable.
6. Start the next highest-value Golden Journey slice in the same run.
7. Use the hourly wake-up only when verification remains pending or work is blocked.

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
