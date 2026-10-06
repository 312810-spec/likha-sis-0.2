# Current task — CTOS v3

Updated: 2026-10-06.

Use CTOS.md as the controlling plan. Current milestone: **M02 — Work access and session integrity**.

Read CTOS.md, CTOS-STATE.md, docs/ctos/FORGE-V3-ADAPTER.md, and AGENTS.md before the historical baseline below. Do not mass-merge historical branches and do not convert unverified evidence into readiness claims.

## M01 — Academic trust: COMPLETE (PASS, tag `ctos-m01-complete`)

Closed with `ComputedTermGrade.complete`: a provisional grade is now visibly
provisional on screen and in both exports. All seven verification items have
executable tests. See `docs/ctos/checkpoints/m01.md`.

## M02 in progress

Required verification: account switch, stale async response, spoofed ID,
reassignment, revocation, adviser vs subject scope, offline last-confirmed
assignment, handover of pending work, sync queue scope.

M02's areas (access control, sync scope) are in the adapter's High-Fidelity
list, so it takes the strongest verification mode, including an independent
verifier pass rather than the generator agreeing with itself.

Next step: map the existing school-scope enforcement surface, then decide which
of the nine items already have code and which are greenfield.

---

# Historical baseline retained for evidence

# Current task

Updated: 2026-10-03.

## Goal

Make the Windows teacher app manageable and establish a real Android path.
Use current stable tools and preserve teacher work during sync failures.

## Restored implementation

- Full-queue entity conflict checks.
- Retained encrypted rejected incoming records and explicit human review.
- Atomic pull application/version/cursor updates and atomic review resolution.
- Clear local-save vs hub-transfer status with manual/foreground refresh.
- Correct camelCase preview serialization and selected extra entity previews.
- Platform key-store adapter boundary; Android is still unsupported.
- Latest stable npm/Rust dependencies and Windows installer artifact CI.

## Verified on restored source

- Latest Node 26.10/npm 12.2 frontend quality: 126 files, 1,184 tests pass.
- Playwright 1.63 / Chrome Headless Shell 153.0.8010.12 workflow and accessibility
  smoke passes, zero findings. Exact bundled browser fetched from official Google
  storage when the CDN download was unreliable.
- Full native Rust tests pass, including integration suites; new key reopen,
  failed-key preservation and legacy Argon2 hash regressions pass.
- Rust formatting and Clippy all-targets with warnings denied pass.
- Security CI is green after updating the vulnerable brace-expansion dependency.
- Windows installer build/native tests/artifact upload run in PR101 CI.

## Remaining work

Check final Windows CI and exercise its installer on a Windows device.
Implement real Android Keystore/startup integration before claiming Android use.
Portable encrypted backup/recovery is implemented in the Devices and first-run screens.
Installed-device recovery and upgrade tests are pending; Android remains unsupported.
See docs/PORTABLE-BACKUP.md for the format, scope and replacement-device workflow.
The teacher pilot guide is docs/MANAGEABLE-APP.md.

Application edits and test checkpoints are now saved on PR101. The first workspace
reset is recorded as history; verification above was rerun on restored source.

## Portable recovery checkpoint

- Password-protected SQLCipher snapshot includes committed WAL records and schema version.
- Destination keys are freshly generated/reprotected; existing installations are not overwritten.
- Full backup requires School Head authority in every school on the installation.
- First-run recovery is staged and selected on full restart; client sync requires re-enrollment.
- Focused UI tests pass; full frontend suite: 128 files / 1,192 tests.
- Native full suite: 1,099 Linux unit tests plus integration suites pass.
- Browser workflow/accessibility smoke passes with zero findings.
- Formatting of changed files, native formatting and Clippy are checked.
- Local whole-repo formatting encounters a pre-existing uncommitted change in
  docs/SOURCE-REGISTRY.md; it is preserved and excluded from this checkpoint.
- Windows CI must verify DPAPI recovery and build refreshed test installers.

## Approved school class folio redesign

Branch: `design/premium-school-ui-20261003`, based on main through PR101; draft PR102.
The owner requested complete concept fidelity using Prompt Master to establish the
frontend engineer role first. The brief is in docs/design/class-folio.

Dashboard now lists authorized subject assignments beside a worksheet with
Overview, Scores, and Forms. The real grading journey is embedded and preserves
work across worksheet tabs. Desktop has six primary destinations; phone has
Today, Classes, Forms, and Account. School Forms and Calendar use existing real
services. More preserves specialized management tools and the daily planner.
Global school theme includes remembered Light/Dark/System; appearance, density,
and sign-out are in Account. Official advisory attendance stays separate from
subject records. Login starts on Dashboard.

Two independent design/workflow reviews found and resolved the local Back-to-class
no-op, retained login destination, and tab-switch draft loss. Actual screenshots
and implementation boundaries are in docs/design/class-folio/README.md and
ADR-0073. Core frontend quality: 132 files / 1,225 tests pass. Browser checks cover
both appearances, three densities, four widths, context and navigation, with zero
WCAG A/AA findings. Production build and dev-preview isolation pass.

Next release check: exercise the complete redesigned workflow, keyboard use, and
appearance in the installed Windows app. Native Android remains unsupported
pending the native work above. Production is not deployed by this redesign.

## Class folio detail refinement

Continued on the same isolated design branch and draft PR102. The refinement adds
stable keyboard focus in embedded Scores, an announced selected class, a sticky
bounded desktop class index, density-aware reading text, and a bounded Account
panel with a close control. Scoring now has draft-preserving assessment disclosure,
aligned assessment/actions, spaced exports and immediate completion/protection
feedback after score save. Open class record reuses an exact existing match;
multiple matches require teacher choice. Grading rules/native authority are unchanged.

Updated actual desktop/phone/light/dark scoring captures are in the design folder.
Full frontend quality passes: 132 files / 1,233 tests. Production build and
dev-preview isolation pass. Browser smoke covers both appearances, all three
densities and four widths, actual keyboard scoring, sticky index and short-screen
Account, with zero axe WCAG A/AA findings. Independent review caught and resolved
a delayed-save focus leak across class changes.
Next release check remains the installed Windows app workflow. No deployment or
native Android support is implied by browser refinement.
