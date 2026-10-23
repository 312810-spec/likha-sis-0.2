# PM-13 native grade access contract

23 October 2026, Asia/Manila. Base de3c691dcce810fda88204cc0101a242c5fd30a5. SRC-AUTH-1 is initially a source finding, not an executed exploit. Scope: compute_learner_term_grade native command/session/record authority only. Existing UI, save/draft/history/sync, grading arithmetic, official output and schemas remain unchanged. Current task pack Version1 (119544 bytes,962 lines) read in full; relevant attached Assurance and current FORGE4 adapter applied.

Frozen required criteria:

| ID  | Expected                                                                          | Evidence                                                                                                              |
| --- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| G1  | Same-school unassigned teacher denied even for a computable grade                 | Native command-core regression with real SQLCipher fixture and session                                                |
| G2  | Assignment replacement and school-head role revocation apply to existing sessions | Fresh trusted DB checks, denied old actor, allowed authorized replacement/head                                        |
| G3  | Canonical school/record/learner binding and missing/zero preserved                | Cross-school/unknown record, missing learner, zero positive control; unchanged score/history/outbox counts            |
| G4  | No/expired/revoked session cannot read                                            | Actual common session validation plus endpoint negative cases                                                         |
| G5  | Existing behavior and affected gates preserved                                    | Native fmt/test/clippy and Windows build/tests in CI; source-bound proof; installed-device/manual acceptance separate |

The local executor has no cargo. Reproduction uses a test seam preserving the original command body, with native regression execution in the existing CI runners before adding an assignment guard. No local native pass is claimed. Reuse the existing report-readiness authorized_record contract if the gap reproduces; compare duplicating policy or gating through an arbitrary assessment item (reject: duplication/empty-record mismatch). No changed UI controls or effects: token/button contracts N/A; retain prior revision-bound visual evidence and full A1–A7 limits.

## Prompt shown before execution

```text
+FORGE Prompt Master → UI + UX: execute PM-13 — Complete Scores editing and correction design for LIKHA-SIS.

Stage: 4 Pilot. Dependencies/activation: 12; protect verified repairs.

F — Refresh repository/rules, FORGE 4 adapter, TASK/state, relevant handoff, HEAD/diff and affected CI. Read this pack's shared contracts and relevant attached design/assurance sections. Source starting points: src/ui/ClassRecordJourneyScreen.tsx; src/ui/ClassRecordWorkspace.tsx; src/ui/ClassRecordsScreen.tsx. Verify current ownership/reachability; preserve concurrent work, completed repairs and established scoped authorization.

O — Teacher outcome: Let the teacher enter/correct the intended learner score while preserving every newer draft. Freeze the exact task boundary, acceptance IDs and expected evidence before editing.

R/G — Investigate and design: Which task gap remains after the verified repairs? Carry forward A1–A7. Specify roster/context, learner identity, aligned score fields, ranges/linked errors, missing versus zero, exception actions, recorded/proposed comparison, reason and explicit confirm/cancel. Preserve Enter/arrows/Tab/Escape and IME behavior. Design pending/failed/partial/denied/newer-draft states; local save never proves hub transfer. Connect each decision to evidence → smallest mechanism → risk/counterexample → completion test. Resolve reversible choices independently; ask only for facts blocking correctness. Complete the detailed element/button/effects contract for every changed control, including actual token values and applicable states.

Verification and export: Reproduce a remaining defect before editing. Run zero/missing, correction/cancel/retry, rapid typing during delayed acknowledgment, denial/context switch and completeness with unsaved work. Assert UI, canonical submitted tuple and applicable persistence. Export updated ledger, bounded repairs and exact A1–A7 statuses; teacher/device acceptance remains separate. Apply the current affected repository gates. Inspect actual renders internally with synthetic data; disclose manual/platform gaps. Do not create missing product features or alter approved official output templates to populate a screen.

E — Deliver the task-specific contract and bounded implementation where called for, actual commands/results, remaining limits, source-bound receipts and one next action. Update the surface/task coverage register. Preserve prepared/attempted/confirmed action distinctions and the shared readiness rules; no unsupported whole-app or device claim.
```
