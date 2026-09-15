# ADR-0060: Promote Golden Journey class context to the app boundary

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

ADR-0059 proved a bounded `TeacherClassWorkContext` inside My Day. That first slice intentionally stopped at the screen boundary: opening Subject Attendance unmounted My Day and therefore discarded the selected class.

The next Golden Journey step is not a new attendance implementation. It is preserving the already-selected class while the teacher performs connected work, then returning without asking for the class again.

The context contains one canonical identifier (`teachingAssignmentId`) plus subject/section/schedule labels used only for presentation. It must never become an authorization source.

## Decision

Promote the bounded class work context to `App` state for the signed-in session.

- My Day becomes controlled by the app-owned context.
- Opening Subject Attendance from the Class Workspace preserves that context.
- Subject Attendance exposes a contextual return action only when its assignment matches the preserved class context.
- Before restoring the Class Workspace, the app reloads the signed-in teacher's authorized teaching assignments through `SubjectAttendanceApplicationService.listMyAssignments` and verifies that the canonical assignment still exists.
- Missing, stale, or unverifiable context falls back safely to Today/My Day instead of restoring a class workspace.
- Logout, session expiry, setup completion, and a fresh login clear the context.
- The context is not persisted to SQLite, local storage, cloud sync, URLs, or a global state library.

## Security and privacy

This remains UI navigation state only. Trusted application/repository commands continue to enforce school/user/assignment authorization below the UI.

Revalidation is fail-closed: a failure to load the teacher's current assignments clears the context rather than trusting stale labels or identifiers.

No learner PII is added to the context.

## Consequences

Positive:

- teacher selects a class once for the attendance round trip;
- the first real Golden Journey cross-screen transition is continuous;
- stale assignment changes recover to Today without exposing another class;
- no migration, sync, cloud, or new dependency is introduced;
- Subject Attendance remains independently usable outside the Golden Journey wrapper.

Limitations deliberately retained:

- class context survives only the current authenticated app session;
- Class Record, learner detail, Adviser Room, and form workflows are not yet connected to this context;
- there is still no durable “continue tomorrow where you stopped” state;
- term context remains a separate future slice.
