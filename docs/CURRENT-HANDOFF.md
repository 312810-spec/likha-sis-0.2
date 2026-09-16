# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-17

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

Current main: `fe6c0ab8f4e83c4c02501837c5ad78f57e35b90d` (PR #93).
PR #93's exact head `0ccceffbaa520a42cbd4b8f8b850fabd20ec90ca` passed Quality #822 and independent Security #936 before squash merge.

PR #93 established the trusted native boundary for **official daily attendance owned by the active section adviser**:

- `adviser_attendance_roster_for_date`, `adviser_record_attendance`, and `adviser_bulk_mark_attendance_present` are registered alongside the existing general attendance commands;
- every adviser command revalidates `section_id + attendance_date` through `auth::authorize_adviser_of_section`, so only the active adviser or a School Head may proceed;
- cross-school and stale/future advisory context fail closed through the existing authorization primitive;
- adviser writes reuse `record_attendance_with_optional_sync`, preserving local-first persistence and enrollment-gated encrypted outbox behavior;
- bulk Present preserves the existing non-overwrite behavior;
- an unrelated teacher is rejected before sync-key resolution or attendance mutation;
- Subject Attendance remains separate and is never converted into official attendance.

GJ-7 software recovery evidence remains valid from PR #90: persisted score/outbox evidence survives clean encrypted reopen and command enqueue failure rolls back atomically. Actual process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows hardware/runtime proof remain verification debt.

## Current slice

Branch: `feat/adviser-daily-attendance-ui`.

Compose the adviser-native daily-attendance boundary into My Advisory without exposing the general school-wide Attendance surface.

Current implementation scope:

- add a dedicated `AdviserDailyAttendanceRepository` that exposes only daily roster, record, and bulk-Present operations;
- add `AdviserDailyAttendanceApplicationService` with section/learner/date/status validation and no monthly/SF2 API;
- add a Tauri adapter mapped only to the three adviser-authorized native commands from PR #93;
- wire the service through `composition.ts` without changing the existing general `attendanceService`;
- add an **Official daily attendance** panel inside My Advisory using the already-revalidated advisory section/date context;
- allow Present, Absent, and Tardy marks plus **Mark unmarked Present**;
- keep **Subject Attendance signals** read-only and visibly separate beneath official attendance;
- never add a second school-wide section picker, never infer official attendance from subject signals, and never add monthly/SF2 behavior in this slice;
- use synthetic test data only.

Tests in this slice cover:

- daily-only application validation and delegation;
- exact Tauri command mapping to the adviser-authorized native commands;
- official daily roster display inside My Advisory;
- recording an official mark through the adviser-only service;
- bulk Present preserving an existing Absent mark while filling an unmarked learner;
- stale advisory context never reaching either official attendance or Subject Attendance queries;
- date changes reload authorized sections, official attendance, and subject signals together;
- accessibility verification remains required.

Next after this slice: choose the smallest appropriate official-form continuation only after authoritative adviser authorization/form semantics are verified. Do not turn the existing subject-level signals or an unverified monthly summary into SF2 by inference.

## Continuation execution policy

The owner explicitly rejected hourly execution. One GitHub merge-event continuation task is enabled for owner-authored merges in this repository, with no time-based polling fallback.

Continue useful bounded work within the current run during CI, then recheck once after that work. CI completion is not itself a supported wake-up. Do not create chained short schedules, recursive run-now calls, artificial events, bot-comment relays, competing branches, or duplicate PRs.

Never enable unattended auto-merge on an assumption about required checks. Merge only on exact-current-head Quality and independent Security success, unchanged head, mergeable PR, and no real review blocker.

Astra Max is the preferred planner/reviewer and implementation worker when available. If it is unavailable in the active runtime, continue through the available coding path without waiting or duplicating work.

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
- Class Record local-save integration: actual score rows use `Saved on this device` only after persistence evidence.
- GJ-7 software proof: persisted score/outbox evidence survives clean encrypted reopen and command enqueue failure rolls back atomically; process/hardware recovery remains unverified.
- GJ-8 entry/context: My Advisory is rooted in actual `section_advisories`, preserves bounded authorized section context, fails closed on stale access, and explicitly presents the authorized enrollment roster separately from Subject Attendance signals.
- GJ-8 trusted write boundary: active advisers/School Heads have a distinct native boundary for official daily attendance that preserves the existing local-save/sync transaction.

Current: GJ-8 adviser-specific daily-attendance application/UI composition inside My Advisory.

Next: the appropriate adviser-owned form continuation only after authoritative form and authorization semantics are verified.

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
- `AdvisoryWorkContext` is navigation state only; it is never authorization evidence.
- `section_advisories` plus trusted backend commands remain the advisory authority.
- Subject Teaching Assignment authority and advisory authority must remain separate.
- Subject Attendance is an internal subject-level monitoring record; it must never be silently treated as official SF2 attendance.
- Official attendance writes must remain official attendance records; Subject Attendance must not be converted into them.

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
- stale or unauthorized class/advisory context fails closed;
- `TeacherClassWorkContext` and `AdvisoryWorkContext` are navigation state only;
- after a transition that may change assessment inputs, do not present an old computed grade as current without trusted recomputation.

Known correctness debt: Grade 12 SY 2026–2027 transmutation has prior research suggesting a hybrid legacy-weight/new-transmutation rule. Treat it as unresolved until verified against sufficiently authoritative evidence and the current code path.

## CI and autonomous loop

For ordinary feature work:

- feature branch push: no duplicate full Quality run;
- PR: one authoritative affected-work Quality workflow;
- Security: independent and fail-closed;
- merge only on exact-current-head evidence.

After opening a PR:

1. Keep one canonical PR and the existing production continuation.
2. Use pending-CI time for bounded preparation and fresh-context review.
3. Recheck exact-head Quality and independent Security after useful work.
4. Fix only evidence-backed failures with the smallest reversible change.
5. Merge when the exact head is green, reviewed and mergeable.
6. Start the next highest-value Golden Journey slice in the same run.
7. If verification remains pending, checkpoint honestly; do not invent a polling loop.

If another agent opens overlapping work, compare it with the active branch, select one canonical path, preserve useful ideas, and supersede the duplicate rather than merging both.

## Durable references

Read only when relevant:

- `docs/ACTIVE-PLAN.md`
- `docs/PROJECT-MEMORY.md`
- `docs/SOURCE-REGISTRY.md`
- `docs/VERIFICATION-DEBT.md`
- `docs/product/GOLDEN-JOURNEY.md`
- `docs/product/GOLDEN-JOURNEY-IMPLEMENTATION-PLAN.md`
- `docs/product/OFFLINE-CONTRACT.md`
- `docs/product/SUBJECT-ATTENDANCE-SPEC.md`
- `docs/adr/0056-section-advisory-foundation.md`
- `docs/adr/0059-golden-journey-work-context.md`
- `docs/adr/0060-golden-journey-app-class-context.md`
- `docs/adr/0070-golden-journey-class-learner-context.md`
- `docs/adr/0071-golden-journey-class-record-context.md`

## Maintenance rule

Keep this file under roughly 250 lines. Replace stale live-state text instead of appending history. Move durable decisions to ADR or project memory, and research to source-registry or research docs.
