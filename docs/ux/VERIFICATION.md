# FORGE UI + UX verification — 11 October 2026

Implementation: local `1d1edc5faef6a408f6bb5657acebe2e70365aa26`; equivalent GitHub checkpoint `8529094ef1ed1545eb3a823a0cb9da8454e0c47f` on `recovery/forge-ux-20261010`.

The source tree was fetched from GitHub and compared to the local implementation: both `e13edf75e83288884d2939d39526378e4921efe9`. Commit IDs differ because the GitHub connector creates checkpoint commits; file content matches. No main merge or production deployment was performed.

| Check                                                            | Observed result                                                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run quality`                                                | PASS: typecheck, ESLint, formatting, architecture, dead-code check; 146 test files / 1,396 tests passed.                                                                                                                                                                                              |
| Final targeted typecheck/lint after session lifecycle refinement | PASS.                                                                                                                                                                                                                                                                                                 |
| `npm run quality:ui` on the final implementation                 | PASS: assigned-class context, score entry, Forms/Calendar/More/Account, enrollment history, keyboard score save, footer clearance, sticky class index and short-screen Account. Both appearances × three densities × four widths (1440, 1024, 390, 320). Zero axe findings under the configured tags. |
| `npm run quality:ui:recovery`                                    | PASS: 49 checks; 42 state/width/appearance checks plus seven recovery/input checks. Lesson drafts, planner partial success, support marker/update recovery, SF1 duplicate/unconfirmed review, Today; confirmation keyboard behavior; actual doubled body text; touch import.                          |
| `npm run build`                                                  | PASS; existing >500 kB chunk-size advisory remains. No performance failure was established.                                                                                                                                                                                                           |
| `npm run check:dev-preview-isolation`                            | PASS: 21 output files scanned, synthetic fixture traces absent.                                                                                                                                                                                                                                       |
| `git diff --check`                                               | PASS.                                                                                                                                                                                                                                                                                                 |

The full suite finished with 1,396 tests after the added late-extension regression. Tests/typecheck/lint were also focused on the changed session lifecycle. Browser recovery provenance is in `recovery-verification.json`: final implementation commit, empty source diff SHA-256, Chrome Headless Shell 155.0.8059.39, concrete checked states and observed measurements.

## Evidence boundaries

- Native Rust tests were not run: Cargo/Rust tools are unavailable in this runtime. Rust source was not changed by these fixes.
- Windows installed-app and Android builds, SDK/device acceptance, encrypted startup, process death, platform key storage, signed upgrades, actual native imports/exports, backup restore and cross-device conflicts remain untested.
- The browser uses real frontend application services over synthetic memory repositories. It does not prove real database persistence or authorization enforcement.
- Manual screen-reader, physical touch/keyboard, realistic school workload acceptance and exhaustive visual inspection of every screen remain untested. Automated scans are not full accessibility certification.
- Session drafts are memory-only. They survive navigation and same-owner reauthentication; logout and app closure discard unsaved drafts. Durable encrypted recovery is a separate pending implementation.
- No screenshots are supplied in this delivery.
