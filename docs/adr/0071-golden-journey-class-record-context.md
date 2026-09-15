# ADR-0071: Golden Journey class record entry resolves from preserved class context

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

The Golden Journey sequences Class Record work after Subject Attendance and learner context. A teacher already inside a preserved class should be able to reach that class's scoring workspace without selecting the section and subject again.

`TeacherClassWorkContext` intentionally carries only the canonical `teachingAssignmentId` plus display labels. It is navigation state, not authorization. The section and subject therefore must be resolved again through a trusted assignment-owned application path.

The existing standalone `ClassRecordsScreen` also requires two academic choices that materially affect correctness:

- grading period / term;
- DepEd grading weighting policy.

Those choices must not be silently inferred from array order, a default flag, or a subject name.

## Decision

Add a bounded class-context entry into the existing Class Record capability.

- `ClassWorkspaceScreen` exposes `Open class record` for the preserved teaching assignment.
- `ClassRecordJourneyScreen` revalidates that assignment through `SubjectAttendanceApplicationService.listMyAssignments` before using its section, subject, or school year.
- The screen loads the grading periods for the assignment's school year and the available grading-weight policies.
- The teacher explicitly selects both the grading period and grading weighting before opening the record.
- No period is selected merely because it is first in a list.
- No weighting is selected merely because it is marked default.
- No weighting is inferred from subject name.
- `ClassRecordApplicationService.createClassRecord` remains the find-or-create boundary and keeps its existing school, ownership, school-year, and validation behavior.
- Once a valid record is returned, the existing `ClassRecordWorkspace` is reused for scoring.
- Returning from the journey restores the exact preserved class context.
- The standalone `ClassRecordsScreen` remains independently reachable and unchanged.

## Failure behavior

The flow fails visibly and retryably when:

- the teaching assignment is no longer authorized;
- no grading period exists for the school year;
- no grading-weight policy exists;
- the selected period or weighting is invalid/stale;
- `createClassRecord` refuses the combination;
- an application-service call fails.

A stale or forged UI context never grants access.

## Security and privacy

`TeacherClassWorkContext` and the app's `classRecordAssignmentId` are navigation state only. Authorization remains below the UI. Before section/subject identifiers are used, the assignment is revalidated against the signed-in teacher's own authorized assignments.

No new learner fields, PII, cloud dependency, repository method, schema, or migration are introduced.

## Academic correctness

This slice deliberately keeps academic policy explicit:

- term selection is teacher-visible and explicit;
- grading weighting is teacher-visible and explicit;
- grade formulas remain in existing application/domain/repository logic;
- the UI does not duplicate grade computation or infer policy from labels.

This supersedes the earlier draft of this ADR that proposed automatically using the first grading period and a default weighting policy.

## Consequences

Positive:

- the teacher keeps the class context and avoids repeated class selection;
- trusted assignment scope is preserved;
- academic choices that can change grade outcomes remain explicit;
- the mature `ClassRecordWorkspace` is reused rather than duplicated;
- the implementation stays small and reversible.

Deliberate limitations for this first GJ-6 slice:

- Creation Studio / assessment authoring is not yet entered directly from this class-context path;
- grade-state continuity and explicit offline/local-save visibility remain later Golden Journey slices;
- Android-specific quick-entry refinements are not redesigned here.
