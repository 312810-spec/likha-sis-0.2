# PM-13 saved-grade readiness handoff

23 October 2026, Asia/Manila. Branch forge/scores-grade-readiness-20261023 from05e885c6fe0e449082325bffd3eecf6c4da04026. Current task-pack Version1 read in full; complete PM-13 prompt shown before implementation and retained with frozen C1–C6 in scores-grade-readiness-contract-2026-10-23.md. Parent PR150 remains draft on PR149. Parent documentation-checkpoint CI was initially Quality39863467379 in progress /Security39863467363 success; that run is not this candidate's gate.

## Outcome and verification

Explicit term-grade reads wait for unresolved score writes using the existing synchronous write guard. The action stays keyboard reachable and explains why it waits. During saving, the affected learner's cell shows a pending message instead of an older grade or late read reply. Other learners remain readable. All modes explain that full-period term grades use saved device records, exclude unsaved input and do not establish reporting approval. Current-item unsaved work has an adjacent status; newer zero/reason/draft survives. Confirmed score writes retain existing generation-guarded grade refresh, failure preserves work/error, and read retry causes no score write. No policy/native/schema/style/dependency/template change.

Initial candidate34391d79 passed baseline4 FAIL/118 PASS → focused122/full quality1,691/161 and browser36/72, UI/recovery50/Scores47/build/isolation21. Those checks are historical and are not reused for the strengthened source. Final failure-path review reproduced2 FAIL/3 PASS/118 skipped: pre-write grade restoration after failure and late pre-write reply after failure. Fifth regression added; strengthened focused123 PASS. Write dispatch now invalidates the learner's earlier grade reads; null/exception outcomes keep an already-requested grade unconfirmed until a fresh successful read. Draft/error/reason remain; a fresh grade check does not resend a score.

Final full quality, expanded browser36/108 states, and repeated UI/recovery/journey verification are in progress. Final build/isolation21 PASS. Initial evidence JSON is explicitly superseded; the completed source-bound replacement and CI/merge receipt will be recorded at the documentation checkpoint after all required gates pass. No integration merge before those gates.

## Carried A1–A7 status

| ID                     | Bounded evidence and limits                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 identity/value      | Canonical classRecord/learner grade reads and assessment/learner score tuple checked; saved18 vs proposed0 preserved; SRC-AUTH-1 assignment-boundary verification still pending |
| A2 persistence/status  | Deferred confirmed/failed writes, busy read guard and saved-only status checked; browser fixture persistence is not native device or hub receipt                                |
| A3 preservation        | Newer score/reason/cancel and existing context/denial/generation regressions retained; account/native/device proof separate                                                     |
| A4 appearance          | Initial36/72 superseded; final36/108 in progress; System provider behavior separately evidenced                                                                                 |
| A5 accessibility       | Native button semantics/description, pending keyboard activation, focus/hit/targets, axe/reflow/reduced motion PASS; manual AT/OS zoom/physical IME NOT RUN                     |
| A6 teacher outcome     | Technical correctness only; no observed teacher speed/comprehension or professional approval                                                                                    |
| A7 regression/platform | Initial local quality/UI evidence superseded; strengthened focused123/build/isolation PASS, final gates pending; no fresh native Windows/Android installed claim                |

SRC-AUTH-1: inspected compute_learner_term_grade checks active school scope but does not call the assignment-access guard used for item score writes/history. Record this as a source-observed permission-gap candidate, not an executed exploit. Next priority: synthetic native reproduction of a same-school unassigned class/learner grade read, then trusted-boundary repair if confirmed. Do this before expanding runtime journeys; broader category/period/report-readiness and teacher/device observations remain in the backlog.

Full PM-12/13, Scores A1–A7 and overall teacher/device/manual acceptance remain PARTIAL/INCONCLUSIVE. This slice is bounded UI feedback verification only. No main/dependent-chain merge or deployment.
