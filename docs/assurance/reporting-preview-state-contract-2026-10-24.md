# PM-13 reporting preview context contract

24 October 2026, Asia/Manila. Base7ad600fe2ef03445ab38a652a539273e48370c71. Current Prompt Master pack read in full (Version1,119544 bytes/962 lines). Full PM-13 prompt shown before implementation. Current FORGE4 adapter and relevant attached design/playbook/assurance guidance apply.

Teacher outcome: an interrupted or unconfirmed score save must not restore an older reporting snapshot or leave its check permanently busy. Scope: existing ReportCardReadinessPanel within Scores; no new reporting family, official template, grading/native policy or persistence change.

| ID  | Required behavior                                                                                                           | Required evidence                                                                                                    |
| --- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| R1  | Hiding during unavailable/write state invalidates an old snapshot even if revision is unchanged                             | Component regression and real workspace browser failure flow                                                         |
| R2  | An interrupted pending check cannot become a permanent busy state after re-enable; old replies cannot replace a fresh check | Deferred component tests with canonical read arguments and retry                                                     |
| R3  | Returning to a previous service/record/revision cannot revive an old snapshot, error or loading state                       | Context-cycle tests and existing mismatch/late-response controls                                                     |
| R4  | Current zero/missing/partial results, saved-only/newer drafts, no export/write/replay and explicit retry remain             | Existing tests, added retry/denial cases, synthetic workspace persistence/request assertions                         |
| R5  | Changed hint/control semantics retain incumbent tokens, keyboard/reflow/contrast/motion and required repository checks      | Changed-state browser matrix, internal render inspection, JS quality/build/UI/recovery/isolation and source-bound CI |

Baseline suspected source mechanism: result identity stores service/record/revision but does not encode availability generation; current hides disabled results without invalidating stored state. Native behavior is not inferred from the UI test. Reproduce before repair. Required failures block this bounded task; full A1–A7 teacher/manual/device acceptance stays partial. No unrelated redesign, dependency replacement, main/dependent-chain merge or deployment.

## Prompt shown before execution

### PM-13 · Complete Scores editing and correction design

```text
FORGE Prompt Master → UI + UX: execute PM-13 — Complete Scores editing and correction design for LIKHA-SIS.

Stage: 4 Pilot. Dependencies/activation: 12; protect verified repairs.

F — Refresh repository/rules, FORGE 4 adapter, TASK/state, relevant handoff, HEAD/diff and affected CI. Read this pack's shared contracts and relevant attached design/assurance sections. Source starting points: src/ui/ClassRecordJourneyScreen.tsx; src/ui/ClassRecordWorkspace.tsx; src/ui/ClassRecordsScreen.tsx. Verify current ownership/reachability; preserve concurrent work, completed repairs and established scoped authorization.

O — Teacher outcome: Let the teacher enter/correct the intended learner score while preserving every newer draft. Freeze the exact task boundary, acceptance IDs and expected evidence before editing.

R/G — Investigate and design: Which task gap remains after the verified repairs? Carry forward A1–A7. Specify roster/context, learner identity, aligned score fields, ranges/linked errors, missing versus zero, exception actions, recorded/proposed comparison, reason and explicit confirm/cancel. Preserve Enter/arrows/Tab/Escape and IME behavior. Design pending/failed/partial/denied/newer-draft states; local save never proves hub transfer. Connect each decision to evidence → smallest mechanism → risk/counterexample → completion test. Resolve reversible choices independently; ask only for facts blocking correctness. Complete the detailed element/button/effects contract for every changed control, including actual token values and applicable states.

Verification and export: Reproduce a remaining defect before editing. Run zero/missing, correction/cancel/retry, rapid typing during delayed acknowledgment, denial/context switch and completeness with unsaved work. Assert UI, canonical submitted tuple and applicable persistence. Export updated ledger, bounded repairs and exact A1–A7 statuses; teacher/device acceptance remains separate. Apply the current affected repository gates. Inspect actual renders internally with synthetic data; disclose manual/platform gaps. Do not create missing product features or alter approved official output templates to populate a screen.

E — Deliver the task-specific contract and bounded implementation where called for, actual commands/results, remaining limits, source-bound receipts and one next action. Update the surface/task coverage register. Preserve prepared/attempted/confirmed action distinctions and the shared readiness rules; no unsupported whole-app or device claim.
```

## Required security prerequisite — discovered before merge

Initial UI-only headfc7ce1c passed Quality40095919498 but failed Security40095919479. Cargo-deny job120878042459 flags ctutils0.4.2 (RUSTSEC-2026-0385); OSV job120878042601 flags that plus undici8.11.2 (GHSA-4qv8-2p9j-2685, GHSA-f72v-6w45-q472, GHSA-xjj6-f33q-929c) and zod4.4.3 (GHSA-mrhx-c7xc-m3w5). These unchanged baseline locks are a current required gate failure, not a regression caused by the panel source. No merge occurred.

S1 (required before merge): update only the affected transitive lock entries to current compatible stable fixes, verify upstream registry/advisory metadata and checksums, preserve direct manifests/scanner rules/allowlists, re-run affected JS and native/Windows gates plus Security. Latest verified compatible versions: undici8.12.3, zod4.6.7 (npm registry), ctutils0.4.5 (official crates index blob c8e1d3863f67e0195261375719cd08680a85335f; checksum38d28fb6aa7dd680b3ffd1a3e64e115c177bdba63c0ae7f9cd48129ff05c4fa0, MSRV1.87, existing cmov^0.5.3 dependency retained). Cargo absent locally: single verified Cargo.lock version/checksum patch will be validated by real CI Cargo resolution/build/tests; no local cargo claim.

Select minimal compatible patch updates: meets required scan gate while retaining current APIs and project manifests. Waiving/ignoring findings fails the frozen security gate; parking the blocker does not complete authorized integration. R1–R5 remain unchanged. S1 deliberately expands affected verification to the native dependency graph; final source/CI/artifact receipts must reflect this combined candidate and preserve initial failure evidence. Official sources: RustSec RUSTSEC-2026-0385 and the five advisory/registry links in the evidence receipt. No new scanner exception or downgraded threshold.
