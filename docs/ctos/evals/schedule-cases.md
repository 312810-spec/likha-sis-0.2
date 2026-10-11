# CTOS eval cases — schedule planning (M09)

**Milestone:** M09 — Teacher Load Maker + Smart Scheduling
**Covers:** CTOS.md §M09's acceptance list — independent checker, conflict
fixtures, stale-generation publication rejection, atomic publication,
version-consistent teacher/section/room views — plus the three required
generation states and the authorization boundary in front of them.
**Automated:** yes (Rust + TS). Every case below names the test that proves
it, and every test named here is wired into `cargo test` or `npm run quality`.

The case file is written from the real test names, not from the plan. Where a
clause is proven structurally rather than by a single test, that is said
explicitly and the structure is named.

## 1. The independent checker

The checker (`src/scheduling/check.rs`) shares no code with the generator. It
reads placements and inputs fresh from the database and re-derives every
constraint, so a draft the generator never produced is judged on its own
merits — which is what makes a human repair checkable.

| Case                                                          | Test (Rust)                                                                                |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| A generated plan passes the checker and publishes             | `a_school_head_generates_validates_and_publishes_a_plan`                                   |
| One teacher double-booked is flagged exactly once             | `the_checker_flags_one_teacher_double_booked` (`tests/schedule_planning_management.rs`)    |
| One section double-booked is flagged                          | `the_checker_flags_one_section_double_booked_and_one_room_double_booked`                   |
| One room double-booked is flagged                             | `the_checker_flags_one_section_double_booked_and_one_room_double_booked`                   |
| A class inside an unavailable window is flagged               | `the_checker_flags_a_class_inside_an_unavailable_window`                                   |
| A stale draft is still the draft after refusal                | `a_stale_generation_is_refused_at_publication`                                             |
| A generated plan's placements are listed for repair           | `lists the draft's placements for repair` (`SchedulePlannerScreen.test.tsx`)               |
| A clean plan reports clean                                    | `runs the independent checker and reports a clean plan` (`SchedulePlannerScreen.test.tsx`) |
| Each violation is explained in a teacher-readable sentence    | `explains each violation the checker finds` (`SchedulePlannerScreen.test.tsx`)             |
| The checker runs on a plan id, independently of publishing it | `runs the independent checker on the plan id` (`schedule-planning-repository.test.ts`)     |

Constraint coverage, and where each is checked:

- **teacher eligibility** — `check_teacher_conflicts`; the command layer's
  `Capability::ManageTeachingAssignments` gate
  (`a_teacher_cannot_generate_or_publish`)
- **subject requirements** — `check_requirement_shortfalls`
- **weekly/daily minutes** — `check_daily_and_weekly_load`, seeded from the
  DepEd Order No. 005 s. 2024 six-hour ceiling
  (`settings_default_to_the_national_policy_grid_and_are_school_scoped`)
- **teacher availability** — `check_teacher_unavailability`
- **section conflicts** — `check_section_conflicts`
- **room/lab conflicts** — `check_room_conflicts`, `check_unknown_rooms`
- **shared learners where applicable** — `check_shared_learners`, derived from
  actual `section_memberships` overlap rather than a stored flag
- **breaks/setup/travel buffers** — `check_passing_buffers`, adjacent meetings
  only
- **fixed decisions / legacy meetings** — `check_legacy_conflicts`, which
  validates a draft against the school's hand-created meetings
  (`plan_id IS NULL`) rather than deleting them

Of CTOS.md §M09's eleven required constraints, ten are enforced by the checker.
**Curriculum/term applicability is the exception and is not claimed** — see
"Not claimed" below.

## 2. The three required generation states

`GenerationOutcome` is a tagged enum with exactly three variants, so the screen
cannot render a state the backend did not report.

| State                                        | Proof (Rust)                                                                                    | Proof (TS)                                              |
| -------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| Valid solution                               | `a_school_head_generates_validates_and_publishes_a_plan`                                        | `reports a valid generation by its meeting count`       |
| Proven impossible under supplied constraints | `an_impossible_school_is_reported_not_crashed` (`scheduling/pipeline.rs`) — minutes vs. minutes | `reports a proven-impossible generation with its proof` |
| Search stopped / no solution yet             | `a_starved_budget_stops_instead_of_failing` (`scheduling/pipeline.rs`) — a zero-step budget     | `reports a stopped search as 'no solution yet'`         |

An `Impossible` outcome carries an `ImpossibilityProof` — required weekly
minutes against available weekly minutes — not a timeout excuse. A `Stopped`
outcome carries the steps used and the assignments still unplaced, and the plan
exists in all three cases so a partial timetable is still repairable.

## 3. Stale-generation publication rejection

| Case                                                     | Test                                                  |
| -------------------------------------------------------- | ----------------------------------------------------- |
| An input that moved after generation refuses publication | `a_stale_generation_is_refused_at_publication` (Rust) |
| Both fingerprints are returned so the change is visible  | `a_stale_generation_is_refused_at_publication` (Rust) |
| A stale refusal leaves nothing live and the draft intact | `a_stale_generation_is_refused_at_publication` (Rust) |
| The screen reports staleness instead of publishing       | `reports a stale plan instead of publishing it` (TS)  |

The Lock is a SHA-256 over every constraint input at plan creation
(`scheduling/constraints.rs`); publication recomputes it and compares. This is
the clause that keeps a plan built against last term's assignments from
silently becoming this term's live timetable.

## 4. Atomic publication

| Case                                                     | Test (Rust)                                                      |
| -------------------------------------------------------- | ---------------------------------------------------------------- |
| A violating plan publishes nothing                       | `publication_is_atomic_a_violating_plan_publishes_nothing`       |
| The refusal carries the checker's findings, not a reason | `publication_is_atomic_a_violating_plan_publishes_nothing`       |
| The draft is still the draft after a refusal             | `publication_is_atomic_a_violating_plan_publishes_nothing`       |
| Supersede, replace and publish commit as one transaction | `a_second_publication_supersedes_the_first_and_the_views_follow` |

`schedule_plan::publish` is the only `&mut Connection` function in the module:
everything from the staleness re-lock through the supersede, the meeting
replacement and the publication is one `transaction()` that either fully
commits or fully rolls back.

**Existing-data preservation, proven:** `publication_preserves_manually_created_meetings`
(`repository/schedule_plan.rs`) — a meeting the school created by hand
(`plan_id IS NULL`) survives publication untouched. A plan replaces only the
meetings a previous plan owned.

## 5. Version-consistent teacher/section/room views

| Case                                                      | Test (Rust)                                                              |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| All three views are the same set of meetings              | `published_views_are_version_consistent_across_teacher_section_and_room` |
| Views follow the live revision after a second publication | `a_second_publication_supersedes_the_first_and_the_views_follow`         |
| A superseded revision is history, not a deletion          | `a_second_publication_supersedes_the_first_and_the_views_follow`         |
| Views are `None` before the first publication             | `a_teacher_cannot_generate_or_publish`                                   |
| The three views are read in one call                      | `reads the three published views in one call` (TS)                       |

`published_views` resolves the one live revision once and reads all three
views against its `plan_id` in a single call, so a teacher's view and a room's
view cannot disagree about which timetable is live. The schema's
one-published-plan partial index makes that a provable property rather than a
query convention.

## 6. The authorization boundary

UI hiding is not authorization; every command re-derives school and actor at
the trusted boundary.

| Case                                               | Test (Rust)                                |
| -------------------------------------------------- | ------------------------------------------ |
| A teacher cannot generate                          | `a_teacher_cannot_generate_or_publish`     |
| A teacher cannot publish                           | `a_teacher_cannot_generate_or_publish`     |
| A teacher can still read their own published views | `a_teacher_cannot_generate_or_publish`     |
| No command accepts a client-supplied school id     | `never sends a school id on any call` (TS) |

## Evidence labels

`implemented`, `tested` and `verified` for every case above — each names a
test that ran and passed in this milestone's gate run. No confidence
percentages are asserted; none were measured.

## Not claimed

- **Curriculum/term applicability is not enforced.** Of §M09's eleven required
  constraints this is the one with no checker rule. There is no curriculum
  table to be applicable to: `subjects` carry no term and no grade-level
  applicability, so a rule would have to be invented along with its data. The
  ten other constraints are implemented and tested.
- **The generator is greedy, not optimal.** Most-constrained-first with a step
  budget. It proves _impossibility_ arithmetically (required weekly minutes vs.
  available weekly minutes) and reports `Stopped` when the budget is spent; it
  does not prove optimality, and no schedule is claimed to be the best one.
- **The browser axe gate does not traverse the planner screen.** `npm run
quality:ui` drives the dev preview, which cannot reach the new tab. The
  screen is axe-checked in jsdom by `keeps the planner accessible` — structure
  and ARIA only, not contrast or layout. Both runners ran; neither is claimed
  for the other.
- **No native Windows or Android evidence this milestone.** The Rust suite
  exercises the new migration, repositories, generator and checker against the
  encrypted in-memory device database; the installed packages were not built
  or exercised. Native claims remain where they were.
- **`reporting-cases.md`, `recovery-cases.md` and `android-cases.md` remain
  `planned` / `blocked` in the registry, unchanged by this milestone.**
