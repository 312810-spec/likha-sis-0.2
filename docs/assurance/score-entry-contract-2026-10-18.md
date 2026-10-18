# Bounded score-entry Assurance contract

Baseline: `ac4c3add56fb7a0677f1a0f745bf1de816ea55ee` (remote main fetched 2026-10-18).
Branch: `forge/bounded-journey-assurance-20261018`; initial worktree clean.

## Outcome and boundary

Teacher enters/corrects one eligible learner's score in an existing Class Record.
The saved value, retained unsaved input, correction reason and local-save feedback
must agree. Score identity is school + assessment item + learner, under the
class record's section/subject/period. This slice includes the UI, service,
trusted command, local persistence and sync enqueue trace; excludes report
issuance, redesign, new curriculum rules and whole-app completion.

Selection: score loss/corruption affects grading and report projections, and
source shows an editable score input during an asynchronous write followed by
unconditional draft deletion. Earlier F01–F16 completion is historical evidence,
not proof this race is safe. No claim of an exhaustive consequence ranking.

## Frozen acceptance criteria (all required)

| ID  | Requirement / invariant                                                                                                                          | Severity | Evidence required                                                                            |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------- | -------------------------------------------------------------------------------------------- |
| S1  | Completing an older save preserves a newer typed draft; it must not claim that draft is saved or move focus away.                                | Major    | Deferred-write regression fails on baseline and passes after repair; running UI interaction. |
| S2  | Unchanged normal score save updates only the intended row, clears only the submitted draft and shows local confirmation after acknowledgment.    | Major    | Positive control and repository payload/row assertions.                                      |
| S3  | Failed/rejected write preserves score/reason drafts and suppresses confirmation; retry/correction remains explicit and does not silently replay. | Major    | Rejection and retry execution.                                                               |
| S4  | Switching assessment context cannot apply an old response to a new item/learner.                                                                 | Major    | Stale-context regression execution.                                                          |
| S5  | Trusted authorization, persistence/history atomicity and sync identity for this path hold; missing native proof remains inconclusive.            | Critical | Native tests/database assertions at the checked revision; source trace alone insufficient.   |
| S6  | Affected controls remain keyboard reachable and legible at desktop/mobile in light/dark, with no relevant automated accessibility violations.    | Major    | Browser keyboard, axe, overflow and internal render inspection.                              |
| S7  | Intended-teacher usability validation remains pending unless a real teacher task trial occurs.                                                   | Advisory | Explicit trial status, no simulated claim.                                                   |

No acceptance criterion may be relaxed after seeing results. Browser fixtures
exercise production components but do not prove encrypted/native persistence,
real authorization or two-device transfer. Session score drafts are memory only;
process-death/reload recovery is not promised by this slice.

## Investigation checkpoint

Source hypothesis: `handleRecord` clears every draft for the learner after an
acknowledgment, even if the teacher typed another value while awaiting it.
No production repair yet. Additional trusted-boundary findings will be recorded
separately with execution limits; scope will remain this journey.
