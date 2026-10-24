# PM-13 saved-grade readiness handoff

23 October 2026, Asia/Manila. Branch forge/scores-grade-readiness-20261023 from05e885c6fe0e449082325bffd3eecf6c4da04026. Current task-pack Version1 read in full; complete PM-13 prompt shown before implementation and retained with frozen C1–C6 in scores-grade-readiness-contract-2026-10-23.md. Parent PR150 remains draft on PR149. Parent documentation-checkpoint CI was initially Quality39863467379 in progress /Security39863467363 success; that run is not this candidate's gate.

## Outcome and verification

Explicit term-grade reads wait for unresolved score writes using the existing synchronous write guard. The action stays keyboard reachable and explains why it waits. During saving, the affected learner's cell shows a pending message instead of an older grade or late read reply. Other learners remain readable. All modes explain that full-period term grades use saved device records, exclude unsaved input and do not establish reporting approval. Current-item unsaved work has an adjacent status; newer zero/reason/draft survives. Confirmed writes retain generation-guarded grade refresh. Failed/unconfirmed score outcomes keep the grade unconfirmed until a fresh successful read. The grade-read handler does not write or replay scores; existing input blur/Tab commit semantics remain. No policy/native/schema/style/dependency/template change.

Initial baseline4 FAIL/118 PASS; follow-up failure-path baseline2 FAIL/3 PASS/118 skipped. Final focused123 PASS (five new cases), full quality1,692 tests/161 files PASS, build/isolation21 PASS. Final browser36 configurations/108 states PASS across two resolved appearances × three densities ×1280/640/390 × normal/reduced motion. Each case checks pending save, confirmed save with newer zero and unconfirmed correction; canonical tuple and fixture receipt, no replay, retained reason, explicit read recovery, axe/reflow/targets/focused control hit/viewport/footer clearance. Six current desktop/phone renders inspected internally. Repeated UI smoke/recovery50/Scores47 observations PASS. Actual control profiles, initial/follow-up baselines and final source hashes are in scores-grade-readiness-evidence-2026-10-23.json.

The initial1691/72-state receipts are superseded. A concurrent full run hit timeouts in unchanged tests; same-source sequential full quality passed without changing test thresholds. A stale-ref synchronization correction caused the in-progress browser attempt to be discarded and restarted on verified5f83f388; only the final stable run is accepted. Both interruptions are retained in raw evidence.

PR161 passed Quality39866307674 and Security39866307682 on5f83f388, then merged as534d0b71. Checked/CI/actual merge tree3150b27b matches. CI confirms1,692/161, UI smoke, recovery50 and startup26; native/Windows skipped by the affected-work classifier. Exact receipt: scores-grade-readiness-ci-merge-2026-10-23.json. Parent PR150 remains draft on149.

## C1–C6 executed checks

| ID  | Expected → executed evidence                                                                                                                                                     | Result / limit                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| C1  | Saved-only full-period evidence and pending zero/correction → component zero/Escape plus every browser density/state                                                             | PASS for selected current item; other-item draft inventory not added                           |
| C2  | Read waits for unresolved writes → repeated component activation plus browser Enter/Space, canonical write count and accessible description                                      | PASS; input blur/Tab remains an independent existing save trigger                              |
| C3  | Older grade cannot appear during a learner save → displayed-grade and late-reply component cases plus pending state in36 browser configurations                                  | PASS for current roster/learner context                                                        |
| C4  | Failed outcome stays unconfirmed; fresh read recovers without replay → two failure-order regressions and failed correction/read recovery across36 configurations                 | PASS for exercised exception paths; null outcome branch source-inspected with shared mechanism |
| C5  | Existing zero/missing/correction/cancel/IME/context/generation guards → final123 workspace cases and existing47-observation Scores journey                                       | PASS at component/fixture layer; native assignment/device evidence separate                    |
| C6  | Incumbent styles/semantics and affected gates →108 axe state audits,36 focused-button target/hit/viewport/footer checks, reflow/reduced motion, six renders, quality/build/UI/CI | PASS for selected matrix; System provider/manual AT/OS zoom/physical device limits retained    |

## Carried A1–A7 status

| ID                     | Bounded evidence and limits                                                                                                                                                                    |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 identity/value      | Canonical classRecord/learner grade reads and assessment/learner score tuple checked; saved18 vs proposed0 preserved; SRC-AUTH-1 assignment-boundary verification still pending                |
| A2 persistence/status  | Deferred confirmed/failed writes, busy read guard and saved-only status checked; browser fixture persistence is not native device or hub receipt                                               |
| A3 preservation        | Newer score/reason/cancel and existing context/denial/generation regressions retained; account/native/device proof separate                                                                    |
| A4 appearance          | Final36/108 and six current inspected renders PASS; System provider behavior separately evidenced                                                                                              |
| A5 accessibility       | Native button semantics/description, pending keyboard activation, focus/hit/targets, axe/reflow/reduced motion PASS; manual AT/OS zoom/physical IME NOT RUN                                    |
| A6 teacher outcome     | Technical correctness only; no observed teacher speed/comprehension or professional approval                                                                                                   |
| A7 regression/platform | Final quality1,692/161, focused123, UI/recovery50/Scores47/build/isolation PASS; affected Quality/Security PASS, exact merge receipt recorded; no fresh native Windows/Android installed claim |

SRC-AUTH-1: inspected compute_learner_term_grade checks active school scope but does not call the assignment-access guard used for item score writes/history. Record this as a source-observed permission-gap candidate, not an executed exploit. Next priority: synthetic native reproduction of a same-school unassigned class/learner grade read, then trusted-boundary repair if confirmed. Do this before expanding runtime journeys; broader category/period/report-readiness and teacher/device observations remain in the backlog.

Full PM-12/13, Scores A1–A7 and overall teacher/device/manual acceptance remain PARTIAL/INCONCLUSIVE. This slice is bounded UI feedback verification only. No main/dependent-chain merge or deployment.
