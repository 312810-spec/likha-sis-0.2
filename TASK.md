# Current task — CTOS v3

Updated: 2026-10-18 (Asia/Manila).
Read `CTOS.md`, compact `CTOS-STATE.md`, `AGENTS.md` and the latest relevant checkpoint.

## Verified separate dependency maintenance — 2026-10-18

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

## Current bounded native prerequisite

PR149 head421cec8 passed Quality39150927681/Security39150927807; native/Windows
steps were skipped. The inherited native failure was reproduced against pinned SQLCipher:
racing rusqlite initialization can key before EXTRA_INIT finishes. App-owned db::open now
has a one-time completion barrier; cold subprocess regression and dependency mechanism
probe are added. Read `docs/assurance/sqlcipher-startup-handoff-2026-10-19.md`.
Local Rustfmt/probe48 PASS; app native compile blocked by missing system packages.
Fresh full candidate CI remains required. Teacher/device acceptance and merge stay gated.

## Active Scores pilot — 19 October 2026

User executed Prompt Master revision2. Current dependent branch `forge/scores-detail-20261019`
starts from PR148 head237b7b5 → PR147 → PR146; main remains ac4c3ad. Detailed contract,
control/token/effects specification and handoff: `docs/assurance/scores-detail-handoff-2026-10-19.md`.
This explicitly selected Scores journey precedes the unrelated M11 continuation below.
Do not mass-merge the old stack or claim deployment. Required teacher/device evidence and
current native gate remain unresolved; finish this pilot before activating another journey.

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
