# ADR-0015 — Expand DepEd Grading Policy Coverage (M15)

Status: Accepted

## Context

M13/M14 shipped grade computation and a report-card export for exactly one
DepEd weight group (core K-10 English/Filipino/Math/Science/AP/GMRC), with
the gap explicitly disclosed rather than silently assumed correct.
ADR-0014 found the real blocker to closing that gap: `Subject` carries no
DepEd weight-group classification, and `grading_computation::compute_term_grade`
applied whichever policy was marked `is_default` to _every_ class record —
there was no mechanism for a second policy to coexist meaningfully even if
one were seeded.

## Decision

No new 10-scenario process was run — ADR-0010's versioned-reference-data
pattern (`grading_policies`) and ADR-0013's `grading_weight_policies`
pattern already settle "how to represent a DepEd policy a teacher picks
from"; this milestone applies that existing pattern to a field it hadn't
reached yet, rather than inventing a new one.

1. **`class_records.weight_policy_id`** (migration 11): a class record now
   explicitly pins which weight policy applies, mirroring how
   `grading_period_id` is already an explicit pick, never inferred.
   Nullable for migration safety only — an existing (pre-M15) class
   record is left `NULL`, meaning "use whichever policy is currently
   default," the exact behavior it already had; every record created
   since this migration always pins one (`class_record::create`'s new
   required parameter, validated to exist, `None` on an unknown id —
   same convention as `grading_period_id`/`category_id` elsewhere).
   `class_record::resolved_weight_policy_id_in_school` is the
   COALESCE-to-default lookup grade computation actually calls, so the
   raw nullable column is never read directly outside this one function.
2. **A second weight policy, EPP/TLE & MAPEH** (20% Written Works / 60%
   Performance Tasks / 20% Examinations, DO 015 s.2026 Table 9's second
   row) — verified against this session's own prior primary-source
   reading of the Order's PDF (the same reading ADR-0013 recorded;
   not re-fetched, since the table was already fully transcribed and
   cross-checked in that earlier pass). Seeded as non-default.
3. **`grading_computation::compute_term_grade`** now resolves the class
   record's own pinned policy instead of always querying `is_default = 1`
   directly — the one behavioral change that makes (1) and (2) actually
   matter. Proven with a dedicated test
   (`compute_term_grade_uses_the_class_records_own_pinned_policy_not_the_default`)
   and a second test giving the _same_ raw scores to both policies and
   asserting the resulting grades differ
   (`k10_and_epp_tle_mapeh_policies_weight_the_same_imperfect_scores_differently`)
   — the strongest available proof the pinned policy, not the default, is
   what actually gets applied.
4. **UI**: `ClassRecordsScreen`'s create form gained a required "DepEd
   grading weighting" picker (defaults to the current default policy,
   but is always shown, never hidden — matching this project's "explicit,
   not inferred" pattern for `category_set`/`grading_policy` pickers
   elsewhere). The class-records list table gained a "Weighting" column.
   `ClassRecordWorkspace` now receives and displays the resolved
   `weightPolicyName` (as a prop from `ClassRecordsScreen`, which already
   holds the joined detail) in place of the M14 session's now-inaccurate
   hardcoded "this export uses core K-10 weighting for every subject"
   text — that warning is corrected to name the actual policy in effect
   and note that Senior High School/Grade 12/Key Stage 1 subjects still
   have no correct option in the picker at all (rather than silently
   defaulting to a wrong one), since those groups remain unimplemented.

**Correction to the prior record**: ADR-0013/0014 both listed "GMRC/VE's
internal Cognitive/Affective/Behavioral domain split" as an unimplemented
gap affecting grade correctness. Re-checking Table 9 during this
milestone's scoping: GMRC/Values Education is already part of the K-10
core weight group (Written Works 20% / Performance Tasks 50% /
Examinations 30%, identical to English/Filipino/Math/Science/AP) — the
domain split (Table 3) is a within-item assessment-_design_ guideline for
how a teacher should distribute WWs/PTs/EXs items across Cognitive/
Affective/Behavioral aspects, not a different weighting formula. GMRC/VE
grades computed by this app were already DepEd-compliant on the
weighting front since M13; only the domain-_tagging_ feature (letting a
teacher mark which aspect an item addresses) remains unimplemented, and
it does not affect the correctness of any grade already computed. Flagged
here so the gap list in ADR-0013/0014 isn't taken as still-accurate
without this correction.

## Consequences

- New: migration 11 (`class_records.weight_policy_id` column; the
  EPP/TLE & MAPEH policy + its weight components, reusing the same
  Examinations/ST1/ST2/TE category structure migration 10 already
  seeded — no new category rows needed, only new weight rows against
  existing categories). `class_record::resolved_weight_policy_id_in_school`,
  `grading_computation::{GradingWeightPolicy, list_weight_policies}`, new
  command `list_grading_weight_policies`. `class_record::create`'s
  signature gained a required `weight_policy_id` parameter — every call
  site across the Rust test suite, two integration test files, the
  command layer, and every TS layer (domain/port/infra/application/UI)
  updated accordingly.
- **Verification actually run this session**: `cargo test` — 201 lib
  tests (up from 192; +9 new: 2 migration tests, `resolved_weight_policy_id_in_school`
  coverage in `class_record.rs`, `list_weight_policies` +
  policy-differentiation proofs in `grading_computation.rs`) + 51
  integration tests, all green. `cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — 242 TS tests (up from 239, +3),
  typecheck/lint/format/architecture-boundary all clean. `npm run build`
  succeeds.
- **Independent review**: not dispatched. The new command follows the
  identical authorization pattern every existing reference-data command
  uses (`list_grading_policies`, `list_categories_for_set`); `class_record::create`'s
  new parameter is validated the same way its existing three already are
  (resolve-within-school-or-reference-data-existence-check, `None` on
  failure). No new authorization surface introduced.
- Not implemented (deliberately out of scope, unchanged from ADR-0013/0014):
  all Senior High School (Key Stage 4) weight groups, Key Stage 1
  descriptive grading, Grade 12's DO 8, s. 2015 carryover (still no
  primary source located), GMRC/VE's domain-_tagging_ UI (does not affect
  grade correctness — see Correction above), a `Subject`-level default
  weight-group suggestion (would require guessing a subject-name-to-DepEd-
  group mapping — still deliberately not built).
