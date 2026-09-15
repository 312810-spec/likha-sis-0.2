# ADR-0071: Golden Journey class records remain assignment-scoped and term-explicit

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

The Golden Journey now preserves one teaching assignment from Today through Subject Attendance and learner context. The next step is Class Record work without forcing the teacher to select the same section and subject again.

The existing `ClassRecordsScreen`, `ClassRecordWorkspace`, assessment authoring, score recording, export, and grade-computation paths already contain the real class-record behavior. Rebuilding those inside the Golden Journey would duplicate logic and risk moving academic rules into UI state.

`TeacherClassWorkContext` remains navigation state only. It cannot authorize grade access or determine a grading period or weighting policy.

## Decision

Add a Golden Journey Class Records adapter that reuses the existing grading stack.

- Revalidate the preserved `teachingAssignmentId` through `SubjectAttendanceApplicationService.listMyAssignments(teacherUserId)` before showing class-record work.
- Derive `sectionId`, `subjectId`, and `schoolYear` only from the revalidated teaching assignment.
- Filter existing class records to that exact section and subject.
- Keep grading period selection explicit. LIKHA must not infer the active term from UI context.
- Keep DepEd grading-weight policy selection explicit. LIKHA must not infer a weight policy from a subject name.
- Reuse `ClassRecordWorkspace` unchanged for scoring and `AssessmentAuthoringScreen` unchanged for assessment creation.
- Preserve an explicit return to the selected class.
- Keep the standalone `ClassRecordsScreen` available when the teacher enters Class Records outside a preserved class context.

## Security and correctness

The UI context does not grant access. A stale or forged teaching-assignment id is revalidated before the adapter derives section and subject scope.

The adapter does not calculate grades, alter weight formulas, fabricate grading periods, or copy scoring logic. Existing application/domain/repository paths remain authoritative.

A stale assignment fails closed and does not show class-record work.

## Consequences

Positive:

- teachers no longer reselect section and subject after entering a class from Today;
- existing scoring, assessment, export, and grading behavior stays centralized;
- term and weighting choices remain visible and deliberate;
- no migration, new dependency, cloud call, sync change, or grading-formula change is introduced;
- the change is reversible because the ordinary Class Records workflow remains intact.

Deliberate limitations:

- term continuity is not yet promoted into the broader Golden Journey context;
- this slice connects class context to Class Records but does not yet add a cross-workflow grade-state summary;
- broader offline/reconnect continuity remains a later Golden Journey slice.
