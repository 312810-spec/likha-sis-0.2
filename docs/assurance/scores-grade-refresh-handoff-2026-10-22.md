# Scores grade-refresh handoff

22 October 2026, Asia/Manila. Branch `forge/scores-grade-refresh-20261022`, base290b574d1fddc4031be76c7a6aacbe15696c06b1. Current adapter/CTOS and existing Scores A1–A7 govern this PM-12/13/31 state-hardening slice.

## Result

Reproduced three defects in the term-grade presentation: a failed automatic read retained the old number; an old roster response could repaint grades after assessment selection; and an initial pending bulk read prevented recomputation after a successful score. Before repair:3 new regressions FAIL/68 existing PASS. After repair:all3 PASS; two more tests cover newer explicit refresh versus older background response and independent success/null/error rows.

`ClassRecordWorkspace` now owns explicit updating/error grade states, current-roster and per-learner read revisions, synchronous duplicate bulk guard and remembered grade-read intent while the initial request is pending. Failed reads hide stale numbers and name Show term grades as recovery. Grade retry reads only, never replays a score write. Saved on this device remains truthful after the separate read fails. Null stays Not yet available without inferring its cause. The existing result annotations, score/correction flows, palette and table remain.

Contract: scores-grade-refresh-contract-2026-10-22.md. Source/control/state ownership: scores-grade-state-ledger-2026-10-22.md. Probe: scripts/assurance/scores-grade-refresh-browser.mjs. Exact source-bound measurements: scores-grade-refresh-evidence-2026-10-22.json.

## Verification

Local quality PASS:1,617 tests/161 files plus typecheck/lint/format/architecture/dead-code/batch checks. UI smoke PASS; recovery50 PASS; existing Scores browser47 PASS; build and21-file fixture isolation PASS. Changed-state matrix36 configurations PASS (two themes ×three densities ×three widths ×two motion preferences), zero axe/visible-cell/document overflow findings. Actual correction→failed recomputation→keyboard read-only retry PASS with retained save/focus. Internal light comfortable desktop and dark guided phone renders inspected; all error text wraps and remains readable. Publication/CI pending receipt.

The probe was corrected to use the actual Save correction accessible name, inspect the affected learner's grade rather than other learners' still-valid numbers, remove a copied comparison-only filename variable, and exclude intentionally clipped phone table headers from visible-cell overflow assertions. Visible body cells and document overflow remain checked. These are measurement corrections, separate from the three reproduced product defects.

No native/service/domain/algorithm/schema/export/lock/workflow change. Replaced-service invalidation is source-traced through the existing roster effect; delayed assessment-context responses are regression-tested. Browser grade values/failures are controlled synthetic responses, not native computation proof. Full teacher/device/manual A1–A7 remains INCONCLUSIVE. No main merge/deployment.

## Next action

Preserve Scores as the single runtime pilot. Continue the source-owned state inventory for the next uncovered Scores family; external teacher/disposable-Windows/manual observations stay pending and cannot be inferred from CI. Do not repeat completed palette/layout/library experiments without changed evidence. Main and the draft dependency chain remain separate.
