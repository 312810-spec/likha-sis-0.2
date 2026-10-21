# Current task — CTOS / FORGE 4.0

Updated: 2026-10-21 (Asia/Manila).
Read `CTOS.md`, compact `CTOS-STATE.md`, `AGENTS.md` and the latest relevant checkpoint.

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
