# ADR-0034 — Class Records, Assessments, Score Entry, Grade Output (UX-04)

Status: Proposed (in progress — filled in as the milestone proceeds,
per this project's convention of recording decisions as they are made)

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

(Filled in as each piece is implemented.)
