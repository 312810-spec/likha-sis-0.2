# ADR-0059: Golden Journey begins with a bounded class work context

Status: Accepted for implementation slice

Date: 2026-09-15

## Context

LIKHA-SIS 0.2 already has real domain/repository work for teaching assignments, schedule meetings, subject attendance, class records, learners, and My Day. The Legacy Soul recalibration therefore should connect existing capabilities before rebuilding them.

The current My Day schedule knows the canonical `teachingAssignmentId` and friendly subject/section labels, but it only presents schedule text. Teachers must leave the surface and re-enter feature-oriented flows to do work.

A large App-level navigation/state rewrite at the same time as the first experience slice would make the change harder to review and roll back.

## Decision

Introduce a small UI-only `TeacherClassWorkContext` and use it first inside My Day:

- canonical identity is `teachingAssignmentId`;
- subject/section/schedule labels are presentation hints from an already-authorized read model, never a replacement for trusted validation;
- selecting a scheduled class opens a small Class Workspace without asking for the class again;
- the first real action is existing Subject Attendance;
- no placeholder future controls are added;
- no database/schema/cloud/dependency change is made;
- the first slice keeps the selected class context local to My Day.

After this slice is green and reviewed, a later slice may promote the same bounded context into app-level resume/navigation state so class context can survive transitions into Attendance, Class Record, Learner, and other connected work.

## Why local first

This follows the project rule to make small reversible changes. It proves the interaction and accessibility contract without rewriting `App.tsx`, introducing a state library, or creating durable UI state prematurely.

## Security

The context does not carry a client-supplied school ID or grant authority. Existing commands/repositories remain authoritative. Possession of an old UI context cannot authorize an operation.

## Consequences

Positive:

- first visible Legacy Soul behavior is implemented with very small blast radius;
- existing attendance behavior is preserved;
- tests can verify select-once class behavior immediately;
- no migration or sync implications.

Temporary limitation:

- the class context is not yet retained when navigating away from My Day;
- “Continue where you stopped” remains future work;
- term context is not yet part of this first slice.

These are deliberate follow-up slices, not hidden claims of completion.
