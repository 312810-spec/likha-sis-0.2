# LIKHA-SIS 0.2 — Golden Journey Implementation Plan

Status: implementation sequence after recalibration

Date: 2026-09-15

## Goal

Build one excellent end-to-end teacher journey before propagating the redesign across the whole product:

> Sign in → Today → Filipino 8 Joy → attendance → learner → class record → grade state → offline save → reconnect → My Advisory → relevant form → close → return and continue.

This plan preserves proven domain/repository behavior and changes the experience layer in small reversible slices.

## Current structural diagnosis

The repository already contains many of the necessary capabilities, but they are distributed across separate screens and local `App.tsx` handoff states. The redesign problem is therefore primarily **integration, context persistence, hierarchy, and recovery**, not rebuilding every feature.

Two current home concepts overlap:

- `TeacherWorkspaceScreen` — section/adviser-style overview, attendance priorities, grading-period status, counts, sign-in activity;
- `MyDayScreen` — schedule + subject-attendance gaps + sync conflicts.

Legacy Soul replaces both ordinary-teacher entry points with one **Today** experience. Useful behavior from each is preserved; duplicate dashboard behavior is retired.

Current `App.tsx` also keeps many separate handoff states (`attendanceSectionId`, `rosterSectionId`, `subjectAttendanceAssignmentId`, assignment/adviser/schedule contexts). These were safe incremental choices but now create fragmented navigation. The redesign introduces a bounded work-context model instead of adding more one-off handoff variables.

## Guardrails

1. No domain capability disappears during UI movement.
2. No new global state library is introduced unless the existing React composition model proves insufficient.
3. No cloud dependency is added to ordinary navigation or save paths.
4. No schema change merely to support screen navigation.
5. Existing authorization remains enforced below UI.
6. All fixtures/screenshots use synthetic data only.
7. Efficient, Comfortable, and Guided share the same workflow/domain state.
8. Android interprets the same work context with a purpose-built mobile layout.
9. Every slice ships with tests before the next slice expands scope.
10. A screen is not considered replaced until its useful actions are mapped KEEP/MOVE/MERGE/REPLACE/RETIRE.

## GJ-0 — Baseline and acceptance harness

Before visual rewriting:

- record the current Golden Journey behavior with synthetic fixture data;
- identify exact existing callbacks/services for Today, subject attendance, learner access, class record, advisory, forms, conflicts, sync status;
- add a focused regression checklist for these capabilities;
- capture the current keyboard path and mobile-width behavior;
- ensure the branch quality/security gates are green.

Output: a stable baseline that tells us whether redesign loses functionality.

## GJ-1 — Work Context foundation

### Problem

Navigation context is currently spread across many independent `App.tsx` state values. This makes “select class once” and “continue where you stopped” difficult.

### Implement

Introduce a small UI/application-level `WorkContext` model, not a database entity.

Minimum variants:

```text
TeacherClassContext
- teachingAssignmentId
- gradingPeriodId? (visible default, can be changed)
- schedule occurrence/date? (optional entry context)

AdvisoryContext
- sectionAdvisoryId / sectionId
- gradingPeriodId? (visible default)
```

Derived fields such as section/subject/school-year/teacher names are loaded from trusted services/repositories; they are not copied into durable truth merely for navigation.

### Do not do

- no Redux/Zustand by default;
- no database migration;
- no client-supplied school ID;
- no teaching-assignment proxy for advisory authority.

### Tests

- switching class replaces the class context cleanly;
- current term can be changed without losing class selection;
- stale/missing context falls back safely;
- unauthorized/deleted assignment cannot be opened just because an old UI context exists;
- sign-out clears sensitive navigation context.

## GJ-2 — Today replaces duplicate teacher dashboards

### Preserve from My Day

- schedule order;
- pending subject attendance;
- unresolved conflicts that genuinely require teacher action.

### Preserve from Teacher Workspace

- useful adviser/section work signals that belong to the signed-in teacher;
- current grading-period awareness;
- direct continuation into real work.

### Retire from ordinary Today

- generic counts with no immediate action;
- sign-in activity as a primary dashboard concern;
- duplicate attendance lists from two home concepts;
- card-farm presentation.

### Today structure

1. **Now** — current/next scheduled class when available.
2. **Next** — following class or important same-day work.
3. **Needs Attention** — deterministic, explainable items.
4. **Continue** — last safe local work context when still authorized.
5. quiet local/offline/sync status.

Every Today item leads directly into the relevant workspace with context already selected.

## GJ-3 — Class Workspace shell

Create the integrated teacher workspace rooted in `teachingAssignmentId`.

Recommended information architecture:

- Overview
- Attendance
- Learners
- Class Record
- Assessments / Scores
- Grades / Progress
- Notes/interventions when implemented
- Relevant outputs/forms
- History/details progressively disclosed

The exact visible tabs may differ by platform/mode; the domain context remains the same.

### Desktop behavior

- persistent class identity and term in the workspace header;
- keyboard-friendly switching/actions;
- tables optimized for data entry;
- avoid repeated modals/selectors;
- side-by-side context where useful.

### Android behavior

- focus on Now/Attendance/quick scoring/learner lookup/notes;
- bottom/top mobile navigation appropriate to the device;
- avoid rendering desktop data tables at phone width.

## GJ-4 — Subject attendance integrated

Move the existing subject-attendance workflow into Class Workspace without changing its domain meaning.

Acceptance:

- class already selected;
- date/session state obvious;
- Present/Absent/etc behavior remains whatever the existing validated subject-attendance domain supports;
- save locally first;
- close/reopen preserves local write;
- Today updates deterministically after attendance becomes complete/meaningfully started according to the domain rule;
- no accidental interaction with official adviser/SF2 attendance.

## GJ-5 — Learner context inside class

A teacher opens a learner from the current class roster without losing class context.

Requirements:

- only locally/centrally authorized learner scope;
- easy return to the exact class location;
- show class-relevant information first;
- broader learner history/details progressively disclosed according to capability;
- no repeated section/subject/year selection.

## GJ-6 — Class Record + assessment/scoring integration

Move existing class-record/assessment/score capabilities into the persistent class context.

Requirements:

- visible term;
- keyboard-first Windows entry;
- purpose-built Android quick entry where feasible;
- validation and grading policies remain domain/service concerns;
- no UI-owned grade formulas;
- local save state visible;
- incomplete work recoverable after restart.

## GJ-7 — Offline/reconnect proof

Execute the approved Offline Contract through the same journey.

Required visible states:

- Saved on this device;
- Waiting to sync;
- Synced;
- Needs review;
- Access changed.

Test network loss before class open, during attendance, during score entry, before/after restart, and during reconnect.

No “success” state is allowed unless the local transaction actually committed.

## GJ-8 — My Advisory

Create the adviser workspace rooted in the actual `section_advisories` relationship.

Primary areas:

- learners/roster;
- adviser attendance and monthly summary;
- enrollment/movement status;
- learner progress/failures/interventions as available;
- required adviser forms/outputs;
- Needs Attention items specific to advisory work.

Do not use subject Teaching Assignment as advisory authority.

## GJ-9 — Form bridge

From the class/advisory context, surface applicable official/practical outputs derived from existing records.

Rules:

- do not create a duplicate forms database;
- readiness problems explain which source record is missing/incomplete;
- authoritative-template generation remains version/provenance controlled;
- Windows is the primary official-form workstation;
- Android may view readiness/status and perform appropriate simple inputs without pretending to be the full form workstation.

## GJ-10 — Resume and recovery

Implement “Continue where you stopped” as a local preference/context pointer, not academic truth.

It records only the minimum navigation context required to resume safely. On startup/sign-in:

1. validate the stored context is still structurally valid;
2. validate current authorization/scope;
3. if valid, offer Continue;
4. if not, discard/hide the stale pointer without deleting academic records;
5. never store learner PII in unnecessary UI preference payloads.

Also test:

- app restart;
- session expiration;
- sign out/sign in as another user;
- removed assignment;
- changed adviser assignment;
- closed school year;
- offline start.

## GJ-11 — School-year lifecycle implementation

After the teacher journey is coherent, implement the smallest correct lifecycle mechanism required by `SCHOOL-YEAR-LIFECYCLE-CONTRACT.md`.

Do not add schema until tests/spec prove existing `school_year` strings cannot safely express the required lifecycle state.

Likely implementation sequence:

1. lifecycle domain type/state-transition tests;
2. persistence/migration only if necessary;
3. preparing/active/closing/closed trusted-boundary rules;
4. rollover preview (no mutation);
5. transactional/idempotent rollover execution;
6. historical-year correction rules;
7. stale-device/reconnect tests;
8. backup/restore across two years.

## GJ-12 — Validation panel

Use 5–8 teachers with varied workflows/digital comfort and synthetic data.

Core tasks:

1. find the class they are about to teach;
2. take attendance;
3. enter one assessment and several scores;
4. correct a mistaken score;
5. find a learner and return to the exact class state;
6. continue working after internet loss;
7. understand whether work is saved/synced;
8. complete an adviser task;
9. locate/generate the relevant output;
10. close and later resume work.

Observe without coaching first. Record task completion, errors, hesitation points, repeated questions, navigation backtracks, and confidence in save/offline states.

## First code change after this plan

The first production-code PR should be intentionally small:

**Work Context + Today entry integration**

- introduce the bounded work-context type/state;
- teach Today/My Day to open a class context, not only attendance;
- preserve existing attendance callback as a child action of that class context;
- add tests for class selection, safe fallback, and sign-out clearing;
- do not redesign Class Record yet;
- do not add schema;
- do not delete existing screens until equivalent capability is proven.

This creates the connective tissue for every later Golden Journey slice without committing to a giant rewrite.
