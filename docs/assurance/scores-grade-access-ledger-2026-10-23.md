# PM-13 native grade-read authority ledger

23 October 2026, Asia/Manila. Frozen G1–G5 and full shown prompt: scores-grade-access-contract-2026-10-23.md. Bounded SRC-AUTH-1 continuation of the Scores pilot.

## Evidence and selected mechanism

Native pre-guard CI on6f580f0 / treed69966e compiled1318 library tests:1315 passed,3 denial assertions failed. Unassigned teacher returned a genuine computed grade with initial_grade0.0/term_grade60/complete=true. Existing sessions also retained access after assignment replacement and school-head role revocation. Unknown/foreign records, no/revoked session and zero/missing controls passed. The earlier93ed attempt failed fmt only; its two wraps were corrected before actual reproduction.

Reuse report_readiness::authorized_record inside the session-derived grade command core. This resolves the class record within the session's school, queries the current exact section/subject assignment and current school-head role, and propagates denial/errors before canonical grade computation. Actor/school remain trusted session values. The existing DB connection lock covers authority and read together. Unknown/foreign record remains None; no math, schema, client authority parameter, write, history or sync change.

Rejected alternatives: duplicate permission SQL risks policy drift; choosing an arbitrary assessment item fails the empty-record case; UI-only filtering does not enforce native authority. A school registrar is not granted an extra grade permission by this slice. Two separate partial assignment matches cannot combine into authority.

| Criterion | Required evidence                                                                                             |
| --------- | ------------------------------------------------------------------------------------------------------------- |
| G1        | Unassigned and registrar denial on actual computable grade                                                    |
| G2        | Existing-session replacement/revocation; assigned replacement and current school head allowed                 |
| G3        | Exact section/subject pair; school/record/learner scope; zero/missing; unchanged score/history/outbox counts  |
| G4        | No, expired and persisted-revoked session rejected                                                            |
| G5        | Ubuntu fmt/test/clippy, five pinned negative controls with byte restoration, Windows build/tests and Security |

## Coverage register and effects

| Surface/task                       | This slice                                                                          | Remaining scope                                                                        |
| ---------------------------------- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| PM-13 term-grade native read       | Seven native regressions, canonical authorization and three grade negative controls | Wider Scores category/period/report-readiness state coverage and external observations |
| Prior PM-13 UI grade feedback      | Source/test/style/probe hashes unchanged from PR161                                 | Prior visual receipts retain their own source/environment limits                       |
| UI control/token/motion contract   | NOT APPLICABLE: no changed controls, styles or effects                              | Existing contracts retained                                                            |
| Other school-wide command surfaces | NOT RUN in this bounded slice                                                       | Separate investigation required; no whole-app permission claim                         |

The negative-control probe retains the two pinned score-write controls and adds three grade controls. It reconstructs the original public command body with only lock/borrow adaptation into the executed pre-guard seam; asserts exact bytes against6f580f0; requires test assertion failures (including actual computed-grade exposure), rejects compilation errors and restores every modified source byte in finally.

A1–A7 remain partial/inconclusive at full task-family level. Native synthetic authorization tests do not establish installed Windows operation, physical keyboard/IME, manual assistive technology, actual Android, real teacher understanding, official policy applicability or hub transfer. No new render or device evidence is claimed.

## Before and after

| Before                                                                         | After implemented                                                                            |
| ------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| Any active school member can reach grade computation for a school-owned record | Current exact assignment or school-head authority required before computation                |
| Existing session retains access after reassignment or head-role revocation     | Fresh trusted authority lookup on every read                                                 |
| Earlier write negative controls cannot compile the new grade test seam         | Probe retains helpers only for compilation and separately reconstructs pinned grade behavior |

Final source-bound CI/merge results belong in scores-grade-access-ci-merge-2026-10-23.json and the current handoff. Keep broader task-family/manual/device limits separate.

## Carried A1–A7 acceptance

| ID  | This slice and remaining limit                                                                                                        |
| --- | ------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | Current native grade authority and canonical zero/missing/scope covered by G1–G4; full Scores state/identity coverage remains partial |
| A2  | Prior submitted-revision/local-versus-transfer UI protections retained; no new real hub receipt evidence                              |
| A3  | Grade command remains read-only; no replay or UI/context/IME behavior change; prior source-bound UI evidence retained                 |
| A4  | No changed controls/tokens/effects; prior measured UI ledger retained; no new render claim                                            |
| A5  | No changed keyboard/focus geometry; manual assistive technology and physical-device observations NOT RUN                              |
| A6  | Representative teacher comprehension NOT RUN; no speed or comprehension claim                                                         |
| A7  | Affected candidate repository/native CI must pass; installed Windows, actual Android and real exchange NOT RUN                        |
