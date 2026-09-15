# ADR-0070: Golden Journey class learner context uses assignment-owned scope

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

The Golden Journey implementation plan sequences learner context after Subject Attendance and before Class Record. A teacher should be able to move from the currently selected class into a learner without selecting the section/subject again and without broadening learner access.

LIKHA already has two relevant roster-style reads:

- `SectionApplicationService.roster(sectionId, date)`, which is a general section workflow;
- `SubjectAttendanceApplicationService.monitor(teachingAssignmentId, date)`, which is rooted in one teaching assignment and is enforced at the trusted Tauri boundary by `subject_attendance::authorize_own_assignment`.

The class workspace context itself is UI navigation state and must never become an authorization source.

## Decision

For the first GJ-5 learner-context slice, reuse the assignment-owned Subject Attendance monitor as the learner read model.

- The canonical scope is the preserved `teachingAssignmentId`.
- Learner access is offered only when the preserved class context matches the assignment that opened the Subject Attendance journey.
- `SubjectAttendanceApplicationService.monitor(teachingAssignmentId, today)` supplies the current learner rows and class-relevant attendance signals.
- The generic section roster is not used from class context because knowing a section identifier is not sufficient reason to widen the trust boundary.
- The learner detail shown in this slice is intentionally narrow: name plus subject-attendance counts/streak already returned by the authorized monitor.
- Returning to the learner list and then to the class preserves the existing bounded class context.
- Broader learner profile/history remains a later slice and must use an explicitly authorized capability rather than inheriting access from this UI context.

## Security and privacy

Authorization remains below the UI. `TeacherClassWorkContext` does not grant access and does not carry a client-supplied school id.

The trusted command/repository path continues to require that the signed-in user owns the teaching assignment. A forged, stale, or different assignment cannot be opened merely because the UI possesses old labels or an id.

No additional learner fields such as LRN, address, guardian information, or health data are introduced in this slice. Tests use synthetic learner data only.

## Consequences

Positive:

- advances the Golden Journey from class → attendance → learner without repeated class selection;
- preserves the narrowest already-proven authorization boundary;
- shows class-relevant information first;
- avoids a new repository, schema, dependency, cloud call, or global state mechanism;
- keeps existing Subject Attendance behavior independently usable.

Deliberate limitations:

- this is not yet a full learner profile;
- learner context is not yet connected to Class Record or assessment scoring;
- the learner panel is anchored to the preserved class assignment, not to later manual changes inside the standalone Subject Attendance picker;
- broader learner history must be added only after its authorization contract is explicit and tested.
