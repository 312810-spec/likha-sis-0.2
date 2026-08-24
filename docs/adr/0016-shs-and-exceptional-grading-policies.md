# ADR-0016 — SHS + Exceptional Grading Policies (M16)

Status: Accepted

## Context

M15 closed the architectural gap that prevented a second DepEd weight
policy from ever being applied. ADR-0015's own "Next unlock" note
predicted every further DepEd weight group would now be "a purely
additive change — seed a policy + weight rows, following migration
10/11's exact pattern — not a new architecture decision." The user
directed the milestone sequence M15 → M16 (SHS + exceptional policies) →
M17 (Learner Profile Enrichment) → M18 (Bulk Attendance/Teacher
Productivity) → Roles & Permissions in one message. M16 is that
prediction's first real test: DepEd Order No. 015, s. 2026's Table 10
(Key Stage 4 / Senior High School) has **six** weight groups, three of
which are structurally different from anything implemented so far — not
just different percentages, but a different shape of the Examinations
component.

## Decision

**No new 10-scenario process, no schema change beyond seed data.** The
source data (Table 10 / Annex D Table 2, plus Annex D paragraphs 46-47, 49) was already fully transcribed and verified at full resolution during
M13's original primary-source PDF reading (recorded in ADR-0013's own
context) — this milestone re-used that transcription rather than
re-fetching the PDF, and cross-checked it once more against this
session's own record before writing the migration.

Table 10's six groups fall into three structural shapes, each expressed
as pure data against the _existing_ `assessment_categories`/
`grading_weight_components` schema, with zero changes to
`grading_computation::compute_term_grade`'s algorithm:

1. **Full three-part Examinations** (ST1/ST2/TE 30/30/40, same shape as
   both K-10 policies) — Core Subjects & Other Academic Electives
   (20/50/30), Arts/Sports/Health and Wellness Electives (20/60/20),
   TechPro Electives (15/65/20).
2. **Examinations present but composed of a Term Examination only**, no
   Summative Tests, at its full weight within the Examinations component
   (Annex D paragraph 46a) — Field Exposure/Arts Apprenticeship/Creative
   Production and Innovation (15/70/15). Expressed as a single child
   weight row (Term Examination, 100% within Examinations) instead of
   three — `compute_term_grade`'s existing "roll up whichever children a
   policy actually has" logic handles this without modification, proven
   by a new end-to-end test
   (`compute_term_grade_handles_a_policy_where_examinations_is_term_examination_only`).
3. **No Examinations component at all** (Annex D paragraph 46b/46c) —
   Research Electives & Design and Innovation (40/60, WWs/PTs only) and
   Work Immersion (20/80, where WWs is explicitly the learner's
   _portfolio_ and PTs is the _industry-based evaluation from the
   workplace supervisor_, not ordinary classwork). Expressed by seeding
   **no** weight row for the Examinations category in that policy —
   `compute_term_grade`'s top-level loop simply never visits a category
   with no weight row, so it's skipped rather than treated as
   missing/undefined. Proven by a new end-to-end test
   (`compute_term_grade_handles_a_policy_with_no_examinations_component`).

This confirms ADR-0015's prediction empirically, not just by inspection:
five new weight policies (a sixth, Core Subjects, mirrors the K-10 shape
exactly) were added with a single additive migration and zero repository/
algorithm code changes, and the TS/UI layer required **no changes at
all** — `ClassRecordsScreen`'s weighting picker and `ClassRecordWorkspace`'s
policy-name display are already fully data-driven from
`list_grading_weight_policies`, so all eight policies (2 from M15 + 6
from this milestone) appear automatically.

**Caveats carried into every policy's own citation text**, not left
implicit:

- Annex D paragraph 47: DepEd itself defers detailed item-level
  specifications to a separate "implementation guidelines of the
  Strengthened SHS Curriculum" issuance this app has not obtained. The
  weight _percentages_ are DepEd's own stated figures, not a guess — the
  guidance behind how to apply them item-by-item is what remains
  incomplete.
- Annex D paragraph 49: Grade 12, which has not yet adopted the
  Strengthened SHS Curriculum for SY 2026-2027, uses DO 8, s. 2015
  weights instead — these six policies apply to Grade 11 now, and to
  Grade 12 only once it transitions. DO 8's exact percentages remain
  unimplemented (still no primary source located, unchanged from
  ADR-0013/0015).

## Consequences

- New: migration 12 (six `grading_weight_policies` rows + their weight
  components, all non-default, reusing the existing WWs/PTs/Examinations/
  ST1/ST2/TE categories from migration 10 — no new categories). Four new
  migration tests (`migration_12_*`) verifying the seed count, the
  full-three-part shape, the TE-only shape, and the no-Examinations shape
  for both affected policies. Three new `grading_computation` tests
  proving end-to-end computation for the two structurally exceptional
  shapes plus a "nothing scored yet" case for the TE-only policy.
- `list_weight_policies`'s existing test updated for the new count (8,
  up from 2) — no production code change, since the function was already
  policy-count-agnostic.
- **Verification actually run this session**: `cargo test` — 208 lib
  tests (up from 201; +7: 4 migration tests, 3 `grading_computation`
  tests) + 51 integration tests, all green. `cargo clippy --all-targets
-- -D warnings` clean. `npm run quality` — 242 TS tests (unchanged from
  M15 — confirms the TS/UI layer needed no changes), typecheck/lint/
  format/architecture-boundary all clean. `npm run build` succeeds.
- **Independent review**: not dispatched. Purely additive seed data
  against an already-reviewed schema/algorithm (M13/M15); no new
  authorization surface, no new command, no new TS/UI code path.
- Not implemented (deliberately out of scope, unchanged from ADR-0013/
  0015): Key Stage 1 descriptive grading (a structurally different
  computation — rubric evidence, not weighted numeric scores — deferred
  to a later milestone by the user's own roadmap, not folded into M16),
  Grade 12's DO 8, s. 2015 carryover (still no primary source located),
  GMRC/VE's domain-tagging UI (does not affect grade correctness — see
  ADR-0015's correction), a `Subject`-level default-weight-group
  suggestion (still would require guessing a subject-name-to-DepEd-group
  mapping — a teacher must still pick explicitly for SHS subjects, same
  as every other policy).
