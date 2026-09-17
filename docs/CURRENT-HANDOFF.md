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

Current main: `59246a53bf4cd12506ef7e01972be59b8ca4f84b` (PR #94).
PR #94's exact head `2e07800b07ffef2454b26f1a7741271c6f74c98e` passed Quality #835 and independent Security #971 before squash merge.

PRs #93–#94 now complete the adviser-owned **official daily attendance** vertical slice:

- trusted native commands revalidate `section_id + attendance_date` through `auth::authorize_adviser_of_section`, so only the active adviser or a School Head may proceed;
- adviser writes reuse the existing local persistence + enrollment-gated encrypted outbox transaction;
- My Advisory uses a dedicated daily-only application/repository path rather than the general school-wide Attendance surface;
- Present, Absent, Tardy, and non-overwriting **Mark unmarked Present** are available inside My Advisory;
- stale advisory context is revalidated before official daily attendance or Subject Attendance is queried;
- Subject Attendance remains a separate read-only signal and is never converted into official attendance or SF2;
- official attendance rendering is independent from Subject Attendance rendering, so a subject-signal failure cannot block official attendance work.

GJ-7 software recovery evidence remains valid from PR #90: persisted score/outbox evidence survives clean encrypted reopen and command enqueue failure rolls back atomically. Actual process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows hardware/runtime proof remain verification debt.

## Current slice

Branch: `feat/adviser-monthly-attendance-preview`.

Add the smallest trusted monthly adviser continuation before touching SF2 export behavior.

Current implementation scope:

- add a read-only `adviser_monthly_attendance_summary` Tauri command;
- authorize the caller against the section on the **last calendar day of the requested month**, reusing `auth::authorize_adviser_of_section`;
- allow only the active month-end adviser or a School Head in the same school;
- reuse the existing `attendance::monthly_grid_for_section` report shape;
- keep this explicitly a **monthly attendance preview**, not an official SF2 form;
- invalid months fail closed at the native boundary;
- do not change schema, sync, daily attendance behavior, Subject Attendance, filesystem export behavior, or SF2 fidelity claims in this slice;
- use synthetic test data only.

Tests in this slice cover:

- normal and leap-year month-end calculation;
- active month-end adviser access to the existing monthly grid;
- non-adviser denial;
- a future advisory assignment not authorizing an earlier month;
- malformed/invalid month failing closed.

Next after this slice: if the monthly authorization boundary is green, add an adviser-authorized wrapper around the existing **SF2-inspired CSV** export with the same truthful `FieldDisclosure`. Do not label that CSV as a submission-ready official SF2. A real official-form path requires authoritative template/layout evidence and must preserve the project's official-form fidelity rules.

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
- GJ-8 daily application/UI: My Advisory records official daily attendance through a dedicated adviser-only service while Subject Attendance stays separate and read-only.

Current: GJ-8 trusted adviser monthly-attendance preview boundary.

Next: adviser-authorized truthful SF2-inspired preview/export, then official-template work only if authoritative form evidence is sufficient.

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
- The existing section monthly CSV is **SF2-inspired**, not submission-ready official SF2; preserve its `FieldDisclosure` and do not overclaim fidelity.

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
- `docs/adr/0009-sf2-export-and-official-form-engine.md`
- `docs/adr/0056-section-advisory-foundation.md`
- `docs/adr/0059-golden-journey-work-context.md`
- `docs/adr/0060-golden-journey-app-class-context.md`
- `docs/adr/0070-golden-journey-class-learner-context.md`
- `docs/adr/0071-golden-journey-class-record-context.md`

## Maintenance rule

Keep this file under roughly 250 lines. Replace stale live-state text instead of appending history. Move durable decisions to ADR or project memory, and research to source-registry or research docs.
