# ADR-0034 — Class Records, Assessments, Score Entry, Grade Output (UX-04)

Status: Accepted

## Context

Fifth milestone of the UI-First World-Class Product Program (ADR-0030),
following UX-03 (ADR-0033). Baseline SHA `0634421` (UX-03's completion
checkpoint). Scope: polish `ClassRecordsScreen`/`ClassRecordWorkspace`
— the same hierarchy/non-color-cue/dev-preview-fixture disciplines
UX-01–03 already established — while fixing four correctness defects
found during discovery by direct inspection of the live code, adding a
completion-count readout, a grade-freshness guarantee, and (an approved
scope expansion) assessment-item edit/delete.

Product identity: **LIKHA-SIS 0.2** throughout.

## Confirmed correctness defects (found before implementation began)

Direct reading of `src/ui/ClassRecordWorkspace.tsx` at the pre-UX-04
baseline confirmed four real, reproducible defects:

1. **Stale roster after a failed assessment-item switch.** The
   item-selection effect (`ClassRecordWorkspace.tsx:149-167`) never
   clears `roster` before fetching the newly selected item's roster —
   the same defect class UX-03 fixed for Attendance/Monthly Summary,
   unfixed here.
2. **Overlapping score writes reachable via two separate, unguarded
   trigger paths.** `savingLearnerId` is a single shared string with no
   per-request identity. The score `<input>`'s commit path is guarded
   against re-entrancy by `committingRef`, but the "Excused"/"N/A"
   exception buttons call `handleRecord` directly, bypassing that guard
   entirely — a teacher typing a score and clicking an exception status
   for the same learner in quick succession can race, with no guarantee
   the later action wins.
3. **Redundant duplicate exception writes.** Unlike the score-input
   path (which has no analogous check either, see above), the exception
   buttons don't check whether the clicked status is already active
   before issuing a write.
4. **Term grades that keep looking current after a score changes.**
   `termGrades` state is never invalidated when `handleRecord` saves a
   new score — a teacher can compute term grades, correct a score
   afterward, and the on-screen grade table keeps showing the stale
   numbers with no indication they're now wrong.

## Investigated and found inapplicable (capability didn't exist)

- Assessment max-score/category changes after scores exist, and
  deleting a scored assessment: impossible prior to this milestone —
  `assessment_item.rs` had no `update`/`delete` function at all. This
  milestone adds both, bounded by the safety rules in Decision §3 below.
- Weighting-policy changes after a class record's assessments/scores
  exist: still impossible (`class_record.rs` has no `update` function)
  — **out of scope for UX-04**, not silently addressed.

## Decisions

### 1. Defect fixes (all four, TDD — failing test first)

- **Stale roster**: `loadRoster()` extracted as a named function with a
  per-fetch request-identity ref (`rosterRequestRef`); the item-selection
  effect synchronously clears `roster`/`rowErrors`/`termGrades` before
  calling it, so a slower, now-superseded fetch can never paint over a
  newer selection. Mirrors UX-03's identical fix for Attendance/Monthly
  Summary exactly — same defect class, same cure.
- **Overlapping writes across two trigger paths**: a per-learner
  write-generation counter (`writeGenerationRef: Map<learnerId, number>`)
  lives inside `handleRecord` itself (the one function both the
  score-input commit path and the exception buttons call), not
  duplicated at each call site. A response is only applied if it is
  still the latest generation for that learner when it settles.
  Deliberately **not** a global "freeze the whole gradebook" lock — a
  slow write for one learner must never block entry for a different
  learner.
- **Duplicate exception writes**: `handleRecord` no-ops (returns `true`
  without writing) when the requested status is already the learner's
  current status, mirroring the score-input path's own unchanged-value
  no-op.
- **Term-grade freshness**: see §2.

### 2. Term-grade freshness: automatic single-learner recompute, not a stale badge

Investigated whether automatic recomputation is "cheap, deterministic,
and safe enough" before defaulting to a manual stale-badge-plus-button
pattern, per the implementation brief. Conclusion: recomputing the
**whole roster** on every score save would be O(n) per save and would
directly contradict ADR-0013's own rationale for making grade
computation on-demand rather than automatic (a per-learner Tauri round
trip, wasteful to repeat for an entire class on every keystroke).
Recomputing **only the one affected learner** is O(1), deterministic
(`compute_term_grade` has no hidden state), and safe. The mechanism
(`maybeRefreshTermGrade`) is additionally gated behind "term grades have
already been shown at least once this session" (`Object.keys(termGrades)
.length > 0`), so a teacher who never opens the term-grade table pays no
hidden cost. On refresh, the affected learner's row gets a subtle,
non-flickery `role="status"` "(just updated)" annotation for ~2.5
seconds — confirmed working end-to-end in a real browser (see
Verification below): editing one learner's Term Examination score while
term grades were already shown updated only that learner's grade and
row, with the annotation appearing and later clearing, while the other
two learners' rows stayed untouched.

### 3. Assessment-item correction: three functions, not one

- **`renameItem`** (name only) is **always** permitted, scored or not.
  Investigated rather than assumed: grepped `grading_computation.rs`,
  `learner_score.rs`, and the export module for any read of
  `assessment_items.name`, and checked the schema for a uniqueness
  constraint on it — found neither. The name is purely descriptive and
  provably safe to change regardless of scoring state.
- **`updateItem`** (name + category + max score) and **`deleteItem`**
  are permitted **only** while the item has zero recorded scores of any
  status (scored/excused/not-applicable) — `has_any_scores` in
  `assessment_item.rs` checks for any `learner_scores` row at all, not
  just `status = 'scored'`. This is intentionally more conservative than
  strictly necessary: an item with only Excused/N/A entries (no `Scored`
  row) currently contributes nothing to `leaf_percentage_score`'s sum,
  so changing its category/max score would not actually alter any
  already-computed grade. The stricter rule was kept anyway — it matches
  this codebase's established fail-closed convention (block first,
  relax only with positive evidence), the milestone brief's "for a
  SCORED item" language did not distinguish exception-only from
  raw-scored, and the loosening is available as a low-risk follow-up if
  a real teacher workflow ever needs it. Not a defect; a documented,
  deliberate conservatism.
- UI: an unscored item's "Edit" shows the full name/category/max-score
  form; a scored item's shows only the name field plus a plain-language
  explanation ("This activity already contains learner scores. Its
  maximum score and category can't be changed here because doing so
  could change previously calculated grades. Its name can still be
  corrected."). Delete uses a two-step confirm/cancel (not a browser
  `confirm()` dialog, consistent with this app's existing pattern
  elsewhere) for an unscored item, and is simply unavailable (with an
  inline reason) for a scored one.

### 4. Completion-count semantics

`recorded_count` (per assessment item) and its class-record-level
aggregate counterpart both count **any** `learner_scores` row
(scored/excused/not-applicable alike) — matching
`LearnerScoreRosterEntry.status !== null`'s existing "recorded at all"
meaning in `ClassRecordWorkspace`'s roster-level count, not a narrower
"actually scored" meaning. `total_eligible` is the section+grading-period
roster size (`section_membership::roster_for_section_over_range`),
computed once per class record (not per item) since it does not vary
per item. Added at three levels: per assessment item (in its
list-button label), per open roster ("X of Y recorded · Z remaining",
pre-existing from UX-03's pattern reused here), and — after
investigating the cost (see §5) — per class record in the
`ClassRecordsScreen` list itself.

### 5. Per-class-record progress summary: investigated, implemented

Investigated whether a compact list-level progress indicator was worth
the touch (it requires extending `ClassRecordDetail`, which ripples into
every fixture/fake across 6 TS files plus Rust). Decided yes:
`item_count`/`recorded_count` are cheap pure-SQL correlated subqueries
added directly to `class_record::DETAIL_SELECT_LIST`; `total_eligible`
reuses `section_and_period_range_in_school` +
`roster_for_section_over_range` (the same calls
`assessment_item::list_by_class_record` already makes), applied once per
row in a `with_total_eligible` post-processing step. The list shows
either "No assessment items yet" (item_count = 0) or "N items · X of Y
recorded" (Y = item_count × total_eligible, the theoretical maximum).

**A real bug found and fixed during this work**: the list's fetch effect
in `ClassRecordsScreen.tsx` ran only once on mount, so a teacher who
scored items in a workspace and clicked "Back to Class Records" saw the
same stale counts they left behind — the exact "looks current but
isn't" failure mode this milestone's term-grade-freshness work exists to
prevent, just one level up. Fixed: "Back to Class Records" now
re-fetches before returning to the list. Caught by a dedicated test
before being caught by a human.

### 6. Grade-completeness re-verification: no defect found

Re-inspected `grading_computation.rs`'s `leaf_percentage_score`/
`compute_term_grade` against the explicit worry ("don't equate 'category
contains an assessment' with 'a learner has a meaningful complete
grade'"). Findings, cross-checked against the already-passing Rust test
suite: blank (no row) is correctly excluded from both numerator and
denominator; a real `0` score is correctly counted (not conflated with
"not entered"); Excused/N/A are correctly excluded from both; a category
with zero recorded scores anywhere correctly yields `None` for the whole
term grade (never a fabricated partial number); a category that has
_some_ scored items and some still-unscored ones correctly pools only
the scored ones (ADR-0013's own documented, accepted interpretation —
not a new ambiguity). No new failing test was added, per the brief's
"only if a real ambiguity is found" instruction — none was.

### 7. Dev-preview fixture: a second independent mutable-state slice

Unlike the attendance fixture (one repository class, private state),
Class Records needs three repository classes (assessment, learner-score,
class-record) to observe the _same_ evolving item/score data, so the
new fixture state in `src/dev-preview/fixtures.ts` lives at module scope
rather than duplicated per instance. Covers the three states a teacher
can be in (nothing set up, partially scored, fully scored across every
category including the Examinations sub-tests). `computeTermGrade` in
the fixture is an explicitly-labeled simplified unweighted-average
stand-in for visual testing only — never the real DepEd algorithm,
which lives exclusively in Rust.

### 8. Mobile ledger reuses, does not duplicate, the UX-03 pattern

The score-entry table's phone-width (≤640px) treatment (`.score-entry`
in `styles.css`) was already written to the same "learner identity →
score/status → save state" stacked-block pattern as Attendance's own
ledger, and `ClassRecordWorkspace.tsx`'s markup already used that exact
class name — no new CSS needed there. Browser-rendered verification at
390px _did_ catch two real layout bugs the jsdom test suite could not
(no layout engine in jsdom): the scored-item rename form's label/input
overlapped its explanatory paragraph (a bare `.field-hint` text node was
squeezed as a flex sibling inside `.form-row` instead of getting its own
line), and the assessment-item list's action row ran together
illegibly at phone width. Both fixed; see Verification.

## Verification

- `cargo test`/`cargo build`/`cargo clippy` could **not** be run this
  session — a pre-existing, unrelated `windows-future`/`windows-core`
  duplicate-version dependency conflict in `Cargo.lock` blocks
  compilation (confirmed via `cargo check`, full error trace recorded in
  session notes; both `windows-core` 0.61.2/0.62.2 and `windows-future`
  0.2.1/0.3.2 are locked simultaneously). Not caused by any file changed
  this session (only `.rs` source files were touched, never the
  manifest/lockfile) and not resolved, per the instruction not to force
  a Cargo.lock change outside this milestone's scope. All Rust changes
  were verified by careful manual review (signatures, SQL correctness,
  fail-closed-on-`None` conventions, test logic) instead — see
  `docs/VERIFICATION-DEBT.md`.
- `npm run quality` (typecheck, lint, format, architecture-boundary
  check, full Vitest suite): green throughout, 389 tests at the final
  checkpoint (up from the UX-03 baseline's 379).
- `npm run build` + `npm run check:dev-preview-isolation`: clean; the
  fixture is confirmed absent from `dist/`.
- `npx knip`: clean for every file touched this session (one
  newly-introduced unused export, `FIXTURE_SUBJECTS`, was un-exported
  once flagged; the four remaining findings — `userService`,
  `LEARNER_SCORE_STATUSES`, `OmittedField`, `FieldDisclosure` — all
  pre-date this session and are unrelated to it).
- Browser-rendered visual verification (Chromium via Playwright,
  launched directly against the pre-installed browser rather than
  through `playwright-cli`, which failed on a browser-version mismatch
  in this environment — disclosed, not routed around silently): 1366×900
  and 390-wide, light and dark, Efficient/Comfortable/Guided, covering
  the Class Records list (all three progress states), an empty
  workspace, a partially-scored workspace (locked vs. unlocked item
  editing, two-step delete), a fully-scored workspace with a real term-
  grade table (normal/floored grades), the live grade-freshness flash
  after an edit, and item creation. Two real layout bugs were found and
  fixed this way (§8) — neither was reachable from jsdom-based unit
  tests alone.
- Accessibility: existing `expectNoAccessibilityViolations` (axe-core)
  checks pass for every touched screen as part of the Vitest suite.
  Independent `accessibility-reviewer` and `teacher-ux-reviewer` were
  both dispatched (fresh agents, not this session's own implementing
  context) and both hit the project's known agent-resume/retrieval
  failure on their one permitted retry each — no findings text came
  back either time. A rigorous self-review was substituted and found
  one real, must-fix gap: every assessment item's "Edit"/"Delete"
  buttons shared an identical accessible name across the whole list,
  giving a screen-reader user no way to tell which item's controls they
  were on. Fixed by wrapping each item's actions in a named
  `role="group"` (matching the pattern this file's own Excused/N/A
  buttons already used correctly), with a new test proving two items'
  controls stay independently identifiable. The owed independent
  reviews remain open debt (`docs/VERIFICATION-DEBT.md`), not silently
  dropped. Native screen-reader and real-device touch-target
  verification remain out of scope for this environment (no
  Tauri/WebView2 bridge here) — recorded as debt, not claimed as
  covered.
