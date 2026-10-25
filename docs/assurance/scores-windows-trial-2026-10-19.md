# Scores Windows trial — preparation and observation

Scope: the existing assigned-class → Scores → edit → local save → transfer status →
saved completeness journey. This helper prepares the remaining installed-device
and teacher observations; it changes no application, database or installation.

## Preparation contract

All requirements are required for the helper, independently of full pilot acceptance:

| ID  | Requirement                                                                                                                    | Verification                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------- |
| P1  | Verify the original artifact ZIP against pinned size and SHA-256; reject corruption or wrong download before creating a record | Synthetic matching, same-size corruption, truncation, missing-file and default-pin negative controls |
| P2  | Preserve existing observations                                                                                                 | Existing-output rejection and unchanged sentinel contents                                            |
| P3  | Start every teacher/device observation as NOT RUN with no evaluator, observed time, actual result or approval invented         | Generated JSON assertions                                                                            |
| P4  | Separate preparation environment/time and archive identity from installation and acceptance                                    | Generated JSON assertions and source review; no hostname, username or source file path recorded      |

These checks do not prove Windows execution. The helper uses Node built-ins and
requires Node.js (the repository's development environment already uses Node).
No package installation is required to run it. Actual Windows helper execution and
the real artifact ZIP comparison are NOT RUN until executed on the target machine.

## Exact candidate

Source: `52a761cc3d1368a2cc91c95c1ab59a06a07ef266`.
Quality39338547483 and Security39338547311 passed; Quality job steps were inspected
and both Ubuntu/Windows native gates executed. These receipts bind this source,
not later helper-only changes. PR150 depends on draft PR149 and remains draft; no merge/deployment.

[Download the original Windows test-installer ZIP](https://github.com/312810-spec/likha-sis-0.2/actions/runs/39338547483/artifacts/12228374752).
GitHub artifact12228374752:22,970,803 bytes;
SHA-256 `f43f96151e69ad1dbb64b124cc9f499c173e46c01a2a54c2648b551c9efcb1bc`.
Expiry reported by GitHub:2026-11-02T23:23:52Z. Metadata was retrieved on2026-10-20.
This digest covers the original downloaded ZIP, not an extracted MSI/EXE or a
repacked ZIP. A digest match establishes identity against this recorded metadata;
it is not a code-signature, installed-app or release approval claim.

## On the disposable Windows target

Use a VM or isolated disposable installation with synthetic records. Keep existing
real school data/installations out of this trial. From this repository's root in
PowerShell, substitute the actual downloaded archive path and a new results path:

```powershell
node scripts/assurance/prepare-scores-trial.mjs "$env:USERPROFILE\Downloads\likha-sis-windows-test-installers.zip" ".\scores-trial-results"
```

The helper checks ZIP bytes first, creates a new folder, then writes
`observations.json`. A mismatch, missing archive or existing destination returns a
nonzero exit code. It does not download, unpack, install or launch anything.
The output's `preparedAt` is the actual helper execution time, not a teacher trial
or accomplishment timestamp. Archive PASS leaves full readiness INCONCLUSIVE.

After verification, extract the original ZIP using Windows. Record the chosen
installer's actual filename and independently calculated SHA-256, for example:

```powershell
Get-FileHash -Algorithm SHA256 -LiteralPath "C:\actual-extracted-path\actual-installer.msi"
```

The example path is a placeholder, not a known installer filename. Install only in
the disposable target. Record actual installed build/device, synthetic fixture IDs,
evaluator and observations in the JSON. Keep screenshots/learner details private;
use synthetic identifiers and concise evidence references when returning results.

The JSON contains12 tasks covering identity, offline reopen, pending18/newer19,
correction Cancel/commit/history, controlled denial/retry, blank/zero/exceptions,
keyboard/reflow, completeness/transfer comprehension, actual zoom/AT, disposable
upgrade and matched teacher observation. Keep a task NOT RUN if its controlled
condition is unavailable; never simulate a native delay/denial with a browser mock
and record it as an installed-app result. Record AT and zoom independently if only
one was exercised. Use PASS only with the specified observable oracle; record
contradictions as FAIL and insufficient evidence as INCONCLUSIVE. Retain actual
baseline/candidate source identities and observations for the matched teacher trial.

Android and real two-device exchange remain separate NOT RUN gates. No aggregate
acceptance is inferred from the completed Windows tasks.

## Helper verification

```sh
node --test scripts/assurance/prepare-scores-trial.node-test.mjs
```

The tests use synthetic bytes with an injected test-only expected digest; they do
not claim to have downloaded/verified the real ZIP or installed the application.
The CLI accepts no candidate/digest override. Full pilot acceptance remains
INCONCLUSIVE under the frozen A1–A7 contract and existing observation protocol.

Executed locally on Linux/Node24.19.0: all7 focused helper tests PASS, including
actual CLI rejection/error exit and exclusive output preservation. P1–P4 PASS for
the helper's preparation contract. The helper adds no package dependency, invokes
no installer and changes no application/native/workflow source. Windows helper
execution, real ZIP verification and all teacher/device tasks remain NOT RUN.

Repository `npm run quality` exited0: typecheck, lint, formatting, architecture,
dead-code check, batch-runner tests and all1,581 frontend tests PASS. Final runbook
edits passed the focused formatting check. UI/native suites were not repeated for
this helper-only change; previous source-bound receipts remain as recorded above.
