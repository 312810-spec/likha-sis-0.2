# PM-13 saved-grade and unsaved-work contract

23 October 2026, Asia/Manila. Base05e885c6fe0e449082325bffd3eecf6c4da04026. Scope: existing Scores term-grade read/feedback while score writes or newer drafts exist. Preserve roster/authoring/history/export repairs; no new reporting journey, grading policy, native boundary or template change.

Task-pack provenance: LIKHA-SIS-UI-Redesign-Prompt-Master-Task-Pack-2026-10-22.md, Version1,119544 bytes, full962-line current read with has_more=false; Library identity libfile_846882fcdbb88191a2952470debb86b7. Shared element/effects and A1–A7 contracts carried forward. Newer repository FORGE4 adapter controls conflicts with attached v3.1 guidance.

Frozen required acceptance before edits:

| ID  | Outcome                                                                                                                                                                                    | Completion evidence                                                                  |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| C1  | A full-period grade is explicitly based on saved device records; current-item unsaved edits are excluded in every teacher mode.                                                            | Component and browser assertions with zero/newer score and pending correction.       |
| C2  | Explicit grade checks wait while a score write is unresolved. Repeated activation performs no read/write/replay; focusable control explains why it waits.                                  | Deferred write and synchronous handler activation, canonical tuple/count assertions. |
| C3  | A previously displayed grade cannot appear current for a learner whose score save is unresolved.                                                                                           | Deferred success/failure and current learner grade-cell assertions.                  |
| C4  | Confirmed write refreshes requested grades, preserves newer draft and reports saved evidence; failure preserves work, permits explicit grade retry and never implies success.              | Deferred success/failure with controlled grade replies.                              |
| C5  | Existing zero/missing/correction/cancel/IME/context and grade generation guards remain; old results cannot cross roster/grade context.                                                     | Existing focused suite and new late-read case.                                       |
| C6  | Actual changed controls/feedback use incumbent tokens, accessible descriptions and truthful status. Keyboard/reflow/contrast/reduced-motion checked in resolved appearances and densities. | Browser matrix, internal render inspection and affected repository/CI gates.         |

Compare allowing a read during unresolved saves (ambiguous snapshot), auto-saving all drafts (would change teacher intent), and waiting only for dispatched writes while labeling saved-only results (selected if reproduced). Memory drafts remain editable and require existing explicit save/correction semantics. No auto-replay. Full A1–A7 teacher/device/manual evidence remains partial.

## Task-pack prompt shown before execution

```text
+FORGE Prompt Master → UI + UX: execute PM-13 — Complete Scores editing and correction design for LIKHA-SIS.

Stage: 4 Pilot. Dependencies/activation: 12; protect verified repairs.

F — Refresh repository/rules, FORGE 4 adapter, TASK/state, relevant handoff, HEAD/diff and affected CI. Read this pack's shared contracts and relevant attached design/assurance sections. Source starting points: src/ui/ClassRecordJourneyScreen.tsx; src/ui/ClassRecordWorkspace.tsx; src/ui/ClassRecordsScreen.tsx. Verify current ownership/reachability; preserve concurrent work, completed repairs and established scoped authorization.

O — Teacher outcome: Let the teacher enter/correct the intended learner score while preserving every newer draft. Freeze the exact task boundary, acceptance IDs and expected evidence before editing.

R/G — Investigate and design: Which task gap remains after the verified repairs? Carry forward A1–A7. Specify roster/context, learner identity, aligned score fields, ranges/linked errors, missing versus zero, exception actions, recorded/proposed comparison, reason and explicit confirm/cancel. Preserve Enter/arrows/Tab/Escape and IME behavior. Design pending/failed/partial/denied/newer-draft states; local save never proves hub transfer. Connect each decision to evidence → smallest mechanism → risk/counterexample → completion test. Resolve reversible choices independently; ask only for facts blocking correctness. Complete the detailed element/button/effects contract for every changed control, including actual token values and applicable states.

Verification and export: Reproduce a remaining defect before editing. Run zero/missing, correction/cancel/retry, rapid typing during delayed acknowledgment, denial/context switch and completeness with unsaved work. Assert UI, canonical submitted tuple and applicable persistence. Export updated ledger, bounded repairs and exact A1–A7 statuses; teacher/device acceptance remains separate. Apply the current affected repository gates. Inspect actual renders internally with synthetic data; disclose manual/platform gaps. Do not create missing product features or alter approved official output templates to populate a screen.

E — Deliver the task-specific contract and bounded implementation where called for, actual commands/results, remaining limits, source-bound receipts and one next action. Update the surface/task coverage register. Preserve prepared/attempted/confirmed action distinctions and the shared readiness rules; no unsupported whole-app or device claim.
```

## C4 counterexample clarification — before failure-path repair

After the first candidate passed its original cases, final source review required explicitly testing a pre-write grade restored after a failed acknowledgment and a pre-write reply arriving after failure. Follow-up baseline2 FAIL/3 PASS/118 skipped confirmed both. C4 is strengthened without dropping the original criteria: keep grade outcome unconfirmed after null/exception save results until a fresh read succeeds, invalidate pre-write grade replies at dispatch, preserve draft/error/reason, and perform no score replay. Final browser scope includes pending save, confirmed save with newer draft, and unconfirmed save (36×3=108 state audits). Initial candidate CI/source evidence is superseded by this affected source change.
