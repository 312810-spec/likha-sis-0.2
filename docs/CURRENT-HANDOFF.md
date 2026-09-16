# CURRENT HANDOFF — LIKHA-SIS 0.2

Updated: 2026-09-16

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

Current main: `bb4b78678911dca7a9dcd49026e2abf0ec87a5c0` (PR #91).
PR #91's exact head `b664cf3c2b06f10396bd3f72fef66c2883837828` passed Quality
#811 and independent Security #910 before squash merge.

PR #91 established GJ-8 My Advisory context continuity:

- `AdvisoryWorkContext` carries only an opaque `sectionId` navigation pointer.
- My Advisory restores that pointer only after `listAdviserViewSections` proves the section is currently authorized.
- A stale section id never reaches `adviserOverview`; fallback is limited to another section returned by the trusted adviser-authorized list.
- Session transitions clear advisory context.
- Native `section_advisories`/`authorize_adviser_of_section` authority remains unchanged.
- Subject Teaching Assignment is not used as advisory authority.
- My Advisory remains read-only and explicitly does not convert Subject Attendance into SF2.

GJ-7 software recovery evidence remains valid from PR #90: persisted score/outbox evidence survives clean encrypted reopen and command enqueue failure rolls back atomically. Actual process crash/power-loss, DPAPI/session recovery, transport retry after restart, and packaged Windows hardware/runtime proof remain verification debt.

## Current slice

Branch: `feat/advisory-roster-context`.

Use the existing adviser-authorized `adviserOverview` result to make the advisory enrollment roster explicit in My Advisory. No new native command or authorization surface is needed: `repository::subject_attendance::adviser_overview_for_section` already starts from `section_membership::current_roster` for the selected date, then layers read-only Subject Attendance counts over those roster rows.

Acceptance boundary:

- show a clear **Advisory roster** count/context for the authorized section/date;
- keep enrolled learners visible even when no subject session has been held;
- label the following table as **Subject Attendance signals**;
- state clearly that the roster comes from section enrollment and Subject Attendance signals do not become SF2;
- keep all existing adviser authorization and stale-context revalidation intact;
- do not link My Advisory directly to the general `section_roster` command, because that command is intentionally school-scoped for any authenticated member rather than adviser-scoped;
- no schema, sync, grading, cloud, write-path, or real learner PII changes.

Next after this slice: the smallest official adviser-owned daily-attendance/form continuation that has its own trusted authorization and preserves the Subject Attendance / SF2 boundary. Do not infer official SF2 state from Subject Attendance signals.

## Continuation execution policy

The owner explicitly rejected hourly execution. One GitHub merge-event continuation task is enabled for owner-authored merges in this repository, with no time-based polling fallback.

Continue useful bounded work within the current run during CI, then recheck once after that work. CI completion is not itself a supported wake-up. Do not create chained short schedules, recursive run-now calls, artificial events, bot-comment relays, competing branches, or duplicate PRs.

Branch protection could not previously be read through the connector, so never enable unattended auto-merge on an assumption about required checks. Merge only on exact-current-head Quality and independent Security success, unchanged head, mergeable PR, and no real review blocker.

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
- GJ-8 entry/context: My Advisory is rooted in actual `section_advisories`, preserves bounded authorized section context, and fails closed on stale access.

Current: GJ-8 adviser-owned roster/attendance composition using the already-authorized overview's current-roster rows.

Next: official adviser daily-attendance/form continuation according to release priority and authoritative form evidence.

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
