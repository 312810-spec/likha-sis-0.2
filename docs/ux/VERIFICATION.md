# FORGE UI + UX verification — latest result, 12 October 2026

PR #107 merged to main as `a46eba68f3ca36843d9f8bc34ee844993f9348c8`. Verified head: `684d2c06d8e94cf47a1c8ff0a7cb97a0546ddc30`; source tree: `67d5b2c06e2f88fa223bab37067c5673083c7e88`. Quality Gate `38181491187` and Security Gate `38181491210` passed before merge. Fetched main matches the verified source tree.

| Check             | Final observed result                                                                                               |
| ----------------- | ------------------------------------------------------------------------------------------------------------------- |
| Frontend quality  | PASS: 149 files / 1,441 tests; typecheck, lint, formatting, architecture and dead-code checks                       |
| UI and recovery   | PASS: responsive Light/Dark, density, keyboard and workflow smoke; 49 recovery checks; zero configured axe findings |
| Ubuntu native     | PASS: Rust formatting, 1,452 tests (1,247 unit + 205 integration), Clippy all targets with warnings denied          |
| Windows native    | PASS: app/installer build, 1,461 tests (1,256 unit + 205 integration), installer artifact upload                    |
| Security          | PASS: cargo-deny, gitleaks, osv-scanner                                                                             |
| Production output | PASS: local build and preview fixture isolation; existing chunk-size advisory remains                               |

Classroom recovery now includes encrypted owner/school/assignment/date/revision-scoped device drafts and explicit restore/discard review. Frontend and native regression fixtures pass. Installed-app process-death recovery is still untested. The earlier memory-only draft statement below describes the prior recovery checkpoint.

Remaining acceptance: installed Windows teacher workflows and native import/export/printing/backup/upgrades; actual Android Keystore/startup/process death; real two-device reassignment/backfill; manual screen-reader, physical-input and teacher acceptance. Automated checks do not establish full accessibility conformance or production readiness. No production records were changed; no deployment was performed.

## Earlier recovery checkpoint — 11 October 2026

The historical results and limitations below apply to that earlier source, before PR #107.

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
