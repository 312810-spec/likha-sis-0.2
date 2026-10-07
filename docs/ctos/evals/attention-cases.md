# Attention / Learning Support cases

**Created at:** M08 (2026-10-08). Written from the test names that genuinely
exist at the cited lines.

Every case below names a real test. `Verified` means the test exists and is wired
into the run that M08's checkpoint records.

## The loop's middle (CTOS.md §M08)

The loop's required spine is
`Evidence → identified need → goal → intervention → participation → follow-up → outcome`.
Before M08 the evidence end (the class occurrence) and the follow-up end
(`LearnerFollowupMarker`) both existed. The middle — the teacher's explicit plan,
the learner's participation, and the outcome — did not exist at all, which is the
gap M08 closes.

### One order only

- **a case opens `open` and the three plan fields are all required and trimmed** —
  `Verified`. `src-tauri/src/repository/learner_support.rs`
  (`opening_a_case_records_the_plan_and_starts_it_open`,
  `a_case_requires_all_three_plan_fields`). Empty or whitespace-only `need`,
  `goal` or `intervention` write nothing and return a validation error.
- **the loop advances in exactly one order** — `Verified`.
  `the_full_loop_advances_in_one_order_only`. `open → in_progress` requires a
  participation record; `in_progress → resolved` requires an outcome. Every other
  transition is refused with `Ok(None)` so the screen can say so rather than
  silently succeeding.
- **the schema, not the query, holds the order** — `Verified`.
  `the_schema_forbids_an_empty_plan_field`. Three cross-column CHECK constraints
  make the order the database's property: `participation IS NULL OR status <> 'open'`,
  `outcome IS NULL OR status = 'resolved'`, `resolved_at IS NULL OR status = 'resolved'`.
  Mirrors `OccurrenceStatus`'s M06 precedent.
- **a resolved case keeps its outcome and its timestamp forever** — `Verified`.
  `resolve` sets `resolved_at` alongside `outcome`, and CTOS §5's
  historical-integrity rule forbids a later edit from reinterpreting it.

### Ownership re-derived at the boundary

- **another teacher cannot open a case on someone else's class** — `Verified`.
  `another_teacher_cannot_open_a_case_on_someone_elses_class`. Ownership is
  re-derived from the occurrence's own teaching assignment via
  `authorize_own_assignment`, never from a client-supplied claim.
- **another teacher cannot advance a case they do not own** — `Verified`.
  `another_teacher_cannot_advance_a_case_they_do_not_own`. Every transition
  re-authorizes through the case's own occurrence.
- **an unknown occurrence or an off-roster membership writes nothing** —
  `Verified`. `an_unknown_occurrence_or_off_roster_membership_writes_nothing`.
  Returns `Ok(None)`; a caller that has gone stale cannot create a dangling case.
- **a school cannot read another school's cases** — `Verified`.
  `a_school_cannot_read_another_schools_cases`.
- **the learner name is resolved by the repository, not the caller** —
  `Verified`. `the_learner_name_is_resolved_by_the_repository_not_the_caller`.
  `CASE_SELECT` joins `section_memberships` → `learners`, following the M07
  author-name precedent. No caller can supply a display name.
- **the most recent plan is listed first, deterministically** — `Verified`.
  `list_orders_the_most_recent_plan_first`. `ORDER BY opened_at DESC, id DESC` —
  the `id` tie-break matters because two cases opened in the same millisecond
  share `opened_at`, and UUIDv7's leading bytes are the generating timestamp, so
  the tie-break stays newest-first.

### Teacher-confirmed state (CTOS.md §M08: "official saved state remains teacher-confirmed")

- **the marker's reason drafts the need; nothing is saved without an explicit
  submit** — `Verified`. `src/ui/LearningSupportScreen.test.tsx`
  (`drafts the need from the marker's reason and saves the plan on one explicit
submit`). The save button is disabled until all three fields are non-empty.
- **the plan survives a failed marker clear** — `Verified`.
  `keeps the plan when clearing the marker fails`. `openCase` runs before
  `clearFollowup`, in that order, so a failed clear cannot lose the plan it was
  raised for. The marker is cleared, never deleted, so the day's history keeps it.
- **a refused transition is reported, not silently swallowed** — `Verified` at both
  layers. `src/ui/LearningSupportScreen.test.tsx`
  (`reports a refused transition instead of pretending it succeeded`) and the
  repository's `Ok(None)` contract.
- **each step's action is the button for that step** — `Verified`.
  `shows each case's plan and the one action its status permits`. An open case
  offers only "Record participation"; an in-progress one only "Record outcome"; a
  resolved one offers nothing.

## Unfinished assessment work (CTOS.md §6.1)

`pendingScoring` — a class record with assessment items set up but not every
eligible learner scored. This is one of the two §6.1 items the my-day aggregate
did not used to surface. Derived, never stored: a class record already carries
`itemCount` / `recordedCount` / `totalEligible`.

- **a partially scored class record with items is listed** — `Verified`.
  `src-tauri/src/repository/my_day.rs`
  (`pending_scoring_lists_a_class_record_with_items_that_is_not_fully_scored`).
  Shows `recordedCount` against `itemCount * totalEligible`, because "3 of 12
  recorded" is actionable and "3 recorded" is not.
- **a class record with no items set up yet is not listed** — `Verified`.
  `pending_scoring_ignores_a_class_record_with_no_items_set_up_yet`. "No
  assessment designed yet" is a different question from "not finished scoring".
- **the pending-scoring row opens its class record** — `Verified`.
  `src/ui/MyDayScreen.test.tsx` (`surfaces unfinished scoring with the class
record it belongs to`). The row carries `teachingAssignmentId` so it reuses the
  same assignment-keyed handoff every other pending item uses.

## Learner follow-up due (CTOS.md §6.1)

`pendingFollowups` — standing (never-cleared) follow-up markers on this teacher's
own classes. The second §6.1 item the aggregate did not used to surface.

- **standing markers are listed with the learner's name** — `Verified`.
  `pending_followups_lists_standing_markers_with_the_learners_name`. Joined
  through `learner_followup_markers` → `class_occurrences` → `teaching_assignments`
  → `subjects` / `sections` → `section_memberships` → `learners`, all in one query.
- **cleared markers stop demanding the day's attention** — `Verified` by the same
  test's `cleared_at IS NULL` filter, following M06's cleared-not-deleted rule.
- **the list is scoped to this teacher's own classes** — `Verified`.
  `pending_followups_are_scoped_to_this_teachers_own_classes`. The scoping is in
  SQL (`ta.teacher_user_id = ?`), not read-then-filtered in Rust.
- **the marker hands its own enrollment key to the plan** — `Verified`.
  `MyDayScreen.test.tsx` (`hands a standing follow-up to the learning-support plan
with its own enrollment key`). The row carries `sectionMembershipId` — added in
  this milestone, because `openCase` keys on the enrollment span, not a bare
  learner id.

## Not claimed

- **The browser axe gate does not traverse this screen.** The new screen is
  axe-checked in jsdom by its own `has no new accessibility violations` test, not
  by `npm run quality:ui`, whose harness drives the synthetic dev preview. The
  preview renders `AssignedClassFolio` for the "Classes" tab rather than the real
  `MyDayScreen`, and seeds no class occurrences or follow-up markers, so the new
  screen has no fixture path to be reached through. jsdom has no layout engine, so
  the jsdom check covers structure (labels, roles, ARIA) and explicitly not
  contrast or layout.
- **The marker↔case link stays a handoff, not a stored foreign key.** A support
  case does not record which marker it answered. The screen clears the marker
  after the plan is written; the case itself is anchored to the occurrence and the
  enrollment, which is what the ownership rule needs. A "this case closed that
  marker" query is not claimed and would need a new column.
- **No suggestion or summarization AI.** CTOS.md §M08 allows "AI can suggest or
  summarize"; M08 implements only the teacher-confirmed half. The one place a
  machine draft appears is the marker's reason pre-filling the need field, which is
  the teacher's own earlier text, not generated content.
- **No native Windows or Android evidence this milestone.** The Rust suite
  exercises the new migration and repository against the encrypted device
  database; the installed packages were not built or exercised.
