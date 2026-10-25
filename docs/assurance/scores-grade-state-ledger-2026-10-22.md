# Scores term-grade state and control ledger

22 October 2026, Asia/Manila. PM-12/13/31 continuation. This is the term-grade family within the active assigned-class → Scores journey, not a census of every screen or all Scores states. See scores-grade-refresh-contract-2026-10-22.md for frozen criteria and the existing A1–A7 contract for full acceptance.

## Source ownership and observed gap

`src/App.tsx` embeds `ClassRecordJourneyScreen` under the selected assigned class. That screen resolves assignment/period/weighting and mounts `ClassRecordWorkspace`; the workspace owns grade presentation and refresh. `LearnerScoreApplicationService.computeTermGrade` validates canonical IDs and delegates to its repository. Trusted native computation and authorization are unchanged. `ComputedTermGrade` remains the current domain result; no grading formula or official-source claim is introduced.

At base290b574, `maybeRefreshTermGrade` silently ignored rejected recomputation and left the previous grade visible. Background and bulk reads lacked roster/revision guards; a bulk read in flight before the first displayed result did not trigger the saved-score refresh because the grade map was still empty. Three new regressions failed on the baseline (68 existing passed); the same three passed after repair. Two additional ordering/partial-failure cases extend coverage.

## Actual state contract

| State/trigger                            | Control and visible result                                                                             | Source owner / protection                                                                   |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------- |
| No grade requested                       | Show term grades; no automatic grade read during normal score entry                                    | `handleShowTermGrades`, requested ref                                                       |
| Initial computation                      | Computing… button retains native focusability with aria-disabled; row says Updating grade… as status   | synchronous bulk guard; `refreshTermGrade`                                                  |
| Successful result                        | Domain term grade; existing provisional/floor annotations retained                                     | Current roster generation and learner revision required                                     |
| Null result                              | Not yet available                                                                                      | Service deliberately cannot distinguish unavailable/foreign/incomplete; no invented cause   |
| Save acknowledged after grades requested | Affected learner's old number disappears; Updating grade… until fresh read                             | `handleRecord` → `maybeRefreshTermGrade`; includes initial bulk overlap                     |
| Failed grade read                        | Could not refresh. Show term grades to retry. as row alert; old number hidden                          | Read failure separated from score-write outcome                                             |
| Explicit retry                           | Same Show term grades action, keyboard Enter supported; no score write replay                          | Each learner gets a fresh read revision; current focus retained                             |
| Partial batch failure                    | Successful/unavailable rows still render alongside only affected failure rows                          | Reads settle independently, not an all-or-nothing Promise result                            |
| Earlier read finishes late               | Response discarded; latest learner revision wins                                                       | Per-learner generation guard shared by bulk and automatic paths                             |
| Assessment/roster/service changed        | Old roster generation cannot repaint current rows; fresh roster clears grade intent/results/bulk state | Existing roster request identity and effect cleanup; replaced-service path source-traced    |
| Unsaved score draft                      | Saved grade still describes saved data; existing pending-edit disclosure remains authoritative         | Existing draft/acknowledgment invariants retained; refresh begins after save acknowledgment |
| Grade read fails after save              | Saved on this device remains valid; grade failure cannot turn save into failure                        | Separate async read helper catches its own rejection                                        |
| Theme/density/reduced motion             | Existing semantic text/error/hint tokens, table and native button; no new animation                    | Existing measured shared system; actual changed-state browser matrix                        |

No new primary action, modal, card, component library, motion duration or token authority. Explicit rows carry meaning without color dependence. Guided copy now describes an unavailable result without inferring why the boundary returned null, and tells the teacher how to retry a failed check.

## Verification mapping and limits

G1: regression for stale-number failure and read-only retry; browser controlled failure after actual correction. G2: delayed read after assessment change and newer explicit read versus older automatic response; service replacement shares the source-traced roster-generation cleanup. G3: initial bulk read overlaps a saved score and returns late. G4: independent success/null/error rows plus existing duplicate-computation/no-unrequested-read tests. G5: browser states, keyboard focus, applicable quality/build/CI receipts in the handoff.

Synthetic grades88/92 test display ordering, not official arithmetic or native persistence. No new export/reporting, print, grading algorithm, schema, authority, installed Windows, Android or real exchange evidence. Teacher comprehension, manual AT/OS zoom and full Scores A1–A7 remain pending. Other UI families keep their previous statuses; do not widen the runtime pilot from this repair.
