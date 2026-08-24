# ADR-0008 — Section Foundation & DepEd Attendance Semantic Alignment (M9)

Status: Accepted

## Context

M8's real DepEd source (`CONSO SF v2025.xlsx`) surfaced two concrete gaps
in the M7/M8 attendance model, disclosed on-screen at the time rather than
silently accepted:

1. SF2 is organized **per section/grade level**. This schema had no
   `Section`/`GradeLevel` entity — attendance was recorded and summarized
   school-wide, which cannot produce a real section-level SF2 export.
2. DepEd's actual per-day attendance codes are **Present (blank) / Absent
   (x) / Tardy (shaded)** — three codes, not four. This app's model had a
   `Late`/`Excused` pairing with no official basis; `Excused` in
   particular has no DepEd equivalent at all.

M9 was redirected from the previously-decided "Learner Profile
Enrichment" (LRN/birthdate/guardian — still a valid, DepEd-mandated need,
see `docs/product/M9-DECISION.md`) to close these two gaps instead,
because they block every future official-form milestone at a more
fundamental level than the learner-record fields do: without sections,
there is no way to scope attendance, rosters, or reports the way DepEd
actually organizes a school. This decision was made mid-session (recorded
only in this session's own working notes at the time); this ADR is the
durable record of what was decided and why, not a re-opening of the
choice — see `docs/product/M9-DECISION.md` for the product-decision
context.

## Decision

**A `Section` entity, scoped to school/school-year/grade-level/name.**
`sections` (migration 5): `id`, `school_id`, `school_year`, `grade_level`,
`name`, unique on `(school_id, school_year, grade_level, name)`. Mirrors
`learner::find_by_id_in_school`'s isolation convention exactly
(`section::find_by_id_in_school`, `section::list_by_school`).

**Membership as a half-open time interval, not a foreign key on
`Learner`.** `section_memberships` (`section_id`, `learner_id`,
`starts_on`, `ends_on` nullable) models "this learner was on this
section's roster from `starts_on` up to but not including `ends_on`"
rather than a single current `section_id` column on `learners`. This is
the same pattern reason as `SectionMembership`'s doc comment: a transfer
mid-year needs to close one membership and open another without gaps or
double-counting, and a monthly report needs to include a learner who
transferred out partway through the month. A `starts_on`/`ends_on <
half-open>` interval makes both "who's on the roster right now"
(`roster_for_section`) and "who was on the roster at any point in this
date range" (`roster_for_section_over_range`) simple range queries
instead of needing a separate history table.

**"At most one open membership per learner" is a structural invariant, a
unique partial index, not application-level check-then-act.** `CREATE
UNIQUE INDEX idx_one_active_membership_per_learner ON
section_memberships(learner_id) WHERE ends_on IS NULL`. This project has
shipped this exact class of bug twice before at the SQL layer (the M4
self-grant race, the M6 bootstrap race) — both were `SELECT`-then-act
checks that didn't actually participate in SQLite's write-lock
serialization. Enforcing the invariant as a real constraint instead of
application logic makes the same mistake structurally impossible here,
rather than trusting a third careful review to catch it.

**Attendance is now section-scoped, not merely school-scoped.**
`attendance_records` gained `section_id` (nullable, for legacy-row
compatibility — see Consequences) and `record()`/
`roster_for_section_date()`/`monthly_grid_for_section()` all take
`section_id` as an explicit parameter, verified in order: the section
belongs to the caller's school, the learner belongs to the caller's
school, and the learner holds an _active membership in that section on
that date_ (`section_membership::is_active_member`). A learner who is on
the school's roster but not that section's roster on that date cannot be
marked — this is a real narrowing of who can be marked, not just an
added filter on reads.

**`section_id` is a legitimately client-supplied identifier, the same way
`learner_id` already is.** Unlike `school_id` (always session-derived,
never a parameter — ADR-0004's core invariant), `section_id` and
`learner_id` both identify WHICH thing within the caller's own school,
and isolation is enforced by scoping every query on both `school_id` AND
the supplied id together. A `section_id` from another school does not
leak rows; it resolves to nothing, exactly like an unrelated
`learner_id`.

**The retired `late`/`excused` statuses are migrated, not dropped
silently.** SQLite cannot alter a `CHECK` constraint in place, so
migration 5 rebuilds `attendance_records` (standard
create-copy-drop-rename), remapping `late → tardy` (direct rename) and
`excused → absent` (no DepEd equivalent exists; `absent` is the closer of
the two remaining options — an excused absence is still an absence for
attendance-counting purposes). This is a real, tested, lossless data
migration (`db::migrations::tests::migration_5_converts_legacy_attendance_data_without_loss`),
not merely a forward-only schema change — row count is preserved, no
rows are dropped, and the new `CHECK` constraint is proven to reject the
retired `excused` value going forward.

## Consequences

- New: `src-tauri/src/repository/{section,section_membership}.rs`,
  `src-tauri/src/commands/section.rs`, migration 5. `attendance.rs`
  (repository + commands) reworked: `roster_for_date` →
  `roster_for_section_date`, `monthly_grid` → `monthly_grid_for_section`,
  `record` gained a `section_id` parameter.
- New TS: `src/domain/section.ts`, `src/domain/ports/section-repository.ts`,
  `src/infrastructure/tauri/section-repository.ts`,
  `src/application/section-service.ts`, `src/ui/SectionsScreen.tsx`
  (create a section, enroll a learner — the minimum needed for the
  now-section-scoped Attendance/Monthly-Summary screens to be reachable
  at all, not full section-roster management). `AttendanceStatus` is now
  `"present" | "absent" | "tardy"` throughout the TS layer, matching
  Rust; `MonthlyLearnerAttendance.lateCount`/`excusedCount` became
  `tardyCount` (with `absentCount` absorbing the old `excusedCount`
  total).
- `AttendanceScreen`/`MonthlySummaryScreen` both gained a section picker
  (defaulting to the first section returned) ahead of their existing
  date/month pickers; teacher-facing copy changed from
  "Present/Absent/Late/Excused" to "Present/Absent/Tardy" throughout,
  including `aria-label`s.
- **Legacy rows become permanently unreachable through any read path, by
  design, not oversight — worth stating plainly rather than leaving
  implicit.** Migration 5 leaves pre-migration `attendance_records` with
  `section_id = NULL` (an honest "recorded before sections existed"
  marker) rather than backfilling a fabricated section. But every current
  read path filters or joins on `section_id` (`roster_for_section_date`,
  `monthly_grid_for_section`), and the old school-wide `roster_for_date`
  was deleted outright — so a NULL-`section_id` row can never appear in
  any UI a teacher can reach. On this project's dev-only synthetic data,
  with no production install yet, this is an acceptable v1 gap, not a
  data-loss bug (the rows still exist and are recoverable by direct
  query). If a real install ever exists before a "retroactively assign
  legacy attendance to a section" tool is built, this is exactly where a
  "my attendance history disappeared" report would trace back to — flag
  it here rather than relying on a future debugger to rediscover it from
  scratch.
- **This grid does not distinguish "unmarked" from "not an active member
  that day."** `monthly_grid_for_section` shows `None` for both a day the
  learner was simply never marked and a day they weren't yet (or no
  longer) an active section member. Deliberate v1 simplification — a
  correct distinction would need a third grid state, not just
  `Option<AttendanceStatus>`. Not required for this milestone; a real
  gap if a teacher relies on this grid to notice "this student was never
  marked" versus "this student joined mid-month."
- Not implemented (deliberately out of scope): full section-roster
  management (removing/editing a membership from the UI, viewing a
  section's current roster as its own screen), bulk enrollment, a
  section-level SF2 export (this milestone is the prerequisite for that,
  not the export itself — see M8-DECISION.md), grade-level/school-year
  as anything beyond free-text fields (no controlled vocabulary, no
  DepEd-standard grade-level list validated against a source).
