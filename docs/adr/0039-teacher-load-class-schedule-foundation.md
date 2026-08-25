# ADR-0039 — Teacher Load / Class Schedule Foundation

Status: Accepted

## Context

`docs/product/PRODUCT-CONTRACT.md` §6 already set the direction: Teacher
Load is a foundational school-organization record, not merely an SF7
field, and a future schedule-generator/optimizer is an explicit
**hypothesis**, not something to build now. Repository truth confirmed
before designing anything: `class_records` has **no teacher/owner
column at all** (`section_id`, `subject_id`, `grading_period_id`,
`weight_policy_id`, `curriculum_version_id` — never who teaches it).
There is no `teachers` table, no schedule table, no assignment concept
anywhere in this codebase. "Teacher" is already fully represented by
the existing `users` + `user_school_memberships` + `user_school_roles`
(`teacher` role) — no new identity table is needed.

## Research (verified, not assumed)

- **RA 4670 (Magna Carta for Public School Teachers)** and **DepEd
  Order No. 005, s. 2024** ("Implementation Guidelines on Rationalizing
  Teachers' Workload and Overload Compensation," supplemented by DepEd
  Memorandum No. 053, s. 2024): a public school teacher's 8-hour
  workday splits into **at most 6 hours of actual classroom teaching**
  plus 2 hours of ancillary tasks; exceeding 6 hours of classroom
  teaching triggers overload compensation eligibility. **CONFIRMED
  requirement**: teaching load is fundamentally a **time** metric
  (hours/minutes), not merely a count of classes.
- **CONFIRMED**: DO 005 s.2024 explicitly classifies **class-advising
  ("advisory") as an ancillary task**, separate from the 6-hour
  classroom-teaching load. Advisory assignment must **not** be modeled
  as, or counted toward, instructional teaching load in this
  foundation.
- **UNRESOLVED (deliberately not guessed)**: the exact numeric overload
  threshold is authoritative and long-standing (6 hours/day), but this
  milestone does not encode automatic overload enforcement — see
  Decision below.
- **Triangulated, not primary-source-verified this session** (search
  results, not a downloaded DepEd Order PDF — recorded honestly, same
  disclosure standard as prior milestones): the general shape above.
  `docs/SOURCE-REGISTRY.md` records the exact sources.

## Decision

**Three separate concepts, two new tables, load always derived —
Recommended over 9 other internally-scored designs** (class-record-
centered, course-offering model, teacher-centric JSON blob,
schedule-first/no-assignment-identity, a polymorphic "assignment type"
table covering teaching+advisory+ancillary together, and others):

1. **`teaching_assignments`** — _who teaches what, for how long a
   period_. `(id, school_id, teacher_user_id, section_id, subject_id,
created_at)`, `UNIQUE (section_id, subject_id)` — at most one
   teacher per section+subject at a time (matches the documented job
   "avoid duplicate/conflicting assignments"; a reassignment is an
   explicit remove-then-create, not a silent overwrite). Deliberately
   stores **no `school_year`** of its own — derived from
   `sections.school_year` via `section_id`, the exact same
   single-source-of-truth reasoning ADR-0011 already established for
   `class_records`. `teacher_user_id` is validated to be a member of
   `school_id` (via the existing `user::is_member_of_school`) — not
   role-gated to `teacher` specifically, matching how `class_record::create`
   validates its own referenced section/subject by existence-in-school
   rather than by role.
2. **`schedule_meetings`** — _when/where an assignment occurs_, one row
   per recurring weekly slot. `(id, school_id, teaching_assignment_id,
weekday 0-6, starts_at "HH:MM", ends_at "HH:MM", room nullable,
created_at)`. Local wall-clock time as plain `HH:MM` text — the
   Philippines is a single timezone; storing UTC timestamps would add
   pure incidental complexity for zero benefit and real bug risk (a
   recurring Monday 8am class is not a moment in time, it is a
   standing local-clock rule). An exceptional one-off date override is
   explicitly deferred (see Not Built below), but this shape does not
   block adding one later (a nullable `specific_date` column or a
   separate override table, neither designed now).
3. **Teacher Load — always derived, never stored.** No
   `teacher.total_load` column. A load query joins
   `teaching_assignments` → `schedule_meetings` for one teacher and
   returns three independent numbers per PRODUCT-CONTRACT §6's own
   explicit requirement to "track both classroom teaching time and
   distinct preparation count" — never balance on one number alone:
   assignment count, distinct-subject (preparation) count, and total
   weekly instructional minutes. The 6-hour/day RA 4670 threshold is
   **not enforced** this milestone (no reject, no warning) — the
   metric this milestone produces is exactly what a future
   overload-flagging feature would need, but deciding whether to hard
   block, warn, or merely report an overload is a product-policy
   question with no repository evidence yet, not guessed at here.

**Explicitly NOT the same entity as `class_records`, and no FK between
them this milestone.** A class record is scoped to one grading period
(proliferates ~3×/year per subject as terms are set up) and requires a
grading period to already exist; a teaching assignment is a school-year-
long relationship that must be able to exist before any grading period
or class record does (the documented job: assign, then eventually
schedule, then eventually grade). Forcing a link now would mean either
retrofitting `class_records` (an already-stable, four-ADR-deep table)
for a benefit nothing yet needs, or blocking assignment on a class
record existing — a real regression on the documented job. A future
milestone may choose to derive a class record's owning teacher by
matching `(section_id, subject_id, school_year)` against
`teaching_assignments`, entirely without a schema change here.

**Advisory and ancillary duties are explicitly out of scope** — DO 005
s.2024 itself classifies advisory as non-instructional; conflating it
into `teaching_assignments` would misrepresent DepEd's own workload
categories, not just be premature scope.

## Authorization

New `Capability::ManageTeachingAssignments`, **School Head only** —
deliberately not `ManageSchoolMembership` (per this milestone's own
instruction not to reuse it merely because School Head currently owns
it — assigning teachers to classes is a distinct scheduling-authority
decision, not a membership-onboarding one) and not `ManageLearners`
(Registrar's scope is enrollment/records, not staffing). Gates create/
remove of both `teaching_assignments` and `schedule_meetings`.

**Viewing is a separate, narrower rule, not a capability**: a session
may view a teacher's own load/schedule (`teacher_user_id == session's
own user_id`) OR any teacher's load/schedule if the session holds
`ManageTeachingAssignments`. A Teacher must not be able to view (let
alone modify) another teacher's load without School Head authority —
implemented as `auth::authorize_view_teacher_load`, a new small gate
function (not a `Capability` match arm, since it depends on which
teacher is being viewed, not a fixed role set) — mirrors this
codebase's existing pattern of small, purpose-built `authorize_*`
functions rather than forcing everything through one shape.

Every write path derives `school_id` from the session only, never a
client-supplied parameter — the same non-negotiable already established
for every other command in this codebase.

## Consequences

- `src-tauri/src/db/migrations.rs` — migration #18: `teaching_assignments`,
  `schedule_meetings`.
- `src-tauri/src/repository/teaching_assignment.rs` (new) — create,
  remove, replace, list-by-teacher, list-by-section, teacher-load
  derivation.
- `src-tauri/src/repository/schedule_meeting.rs` (new) — create (with
  teacher/section/room conflict detection), remove, list-by-teacher,
  list-by-section.
- `src-tauri/src/auth/mod.rs` — `Capability::ManageTeachingAssignments`;
  `authorize_view_teacher_load`.
- `src-tauri/src/commands/teaching_assignment.rs` (new) — thin command
  wrappers, session-derived `school_id` only.
- **No UI this milestone.** The documented vertical slice ("School Head
  assigns one teacher, sees it reflected in load") is proven at the
  repository/command layer with tests, the same zero-UI proof shape
  RBAC Foundation and Curriculum Foundation both already used
  successfully this program. Inventing a first-ever "Teachers/Personnel"
  screen from nothing is a bigger step than "one thin vertical slice,"
  and the milestone explicitly prohibits building the scheduling
  workspace itself.
- Not built this milestone (explicit non-goals): any timetable
  optimizer/solver; advisory/ancillary duty tracking; personnel
  qualifications/position/designation; availability/constraints;
  relief/substitute suggestion; SF7 export; "My Day" integration; any
  UI; automatic overload enforcement (metric only, no policy decision);
  one-off exceptional-date schedule overrides (shape left open, not
  designed); any change to `class_records`.
