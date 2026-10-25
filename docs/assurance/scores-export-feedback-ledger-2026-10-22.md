# Scores CSV state and control ledger

22 October 2026, Asia/Manila. Scope: existing Scores workspace report-card/class-summary CSV feedback. PM-12/13/31; no new journey. Contract: scores-export-feedback-contract-2026-10-22.md.

## Source trace

App → assigned-class folio → ClassRecordJourneyScreen → ClassRecordWorkspace. The journey keys the workspace by teacher/assignment/class-record identity. Workspace handlers delegate to ExportApplicationService, which validates the class-record identifier and delegates to ExportRepository. Native commands in src-tauri/src/commands/export.rs require active school scope and read persisted class/period/roster/grade data under the database lock. That source supports describing a saved-record snapshot; this slice does not retest native filesystem writes or validate file contents.

The previous workspace retained a prior result when a new attempt started or failed. Export errors used the assessment-level banner, whose recovery was Reload items. Both folder actions had the same accessible name. Earlier browser execution also observed a long unbroken path overflowing the page; those unfinished local files/logs were removed by workspace maintenance. The slice was reconstructed on the unchanged GitHub base and verified again with source hashes.

## State ownership

| State                  | Visible feedback/action                                                             | Protection and meaning                                                                                                |
| ---------------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Idle                   | Export report card (CSV) / Export class summary (CSV)                               | Existing explicit actions; no background export                                                                       |
| Pending                | Exporting…; aria-disabled                                                           | Existing handler guard; prior result/path/folder action for that kind is removed                                      |
| Confirmed              | Report card exported / Class summary exported; exact returned path                  | Only a returned result establishes UI confirmation; omitted-field disclosure preserved                                |
| Snapshot               | Exported snapshot of saved records; later changes require export again              | Does not imply a live file, submission-ready official form or teacher approval                                        |
| Failure                | Output-specific export not confirmed heading and error                              | Does not assert no file could exist; no automatic retry or unrelated Reload items                                     |
| Null                   | No named output export was returned; check access and try again                     | Does not invent a specific not-found/denial cause                                                                     |
| Retry                  | Same named Export action; keyboard Enter retains initiating focus                   | Explicitly requests an export; does not replay a score/correction; existing score-field blur commits remain unchanged |
| Other output confirmed | Its path and named folder action remain                                             | Errors/results are independent by output kind                                                                         |
| Folder action          | Visible Open folder; accessible Open report card folder / Open class summary folder | Exact returned path passed to revealExportedFile                                                                      |
| Folder failure         | Could not open the folder for this file                                             | Confirmed export retained; no new export request                                                                      |
| Long path              | Complete copyable path wraps using .score-export-path                               | Scoped overflow-wrap:anywhere and white-space:normal; no truncation or filename rewrite                               |

No new component abstraction, dependency, palette or animation. The existing native buttons, Alert roles, spacing and semantic theme tokens remain. Repeated activation is checked with native keyboard Enter on the aria-disabled button; Playwright's availability checks intentionally prevent a normal click on that state.

## Evidence and boundary

Fresh component tests cover pending/failure/retry and null for both outputs, independent confirmation/folder names, summary duplicate guard and folder-open failure. The existing report-card duplicate guard remains. The browser injects virtual results and paths only: deferred failure, retry/focus, reveal path identity, no score writes and both output-error states across themes/densities/widths/motion. Its confirmations are synthetic response evidence, not evidence that a native file was created/opened.

Source-bound results and actual checks belong to scores-export-feedback-evidence-2026-10-22.json and the handoff. File bytes, official-form fidelity, installed Windows, Android, real two-device exchange, teacher comprehension and manual AT/OS zoom retain their existing pending status. Full Scores A1–A7 is not completed by this UI repair.
