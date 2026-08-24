# ADR-0013 — DepEd Grade Computation (M13)

Status: Accepted

## Context

M11/M12a/M12b built grading periods, class records, and assessment items/
scores, deliberately deferring grade computation/weighting — DepEd's actual
Written Works/Performance Tasks/Examinations weighting was flagged in both
ADR-0010 and ADR-0012 as "genuinely complex enough to need its own research
pass." M13 is that pass.

**This milestone is compliance-sensitive**, so research used a primary
source, not a secondary summary. `WebSearch` located a citation for **DepEd
Order No. 015, s. 2026**, "Revised Guidelines on Classroom Assessment,
Grading System, and Awards and Recognition for the K to 12 Basic Education
Program," including a direct link to the order's own PDF on
`deped.gov.ph`. That PDF (`deped.gov.ph/wp-content/uploads/DO_s2026_015r.pdf`,
60 pages, image/scanned — no text layer, so read visually page-by-page, not
via text extraction) was downloaded and read directly this session — not
trusted from a blog/aggregator summary alone, though three independent
secondary sources (depedclub.com, depedtambayanph.net, tchersden.blogspot.com)
were also checked and agreed with the primary source on every figure
transcribed below, which is itself corroborating evidence the transcription
is accurate.

### What the Order explicitly requires (verified against its own text)

- **Grading structure (Annex D "Guidelines on Numeric Grading System for
  Key Stage 2 to 4")**: `IG = sum over components of (PS × weight%)`, where
  `PS = (sum of raw scores in that component / sum of max scores) × 100`
  (points-pooled across every item in a component, not item-averaged —
  confirmed by the Order's own Table 5 worked example, where four Written
  Works items of unequal max score are pooled as 74/85, not averaged as
  four separate percentages).
- **Weight table (Table 9, KS2-KS3/Grades 4-10)**: English, Filipino,
  Mathematics, Science, Araling Panlipunan, GMRC/Values Education — Written
  Works 20%, Performance Tasks 50%, Examinations 30%. EPP/TLE and MAPEH —
  20%/60%/20% (**not implemented this milestone**, see Scope below).
- **Examinations is not a flat pooled bucket.** It is composed of three
  named sub-assessments — Summative Test 1, Summative Test 2, Term
  Examination — each independently scored as its own percentage, then
  combined `0.30×ST1 + 0.30×ST2 + 0.40×TE` (Annex D paragraph 6) _before_
  the Examinations category's own overall weight is applied. This structural
  fact, not just a number, drove this milestone's schema decision (below).
- **Two grading regimes, selected by school year, not by policy choice**:
  SY 2026-2027 uses an **Adjusted Transmutation Table** (Annex D Table 4 —
  41 contiguous bands, IG 0.00-100.00 mapped to TG 60-100, transcribed
  verbatim into `grading_computation::ADJUSTED_TRANSMUTATION_TABLE`).
  **SY 2027-2028 onward** uses a **Zero-Based Grading System** — no
  transmutation; `TG = round(IG)` directly (Annex D paragraphs 13-15).
  Both were verified against the Order's own worked examples (Table 5:
  Science KS2, IG 85.8 → TG 88, transmuted; Table 6: Mathematics KS3, IG
  83.6 → TG 84, zero-based) — this implementation reproduces both exactly
  (`compute_term_grade_reproduces_the_orders_own_*_worked_example`).
- **A floor of 60** (Annex D paragraph 18): "the default minimum grade to
  be reflected in the report card shall be set at 60," regardless of a
  lower raw computation. Under the transmutation regime this floor is
  already structural (the table's lowest band is 60); under zero-based
  grading it requires an explicit clamp, since `round(IG)` alone could
  produce a lower number.
- **Grade 12 carve-out** (paragraph 49): "For SHS Grade 12, which has not
  yet implemented the Strengthened SHS Curriculum for SY 2026-2027, the
  weights in DO No. 8, s. 2015 shall apply together with the adjusted
  transmutation table." **Not implemented** — see Scope.

### What is this app's own interpretation, not DepEd's

The Order does not specify how to compute a grade when scoring is
incomplete (some items not yet marked, or a whole category never scored).
This implementation's rule — a category's PS is undefined until it has at
least one `Scored` item, and the _entire_ term grade is reported as "not
yet computable" (`None`) until every weighted category is defined — is
this app's own choice, consistent with the existing "disclose, don't
fabricate" principle (`AttendanceRosterEntry`/`LearnerScoreRosterEntry`'s
own "absence of a row means not yet recorded" idiom, and ADR-0009's
`FieldDisclosure`). An alternative (treat an unscored item as zero) would
silently punish a learner for work not yet graded and was rejected.

### What remains uncertain / explicitly not modeled

- **DO 8, s. 2015's exact percentages** (needed only for the Grade 12
  carve-out above) could not be confirmed from a primary source this
  session — secondary sources returned internally inconsistent numbers
  (one search result's totals didn't sum to 100%). Per this project's
  `deped-compliance` rule ("do not infer or copy historical weighting
  merely because it is familiar"), these were **not implemented from
  memory** — the Grade 12 carve-out is explicitly out of scope until a
  primary DO 8 source is located.
- **The EPP/TLE & MAPEH weight group** (20/60/20), **all Key Stage 4 (SHS)
  weight groups** (Table 10 — six further subject-group variants with
  different Examinations/no-Examinations structures), **GMRC/VE's internal
  Cognitive/Affective/Behavioral domain split** (Table 3), and **Key Stage
  1's descriptive-grading conversion matrix** (a different computation
  entirely, not weighted numeric scoring) are all verified and transcribed
  during this session's research but **not implemented** — see Scope.

## Decision

### Architecture: two independent, separately-versioned concerns

Per the user's instruction not to manufacture a decision where ADR-0010's
`grading_policies` pattern already settles it — it settles the _versioning_
half, but not the _structural_ half (Examinations' internal three-part
composition is a genuinely new shape ADR-0010 never had to model, since
grading periods are flat). The 10-scenario process was applied to that one
open question: **how to represent Examinations' ST1/ST2/TE sub-structure**.

Ten scenarios were generated and scored against the project rubric
(Teacher Value 20%, DepEd Alignment 15%, Dependency Readiness 10%, Reuse
10%, Architectural Fit 10%, Security Safety 10%, Implementation Risk 10%,
Testing Confidence 5%, Future Leverage 5%, Time-to-Value 5% — the same
weights `docs/product/M8-DECISION.md` established, reused per
`docs/PROJECT-MEMORY.md`'s "no `SCENARIO-RUBRIC.md` file exists" note from
the M9 session). The two finalists:

- **Recommended (chosen): a nullable self-referencing `parent_category_id`
  on the existing `assessment_categories` table.** Examinations' three
  sub-assessments become ordinary child category rows (seeded, versioned,
  same as every other category) under "Examinations" in the DO 015 set.
  An `assessment_item` under Summative Test 1 is created through the exact
  same `assessment_item::create` path as any other item — zero new
  concepts for the 90% case, and `assessment_item::create` now rejects
  creating an item directly under a category that _has_ children (a
  parent), so a teacher can never create an item that would be ambiguous
  to aggregate. Highest score on Reuse, Architectural Fit, and
  Time-to-Value of the ten scenarios — it reuses 100% of M12b's
  `assessment_item`/`assessment_category` machinery unchanged.
- **Next Best: a separate `category_components` join table** decoupling
  "internal composition" from the category hierarchy (an item references
  a component, not a category, when it needs sub-structure). Slightly
  cleaner separation of concerns (a category never "has children"; it
  optionally has internal weighted parts) and would be the better choice
  if a future Order nests _multiple_ categories this way rather than only
  Examinations — but for what DO 015 currently specifies, it adds a
  second FK shape on `assessment_items` for no correctness benefit today.

**Weights** are the second, independently-versioned axis: a new
`grading_weight_policies`/`grading_weight_components` pair, matching
`grading_policies`/`grading_policy_periods`' exact shape (name + source
citation + `is_default`, one row per weighted category referencing
`assessment_categories.id`, "at most one default" enforced by the same
unique-partial-index pattern this codebase has now used four times —
migrations 5, 6, 9, and this one). A weight row's meaning (top-level
subject-weight vs. within-parent split) is derived from whether its
category has a `parent_category_id`, not a duplicated flag.

**Regime selection** (transmutation vs. zero-based) reuses the _existing_
`grading_periods.school_year` field directly — no new "policy effective
date" table was needed, since the Order's own switchover is keyed to
school year, which this schema already tracks per grading period.

**The transmutation table itself is Rust constant data, not a database
table.** A disclosed simplification: DepEd could in principle publish a
different table for a future transition year, but that would require code
changes to the algorithm structure anyway (the 41-band table shape is
specific to this one transition, not a generic reusable pattern the way
weight percentages are), and seeding 41 rows for zero behavioral benefit
this session was judged not worth the migration complexity. If a future
year needs a _different_ transmutation table, this is the one piece that
would need a genuine follow-up decision, not just new seed data.

### Scope: one weight group implemented, others explicitly deferred

Given the compliance-sensitivity and research depth already required to
verify even one weight group correctly (primary-source PDF research,
41-row table transcription, two worked-example reproductions), this
milestone implements **exactly one** `grading_weight_policies` row: the
KS2-KS3 "English, Filipino, Mathematics, Science, AP, GMRC/VE" group
(20/50/30, Examinations 30/30/40 internal). **Not implemented**: the
EPP/TLE & MAPEH group, any Key Stage 4 (SHS) group, GMRC/VE's domain
split, Key Stage 1 descriptive grading, and the Grade 12 DO 8 carryover.

A class record for a subject outside the implemented group will currently
be computed with the wrong weights if the teacher uses this feature for
it — this is a real, disclosed limitation, not a silent gap: the
`ClassRecordWorkspace` UI's Guided-mode hint states the exact weighting
in use and that other subjects aren't yet supported (see
`src/ui/ClassRecordWorkspace.tsx`'s `field-hint` next to the "Show term
grades" button). A future milestone adding a `Subject`-level or
`ClassRecord`-level weight-group selection is the natural next step —
deliberately not built this session, since `Subject` currently has no
grouping classification at all and inventing one without further DepEd
confirmation of exactly how "learning area" maps to a real `Subject` row
in this schema would itself be a guess.

## Consequences

- New: migration 10 (`ALTER TABLE assessment_categories ADD COLUMN
parent_category_id`; three new child category rows; `grading_weight_policies`/
  `grading_weight_components` tables + one seeded policy),
  `src-tauri/src/repository/grading_computation.rs` (the algorithm, the
  transmutation table, `compute_term_grade`), `class_record::school_year_in_school`,
  `assessment_item::create`'s new parent-category rejection,
  `assessment_category::list_categories_for_set`'s narrowing to leaf
  categories only (a parent like "Examinations" is no longer offered as a
  selectable option when creating an item, since selecting it would
  always be rejected).
- New command: `compute_learner_term_grade` (`class_record_id`/`learner_id`
  client-supplied the same legitimate way `assessment_item_id` already is
  elsewhere; `school_id` from the session only).
- New TS: `ComputedTermGrade` (`src/domain/learner-score.ts`),
  `LearnerScoreRepository.computeTermGrade`, `TauriLearnerScoreRepository`
  implementation, `LearnerScoreApplicationService.computeTermGrade`
  (validates non-empty ids), and a "Show term grades" section in
  `ClassRecordWorkspace.tsx` — on-demand (a button, not automatic),
  since it is a per-learner round trip and recomputing on every
  keystroke/item-selection would be both wasteful and would show a
  misleadingly still-updating number mid-entry.
- **Verification actually run this session**: `cargo test` — 184 lib tests
  - 51 integration tests across 9 test binaries, all green (see
    `docs/ACTIVE-PLAN.md`'s M13 section for the file-by-file breakdown).
    `cargo clippy --all-targets -- -D warnings` clean. Two of the new domain tests directly reproduce the
    Order's own two worked examples end-to-end (schema → repository →
    algorithm) and matched exactly (after two real bugs the tests
    themselves caught and this session fixed: a transcription slip in one
    worked example's max-score fixture, 20/40 instead of the source's
    25/50; and a floor-test that couldn't actually exercise the floor
    clamp under the transmutation regime, since that regime's table already
    floors at 60 structurally — split into two separate tests, one per
    regime, once that was understood). `npm run quality` — typecheck,
    lint, format, architecture-boundary check, 233 TS tests, all green (one
    new bug caught by its own test: `LearnerScoreApplicationService.computeTermGrade`
    was not declared `async`, so its validation `throw`s were synchronous
    instead of promise rejections — the same bug class already documented
    from M8's `monthlySummary`, caught here the same way, by a test that
    asserted `.rejects.toBeInstanceOf(ValidationError)`).
- **Not independently reviewed**: this milestone touches the same
  authorization pattern every prior command already uses
  (`require_active_school_scope`, ownership checks before any write/read)
  with no new pattern introduced, so a full `security-reviewer` dispatch
  was judged lower-value than for M12b's genuinely new mutation surface.
  A `teacher-ux-reviewer` pass on the new "Show term grades" section
  (alongside the standing M12c one) is recorded as owed, not blocking.
- **Visual verification**: not possible this session — same standing gap
  as M12c (no Tauri IPC bridge in a plain browser, Browser pane could not
  composite a screenshot in this environment). The jsdom-based interaction
  tests (12+ in `ClassRecordWorkspace.test.tsx`, including two new ones
  for "Show term grades") are the actual behavioral verification; pixel
  appearance is unverified.
- Not implemented (deliberately out of scope, listed in full above under
  "Scope"): EPP/TLE & MAPEH weighting, any SHS/KS4 weighting, GMRC/VE
  domain split, KS1 descriptive grading, Grade 12 DO 8 carryover,
  Subject-level weight-group selection UI, report cards/official grade
  output (M14).
