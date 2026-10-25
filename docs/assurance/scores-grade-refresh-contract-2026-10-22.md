# Scores term-grade state contract

22 October 2026, Asia/Manila. Base290b574d1fddc4031be76c7a6aacbe15696c06b1. PM-12/13/31 continuation within the existing Scores pilot; A1–A7 remain unchanged.

Outcome: a teacher must not mistake an older computed grade for a current result after a successful score change or a context change. No grading algorithm, official rule, export, native authority or persistence change.

| ID  | Required observation                                                                                                                                                          | Method                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| G1  | After a saved score, an already-requested grade shows updating until its fresh result; failure hides the old number and offers explicit retry without replaying a score write | Deferred/rejected repository component regressions and browser      |
| G2  | A response from a left roster/item or replaced service cannot repaint current grades; older refresh cannot overwrite newer refresh                                            | Controlled out-of-order component tests                             |
| G3  | A bulk computation started before a score acknowledgment cannot overwrite that learner's newer computation; other learners remain independent                                 | Deferred bulk/score overlap regression                              |
| G4  | Null remains an honest unavailable result; failed reads differ from unavailable; duplicate bulk actions are guarded; successful local save remains visible on grade failure   | Existing and new focused tests                                      |
| G5  | State copy, keyboard retry/focus, light/dark and density/reduced-motion layouts pass affected browser/axe checks; normal quality/build and applicable CI pass                 | Actual rendered synthetic UI, internal inspection, repository gates |

Source lead: maybeRefreshTermGrade currently leaves the previous number after a rejected recomputation; bulk and background results have no context/generation guard. These are hypotheses until failing regression execution. Keep the existing palette/layout; add only truthful grade states and recovery. No device/teacher acceptance is inferred from synthetic checks.
