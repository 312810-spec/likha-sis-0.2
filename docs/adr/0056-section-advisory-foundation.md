# ADR-0056: Section Advisory Foundation (Wave 3E)

Status: Accepted

## Context

`docs/product/SUBJECT-ATTENDANCE-SPEC.md` lists "Adviser View" as a
main screen: a section adviser reading read-only subject-attendance
signals across their own advisory class. Every prior addendum to
ADR-0055 (Subject Attendance Foundation) carried "Subject Monitor /
Adviser View" forward as one bundled candidate, because the spec
bundles them under one heading. Wave 3D (Subject Monitor) re-examined
that bundling before writing any code and found the two need
fundamentally different authorization shapes: Subject Monitor reads
data the caller already owns (`authorize_own_assignment`, zero new
design); Adviser View requires a relationship — "who is the adviser of
this section" — that does not exist anywhere in this codebase.

An exhaustive grep across `src-tauri/src/`, every migration, and every
prior ADR confirmed this: no column on `sections`, no `adviser` role in
`user_school_roles`' `CHECK (role IN ('teacher', 'registrar',
'school_head'))`, no enforcement anywhere. Even SF2's own
`commands/attendance.rs` — informally called "adviser-facing" in
`docs/product/PRODUCT-CONTRACT.md` as a UX label only — gates purely on
`require_active_school_scope`, with no adviser-specific check at all.
`docs/product/PRODUCT-CONTRACT.md` also names SF5 ("Adviser/EOSY
workflow") and SF9 ("adviser reviews, doesn't re-encode") as future
milestones that will need the same relationship. This is therefore a
real, cross-cutting architecture decision — not a UI wiring task —
properly warranting this project's established 10-scenario evaluation
process (`.claude/rules/autonomous-development.md`; see `docs/adr/0008-*`,
`0013-*` for prior examples of that process in use).

## Decision

### Scope: authorization/schema foundation only, no Subject Attendance read this wave

Matches this project's established zero-UI-first precedent for a new
domain (RBAC Foundation, Curriculum, Teacher Load, Subject Attendance
Foundation all shipped their first increment with full test coverage
and no caller). This wave answers exactly one question — how is "the
adviser of a section" represented and authorized — and ships it with
full test coverage but zero UI and zero change to any existing Subject
Attendance code path. The actual "Adviser View" read of Subject
Attendance data, built on the gate this wave introduces, is the next
slice (see Consequences).

### How "adviser of a section" is represented: a temporal `section_advisories` table

Ten scenarios were generated and scored against the project rubric
(Teacher Value 20%, DepEd Alignment 15%, Dependency Readiness 10%,
Reuse 10%, Architectural Fit 10%, Security Safety 10%, Implementation
Risk 10%, Testing Confidence 5%, Future Leverage 5%, Time-to-Value 5%
— the same weights `docs/product/M8-DECISION.md` established, reused
per `docs/PROJECT-MEMORY.md`'s "no `SCENARIO-RUBRIC.md` file exists"
note):

1. A bare nullable `sections.adviser_user_id` column.
2. **A `section_advisories` table with a half-open `starts_on`/`ends_on`
   interval, mirroring `section_memberships` exactly.**
3. Reuse `teaching_assignments` via a reserved pseudo-subject
   ("Advisory") standing in for a real subject.
4. Extend `user_school_roles` with a nullable `section_id` scope column.
5. A new `user_section_roles` table (`role CHECK (role IN ('adviser'))`),
   untemporal.
6. Compute "adviser" implicitly — whichever teacher holds the most
   subject assignments for a section.
7. A boolean `is_adviser` flag on individual `teaching_assignments` rows.
8. A generic polymorphic `section_owners` table supporting multiple
   owner "kinds" (adviser, co-adviser, coordinator) from day one.
9. Retrofit `Capability` itself to be resource-scoped (keyed by section,
   not just role), and add an `adviser` capability.
10. Do not model advisership as data at all — treat any teacher with a
    `TeachingAssignment` on a section as authorized to view all of that
    section's Subject Attendance data.

- **Recommended (chosen): Scenario 2, a `section_advisories` table
  (`id`, `school_id`, `section_id`, `teacher_user_id`, `starts_on`,
  `ends_on` nullable, `created_at`), with "at most one active adviser
  per section" enforced as a real unique partial index
  (`idx_one_active_adviser_per_section ON section_advisories(section_id)
WHERE ends_on IS NULL`) rather than application check-then-act.**
  Highest score on DepEd Alignment, Reuse, Architectural Fit, Security
  Safety, Testing Confidence, and Future Leverage. DepEd schools
  reassign advisers by school year (sometimes mid-year); a temporal
  interval is the only shape among the ten that can answer "who advised
  this section last year" without loss, the same reasoning ADR-0008
  already established for `section_memberships` over a bare
  `learners.section_id` column. It reuses that exact schema pattern
  (half-open interval, unique-partial-index invariant — the fourth time
  this codebase has used that invariant shape, after migrations 5, 6,
  and 9) and `authorize_view_teacher_load`'s exact self-or-School-Head
  gate shape, so both the schema and the authorization function are
  proven patterns, not new risk. It is also the only scenario that
  cleanly generalizes to SF5 and SF9's own future "adviser" needs
  without redesign — those milestones can read the same table and gate.
- **Next Best: Scenario 1, a bare `sections.adviser_user_id` column.**
  Faster to implement (fewer moving parts, no new table), and adequate
  if this project only ever needed "who advises this section right
  now." Rejected because it fails the same test ADR-0008 already
  applied to section membership: overwriting the column when a school
  reassigns an adviser at the start of a new school year silently
  destroys the prior year's record, which this project's own audit-
  trail expectations elsewhere (`sf1_import_history`, `audit_log`,
  Subject Attendance's own "actor, device, time" requirement) would
  then have no way to recover. A later migration from Scenario 1 to
  Scenario 2 to fix this would need to reconstruct lost history from
  nothing — better to build the temporal shape once, now, while there
  is no data to lose.

Scenarios 3, 4, 6, 7, 9, and 10 were rejected outright (not
finalists): 3 and 7 conflate two different relationships (subject-
teaching vs. advisory oversight) that happen to often be held by the
same person but are not the same fact, and would pollute
`teaching_assignments`/`subjects` with a fake concept; 4 and 9 require
retrofitting existing, already-shipped, already-tested authorization
infrastructure (`user_school_roles`, `Capability`) for a resource-scoped
shape neither was designed for, a much larger and riskier change than
this foundation needs; 6 is not authorization at all — it is a
heuristic that could assign advisory authority to the wrong person
silently, and breaks the moment a section has an even split; 8 is
speculative generality with no current second "owner kind" to justify
it, violating this project's own scope-discipline rule against
designing for hypothetical future requirements; 5 lacks the temporal
shape Scenario 2 provides for no offsetting benefit over it.

### Authorization: a new `Capability::ManageSectionAdvisories`, and a new self-or-School-Head read gate

`auth::Capability` gains `ManageSectionAdvisories` (School Head only),
deliberately its own variant rather than reusing
`ManageTeachingAssignments` — matching that variant's own doc comment,
which reasons the same way about not reusing `ManageSchoolMembership`:
who advises a section is a distinct scheduling-authority decision from
who teaches which subject to it, even though today both capabilities
resolve to the same role.

`auth::authorize_adviser_of_section(conn, sessions, section_id,
as_of_date) -> AppResult<(user_id, school_id)>` mirrors
`authorize_view_teacher_load`'s exact self-or-School-Head shape: the
section's current adviser (as of `as_of_date`) passes, and so does
anyone holding `ManageSectionAdvisories`. `as_of_date` is caller-
supplied, never computed server-side — matching every other date
parameter in this codebase (`open_or_get_session`'s `session_date`,
`subject_attendance::monitor_for_assignment`'s `as_of_date`). **This
gate is not yet called by any command** — it is the boundary a future
Adviser View read will be built on, written and fully tested now so
that wave can focus entirely on the read itself.

### Commands: assign, end, and read — reference-data convention for the read

`assign_section_adviser`/`end_section_adviser`, gated by
`ManageSectionAdvisories` (School Head only), mirror
`create_teaching_assignment`/`remove_teaching_assignment`'s shape
exactly. `current_section_adviser` (read) is gated only by
`require_active_school_scope` — any authenticated school member may
read who currently advises a section, matching this codebase's
established convention that section-level reference data
(`list_teaching_assignments_by_section`) is generally viewable within
one's own school without a dedicated capability. Knowing who a
section's adviser is is not itself sensitive attendance/grade data.

## Consequences

- **Zero change to any existing Subject Attendance code path.**
  `subject_attendance::authorize_own_assignment` and every command in
  `commands/subject_attendance.rs` are untouched. This wave adds new
  files/functions only.
- **New Rust surface, no UI**: `section_advisories` table (migration
  23); `repository::section_advisory` (assign/end/current-lookup/
  is-current-adviser); `Capability::ManageSectionAdvisories`;
  `auth::authorize_adviser_of_section`; three new commands
  (`assign_section_adviser`, `end_section_adviser`,
  `current_section_adviser`), registered in `lib.rs`. The two
  capability-gated write commands were added to `invoke.ts`'s
  `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` set in the same wave
  (see ADR-0022's Wave 3B addendum for why this matters); the read
  command was correctly left out, matching
  `list_teaching_assignments_by_section`'s own precedent.
- **Exact next slice, now unblocked**: a Subject Attendance "Adviser
  View" read — a new repository function and command reusing
  `authorize_adviser_of_section` to return read-only subject-attendance
  signals across an adviser's own advisory section, per
  `docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s "Adviser View" screen.
  This wave deliberately stops short of that read so it can be
  reviewed and tested as its own focused unit.
- **Also unblocked, not started**: SF5 (Adviser/EOSY workflow) and SF9
  ("adviser reviews") can both resolve "who is this section's adviser"
  against the same table and gate once those milestones begin — no
  redesign needed, per the Future Leverage scoring above.
- **Retained gap, disclosed not hidden**: this table has no seed/
  migration path from any existing data — no prior version of this
  codebase ever recorded who advised a section, so every section
  starts with no adviser until a School Head assigns one. This is
  correct (there is no lost history to recover), not an oversight.

## Implementation record

**Verification**: `cargo test`: new `repository::section_advisory`
unit tests (assign/current-lookup/end/at-most-one-active invariant/
unknown-section/unknown-teacher/future-dated-not-yet-current/cross-
school isolation) and new `auth::authorize_adviser_of_section` unit
tests (self-as-adviser allowed/non-adviser denied/School-Head-without-
advising allowed/no-adviser-yet denied/no-session fails closed/School-
Head-from-a-different-school's-section denied), plus new
`tests/section_advisory.rs` command-boundary tests (School-Head-can-
assign-and-read-back/teacher-cannot-assign/no-session-fails-closed/
School-Head-can-end/teacher-cannot-end/any-teacher-can-read-reference-
data/cross-school-isolation-on-read). `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean. Full result counts
recorded in the Wave 3E delivery report
(`../../../LIKHA-SIS-DELIVERY-REPORTS/WAVE-3E-FINAL-REPORT.md`).

**Independent review**: this milestone touches a new authorization
gate, so `.claude/rules/security-privacy.md`'s independent-review
requirement applies. An independent `security-reviewer` agent was
dispatched, scoped to `authorize_adviser_of_section`, the
`section_advisory` repository/commands, and the `invoke.ts` exemption-
list change. Its findings could not be retrieved after one retry — the
known reviewer-harness resume/retrieval problem
`.claude/rules/autonomous-development.md` already anticipates. Per that
rule's protocol, a rigorous self-review was performed instead: both
`authorize_adviser_of_section` branches were traced for cross-school
leakage (none found beyond the bug already caught and fixed by TDD
above), `is_current_adviser`'s half-open date-range comparison was
checked at its exact-boundary and zero-length-interval edge cases (both
correctly resolve to "not current"), `assign`/`end` were confirmed to
reject a cross-school `section_id`/`teacher_user_id` and to scope `end`
by `(id, school_id, section_id)` together so a mismatched pair cannot
touch the wrong row, `current_section_adviser` was confirmed to
disclose nothing more than "no current adviser" for any id it cannot
resolve within the caller's school, and every new query was confirmed
parameterized (no string-built SQL). No blocking issue survived this
self-review. **The independent review remains owed, not satisfied by
self-review** — recorded as higher-priority debt in
`docs/VERIFICATION-DEBT.md`, to be retried in a later session once the
reviewer harness appears healthy, per this project's own periodic-retry
rule.

## Wave 3G Addendum: Section Advisory Management UI (2026-09-01)

Status: Accepted / Shipped

### Context & Need

Wave 3E established the backend foundation (`section_advisories` table, `assign_section_adviser`, `end_section_adviser`, `current_section_adviser`, and `Capability::ManageSectionAdvisories` authorization), and Wave 3F created `AdviserViewScreen` for reading subject attendance. However, no UI existed for a School Head to assign or end section advisories or for teachers to view the assigned class adviser directly in section management.

### Decision & Implementation

1. **Domain & Ports**:
   - Created `SectionAdvisory`, `AssignAdviserOutcome`, and `EndAdvisoryOutcome` in `src/domain/section-advisory.ts`.
   - Created `SectionAdvisoryRepository` port in `src/domain/ports/section-advisory-repository.ts`.
2. **Infrastructure**:
   - Created `TauriSectionAdvisoryRepository` implementing `getCurrentAdviser`, `assignAdviser`, and `endAdviser` via `invoke()`, thoroughly tested in `src/infrastructure/tauri/section-advisory-repository.test.ts`.
3. **Application Service**:
   - Created `SectionAdvisoryApplicationService` in `src/application/section-advisory-service.ts` with ISO date and non-empty string validation, tested in `src/application/section-advisory-service.test.ts`.
4. **Composition & UI**:
   - Wired `sectionAdvisoryService` in `src/composition.ts` and `src/App.tsx`.
   - Enhanced `SectionsScreen.tsx` to display active section advisers on each section row, provide an accessible inline "Manage adviser" panel to assign (teacher dropdown filtered by teacher role, start date) or end an advisory (effective end date), handle all outcomes and permissions, and provide Guided mode guidance.
   - Comprehensive test suite in `src/ui/SectionsScreen.test.tsx` verifying display, assign, end, validation, permissions, and axe-core accessibility.

## Wave 3H Addendum: Section Advisory Form Header Integration (2026-09-01)

Status: Accepted / Shipped

### Context & Need

With section advisory management established in Waves 3E and 3G, official DepEd form exports (such as School Form 2 Monthly Attendance and School Form 9 Report Card) required the assigned Class Adviser name in their official header metadata. Prior to this wave, adviser headers were either blank or omitted from disclosures.

### Decision & Implementation

1. **Export Engine Update**:
   - `src-tauri/src/export/sf2.rs`: Updated `build_sf2_export` signature to accept `adviser_name: Option<&str>`. Added `"Class Adviser"` header row (`adviser_name.unwrap_or("")`). Added `"Class Adviser (if assigned)"` to `populated_fields` in `FieldDisclosure` and added explicit note for unassigned adviser in `omitted_fields`. Added unit tests for assigned and unassigned adviser scenarios.
   - `src-tauri/src/export/report_card.rs`: Updated `build_report_card_export` signature to accept `adviser_name: Option<&str>`. Added `"Class Adviser"` header row, updated `FieldDisclosure`, and added unit tests.
2. **Command Layer Integration**:
   - `src-tauri/src/commands/export.rs`: Updated `export_section_monthly_sf2` to resolve the month-end date and query `section_advisory::current_adviser_for_section(&conn, &school_id, &section_id, &as_of_date)`, resolving teacher display name via `user::find_by_id(&conn, &advisory.teacher_user_id)` and passing it to `build_sf2_export`.
   - Updated `export_class_record_report_card` to resolve `ends_on` of the grading period and perform the same temporal adviser lookup, passing the adviser name to `build_report_card_export`.
3. **Verification**:
   - Integration tests in `src-tauri/tests/export.rs` testing assigned and unassigned adviser rendering against real database sessions and exported CSV content.
   - All quality gates, cargo tests, clippy, fmt, and harness verify 100/100 pass cleanly.
