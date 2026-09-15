# ADR-0071: Golden Journey class record entry resolves from the preserved class context

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

The Golden Journey implementation plan sequences Class Record (GJ-6) after
Subject Attendance (GJ-4) and learner context (GJ-5). A teacher already
inside the preserved class workspace (`docs/adr/0060-golden-journey-app-class-context.md`)
should be able to reach that class's scoring workspace without re-selecting
a section, subject, grading period, and grading weighting from
`ClassRecordsScreen`'s standalone dropdown flow.

`ClassRecordsScreen` already opens a class record through
`ClassRecordApplicationService.createClassRecord`, whose find-or-create
semantics, cross-school-year/ownership validation, and weight-policy
resolution are domain/service concerns and return `null` on a mismatch it
refuses. `TeacherClassWorkContext` carries only `teachingAssignmentId` plus
display-name labels -- it deliberately does not carry a section or subject
id, so a class-context entry point must resolve those through a trusted
service rather than guessing them in the UI.

## Decision

Add a second, additive entry point into the existing class-record
capabilities, reached only from inside the preserved class context.

- `ClassWorkspaceScreen` gains an "Open class record" action next to
  "Check attendance", calling a new `onOpenClassRecord(teachingAssignmentId)`
  prop -- the same shape as the existing `onCheckAttendance` prop.
- A new `ClassRecordJourneyScreen` resolves the class record for that
  teaching assignment:
  - the assignment is revalidated through
    `SubjectAttendanceApplicationService.listMyAssignments` -- the same
    trusted call the app already uses to revalidate a preserved class
    context -- which supplies the assignment's `sectionId`, `subjectId`,
    and `schoolYear`;
  - the section's current grading period comes from
    `GradingApplicationService.listPeriodsBySchoolYear(schoolYear)`;
  - the grading weighting comes from
    `ClassRecordApplicationService.listGradingWeightPolicies()`'s default
    policy;
  - the class record itself is opened through
    `ClassRecordApplicationService.createClassRecord`, unchanged.
- Once resolved, the screen renders the existing `ClassRecordWorkspace`
  directly (roster/scoring UI), with a "Back to class" action that returns
  to `ClassWorkspaceScreen` with the preserved `TeacherClassWorkContext`
  intact.
- `App` holds the resolution as local state scoped to the `my-day` tab
  (`classRecordAssignmentId`), the same narrowly-typed handoff pattern as
  every other contextual id in `App.tsx` -- not a new tab, route, or
  global store.
- `ClassRecordsScreen`'s standalone section/subject/grading-period/
  weight-policy picker is unchanged and remains independently reachable
  from the `class-records` tab.

Every resolution failure is a visible, retryable error rather than a
silent failure or a guessed fallback:

- the assignment is no longer authorized (revalidation fails or the
  assignment is missing from the current list);
- no grading period exists yet for the section's school year;
- no default grading weight policy exists yet;
- `createClassRecord` returns `null` (cross-school-year or ownership
  mismatch).

No grade formula, weighting rule, or validation policy is implemented or
duplicated in this screen -- resolution only supplies identifiers to
services that already own those decisions.

## Security and privacy

`TeacherClassWorkContext` and `classRecordAssignmentId` remain UI
navigation state only. The teaching assignment is revalidated against the
signed-in teacher's own authorized assignments before any section/subject
id is used, so a stale or forged id cannot open another teacher's class
record. `createClassRecord`'s existing school/ownership/school-year checks
are untouched.

## Consequences

Positive:

- a teacher reaches class-record scoring from the same class they are
  already working in, without repeated section/subject/grading-period
  selection;
- every grading-policy and cross-school-year decision stays a
  domain/service concern, matching GJ-6's "no UI-owned grade formulas"
  requirement;
- `ClassRecordsScreen` and `ClassRecordWorkspace` remain independently
  usable and unchanged;
- no new schema, repository method, or global state mechanism is
  introduced.

Deliberate limitations retained for this first slice:

- only the section's first/current grading period is used -- multi-period
  selection from class context is a later slice;
- Creation Studio (`AssessmentAuthoringScreen`) is not yet reachable from
  class context;
- keyboard-first Windows entry and purpose-built Android quick entry
  remain properties of `ClassRecordWorkspace` itself and are not
  redesigned by this slice;
- offline/local-save-state visibility beyond what `ClassRecordWorkspace`
  already shows is deferred to GJ-7.
