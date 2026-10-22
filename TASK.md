# Current task — CTOS / FORGE 4.0

Updated: 2026-10-22 (Asia/Manila).
Read `CTOS.md`, compact `CTOS-STATE.md`, `AGENTS.md` and the latest relevant checkpoint.

Continuation convention: when the user says **continue**, show the selected task-pack prompt first, execute it, then report before-and-after changes. See `docs/assurance/redesign-continuation-sequence.md`. Existing authorization and gates remain.

## Current PM-13 saved-grade readiness continuation — 23 October

Branch forge/scores-grade-readiness-20261023 from05e885c6. Full task-pack PM-13 prompt shown first; frozen C1–C6. Initial baseline4 FAIL/118 PASS and first candidate122/full1,691/browser36×2 passed, then were superseded by required failure-path strengthening. Follow-up2 FAIL/3 PASS/118 skipped; final focused123 PASS, five added cases. Explicit grade checks wait for unresolved score writes; affected cell shows pending; failed/unconfirmed saves keep grade unconfirmed until fresh read and reject pre-write replies. All modes explain saved-only evidence/current-item unsaved work; newer zero/reason/drafts remain without replay. Final full quality/browser36×3/UI/recovery/journey and affected implementation CI/publication in progress. Final build/isolation21 PASS. Exact status in scores-grade-readiness-handoff-2026-10-23.md. Full PM-12/13/A1–A7 partial. SRC-AUTH-1: native compute command checks school scope without an explicit assignment guard; next priority is synthetic same-school unauthorized grade-read reproduction and trusted-boundary repair if confirmed, before runtime expansion. Parent PR150 stays draft on PR149.

## Current PM-13 roster refresh continuation — 22 October

Branch forge/scores-roster-refresh-20261022 from21e91fe. Current task pack read; full PM-13 prompt shown first. Baseline4 FAIL/106 PASS. Same canonical class/item/category/max/service roster survives unrelated assessment check while writes remain blocked; preserve newer inputs, correction reason/errors/focus and dispatched acknowledgment. Independent grade context and item score revision protect derived results/progress. Focused118 and full quality1,687/161 PASS;12 added cases. Browser36 configurations/72 states PASS with hit/viewport/footer clearance; four current renders inspected. UI/recovery50/Scores47/build/isolation/probe lint PASS. PR160 passed Quality39795576022 and Security39795576334 on8188eed7, then merged into the existing integration branch as084c351d on23 October (Asia/Manila). Checked source, CI merge and actual merge share tree1e6a65fa. CI confirms1,687 tests/161 files, UI smoke, recovery50 and startup26; affected-work classifier skipped native/Windows. Exact receipt: docs/assurance/scores-roster-refresh-ci-merge-2026-10-23.json. Parent PR150 remains draft on PR149. Full PM-12/13/A1–A7 partial. Next remaining Scores category/period and completeness/report readiness coverage plus teacher/device observations.

## Current PM-12 deletion/validation continuation — 22 October

Branch forge/assessment-delete-state-20261022 from6d9c7122. Full task-pack PM-12 prompt shown first. Baseline11 FAIL/121 PASS; focus and read-order follow-up failures reproduced. Per-ID pending/duplicate guards, confirmation/selection preservation, truthful non-cancellable pending state, refused/unconfirmed distinction, explicit reload without replay, read-generation/reload latch and removed-row focus implemented. Final focused155/3 and quality1,675/161 PASS;23 added cases. Final browser72 +2 flows/build/isolation PASS; four internal renders inspected. UI/recovery50/Scores47 PASS. PR159 gated/merged as27660efd; Quality39791476198/Security39791476193 PASS on9c6ad148; checked/CI/merge tree660348bb. Exact receipt assessment-delete-ci-merge-2026-10-22.json; handoff assessment-delete-handoff-2026-10-22.md. Full PM-12/A1–A7 partial. Next source-owned Scores category/period and roster-refresh coverage plus external teacher/device observations.

## Current PM-12 edit/rename acknowledgment continuation — 22 October

Branch forge/assessment-edit-ack-20261022 from e4c92cdd. Full task-pack PM-12 prompt shown before execution. Baseline10 FAIL/101 PASS; first candidate exposed editor unmount/focus loss during list read. Preserve newer name/category/max, ABA and cancel/reopen/switch choices; identify old write failures; keep editors mounted during guarded refresh. Pre-supplement focused117 PASS; browser72 configurations +2 flows PASS; UI/recovery50/Scores/browser/build/isolation PASS, four internal renders inspected. Final quality1,652/161 PASS,18 added cases. PR158 gated/merged as d57fe421; Quality39770794816 /Security39770794690 PASS on bf8fb342; checked/CI/merge tree cf3833cf. Exact receipt assessment-edit-ci-merge-2026-10-22.json; handoff assessment-edit-handoff-2026-10-22.md. Full PM-12/A1–A7 partial; next remaining authoring consequence/validation/delete states and external observations.

## Current PM-12 creation acknowledgment continuation — 22 October

Active branch `forge/assessment-draft-ack-20261022` from82dd88f. Task-pack PM-12 prompt shown before execution. Preserve newer creation drafts/focus across delayed acknowledgment in workspace/Studio; prevent composing Enter submission; retain implicit empty-record editor for newer work. Baseline5 FAIL/91 PASS; additional implicit-open regression reproduced. Ten added component cases; local quality1,634/161 files and build/isolation PASS; browser72/UI/recovery50/Scores47 PASS; four renders inspected. PR157 gated/merged into parent as6276bf55; Quality39738480234 /Security39738480229 PASS on54203b7; checked/CI/actual merge tree043bab83. Exact receipt: `docs/assurance/assessment-draft-ci-merge-2026-10-22.json`. Current prompt/contract/elements/before-after/limits: `docs/assurance/assessment-draft-handoff-2026-10-22.md`. Full PM-12 and Scores A1–A7 remain partial/pending. Next: remaining Scores authoring states and external observations.

## Current Scores CSV feedback continuation — 22 October

Active branch `forge/scores-export-feedback-20261022` from c7c9d01. PM-12/13/31 bounded CSV attempt/error/snapshot/folder/path feedback repair. Restored after workspace maintenance; fresh baseline6 FAIL/74 PASS, seven added cases. Current contract/state ledger/checks/publication: `docs/assurance/scores-export-feedback-handoff-2026-10-22.md`. Fresh quality1,624/161 files, UI/recovery50/Scores47/build/isolation and browser36 configurations/72 feedback states PASS; internal renders inspected. PR156 gated/merged into parent asfb47e9f1; Quality39735201256 /Security39735201237 PASS on3a34cd9; checked/CI/actual merge tree1e1b32da. Exact receipt: `docs/assurance/scores-export-feedback-ci-merge-2026-10-22.json`. Preserve all merged repairs; Scores remains the single runtime pilot. Teacher/device/manual A1–A7 remain pending.

## Current Scores state continuation — 22 October

Active branch `forge/scores-grade-refresh-20261022` from290b574. PM-12/13/31 term-grade stale-response/failure repairs: three reproduced regressions, five added tests. Local quality1,617/161 files, UI, recovery50, Scores browser47, build/isolation PASS. Current state/contract/source owners and publication status: `docs/assurance/scores-grade-refresh-handoff-2026-10-22.md`. Changed-state matrix36 PASS with keyboard read-only retry/internal renders; PR155 gated/merged into parent as689abb8c; Quality39699949146 /Security39699949148 PASS onb15a91a; checked/CI/actual merge treea7912280. Exact receipt: `docs/assurance/scores-grade-refresh-ci-merge-2026-10-22.json`. Preserve shared system and Scores pilot; teacher/device/manual A1–A7 still pending. Next: source-owned Scores states and existing external observation protocol.

## Current shared-system continuation — 22 October

Branch `forge/design-system-contracts-20261022` from d002786. PM-03/04 shared catalog/specification: KEEP_BASE; production sources unchanged.36 configurations/108 reflows/2 provider interactions PASS; quality1,612 tests/161 files, build and fixture isolation PASS. Exact sources and limits: `docs/assurance/design-system-handoff-2026-10-22.md`; reusable specification and measured token/control profiles linked there. DS1–DS6 bounded scope complete; DS7 gated: PR154 merged into parent as6632a4d3; Quality39698546428 /Security39698546538 PASS onfee28f0, treea4b60053. Exact receipt: `docs/assurance/design-system-ci-merge-2026-10-22.json`. Full consumer/brand and Scores teacher/device/manual A1–A7 acceptance remain pending. Next: preserve Scores as the single runtime pilot; continue source-owned state inventory.

## Current Prompt Master execution — 22 October

User executed the36-task UI prompt pack. Active child branch
`forge/prompt-master-scores-layout-20261022` froma206308.
PM-00 reconciled; PM-01 source register81/81 UI files and36/36 destinations.
PM-02–04 /PM-12–13 bounded Scores selection/roster hierarchy implemented;
matched baseline/candidate18 each PASS; quality1,612/161 files, build,
UI/recovery50/Scores browser47 PASS. PR153 gated/merged into parent asbe22758;
Quality39694964133 /Security39694964101 PASS on62f32eb, treea9eb54d9.
Runtime census72 pairs:34 fixture branches/17 placeholders/21 path-not-run.
Exact receipt: docs/assurance/prompt-master-ci-merge-2026-10-22.json.
Contract, registry, token/control decisions and next action:
`docs/assurance/prompt-master-execution-handoff-2026-10-22.md`.
Full task/role/state/runtime coverage and teacher/device/manual acceptance
remain partial/pending. Preserve completed repairs and draft chain/main.

## Current bounded follow-up — Scores history

Branch `forge/scores-component-comparison-20261021` from parent `7bea54ac`.
Correction-history retry/scope/author/reflow repairs and matched Base UI experiment:
`docs/assurance/scores-history-handoff-2026-10-21.md`. Comparison43 PASS;
KEEP_BASE for this control (candidate +6,754 gzip bytes without task benefit).
Quality1,612 /161 files, build, UI, recovery50, Scores browser47 PASS.
PR152 merged into parent as1e4164f; Quality39615019567 /Security39615019959 PASS
on58a9fc0, same checked tree55af4a23. Exact receipt: scores-history-ci-merge JSON.
Next: Scores inventory and pending teacher/device/manual observations; do not repeat this experiment.
Teacher/device/manual acceptance remains INCONCLUSIVE. Preserve draft chain/main.

## Latest verified integration — 21 October

PR151 merged into `forge/legacy-setup-recovery-20261020` as252ce879 after
Quality39605264979/Security39605264944 PASS on80a6ebf. Merge and CI trees
match checked treed5f23996. Frontend1,604; Ubuntu1,535/Windows1,544 native;
startup26; UI/recovery; packaging; source/SQLCipher/negative controls all PASS.
Vite8.3.5 resolves the reported findings without changing scanner policy.
Exact receipts: `docs/assurance/forge4-ci-merge-2026-10-21.json`.
Next: same Scores pilot inventory/matched candidate experiment; KEEP_BASE
without evidenced benefit. Actual teacher/device/manual acceptance remains
INCONCLUSIVE. Main staysac4c3add; PR146–150 not mass-merged; no deployment.

## Current action — FORGE 4 / tauri-ui bounded redesign

Apply `docs/ctos/FORGE-V4-ADAPTER.md`. Branch
`forge/tauri-ui-forge4-20261021` starts at PR150 head
`d5fa6dbd44ea4d8a932a326afef4a3cba19913b8`, preserving PR146–PR150.
The user requested v4 integration and redesign execution on21 October.
Early appearance initialization is implemented and locally verified; read
`docs/assurance/tauri-ui-forge4-handoff-2026-10-21.md` for gates, publication
and limits. Full score-pilot teacher/device/manual acceptance stays INCONCLUSIVE.
Next: retain this slice, reconcile changed PR heads and continue the existing
Scores control/state inventory and matched component comparison. KEEP_BASE
until replacement benefit is evidenced. Gated push/sync/merge is authorized; no deployment is implied.
Underlying setup-recovery/device action below remains pending; do not mark it
complete or reopen verified native/dependency repairs.

User approved publication on21 October, explicitly including future verification,
sync, merge and push within scope. This supersedes the prior authorization block.
Publish the reviewed branch and dependent draft PR; verify receipts/required CI.
Keep installed recovery/full pilot acceptance separate. See handoff for evidence.

## Retained prerequisite — actual legacy setup recovery

Active prerequisite: sole-account legacy setup-role recovery, based on PR149 d78374f.
Read `docs/assurance/legacy-setup-recovery-handoff-2026-10-20.md` and R1–R7.
User confirmed sole account; recovery is explicit/password-rechecked, not automatic
promotion or a database reset. Checked source52a761c passed Quality39338547483 and Security39338547311, including
1,535 Ubuntu/1,544 Windows native tests and installer artifact12228374752. Actual
user-device recovery is NOT RUN until observed; use the current handoff/installer.
Do not infer installed recovery or close the Scores pilot from browser/CI results.

Use `docs/assurance/scores-windows-trial-2026-10-19.md` for the pinned installer and
`prepare-scores-trial.mjs` helper. It verifies the original ZIP and creates untested
observations; it does not install or establish teacher/device acceptance.

The latest Scores checkpoint ee2b781 passed Quality39158028481 and Security39158028370,
including executed Ubuntu/Windows native gates. Receipt: `docs/assurance/scores-checkpoint-ci-2026-10-19.json`. Read `docs/assurance/sqlcipher-startup-handoff-2026-10-19.md`.
Remaining pilot acceptance requires the prepared teacher/disposable-device/manual checks;
those observations are NOT RUN. No new runtime journey, merge or deployment is implied.
Historical checkpoint instructions below do not reopen the repaired native/dependency work.

## Earlier separate dependency maintenance — 2026-10-18

Draft PR148, branch `forge/opener-dependency-maintenance-20261018`, depends on PR147.
Read `docs/assurance/opener-maintenance-handoff-2026-10-18.md` and frozen O1–O6.
Checked source `ceeab1d`: all O1–O6 PASS; Quality39135625221 and Security39135625254
SUCCESS.1,576 frontend tests,1,525 Ubuntu/1,534 Windows native tests; Rustfmt/Clippy,
UI/recovery, private synthetic D-Bus success/fallback/denial and unchanged-policy
security gates passed. Windows test-installer artifact12140346037 is bound to this source.
The final checkpoint is documentation only; source hashes bind the completed receipts.
The separate compatibility snapshot removes retired dependencies without new scanner ignores.
No merge/deployment. Old PR147/146 receipts stay revision-bound until actual integration.
Teacher trial, disposable installed Windows GUI/upgrade, Android and real two-device
acceptance remain NOT RUN. Next: review/integrate this verified stack under existing
checks, then conduct the scoped teacher/device trial. Do not repeat maintenance or
resume unrelated M11/Android work merely because the automated checks passed.

## Active bounded score decision design — 2026-10-18

Branch `forge/score-decision-design-20261018`, based on PR146 head `10cfe8c`.
Read `docs/assurance/score-design-handoff-2026-10-18.md` and its frozen D1–D7 contract.
Implemented explicit correction review/confirmation, keyboard Cancel and sequence escape,
unsaved/blank explanations and duplicate-submit protection. Local quality PASS: 1,576 tests;
15 focused browser probes, UI smoke, 50 recovery checks, build and internal final renders.
D1–D6 PASS; teacher trial D7 NOT RUN. Native/backend sources are unchanged; original
native receipts remain revision-bound. Keep scope on this journey. No deployment.
Published as dependent draft PR147 after repository ownership/push permission verification.
Remote implementation `8c9ce19` exactly matches the locally verified checkpoint tree.
Quality CI run 39125554539 PASS on implementation `8c9ce19`; Security 39125554557 FAIL on the existing
three zbus/zvariant advisories (gitleaks PASS). No merge/deployment. Existing blockers
remain separate. Teacher trial script is in the handoff; usability gains are provisional.

## Bounded score-entry investigation — 2026-10-18

Approved draft PR #146 is published. Checked source `129ef31` and CI merge
`1cec109` have the same tree. Frozen contract and current handoff/evidence:
`docs/assurance/score-entry-handoff-2026-10-18.md`.
Frontend quality (1,569 tests), build, browser/UI/recovery, source-SQL fallback,
1,525 Ubuntu / 1,534 Windows native tests, Rustfmt, Clippy, provenance and native
before/after comparisons passed. Windows installer artifact: 12131064945.
The bounded contract is READY FOR REVIEW; merge readiness remains BLOCKED.
Security gates fail on three existing unmaintained zvariant/zbus_names advisories;
lockfiles unchanged, no new suppression. Keep draft; no merge/deployment.
Teacher usability and installed-device acceptance remain pending. Do not widen
this journey into dependency maintenance or unrelated M11 work. Resolve the
recorded dependency-security blockers in a separate scope before merge.

## Authorization carryover — 19 October 2026

User explicitly approved the pending Scores branch push and dependent draft PR after
reviewing the publication block, and requested continued automatic action. Continue routine
project development and publication under the existing scope without repeated permission
questions. This is scoped user authorization, not a platform approval-policy override;
required checks, consequential-action boundaries and truthful acceptance states still apply.

## Confirmed publication

Scores pilot is published as dependent draft PR149:
https://github.com/312810-spec/likha-sis-0.2/pull/149. Implementation commit
`e87b3c11db78dff72a6a1f38fc23bd1cf5b27bb7` has exactly the reviewed local tree.
The user resolved the previous publication authorization block. Quality/Security were
running at the last check; verify their results before acceptance. No merge/deployment.

## Verified native prerequisite and next acceptance

Checked sourcee6f13fd /tree086de06e: Quality39155819896 and Security39155819934 PASS.
1,526 Ubuntu /1,535 Windows native tests, new cold subprocess regression, previous
learner-isolation failures, Rustfmt/Clippy, source provenance, private D-Bus and score
negative controls PASS.1,581 frontend tests/UI/recovery50 PASS. Windows build/test
installer artifact12147627096 is available for disposable-device testing only.
Current receipts/next protocol: `docs/assurance/sqlcipher-startup-handoff-2026-10-19.md`.
The SQLCipher initialization race is repaired with no key/schema/score changes.
Additional zero/60-roster layout/focus checks PASS; native roster/throughput not inferred.

Native repair is technically READY FOR REVIEW. Full Scores acceptance INCONCLUSIVE:
teacher observation, installed Windows GUI/upgrade, actual Android, real two-device
exchange and manual AT/OS zoom remain NOT RUN. No merge/deployment. Do not widen
runtime scope; use the prepared protocol and exact test artifact for these gates.
Evidence/probe-only checkpoint leaves tested application/native/workflow source unchanged.

## Active Scores pilot — 19 October 2026

User executed Prompt Master revision2. Current dependent branch `forge/scores-detail-20261019`
starts from PR148 head237b7b5 → PR147 → PR146; main remains ac4c3ad. Detailed contract,
control/token/effects specification and handoff: `docs/assurance/scores-detail-handoff-2026-10-19.md`.
This explicitly selected Scores journey precedes the unrelated M11 continuation below.
Do not mass-merge the old stack or claim deployment. Required teacher/device evidence and
remaining acceptance gates stay unresolved; finish this pilot before activating another journey.

## Previous continuation (parked during Scores pilot)

PR144 required-subject applicability foundation is verified and merged as
`1e6d2275499c8f7b4236126c557f6232670319b5`. Tested head `1fb7346`:
1,522 Ubuntu / 1,531 Windows native tests; Rustfmt, Clippy, provenance, Security
and Windows debug packaging passed. Test-installer artifact: 12082630839.
Read `docs/ctos/checkpoints/m11-required-subject-applicability-2026-10-17.md`
for exact identities, receipts and limits. PR139–PR143 remain merged.

## Next unblocked work

Manual continuation: automation was explicitly skipped by the user on 2026-10-17.
Leave scheduled tasks unchanged. Established implementation/push/merge authorization
continues; no deployment. Do not repeat completed registry/dependency repairs.

Configure applicability through the existing app and integrate explicit selected/pinned
versions with annual completeness and report preparation. Current SF5/SF6/SF10 call
sites and regression targets are in the checkpoint. Source-lock v2 does not include
the optional pins; the next preparation source version must adopt them explicitly
without rewriting old snapshots, locks or reviews.

Keep missing, withdrawn, changed-grade and mixed contexts pending. Do not invent
official offerings, track/equivalence rules, annual weighting or required-subject counts.
The registry supports exact section cohorts and concrete periods only. Broader
cohort rules need explicit modeling and overlap semantics.

Continue M11 immutable issuance/amendments and cross-form reconciliation.
M10–M17 remain open. PR103 is salvage reference only; do not mass-merge.
Checkpoint about every five minutes when feasible; preserve teacher work, run affected
checks, audit before delivery and report untested behavior. Inspect Git status before edits.
Historical task text is in `docs/ctos/history/TASK-through-2026-10-16.txt`; do not reload by default.
