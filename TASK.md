# Current task — CTOS v3

Updated: 2026-10-08.

Use CTOS.md as the controlling plan. Current milestone: **M09 — Teacher Load Maker + Smart Scheduling**.

Read CTOS.md, CTOS-STATE.md, docs/ctos/FORGE-V3-ADAPTER.md, and AGENTS.md before the historical baseline below. Do not mass-merge historical branches and do not convert unverified evidence into readiness claims.

## M05 — Class Folio: COMPLETE (PASS, tag `ctos-m05-complete`)

Five of the six required properties already held and are named with real tests;
one did not, and it is the one the acceptance clause names. The grading period and
DepEd weighting were blanked on every mount of `ClassRecordJourneyScreen`, and the
Class Folio remounts whenever the teacher moves between Dashboard, My Classes and
Class Record — so the term was re-asked every time. They are now held in App
session state keyed by the assignment and recalled on the next visit.

The recall is revalidated rather than guessed: a grading period the school no longer
publishes falls back to an explicit choice instead of being clamped onto whichever
period happens to be first, which is what keeps the recall from silently meaning a
different term. The class record id is still re-derived on every visit, so a deleted
record is never silently restored and a matching record is reopened rather than
duplicated.

Also corrects an M04 evidence claim: **`format:check` was not actually clean at the
`ctos-m04-complete` tag.** Two M04 case files failed Prettier — a table not
re-padded after a row was added, and `*emphasis*` that Prettier writes as
`_emphasis_`. The M04 code, test and lint gates were real and unaffected (1,331
Rust / 1,257 frontend tests), but the checkpoint's "all five gates pass" was wrong
for that one gate. Both files are formatted in the M05 commit.

133 files / 1,261 tests (the delta from M04 is exactly the four new tests); zero axe
findings. See `docs/ctos/checkpoints/m05.md` and `docs/ctos/evals/folio-cases.md`.

## M04 — Today: COMPLETE (PASS, tag `ctos-m04-complete`)

Seven of eight verification items met. Three needed real implementation: the next
class is now derived in Rust (first sorted meeting at or after `now_time`, with a
"Next up" marker making it one action), `has_any_assignments` separates "not assigned
to any class" from "no classes today", and a pending assignment reads as an assignment
with no `schedule_meetings` — computed from existing data, with no new table or status
column, surfaced in the attention rail with no action button because no scheduling
screen exists yet. Three more (no classes today, unfinished attendance, returned
review) were already implemented and re-verified.

Two things recorded rather than claimed. **Stale offline schedule is `Unknown`:**
`schedule_meetings` is absent from the sync allowlist, so a stale schedule has no
transport to arrive through — that is M13's scope, and no freshness timestamp is
shown because none exists to show honestly. And the investigation found a real
staleness bug the item list does not name: `ClassWorkspaceScreen` renders inside
`MyDayScreen` without a tab change, so returning from it never remounted and the
attention rail kept showing an item the teacher had just cleared. `onBackToToday` now
re-fetches, mirroring `ClassRecordsScreen.handleBackToList`.

1,331 Rust tests (delta from M02 is exactly the six new `my_day` tests) and 1,257
frontend tests; zero axe findings. See `docs/ctos/checkpoints/m04.md` and
`docs/ctos/evals/today-cases.md`.

## M03 — CTOS design system: COMPLETE (PASS)

Four structural gaps fixed: a typography and spacing scale derived from their
bases (so density now rescales all type, not just body text), three duplicate
table definitions consolidated into one `.ledger` primitive, six ad-hoc
breakpoints collapsed onto three sanctioned widths, and the shared copy
vocabulary in `src/ui/theme/copy.ts`. The one missing component — a React error
boundary, of which `src/` had none — is added and wraps the tab switch, so a
render failure no longer takes down the shell and navigation.

`emptyCopy` was drafted and removed: all 45 `<EmptyState>` call sites carry real
context a generic string would discard, so the module ships no entry it cannot
justify. The regression fixture is a ten-test static token guard
(`scripts/design-tokens.test.mjs`), deliberately not a pixel baseline — the repo
has no image-comparison dependency, and pixels are not the property CTOS names.

Accessibility is provably intact: the real-browser smoke ran after the refactor
and reports zero axe WCAG A/AA findings across four widths × both appearances ×
three densities, with a no-horizontal-overflow assertion at every width. See
`docs/ctos/checkpoints/m03.md`.

## M02 — Work access and session integrity: COMPLETE (PASS)

One real defect fixed (`auth::login` left a zombie session on account switch);
the other eight items were proven rather than built — recorded work transfers on
reassignment by construction, and the sync queue is school-scoped by design.
See `docs/ctos/checkpoints/m02.md` and `docs/ctos/evals/access-cases.md`.

## M01 — Academic trust: COMPLETE (PASS, tag `ctos-m01-complete`)

Closed with `ComputedTermGrade.complete`: a provisional grade is now visibly
provisional on screen and in both exports. All seven verification items have
executable tests. See `docs/ctos/checkpoints/m01.md`.

## M06 complete — PASS

Outcome: LIKHA supports the actual teaching session rather than only post-class
administration.

Required: start/finish session, actual occurrence state, attendance, current learning
target, quick evidence, notes, learner follow-up marker, summary/review.

Acceptance: planned, changed, cancelled, and delivered occurrences remain
distinguishable — met by a test rendering all four status chips side by side.

What was actually built this milestone: `ClassroomModeScreen` (the §6.3 cockpit) and
the navigation handoff into it from `ClassWorkspaceScreen`, plus the conformance and
verification record. The occurrence stack — Rust repository, ten Tauri commands,
migration 0043, TypeScript domain/port/service/adapter — was already present and
uncommitted in the working tree, and is claimed as verified here, not built here.
Four real defects were found and fixed in the new screen (save loop, blank-slot
deviation, escaped throw, duplicated status text); details in the checkpoint.

Verification: 135 files / 1,284 frontend tests; 1,362 Rust tests; `cargo fmt --check`
and `cargo clippy --all-targets -- -D warnings` clean; `npm run quality:ui` zero axe
findings. See `docs/ctos/checkpoints/m06.md` and `docs/ctos/evals/classroom-cases.md`.

## M07 complete — PASS

Outcome: attendance and scoring are fast enough for real daily use without
sacrificing academic meaning.

Of CTOS.md §M07's thirteen verify items, ten were already implemented and are
re-verified and named in `capture-cases.md`. Three were partial and are what this
milestone closed:

1. **Keyboard attendance.** `SubjectAttendanceScreen` — the surface Classroom Mode
   routes into when attendance is unsettled — had arrow keys but no letter shortcuts;
   it now takes `P`/`A`/`L`/`E`. Neither roster advanced focus after a mark, so a
   keyboard session cost two keystrokes per learner. `handleMark` now returns
   `Promise<boolean>` and focus advances only on success, so a failed save leaves the
   teacher on the row that needs them.
2. **Tab in the score grid.** Native Tab left the grid for the row's Excused/N/A
   buttons. Tab now commits and moves to the next learner, Shift+Tab moves back up,
   on the reason input as well.
3. **Correction history.** The append-only lineage and its whole read stack existed
   since M01, but nothing called `correctionHistory` outside tests — a teacher could
   correct a score and give a reason, then had no way to see any of it back.
   `ScoreCorrectionHistory` is that surface, fetched on expand so a class of forty
   pays zero queries until one is opened.

Author names in the lineage are resolved at the repository by a double
`LEFT JOIN users`, following the `audit_log.actor_username` precedent — never
client-supplied. The schema's non-cascading `REFERENCES users(id)` means the join
cannot be orphaned; a test asserts the DELETE is rejected.

Two defects found and fixed: `setState` in an effect body (rejected by
`react-hooks/set-state-in-effect`; the reset moved to the toggle handler, which is
also where the immediate "Loading…" feedback belongs), and `getByText` unable to
match text spanning an element boundary — the change line renders
`15 → <strong>19</strong>` as separate text nodes, so the tests read the paragraph's
`textContent` instead.

Verification: 136 files / 1,301 frontend tests (up from 135 / 1,284 — exactly the 17
new tests); 1,364 Rust tests (up from 1,362 — exactly the two new lineage tests);
`cargo fmt --check` and `cargo clippy --all-targets -- -D warnings` clean;
`npm run quality:ui` zero axe findings. See `docs/ctos/checkpoints/m07.md` and
`docs/ctos/evals/capture-cases.md`.

Deliberately out of scope: the class-record `markFinal` state machine, which
`grading-cases.md` assigns to M11. "Fast" is claimed as interaction shape (one
keystroke per learner, no per-row fetch), not as a measured latency.

Next step: execute **M09 — Teacher Load Maker + Smart Scheduling** (CTOS.md §M09). The
M04-recorded duplicated schedule read path remains deliberately untouched and is still
open as a risk; M09 is the natural milestone to reconcile it, since it owns the
scheduling surface.

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

## FORGE UI + UX implementation checkpoint — 2026-10-11

Latest owner instruction: continue audit and verified fixes; do not provide screenshots.
The reconstructed audit implementation is local `1d1edc5`, remote equivalent
`8529094ef1ed1545eb3a823a0cb9da8454e0c47f`, isolated
`recovery/forge-ux-20261010`. Fetched source trees match exactly. Main is not merged.

14 findings implemented: token cycles; truthful confirmed-write/refresh/marker
recovery; scoped drafts; lesson stale-context/late-write protection; boot retry;
private-safe keyed boundary; field read retries; planner operation-specific labels
and confirmations; local dates; real Today routing; source-fresh score/assessment
and SF1 review recovery; confirmed-only idle expiry; responsive shared fields.
Current evidence: 146 files / 1,396 tests; frontend quality, core browser,
49 recovery browser checks, production build and fixture-isolation all pass.
See docs/ux/FORGE-UI-UX-Audit-2026-10-11.md and docs/ux/VERIFICATION.md.

Next pending acceptance: installed Windows exact-source native flows, manual
assistive-technology/teacher-school-head review, then native durable drafts and
Android acceptance. Browser fixtures do not prove those. Cargo/Rust/Android tools
are absent here. CTOS M10 remains a separate pending milestone; no curriculum,
AI generation quality, official workbook or native readiness claim was added.
