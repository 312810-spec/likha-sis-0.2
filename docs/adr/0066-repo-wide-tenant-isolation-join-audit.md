# ADR-0066 — Repo-wide tenant-isolation JOIN audit: every joined tenant table independently constrains `school_id`

Status: Accepted

## Context

The section-membership isolation hardening
(`docs/adr/0042-*` "Addendum (post-Wave-3, 2026-09-03)", PR #34) added an
independent `l.school_id = ?` predicate to every reader that joins
`learners` to `section_memberships`, so a hand-forged
`section_memberships` row pointing a foreign-school `learner_id` at a
local section could not leak that learner. Its `security-reviewer` pass
noted the sweep was scoped to the `learners`-JOIN family only — joins on
`attendance_records`, `learner_scores`, `class_records`, `sections`,
`subjects`, `grading_periods`, `schedule_meetings`, etc. were not
checked for the same "independently constrain **every** joined tenant
table" property.

This ADR is that repo-wide audit.

## Method

Every `JOIN` in `src-tauri/src/repository/**` (there are none in
`export/**` or `formgen/**`) that joins two or more tables carrying a
`school_id` column and returns tenant data was checked against one
question: **is every joined table that has a `school_id` column
constrained to the session `school_id`** — directly in the `WHERE`/`ON`,
or transitively via a join condition like
`sec.school_id = sa.school_id` where the anchor is already constrained?

Where the answer was no, the create/write path for the FK child was
inspected. In every case it validates same-school FKs
(`class_record::create`, `teaching_assignment::create`,
`schedule_meeting::create` all call `*::find_by_id_in_school` on each
FK), so a cross-school FK row **cannot be produced through the app** —
every finding is **defense-in-depth**, the same situation ADR-0042's
addendum hardened for (`enroll` validated same-school, yet the readers
still gained an independent constraint, proven with hand-forged-row
regression tests).

## Already correct (no change)

- `audit_log` LEFT JOIN `users` — `users` is a global identity table
  with no `school_id`; the actor genuinely is whoever acted.
- `grading` × 2, `class_record` (weight-policy / curriculum joins) —
  join only global, versioned reference tables
  (`grading_policy_periods`, `grading_weight_policies`,
  `curriculum_versions`).
- `learner_score::roster_for_item` — already constrains `sm.school_id`,
  `l.school_id`, and `ls.school_id` (the reference pattern).
- `section_advisory` list — join condition is
  `sec.school_id = sa.school_id` with `sa.school_id = ?1`, so `sections`
  is transitively constrained.
- `section_membership::enrollable_learners` and the three readers
  hardened by ADR-0042's addendum.
- `user::list_members_in_school` — `users` is global;
  `user_school_memberships` and `user_school_roles` are both constrained.
- `subject_attendance` entries→sessions — `subject_attendance_entries`
  has **no** `school_id` column (it is a pure child of its session);
  `s.school_id = ?1` on the session is the only possible scope and is
  present.

## Findings hardened

All defense-in-depth; each adds the missing independent `school_id`
constraint. `class_record` and `teaching_assignment` return joined
**names** (section / subject / grading-period label) to the teacher UI
and to `export::report_card`.

| #   | Reader                                                                                                 | Fix                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | `class_record::section_and_period_range_in_school`                                                     | `+ AND gp.school_id = ?2`                                                                                                                                                |
| 2   | `class_record::school_year_in_school`                                                                  | `+ AND gp.school_id = ?2`                                                                                                                                                |
| 3   | `class_record` `DETAIL_SELECT_LIST` (`list_by_school` / `find_detail_by_id_in_school`)                 | `+ AND sec.school_id = ?1 AND sub.school_id = ?1 AND gp.school_id = ?1`; both count subqueries `+ AND ai.school_id = cr.school_id` / `+ AND ls.school_id = cr.school_id` |
| 4   | `teaching_assignment` `DETAIL_SELECT` (`list_by_teacher_in_school` / `list_by_section_in_school`)      | `+ AND sec.school_id = ?1 AND sub.school_id = ?1`                                                                                                                        |
| 5   | `attendance::roster_for_section_date` — `LEFT JOIN attendance_records a`                               | `+ AND a.school_id = ?1` in the `ON` (matching `learner_score::roster_for_item`'s `ls.school_id` predicate)                                                              |
| 6   | `grading_computation::leaf_percentage_score`                                                           | gains a `school_id` parameter; `+ AND ai.school_id = ?4 AND ls.school_id = ?4`; both `compute_term_grade` call sites updated                                             |
| 7   | `schedule_meeting::has_teacher_conflict` / `has_section_conflict` / `total_weekly_minutes_for_teacher` | `+ AND sm.school_id = ?2` (`schedule_meetings` has its own `school_id`; `ta.school_id` was the only scope)                                                               |
| 8   | `section_membership::dependent_records_stranded` NOT-EXISTS subquery                                   | `+ AND cr.school_id = ?2 AND gp.school_id = ?2` (no dedicated test — `ls.school_id` already constrained, `cr.section_id` scoped, covered by existing transfer/end tests) |

### Why these matter (the leak each closes)

- **#3 / #4** — a forged `class_records` / `teaching_assignments` row
  with cross-school section/subject/period FKs would surface another
  school's **section name, subject name, grading-period label, and
  school year** in the Class Records list, the Class Record workspace
  header, the teacher-load / teaching-assignments views, and a generated
  report card's header.
- **#5** — a forged `attendance_records` row in another school for an
  in-scope learner + section + date would show that foreign row's status
  and timestamp as the learner's attendance (`Some(Present)` where it
  should be `None`).
- **#6** — a forged `scored` `learner_scores` row in another school, on a
  real in-scope assessment item for the target learner, would be pooled
  into the DepEd percentage score (verified: PS `85.0` → `92.5` in the
  regression test), corrupting a computed **term grade**.
- **#7** — a forged `schedule_meetings` row in another school pointing at
  an in-scope teaching assignment would raise a false `TeacherConflict`
  / `SectionConflict` and inflate the weekly-minutes load total.
- **#1 / #2** — a forged `class_records` row with a cross-school
  `grading_period_id` would leak that period's date range (which gates
  score eligibility) and school year (which selects the transmutation
  table vs. zero-based grading).

## Verification (this session, branch `claude/tenant-isolation-join-audit`)

TDD: five new forged-row regression tests
(`class_record::detail_readers_do_not_leak_a_forged_cross_school_class_record`,
`teaching_assignment::detail_list_does_not_leak_a_forged_cross_school_assignment`,
`attendance::roster_for_section_date_left_join_ignores_a_foreign_school_attendance_record`,
`grading_computation::leaf_percentage_score_ignores_a_forged_foreign_school_score`,
`schedule_meeting::conflict_checks_ignore_a_forged_foreign_school_meeting_on_an_in_scope_assignment`).
Each was watched to fail with the isolation-gap reason (foreign name
resolved / `Some(Present)` vs `None` / PS `92.5` vs `85.0` /
`TeacherConflict` vs `Created`) with the predicates reverted, then pass
with them in place.

- `cargo test` — **656 lib** (651 + 5) + every integration binary
  (`class_record` 5, `schedule_meeting_management` 9,
  `teaching_assignment_management` 9, `grading` 5, `attendance_management`
  18, …), **0 failed**.
- `cargo clippy --all-targets -- -D warnings` — clean.
- `cargo fmt --check` — clean.
- `npm run quality` / `npm run quality:security` — see the branch handoff
  entry (no TS touched; no dependency change).

**Independent `security-reviewer` pass: verdict PASS** — no blocking, no
should-fix; audit independently confirmed complete (also checked
`commands/`, `import/`, `auth/`, `export/`, `formgen/` — no multi-table
JOIN SQL; two further repo JOINs found, both onto global reference
tables). Two Minor parity fixes were folded in on review:
`class_record` `DETAIL_SELECT_LIST`'s `item_count` subquery gained
`AND ai.school_id = cr.school_id` (matching the already-hardened
`recorded_count` subquery); `section_membership::dependent_records_stranded`'s
grades subquery gained `AND gp.school_id = ?2` (matching fixes #1/#2 on
the same table). Both are availability-only, not leaks, and not
reachable via `assessment_item::create` / `class_record::create`. Full
findings: `.planning/tenant-isolation-audit/security-review.md`.

## Consequences

- Every repository read that joins two or more tenant tables now
  independently constrains `school_id` on each of them (or joins only
  global reference data, or a child table with no `school_id`).
- No behaviour change for correct data — every fix is a pure tightening
  that only ever removes a row a cross-school-corrupted FK should never
  have matched. All membership/class-record/assignment/meeting create
  paths already validate same-school FKs, so these rows cannot arise
  through the app.
- `grading_computation::leaf_percentage_score`'s signature gained a
  `school_id: &str` parameter — an internal function, its two call sites
  in `compute_term_grade` (which already has `school_id`) updated.
- No schema change, no migration, no command surface change, no
  `authorize_*` gate change. `scripts/check-architecture.mjs` unaffected.
- This completes the "constrain every joined tenant table" sweep the
  ADR-0042 addendum's review flagged as still owed.
