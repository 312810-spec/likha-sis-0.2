# FORGE 4 / tauri-ui — first execution checkpoint

## Outcome and source

Applied the verified 20 October LIKHA-SIS FORGE 4.0 adapter and operating
specification. AGENTS now selects the repository v4 mapping. CTOS product rules,
compatible UI/UX/DesignMotion/Assurance references and A1–A7 remain in force.
ChatGPT project settings were not changed; no optional checker/service installed.

Branch `forge/tauri-ui-forge4-20261021` starts at
`d5fa6dbd44ea4d8a932a326afef4a3cba19913b8` (PR150 →149 →148 →147 →146).
Base-associated Quality39341553821 and Security39341553825 returned completed/
success; individual CI jobs were not re-audited here. Current source is not main.
All prior Scores, storage startup and sole-owner recovery repairs are preserved.
No PR merge, deployment or school-data operation was performed.

## Reproduction and change

Held the production React entrypoint while loading the real stylesheet. With
explicit stored Dark and OS Light, the baseline had no `data-appearance`, body
background `rgb(246, 247, 250)` and `color-scheme: light`. This reproduces a
pre-React appearance mismatch under controlled delay, not a measured Windows flash.
An initial probe failed with connection refused because its server was unavailable;
the successful rerun owned and closed its server explicitly.

`index.html` now resolves the same existing preference key in the head, before
module loading. Explicit Light/Dark wins; System/invalid/absent follows OS; blocked
storage and absent/throwing media APIs have a safe fallback. It writes only the
existing appearance attribute and never storage, records or session state.
The React provider retains live preference/system changes. Native window visibility,
database initialization, keys, opener policy, dependencies and CSS are unchanged.

This adapts tauri-ui's no-wrong-appearance startup intent using LIKHA-owned code.
No upstream code copied. The inspected upstream commit remains
`8eb86d894c19b6df04ff883ab28b412b1e5f23ea`. Global selection blocking, raw
diagnostics, template replacement and release-profile changes were excluded.
KEEP_BASE for current score controls; shadcn replacement is not justified or
claimed without the pending matched candidate experiment.

## Executed checks

| Command / method                                        | Actual result and coverage                                                                                                                                       |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Focused Vitest theme/provider/score/sync files          | PASS,91 tests across4 files;11 new actual-inline-script cases                                                                                                    |
| `npm run quality`                                       | PASS,typecheck/lint/format/architecture/deadcode/batch gates;1,604 tests across161 files                                                                         |
| `npm run build`                                         | PASS,195 modules; existing-size advisory for683.35kB JS output remains visible                                                                                   |
| `node scripts/assurance/appearance-startup-browser.mjs` | PASS,13/13:12 preference/system cases +real App startup with denied storage                                                                                      |
| Same script with `--built`                              | PASS,13/13 against the actual production build                                                                                                                   |
| `npm run quality:ui`                                    | PASS,score/context/navigation;2 appearances ×3 densities ×4 widths; no assessed axe A/AA findings                                                                |
| `npm run quality:ui:recovery`                           | PASS,50 checks including draft/focus/200% text/touch                                                                                                             |
| `node scripts/assurance/score-journey-browser.mjs`      | PASS,47 checks including newer-draft retention, exact correction lineage, denial/retry, keyboard exits, focus clearance and18 layout/axe combinations            |
| Internal visual inspection                              | Dark desktop/light phone saved-score renders and dark comfortable390 correction/review render inspected; no new appearance/layout defect observed in those views |

Raw local receipts and source/output SHA-256 bindings are listed in
`tauri-ui-forge4-evidence-2026-10-21.json`. The evidence is a custom manifest,
not claimed FORGE checker output. No screenshots are deliverables or uploaded.
The initial quality run preceded the browser-script/checkpoint additions; final
format/diff checks cover subsequent tooling/documentation. Application source has
not changed since the passing quality/build/runtime checks.

T1–T6: PASS within this bounded instruction/appearance prerequisite. Full Scores
A1–A7 acceptance remains INCONCLUSIVE: teacher comprehension, installed Windows
GUI/upgrade/startup, actual Android, real two-device exchange and manual AT are
NOT RUN. Browser fixture storage is not native SQLCipher/hub proof. New native
tests are NOT APPLICABLE to this source-only HTML change, but native/device
acceptance remains open for the complete pilot. No whole-app readiness is claimed.

## Next action and recheck triggers

Retain this checked slice and continue the existing Scores control/state inventory
and a matched component experiment only for an evidenced gap. Do not widen to M11
or rebuild earlier score/recovery repairs. Current control replacement remains
KEEP_BASE. User/device trial stays pending; it does not block independent candidate
development. Reconcile the latest dependent draft chain before continuing.

Recheck if index/bootstrap, provider/key, theme CSS, generated candidate dependency,
native startup/CSP or dependency-chain source changes. A future enforced CSP must
explicitly permit the initializer; this task does not weaken CSP configuration.

## Local commit and publication block

Implementation/evidence local commit:
`c4324a8` (full identity available in Git). Subsequent edits only record this
publication block; application/test/browser-script source remains unchanged.

Automatic approval review rejected
`git push -u origin forge/tauri-ui-forge4-20261021` to
`312810-spec/likha-sis-0.2`. Stated reason: externally consequential disclosure
to a destination not verified trusted; the reviewer did not accept existing
authorization as explicit publication authorization for this branch/content.
Do not retry using another tool or route. No draft PR, remote durability,
candidate CI, merge or deployment is claimed.

Required next authorization: publish this branch's HTML fix, tests, browser
probe, FORGE adapter/rules/state and synthetic verification evidence to that
repository and open a dependent draft PR against
`forge/legacy-setup-recovery-20261020`. The implementation/checks are complete
and reviewable locally. Preserve actual installed-recovery/teacher/device limits.

## Publication authorization restored — 21 October 2026

The user explicitly approved the pending branch publication and dependent draft PR,
including future verification, sync, merge and push within this project's scope.
This supersedes the earlier insufficient-authorization block; platform controls and
required gates still apply. Do not infer official teacher/device acceptance or
authorize unrelated historical branch merges. Actual publication/CI receipts follow.

## Confirmed publication and dependency-security follow-up

User approval superseded the prior publication block. Terminal push then failed
for missing Git credentials, not an approval rejection. The connected GitHub tool
published source9775b22ad7385ff381578d494adb49da1ae306c7 with tree
21bb3ce7056ed5436a53b79a39abb8177c87c045, exactly matching local7237998.
Draft PR151 targets `forge/legacy-setup-recovery-20261020`. Remote fetch/tree
comparison succeeded. Local earlier history remains on
`forge/tauri-ui-forge4-local-checkpoint-20261021`.

Initial source CI merge26210574d95c186e7fdbeb0935a2fd6503a580db:
Security39604170717 has gitleaks/cargo-deny PASS but OSV FAIL on three newly
published Vite8.3.2 advisories. This blocks merge; no policy suppression added.
See `forge4-vite-security-contract-2026-10-21.md` for the T7/T8 amendment.
Updated to npm-registry current stable Vite8.3.5 and generated its lockfile;
Vite's build-tool transitive updates are retained rather than hand-editing the lock.
Quality1,604, build, dev13/built13, UI smoke, recovery50 and score47 all reran PASS.
The workflow now executes the two startup probes and uploads their JSON receipts.
Fresh candidate Security/Quality and T7/T8 remain pending publication/CI.
New hashes/receipts: `forge4-vite-evidence-2026-10-21.json`. Prior8.3.2 results
remain historical. No native/source-record modification, main merge or deployment.
