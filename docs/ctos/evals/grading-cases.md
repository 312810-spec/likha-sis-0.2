# CTOS Eval Cases — Grading (M01)

**Milestone:** M01 — Academic trust
**Covers:** thresholds, edge attainable scores, blank≠zero≠excused≠not-applicable,
provisional vs complete, policy applicability/versioning, historical stability,
correction/amend behavior
**Status:** implemented + tested (Rust `cargo test`, TS `npm run quality`)
**Evidence labels:** per `README.md`. No numeric confidence is asserted here —
the evidence is the passing test.

The registry row for this file reads "yes (Rust + TS)". That was written at M00
ahead of the cases existing. This file is the cases; it was created at M01 when
the tests it names actually landed. A case is listed here only if a test with
that name exists in the tree at the cited location.

## Item 1 — Exact grading and transmutation thresholds

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| The 41-band table is contiguous — no gap or overlap a real score could fall through | `transmutation_table_ranges_are_contiguous_across_the_full_scale` | `src-tauri/src/repository/grading_computation.rs` | tested |
| The table reproduces the Order's own stated anchor point | `transmute_matches_the_orders_own_stated_anchor_point` | same | tested |
| Both boundaries and midpoints of spot-checked rows match the source table | `transmute_matches_both_boundaries_and_midpoints_of_spot_checked_rows` | same | tested |
| Zero-Based grading applies from SY 2027-2028 onward, not before | `zero_based_grading_applies_from_sy_2027_2028_onward` | same | tested |
| The minimum floor of 60 raises a below-60 grade and flags it | `minimum_floor_raises_a_grade_below_60_and_flags_it` | same | tested |
| Rounding reproduces the Order's own worked example | `round_zero_based_matches_the_orders_own_worked_example` | same | tested |
| End-to-end reproduction of the Order's Science KS2 worked example | `compute_term_grade_reproduces_the_orders_own_science_ks2_worked_example` | same | tested |
| End-to-end reproduction of the Order's Zero-Based worked example | `compute_term_grade_reproduces_the_orders_own_zero_based_worked_example` | same | tested |

## Item 2 — Edge attainable scores

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| An out-of-range Initial Grade clamps instead of panicking (`f64::INFINITY`→100, `-5.0`→60) | `transmute_adjusted_clamps_out_of_range_initial_grades_instead_of_panicking` | `grading_computation.rs` | tested |
| Half-up rounding at 0.4/0.5/0.6 and clamping at 99.5/100.4/-0.5 | `round_zero_based_rounds_half_up_and_clamps_to_the_reportable_range` | same | tested |
| A recorded score of exactly 0.0 and exactly `max_score` both compute | `a_score_of_exactly_zero_and_exactly_max_score_both_compute` | same | tested |
| A very low score floors at 60 under the transmutation table | `compute_term_grade_floors_a_very_low_score_at_60_under_the_transmutation_table` | same | tested |
| A very low score floors at 60 under Zero-Based grading | `compute_term_grade_floors_a_very_low_score_at_60_under_zero_based_grading` | same | tested |

The exactly-zero case is asserted under SY 2027-2028 (Zero-Based), where the
floor is genuinely produced by the explicit clamp. Under the 41-band table the
lowest band already maps 0.00→60 structurally, so the explicit clamp never
fires there — asserting it there would prove nothing.

## Item 3 — blank ≠ zero ≠ excused ≠ not applicable

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| An excused item is excluded from the denominator | `compute_term_grade_ignores_excused_items_in_the_denominator` | `grading_computation.rs` | tested |
| A `not_applicable` item is excluded from the denominator | `compute_term_grade_ignores_not_applicable_items_in_the_denominator` | same | tested |
| A blank item (no row) contributes nothing to the denominator while a real 0.0 in another item does | `a_recorded_zero_scores_zero_but_an_unrecorded_item_scores_nothing` | same | tested |
| A score forged against a foreign school is ignored | `leaf_percentage_score_ignores_a_forged_foreign_school_score` | same | tested |
| A class record in a different school computes to nothing | `compute_term_grade_returns_none_for_a_class_record_in_a_different_school` | same | tested |

The third row is the load-bearing one for the CTOS §5 invariant: a blank and a
zero are different facts, and the assertion checks both halves — the blank
contributes nothing, *and* the real zero still counts as zero.

## Item 4 — Provisional vs complete

Definition implemented (composes with the pre-existing `None` rule; it does not
replace it):

- Some weighted category has zero scored items → `None` → UI: "Not yet available"
- Computable, but ≥1 item in a policy-weighted category has no recorded status → `complete: false` → UI: "(provisional — …)"
- Every item in every policy-weighted category recorded → `complete: true`

Completeness is scoped to **policy-weighted categories only**. An unscored item
in a category the policy does not pool cannot change the number, so flagging the
grade provisional over it would be exactly the false alarm the flag exists to
prevent.

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| `None` when a required category has no scored item yet | `compute_term_grade_returns_none_when_a_required_category_has_no_scored_item_yet` | `grading_computation.rs` | tested |
| `None` when only two of three examination subtests are scored | `compute_term_grade_returns_none_when_only_two_of_three_examinations_subtests_are_scored` | same | tested |
| A fully recorded class record computes `complete: true` | `compute_term_grade_marks_a_fully_recorded_class_record_complete` | same | tested |
| The marker renders for a computable-but-incomplete grade | "marks a computable grade provisional when not every score is recorded yet" | `src/ui/ClassRecordWorkspace.test.tsx` | tested |
| The marker is absent for a complete grade | "shows a complete grade with no provisional marker" | same | tested |
| "Not yet available" still renders for a non-computable grade | "shows 'Not yet available' for a learner with no computable term grade yet" | same | tested |
| The exported report card carries the same disclosure the screen does | `a_provisional_grade_is_marked_so_it_cannot_be_read_as_final` | `src-tauri/src/export/report_card.rs` | tested |
| A not-yet-computable learner is disclosed in the CSV, not dropped | `a_not_yet_computable_grade_is_disclosed_not_dropped` | same | tested |

The report-card test asserts the number is still emitted alongside the
provisional note — this is disclosure, not suppression. The provisional note
takes precedence over the "raised to 60" note in the export, because a floor
applied to an incomplete grade is not the fact a teacher reading a printout
needs first.

## Item 5 — Policy applicability and versioning

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| A class record uses its own pinned policy, not the default | `compute_term_grade_uses_the_class_records_own_pinned_policy_not_the_default` | `grading_computation.rs` | tested |
| Changing the default policy after a record pinned a different one leaves that record's grade byte-identical | `compute_term_grade_stays_stable_when_the_default_weight_policy_changes` | same | tested |
| The seeded policies list with the K-10 default first | `list_weight_policies_returns_all_seeded_policies_with_k10_default_first` | same | tested |
| K-10 and EPP/TLE/MAPEH weight the same imperfect scores differently | `k10_and_epp_tle_mapeh_policies_weight_the_same_imperfect_scores_differently` | same | tested |
| A policy with no Examinations component resolves | `compute_term_grade_handles_a_policy_with_no_examinations_component` | same | tested |
| A policy where Examinations is term-examination-only resolves | `compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only` | same | tested |

The second row is M01's half of the "no silent historical mutation" acceptance
clause: the pinned `weight_policy_id` is what makes a historical record's grade
reproducible, and the test proves promoting a different policy to default does
not retroactively move it.

## Item 6 — Historical stability

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| Repeated computation of the same inputs yields the same grade | `compute_term_grade_is_deterministic_across_repeated_calls` | `grading_computation.rs` | tested |
| Default-policy change does not move a pinned record's grade | `compute_term_grade_stays_stable_when_the_default_weight_policy_changes` | same | tested |
| Append-only correction history, with status/score consistency CHECKs | `migration_42_creates_an_append_only_correction_history_with_status_score_consistency` | `src-tauri/src/db/migrations.rs` | tested |

**Out of scope for M01, owned by M11:** the full issued-snapshot lifecycle
(Working → Draft → Review → Issued → Amendment) and snapshot immutability. M01's
share is the computation-stability half — the two rows above. M11's pipeline is
not built early here.

## Item 7 — Correction and amend behavior

| Case | Test | Where | Result |
| ---- | ---- | ----- | ------ |
| A reason is asked for before changing a recorded score, and nothing is written without one | "asks for a reason before changing an already-recorded score, and writes nothing without one" | `src/ui/ClassRecordWorkspace.test.tsx` | tested |
| The correction is written with its reason once provided | "writes the correction with its reason once the teacher provides one" | same | tested |
| Cancelling a held correction writes nothing and restores the recorded score | "cancelling a held correction writes nothing and restores the recorded score" | same | tested |
| Marking an exception on a recorded score is itself a correction needing a reason | "marks an exception on an already-recorded score as a correction that needs a reason" | same | tested |
| The correction-history schema is append-only and rejects an excused status carrying a score, both directions | `migration_42_creates_an_append_only_correction_history_with_status_score_consistency` | `src-tauri/src/db/migrations.rs` | tested |

Correction lineage (previous value, previous author, reason, time) is preserved
by the append-only `learner_score_corrections` table introduced in migration 42
and by the repository boundary that writes to it.

## Cases NOT covered — stated, not hidden

- **General Average across a learner's full course load.** This export is scoped
  to one class record; the app does not yet aggregate across them. Disclosed in
  `report_card.rs`'s `disclosure()`, not silently omitted.
- **Qualitative descriptors** (Outstanding, Very Satisfactory, …). The
  descriptor table was not independently re-verified against the primary source
  at sufficient resolution this milestone. Omitted rather than risk a wrong
  label; the omission is itself asserted by
  `no_qualitative_descriptor_or_do_8_wording_appears_outside_the_disclosure_block`.
- **Grade 12 (DO 8, s. 2015) weighting.** A primary source for its exact
  percentages could not be located and was not guessed at. A
  `compute_term_grade_applies_grade12_do8_weights_with_adjusted_transmutation`
  test exists and passes, but it exercises the weighting *model*, not a verified
  source table — it is not evidence that the percentages are DepEd-correct. See
  `docs/adr/0013-deped-grade-computation.md`.
- **EPP/TLE/MAPEH and Senior High School weighting.** Not implemented; the
  export discloses the limitation per ADR-0013 rather than refusing.

## Verification commands actually run

From `src-tauri`: `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`,
`cargo test` (full suite — lib and all integration targets).
From the repository root: `npm run quality` (typecheck, lint, format, architecture,
deadcode, and the full Vitest suite).
