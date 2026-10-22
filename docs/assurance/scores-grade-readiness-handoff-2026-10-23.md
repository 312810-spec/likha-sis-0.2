# PM-13 saved-grade readiness handoff

23 October 2026, Asia/Manila. Branch forge/scores-grade-readiness-20261023 from05e885c6fe0e449082325bffd3eecf6c4da04026. Current task-pack Version1 read in full; complete PM-13 prompt shown before implementation and retained with frozen C1–C6 in scores-grade-readiness-contract-2026-10-23.md. Parent PR150 remains draft on PR149. Parent documentation-checkpoint CI was initially Quality39863467379 in progress /Security39863467363 success; that run is not this candidate's gate.

## Outcome and verification

Explicit term-grade reads wait for unresolved score writes using the existing synchronous write guard. The action stays keyboard reachable and explains why it waits. During saving, the affected learner's cell shows a pending message instead of an older grade or late read reply. Other learners remain readable. All modes explain that full-period term grades use saved device records, exclude unsaved input and do not establish reporting approval. Current-item unsaved work has an adjacent status; newer zero/reason/draft survives. Confirmed score writes retain existing generation-guarded grade refresh, failure preserves work/error, and read retry causes no score write. No policy/native/schema/style/dependency/template change.

Baseline4 FAIL/118 PASS; candidate focused122 PASS including four new regression cases. Full npm run quality PASS:1,691 tests/161 files plus typecheck/lint/format/architecture/deadcode/batch checks. Build PASS (existing chunk advisory); fixture isolation PASS21 files. Browser36 configurations/72 states PASS: two resolved appearances × three densities ×1280/640/390 × normal/reduced motion. Every case checks canonical score tuple and fixture receipt (saved18 vs newer0), zero replay, repeated grade activation while saving, per-learner grade refresh, correction reason/cancel, axe A/AA, page reflow, button targets and focused button hit/viewport/footer clearance. Four current desktop/phone pending/newer-draft renders inspected internally. Actual computed token/control profiles are in scores-grade-readiness-evidence-2026-10-23.json; element/effects/before-after/coverage register in scores-grade-readiness-ledger-2026-10-23.md.

Existing UI smoke, recovery50 and Scores journey47 observations PASS. Affected implementation CI and scoped integration publication remain pending until recorded.

## Carried A1–A7 status

| ID                     | Bounded evidence and limits                                                                                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 identity/value      | Canonical classRecord/learner grade reads and assessment/learner score tuple checked; saved18 vs proposed0 preserved; SRC-AUTH-1 assignment-boundary verification still pending |
| A2 persistence/status  | Deferred confirmed/failed writes, busy read guard and saved-only status checked; browser fixture persistence is not native device or hub receipt                                |
| A3 preservation        | Newer score/reason/cancel and existing context/denial/generation regressions retained; account/native/device proof separate                                                     |
| A4 appearance          | Current36 configurations/72 states and four inspected renders PASS; System provider behavior separately evidenced                                                               |
| A5 accessibility       | Native button semantics/description, pending keyboard activation, focus/hit/targets, axe/reflow/reduced motion PASS; manual AT/OS zoom/physical IME NOT RUN                     |
| A6 teacher outcome     | Technical correctness only; no observed teacher speed/comprehension or professional approval                                                                                    |
| A7 regression/platform | Local quality/build/isolation PASS; existing UI/recovery50/Scores47 PASS; affected implementation CI pending; no fresh native Windows/Android installed claim                   |

SRC-AUTH-1: inspected compute_learner_term_grade checks active school scope but does not call the assignment-access guard used for item score writes/history. Record this as a source-observed permission-gap candidate, not an executed exploit. Next priority: synthetic native reproduction of a same-school unassigned class/learner grade read, then trusted-boundary repair if confirmed. Do this before expanding runtime journeys; broader category/period/report-readiness and teacher/device observations remain in the backlog.

Full PM-12/13, Scores A1–A7 and overall teacher/device/manual acceptance remain PARTIAL/INCONCLUSIVE. This slice is bounded UI feedback verification only. No main/dependent-chain merge or deployment.
