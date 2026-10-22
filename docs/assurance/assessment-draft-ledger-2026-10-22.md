# PM-12 creation draft/control/effects ledger

22 October2026,Asia/Manila. Scope: creation acknowledgment and current input in ClassRecordWorkspace and AssessmentAuthoringScreen. Exact prompt/shared contracts: assessment-draft-task-prompt-2026-10-22.md. Frozen criteria: assessment-draft-contract-2026-10-22.md.

## Source and revision meaning

The assigned-class journey mounts the workspace or Creation Studio for the current class record; assessment creation goes through AssessmentApplicationService and its repository port. Native authority, item/category rules, score protection and output formats remain unchanged. A synchronous per-composer revision increments on user name/max/category/set edits. The create request captures its revision and existing canonical arguments. A result confirms the submitted item; it cannot clear a later draft, even if the user edits back to identical text.

| Element / owner              | Updated behavior                                                                                                                   | Geometry, state and effect                                                                                        |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| workspace item-name          | Edits increment creation revision; preserved when an older request finishes                                                        | Existing labelled native text input; current browser geometry/styles in evidence; no new animation                |
| Studio item-name             | Same revision rule; composition Enter returns without creating                                                                     | Existing text input; ordinary Enter retains Add-and-continue behavior; actual device IME still separate           |
| workspace max-score          | A max-only edit preserves the current name/draft when the prior item is acknowledged                                               | Existing min1 number field; no changed validation or range semantics                                              |
| Studio max-score             | Same revision tracking; newer focused field is not displaced                                                                       | Existing number field; focus stays at current input after delayed acknowledgment                                  |
| workspace category           | User choice advances revision; submitted category remains bound to the request                                                     | Existing labelled select; category read/source checks unchanged                                                   |
| Studio category              | A category-only edit retains the current draft; result still belongs to submitted category                                         | Native select; synthetic category-boundary regression; no new official category                                   |
| workspace category-set       | User choice advances revision; existing fresh category resolution remains                                                          | Native select; default reconciliation/source identity unchanged                                                   |
| Studio category-set          | Same user-revision rule                                                                                                            | Native select; no new category-set authority                                                                      |
| workspace Add item           | Captures creation revision; existing Adding…/aria-disabled duplicate guard retained                                                | Existing button and shared motion; no automatic resubmission of retained work                                     |
| Studio Add item and continue | Captures revision and initiating focus element                                                                                     | Existing primary button; return focus only for unchanged draft, same active source and unchanged initiating focus |
| workspace editor toggle      | Unchanged submission retains normal collapse; newer work keeps implicit empty-record editor open; explicit user close is preserved | Native button, aria-expanded/controls unchanged; no modal or layout replacement                                   |
| workspace success Alert      | Names created item; adds Your newer item draft is retained. when applicable                                                        | Existing polite success Alert and semantic theme colors; persistent actual receipt, no fake progress              |
| Studio success Alert / count | Same truthful receipt; count tracks acknowledged creations rather than current draft                                               | Existing success/status treatment; no new timer/delay                                                             |

All four native field families retain source CSS. Each tested configuration records actual width/height/min-height, font/line-height, text/background/border, radius/padding, transition/easing; the focused max field also records outline/offset. Existing density control heights34/40/72px and base text14/15/17px remain. No new duration/easing is authored; reduced-motion inherits the measured shared system. Focus behavior changes rather than a decorative effect. Hover/pressed/disabled visuals use existing controls and were not restyled.

## Observed before / implemented after

| Before observation                                                                 | After requirement / implementation                                                               |
| ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| A delayed successful create cleared a name typed for the next item                 | Only unchanged submitted revision is cleared; newer name/value/category work remains             |
| Returning text to its original value could look unchanged to value-only comparison | Revision identity preserves the newer editing action, including ABA text                         |
| The first item made the default empty-record composer disappear despite newer work | Convert implicit open intent to explicit open only when newer work exists; retain explicit close |
| Studio forced name focus after delayed create/list refresh                         | Restore initiating flow only if draft/source/focus are still unchanged                           |
| Studio handled composition Enter as creation                                       | Composing Enter does not call create; ordinary Enter remains                                     |

Failures keep the current draft and require explicit retry. Existing duplicate review, invalid ranges, scored-item rename/delete restrictions and cancel behavior are protected by existing tests; this slice does not certify all remaining PM-12 editing/deletion combinations. Browser records are synthetic in-memory fixtures. Full Scores A1–A7 teacher/device/manual acceptance remains pending.

Appearance scope: System preference resolution retains the unchanged shared-provider receipt in design-system-measurements-2026-10-22.json. This72-case run exercises both resolved appearances; it does not claim fresh System-preference transition execution or complete A4/manual acceptance.
