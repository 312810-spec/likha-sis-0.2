# CURRENT HANDOFF

## Active Task (2026-09-02, this session — retried UX-02/UX-03 owed independent reviews, self-review substituted again)

User-directed continuation ("continue working on verification debts").
With the self-disabling-button sweep fully closed (see the entry
below), retried the two remaining owed independent-review debts
recorded in `docs/VERIFICATION-DEBT.md`: `accessibility-reviewer`
against `TeacherWorkspaceScreen.tsx` (UX-02) and `teacher-ux-reviewer`
against `AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx` (UX-03). Both
dispatches, plus the one permitted `SendMessage` resume each, hit the
same recurring agent-resume/retrieval failure again (real work done —
32-35 tool calls per attempt — but no retrievable findings text). Per
the established fallback, substituted a rigorous self-review for both:
read every file involved end-to-end (screens, `StatusChip`/
`PageHeader`/`Loading`/`Alert` components, relevant `styles.css`
tokens). **No blocking issue found in either.** One non-blocking
observation recorded for UX-03: `AttendanceScreen.tsx`'s per-row status
buttons still use native `disabled={bulkMarking}` rather than the
`aria-disabled` pattern from the self-disabling-button sweep, but this
is not an instance of that bug (the button that becomes disabled is
never the one that was focused), so no fix was made. Full self-review
detail is in `docs/VERIFICATION-DEBT.md`'s UX-02 and UX-03 entries.

Both debt entries remain open (a self-review is not a substitute for a
real independent review, per project rules) — retry again in a future
session once there's reason to believe the harness's agent-resume
issue is fixed. No code changes this session; only
`docs/VERIFICATION-DEBT.md` was updated. `git status` clean after
commit/push.

**Verified**: no new code — this was a review/documentation-only
session. No test suite run since nothing changed under `src/` or
`src-tauri/`.

Next candidates unchanged from the prior entry below: (1) keep retrying
UX-02/UX-03 in future sessions as the harness allows, or (2)
product-shaped work — SF10 Permanent Record (safest immediately-
implementable slice) or the authoritative-template form-output pipeline
(higher value, currently paused pending more user-supplied DepEd
templates).

## Active Task (2026-09-02, this session — Self-disabling-button sweep: ClassRecordWorkspace/SectionRosterScreen, CLOSES the debt)

User-directed continuation ("continue" / "focus on the debts and next
wave"). Fifth and final batch of the self-disabling-button sweep:
applied the proven `disabled=` → `aria-disabled=` + handler-guard
pattern to the last two, most complex screens —
`ClassRecordWorkspace.tsx` (5 instances: "Add item", per-item "Save"/
"Confirm delete", "Show term grades", "Export report card") and
`SectionRosterScreen.tsx` (11 instances, most sharing one
`anyActionInFlight` flag: "Enroll learner" trigger, "Confirm
enrollment", enroll-panel "Cancel", "Generate SF1", "Export SF5",
per-row "Transfer"/"End enrollment"/"Correct today's placement"/
"Generate SF9", row-panel "Confirm transfer/end/correction", row-panel
"Cancel"). This closes `docs/VERIFICATION-DEBT.md`'s self-disabling-
button entry entirely — all 15 screens from the original sweep are
now fixed.

**Verified**: `npm run quality` 843/843 (16 new interaction tests,
plus 7 existing `.toBeDisabled()`/`.toBeEnabled()` assertions updated
to check `aria-disabled` instead), typecheck/lint/format/architecture
clean. `npm run build`, `npm run check:dev-preview-isolation`, `npm
run harness:verify` (100/100), `git diff --check` — all clean. No Rust
files touched.

`docs/VERIFICATION-DEBT.md`'s self-disabling-button entry is now
CLOSED. No specific next candidate pre-selected from that debt entry
since it's fully retired — the recorded next-wave candidates (from the
earlier "what's next" discussion this session) are: (1) the two owed
independent reviews (UX-02/UX-03 accessibility-reviewer/teacher-ux-
reviewer, blocked on a recurring harness agent-resume issue, self-
review substituted each time — see `docs/VERIFICATION-DEBT.md`), or
(2) product-shaped work — SF10 Permanent Record (fully unbuilt, can
reuse SF1's import/reconciliation architecture) is the safest
immediately-implementable slice; authoritative-template form output
(real DepEd `.xls` templates via a Tauri→sidecar→Apache POI/HSSF
pipeline, vs. today's disclosed-CSV-only exports) is the higher-value
but currently paused candidate — the user has begun supplying real
DepEd SF9/SF10/SF1/SF2/SF4/SF5/SF6 templates for structural evidence,
work is paused mid-way (one synthetic SF1 skeleton reviewed and
approved; user asked to pause further form work until told to
continue — see the session's own notes, not yet written to a
dedicated doc since the work is mid-flight and paused).

## Active Task (2026-09-02, this session — Self-disabling-button sweep: Sections/Sf1Import/SubjectAttendance, complete)

User-directed continuation ("continue"). Fourth batch of the
self-disabling-button sweep: applied the proven `disabled=` →
`aria-disabled=` + handler-guard pattern to `SectionsScreen.tsx`'s
"Create section", "Enroll learner", and "Export SF6" submit buttons;
`Sf1ImportScreen.tsx`'s "Choose Excel file" button; and
`SubjectAttendanceScreen.tsx`'s "Check attendance", "No class today",
"Mark all present", and the per-learner per-status roster buttons — 8
instances across 3 screens. Deliberately left `Sf1ImportScreen.tsx`'s
"Import learners" button as native `disabled` — confirmed by reading
the code that it is not an instance of this bug: `handleCommit` sets
`busy` and `phase: "committing"` together in one batched update, so the
button unmounts (replaced by a loading state) before it could ever be
observed disabled-but-focused.

**Verified**: `npm run quality` 829/829 (12 new interaction tests, each
proving the handler guard blocks a second submission while the first is
still in flight, plus one proving a per-learner mark is blocked during a
concurrent bulk mark-all-present), typecheck/lint/format/architecture
clean. `npm run build`, `npm run check:dev-preview-isolation`, `npm run
harness:verify` (100/100), `git diff --check` — all clean. No Rust files
touched.

`docs/VERIFICATION-DEBT.md`'s self-disabling-button entry updated: 27 of
~45 total instances now fixed across 13 screens; ~10 remaining across
`ClassRecordWorkspace.tsx` and `SectionRosterScreen.tsx` (both use a
shared `anyActionInFlight` guard across several buttons — the next
slice should read that guard's usage carefully before converting, since
converting one button's condition without checking how it's shared
could change another button's disabled behavior).

## Active Task (2026-09-02, this session — Self-disabling-button sweep: ClassRecords/SectionAdviser/LearnerList, complete)

User-directed continuation ("continue working on the waves"). Third
batch of the self-disabling-button sweep: applied the proven
`disabled=` → `aria-disabled=` + handler-guard pattern to
`ClassRecordsScreen.tsx`'s "Open class record" and "Add subject"
buttons, `SectionAdviserScreen.tsx`'s "End advisory" and "Assign
adviser" buttons, and `LearnerListScreen.tsx`'s "Export learner list
(CSV)" button, per-row "Save" (edit) button, "Enroll learner" submit
button, and "Create separate learner" duplicate-review button — 7
instances across 3 screens. Deliberately left `LearnerListScreen.tsx`'s
per-row "View history"/"Edit" buttons and the "Cancel" buttons as
native `disabled` — confirmed by reading the code that neither is an
instance of this bug (Edit's button is unmounted, not disabled, on
click, and already has its own focus-management effect; Cancel is
disabled by a sibling button's async state, not its own).

**Verified**: `npm run quality` 821/821 (7 new interaction tests, each
proving the handler guard blocks a second submission while the first is
still in flight), typecheck/lint/format/architecture clean. `npm run
build`, `npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s self-disabling-button entry updated: 19 of
~45 total instances now fixed across 10 screens; ~18 remaining across
`ClassRecordWorkspace.tsx`, `SectionRosterScreen.tsx`,
`SectionsScreen.tsx`, `Sf1ImportScreen.tsx`, and
`SubjectAttendanceScreen.tsx`.

## Active Task (2026-09-02, this session — Self-disabling-button sweep: GradingPeriods/ScheduleMeetings/TeachingAssignments, complete)

User-directed continuation ("continue working on the waves"). Continued
the self-disabling-button sweep with a second batch, prepared while PR
#27 (the first batch — auth/session screens) was still in CI: applied
the same `disabled=` → `aria-disabled=` + handler-guard pattern to
`GradingPeriodsScreen.tsx`'s per-row "Save" button,
`ScheduleMeetingsScreen.tsx`'s "Schedule meeting" and per-row "Remove"
button, and `TeachingAssignmentsScreen.tsx`'s "Assign teacher" and
per-row "Remove" button — five instances across three screens that
share a simple, consistent create-form-plus-removable-row shape. For
the per-row buttons, the guard checks the specific row/id already in
flight (e.g. `savingPeriodId === policyPeriodId`), not a blanket
any-action-in-flight guard, preserving each screen's existing per-row
disabling behavior exactly.

**Verified**: `npm run quality` 810/810 (5 new interaction tests, each
proving the handler guard blocks a second submission for the same
row/form while the first is still in flight), typecheck/lint/format/
architecture clean. `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100), `git
diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s self-disabling-button entry updated with
this batch's specifics; remaining instances across
`ClassRecordWorkspace.tsx`, `ClassRecordsScreen.tsx`,
`LearnerListScreen.tsx`, `SectionAdviserScreen.tsx`,
`SectionRosterScreen.tsx`, `SectionsScreen.tsx`, `Sf1ImportScreen.tsx`,
`SubjectAttendanceScreen.tsx` still open, pattern proven.

## Active Task (2026-09-02, this session — Self-disabling-button sweep: auth/session-critical screens, complete)

User-directed continuation ("continue"). Picked up the recorded next
slice from the self-disabling-button debt: apply the proven `disabled=`
→ `aria-disabled=` + handler-guard pattern (from the earlier 3-instance
fix) to more screens. Scoped this slice to the four standalone
auth/session-critical submit buttons — `LoginScreen.tsx` ("Sign in"),
`FirstRunSetupScreen.tsx` ("Finish setup"), `AdminPasswordResetScreen.tsx`
("Reset password"), `IdleTimeoutWarning.tsx` ("Stay signed in") —
deliberately not the full ~40-instance sweep across ~15 files, to keep
this change reviewable. Each screen has exactly one self-contained
submit button and is among the first things every teacher touches.

Each fix proven with a real interaction test (not just an attribute
assertion): the underlying repository call is made to hang via an
unresolved `Promise`, the button is clicked once, `aria-disabled="true"`
is asserted, clicked again, and the repository call count is asserted
unchanged — proving the handler-level guard actually blocks the second
submission, not just that the button looks disabled.

**Verified**: `npm run quality` 809/809 (4 new tests), typecheck/lint/
format/architecture clean. `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100), `git
diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s self-disabling-button entry updated:
7 of ~45 total instances now fixed; the remaining ~30+ across
`ClassRecordWorkspace.tsx`, `ClassRecordsScreen.tsx`,
`GradingPeriodsScreen.tsx`, `LearnerListScreen.tsx`,
`ScheduleMeetingsScreen.tsx`, `SectionAdviserScreen.tsx`,
`SectionRosterScreen.tsx`, `SectionsScreen.tsx`, `Sf1ImportScreen.tsx`,
`SubjectAttendanceScreen.tsx`, `TeachingAssignmentsScreen.tsx` remain
open, pattern proven and mechanical to apply in further slices.

## Active Task (2026-09-02, this session — Reveal-in-folder: SF5/SF6/report card/roster, complete)

User-directed continuation ("continue"). Picked up the recorded exact
next slice from the reveal-exported-file feature (PR #24): extend the
"Open folder" button already proven on SF2/SF4 in
`MonthlySummaryScreen.tsx` to the remaining four export surfaces —
SF5 (`SectionRosterScreen.tsx`), SF6 (`SectionsScreen.tsx`), the
class-record report card (`ClassRecordWorkspace.tsx`), and the learner
roster (`LearnerListScreen.tsx`). No new backend/plumbing work — the
`revealExportedFile` port/adapter/service/fixture wiring already existed
at every layer from PR #24; this was UI-only, mirroring the same
button + loading/error-state pattern already established. This closes
the "reveal-affordance" verification debt completely (see
`docs/VERIFICATION-DEBT.md`).

**Verified**: `npm run quality` 805/805 (4 new interaction tests, one
per screen, each proving the underlying `revealExportedFile` call fires
with the exact saved path — not just that a button renders),
typecheck/lint/format/architecture clean. `npm run build`, `npm run
check:dev-preview-isolation`, `npm run harness:verify` (100/100), `git
diff --check` — all clean. No Rust files touched.

## Active Task (2026-09-01, this session — Verification debt sweep: Wave 3I security review retry + native visual pass, complete)

User asked to "work on verification debts." Picked the two highest-
priority actionable items per project priority order (security first).

**Wave 3I independent security review, retried and closed**: the
`security-reviewer` harness's agent-resume/retrieval failure had blocked
this twice before (self-review substituted at the time). Retried this
session — succeeded. Verdict: 0 BLOCKING, 1 SHOULD-FIX (no Rust-side
minimum-password-length enforcement in `admin_reset_teacher_password`,
matching the same disclosed, deliberate convention already documented
for `register_user`/`bootstrap_installation` in
`src/domain/password-policy.ts` — not fixed inline, since doing so only
for this one path would create an undocumented asymmetry; recorded as a
project-wide follow-up instead). Full record:
`docs/VERIFICATION-DEBT.md`'s Wave 3I entry.

**Native visual pass, closed for the 4 outstanding M0–M6 screens**:
using the documented `playwright-cli` browser-mismatch workaround
(`chromium.launch({ executablePath: "/opt/pw-browsers/chromium" })`),
screenshotted `LoginScreen` (direct, real `vite dev`), `FirstRunSetupScreen`
(needed a one-off `window.__TAURI_INTERNALS__.invoke` mock — a throwaway
probe, not a new fixture), and `AppShell`/`LearnerListScreen` (via the
existing dev-preview fixture) — 2 viewports × 2 color schemes each, 16
screenshots total. **Found and fixed a real layout bug**: `WorkbenchNav`'s
nav-group divider used `border-right`, which only reads correctly when
every group shares one row — once a later group wraps to its own row
(confirmed happening even at the primary 1366px desktop width once
"Daily Teaching" grows past one internal row), the earlier group's
`border-right` became an orphaned floating line. Fixed in
`src/ui/theme/styles.css`: unconditional `border-bottom` divider,
removing the narrow-viewport-only special case — verified correct at
850px, 1024px, and 1366px. Screen-reader pass (NVDA/Narrator) stays open
— no Windows screen reader available in this sandbox. Full record:
`docs/VERIFICATION-DEBT.md`'s Native visual/screen-reader entry.

**Verified**: `npm run quality` 801/801 (no regressions), `npm run
build`, `npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean. Only `src/ui/theme/styles.css`
changed; no Rust touched, no cargo checks needed.

## Active Task (2026-09-01, this session — Reveal-exported-file ("Open folder") feature, complete)

User-directed continuation ("continue"). Picked up the second app-wide
debt flagged by the UX-03 teacher-ux review retry (previous entry
below): export results show only a raw OS file path with no way to jump
to the saved file. Scoped to SF2/SF4 in `MonthlySummaryScreen.tsx` only
— the same "prove the pattern on a small, reviewable slice; defer the
full sweep" discipline as the self-disabling-button fix. Remaining
export surfaces (SF5, SF6, report card export, learner roster export)
stay open debt with the pattern now proven to follow.

**Backend**: added `tauri-plugin-opener` v2.5.5 (Rust) /
`@tauri-apps/plugin-opener` v2.5.5 (npm) — official first-party Tauri 2
plugin, `revealItemInDir()` opens the OS file manager at a path. Fixed
CVE-2025-31477 in its `open`-family APIs (untrusted-input path/URL-scope
validation), patched upstream at 2.2.1+, this project pins 2.5.5.
Registered in `src-tauri/src/lib.rs`; capability
`opener:allow-reveal-item-in-dir` granted narrowly in
`src-tauri/capabilities/default.json`. See
`docs/SOURCE-REGISTRY.md`'s new entry for the full dependency writeup.

**Plumbing**: `revealExportedFile(filePath)` added end-to-end —
`ExportRepository` port → `TauriExportRepository` (calls the plugin,
doc-commented with the untrusted-path discipline: only ever call with a
path this app itself just returned from an export, never a user-typed
string) → `ExportApplicationService` (trims, rejects empty) →
`FixtureExportRepository` (genuine no-op for the browser-hosted
dev-preview tool, not a throw — this really is unavailable there, not a
bug to surface).

**UI**: `MonthlySummaryScreen.tsx` — added an "Open folder" button next
to each of the SF2 and SF4 "Saved to `<path>`" result blocks, each with
its own loading/error state (`revealingSf2`/`revealSf2Error`,
`revealingSf4`/`revealSf4Error`), reset on section/month change like the
existing export state. Failure shows a plain-language inline error
rather than throwing.

**Verified this wave**: `npm run quality` — 801/801 tests (9 new: 3 new
`MonthlySummaryScreen` interaction tests, 2 new
`ExportApplicationService` unit tests, plus a `revealExportedFile` stub
added to every other `FakeExportRepository`/`SlowExportRepository` test
double the interface change touched), typecheck/lint/format/architecture
clean. `npm run build`, `npm run check:dev-preview-isolation`,
`npm run harness:verify` (100/100), `git diff --check` — all clean.
Rust touched (`lib.rs`, `Cargo.toml`, `capabilities/default.json`):
`cargo build` clean; `cargo test` (all suites, including every
integration test file) 0 failures; `cargo clippy --all-targets -- -D
warnings` 0 warnings; `cargo fmt --check` clean.

`docs/VERIFICATION-DEBT.md`'s reveal-affordance entry updated: SF2/SF4
in `MonthlySummaryScreen` closed; SF5/SF6/report-card/roster exports
remain open, pattern proven.

## Active Task (2026-09-01, this session — Self-disabling-button focus-loss fix, complete)

User-directed continuation. Picked up the app-wide debt flagged by the
UX-03 accessibility review retry (`docs/VERIFICATION-DEBT.md`):
buttons that use the native `disabled` attribute to block
double-submission blur to `<body>` the instant they're clicked, since
the focused element itself becomes unfocusable mid-interaction.

**Scoped deliberately, not a mechanical app-wide sweep**: fixed the
three specific instances the reviews this session actually re-confirmed
present — `AttendanceScreen.tsx`'s "Mark all present" button and
`MonthlySummaryScreen.tsx`'s "Export SF2"/"Export SF4" buttons.
Pattern: `disabled={cond}` → `aria-disabled={cond}` (keeps the button
focusable/tabbable) + an early-return guard for the same condition
inside the handler itself (`aria-disabled` doesn't block clicks at the
DOM level, so the handler has to). Added a matching
`button[aria-disabled="true"]` CSS rule mirroring the existing
`button:disabled` visual treatment (cursor + opacity), so nothing looks
different to a sighted user. Other screens sharing this same
`disabled={...}` pattern (`LearnerListScreen`, `SubjectAttendanceScreen`,
etc.) are **not** touched — that's a much larger sweep, left as its own
future slice, not expanded into here.

Two existing tests that asserted `.toBeDisabled()` on the changed
buttons were updated to assert `aria-disabled="true"` instead. Two new
tests added — one per changed screen — that actually click the
aria-disabled button and assert the underlying repository call did
**not** fire, proving the handler-level guard works, not just that the
button looks disabled.

**Verified this wave**: `npm run quality` — 796/796 tests (2 new),
typecheck/lint/format/architecture clean. `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s app-wide self-disabling-button entry
updated: these three instances closed; the broader app-wide sweep
(remaining screens) stays open, now with the concrete pattern already
proven here to follow.

## Active Task (2026-09-01, this session — UX-02/UX-03 independent review retry, complete)

Dispatched fresh reviews against the two remaining long-open
independent-review debts: `accessibility-reviewer` for UX-02
(`TeacherWorkspaceScreen.tsx`), and both `teacher-ux-reviewer` +
`accessibility-reviewer` for UX-03 (`AttendanceScreen.tsx`/
`MonthlySummaryScreen.tsx`). All three retrievals succeeded (the 4th,
5th, and 6th successful review retries today).

**UX-02 accessibility: LOOKS-GOOD**, no findings — closed clean.

**UX-03 teacher-ux findings, fixed**: (1) Medium — "resolved" jargon in
the SF4 export error (`MonthlySummaryScreen.tsx`), inconsistent with
the plainer SF2 sibling message — this was this session's own wording
from the earlier SF4 PR, not inherited debt; changed to match SF2's
"could not be found" phrasing. (2) Low — raw file path shown with no
open/reveal affordance — an existing, systemic pattern shared by every
export result across the app (SF2/4/5/6, report card, roster); **not
fixed here** — a real UI feature (reveal-in-folder), out of scope for a
review-fix PR, would need its own scoped slice. (3) Low — AttendanceScreen's
per-row "Retry" buttons shared one accessible name across the whole
roster — fixed with a learner-specific `aria-label`, same pattern as
UX-04's Edit/Delete fix.

**UX-03 accessibility findings, fixed**: (1) Moderate — the monthly
summary table's scrollable container had no `tabIndex`/accessible name
(WCAG 2.1.1, axe's `scrollable-region-focusable` rule — invisible to
`jsdom`-based `expectNoAccessibilityViolations`, since jsdom doesn't
compute real scroll dimensions) — fixed with `tabIndex={0}` +
`aria-label`. (2) Low — self-disabling buttons (native `disabled`)
lose focus to `<body>` on click — confirmed **pre-existing, shared
across `LearnerListScreen`/`SubjectAttendanceScreen`/etc., not new to
UX-03** — recorded as debt, not fixed here (a real app-wide pattern
change, out of scope for a targeted review-fix). (3) Minor — some
`field-hint` instructional text isn't `aria-describedby`-linked to its
control — non-blocking, left as-is per the reviewer's own
"worth tightening only if revisited" call.

**Verified this wave**: `npm run quality` — 794/794 tests (existing
tests extended), typecheck/lint/format/architecture clean. `npm run
build`, `npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s UX-02 and UX-03 entries updated to
CLOSED. A new debt entry records the app-wide self-disabling-button
focus-loss pattern (not this wave's to fix) and the
export-result-no-reveal-affordance pattern.

## Active Task (2026-09-01, this session — UX-04 independent review retry, complete)

Dispatched fresh `teacher-ux-reviewer` and `accessibility-reviewer` runs
against `ClassRecordWorkspace.tsx`/`ClassRecordsScreen.tsx` — the
long-open UX-04 independent-review debt (`docs/VERIFICATION-DEBT.md`,
recorded 2026-08-25, both reviewers previously hit the agent-resume/
retrieval failure twice each). **Both retrievals succeeded this time**
(the third successful review retry today, after the earlier SF5
security review) — the harness issue appears to be intermittent rather
than permanent, at least in this session.

**Findings, both NEEDS-ATTENTION (minor), all fixed**:

- Teacher-UX: (1) Medium — deleting an assessment item gave no success
  confirmation, inconsistent with this file's own create-item and
  `ScheduleMeetingsScreen`'s delete-confirmation precedent; (2) Low —
  editing/renaming an item had the same gap; (3) Low — the
  weighting-name fallback text read as "unknown" (alarming) rather than
  a benign gap; (4) Low — the DepEd weighting-coverage caveat sat below
  the export button, not above it, so a top-to-bottom reader could hit
  "Export" before the caveat.
- Accessibility: (1) Medium — the selected-assessment-item button set
  `aria-pressed` but had no matching CSS rule, so it carried zero visual
  cue for which item was selected (`.attendance-roster` already has this
  exact pattern — `.assessment-item-list` didn't). Verified the
  previously-fixed Edit/Delete accessible-name collision (`role="group"`)
  remains correctly in place, not regressed.

**Fixed**: added `setConfirmation` calls to delete/edit success paths;
changed `"unknown"` → `"not shown"` fallback text (both occurrences);
moved the DepEd caveat paragraph above the export button; added a
`.assessment-item-list button[aria-pressed="true"]` CSS rule mirroring
`.attendance-roster`'s (background/color change + non-color `✓` cue,
WCAG 1.4.1). Extended the 3 affected existing tests with assertions for
the new confirmation text; CSS-only fix has no direct unit-test
coverage (matches how `.attendance-roster`'s identical rule is
verified — visually/structurally, not via a CSS-in-jsdom assertion).

**Verified this wave**: `npm run quality` — 794/794 tests (existing
tests extended, no new `it` blocks, so count unchanged), typecheck/
lint/format/architecture clean. `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean. No Rust files touched.

`docs/VERIFICATION-DEBT.md`'s UX-04 entry updated to CLOSED — both
reviews actually completed and returned findings this time, and every
finding from both is now fixed.

## Active Task (2026-09-01, this session — SF5 export as_of_date bug fix + dev-preview SF5/SF6 wiring, complete)

Follow-up to Wave 3J below. Dispatched an independent `security-reviewer`
against the three Wave 3m export commands (SF4/SF5/SF6) — **this attempt
actually retrieved findings**, unlike the two prior agent-resume/
retrieval failures recorded in `docs/VERIFICATION-DEBT.md` for this
same review. Verdict: **NOT BLOCKING**, one **SHOULD-FIX**.

**Real bug found and fixed**: `commands::export::export_section_eosy_sf5`
(`src-tauri/src/commands/export.rs`) queried
`grading::list_by_school_year(&conn, "", &school_year)` — a hardcoded
**empty-string** `school_id` — purely to compute the `as_of_date`
fallback used by the `authorize_adviser_of_section` check. That
repository function's exact-match `WHERE school_id = ?1` clause can
never match an empty string (school ids are always non-empty UUIDv7s),
so this call silently, always returned zero rows — `as_of_date` always
took the year-boundary fallback (e.g. `"2027-06-30"`) rather than the
real last grading period's end date. Concretely: an adviser whose
advisory ended between the real last grading period's end and the
year-boundary fallback was wrongly evaluated as "not the current
adviser" at that wrong date and denied — not because they actually
aren't the adviser, just because the wrong date was asked about. Not
exploitable as a tenant-isolation bug (confirmed: it never returns
cross-school data, just always-empty), but a real **correctness/
availability** bug for advisers near a school year's actual end.

**Fix**: derive the school*id from the session first
(`sessions.require_active_school_scope`, this file's own established
pattern, used elsewhere in the same function seconds later anyway) and
use \_that* for the `as_of_date` lookup, before calling
`authorize_adviser_of_section` (which independently re-derives and
re-verifies school_id/section ownership — no authorization logic
changed, only the date the question is asked about). Fixed identically
in the integration test file's parallel "standing in for the command"
helper (`src-tauri/tests/export.rs`), which had copied the same bug.

**New regression test**:
`sf5_export_authorization_uses_the_real_last_grading_periods_end_date_not_a_year_end_fallback`
— constructs exactly the window where the bug and the fix disagree
(adviser's advisory ends after the real last grading period but before
the year-boundary fallback), and **proves** the regression: verified it
actually fails with `Unauthorized` against the pre-fix code (temporarily
reverted, ran red, then reapplied the fix and reran green) before
committing — not just written and assumed correct.

**Also fixed while here**: the dev-preview fixture's `exportSectionEosySf5`/
`exportSchoolEosySf6` stubs were unwired "throw" placeholders — and
`SectionsScreen.tsx` (which calls `exportSchoolEosySf6`) **is** wired
into `DevPreviewApp.tsx`, so that throw was a live bug in the
dev-preview tool itself (clicking "Export SF6" there would have thrown
an unhandled error). Wired both with real synthetic results, matching
the existing SF2/SF4 fixture convention.

**Verified this wave**: `cargo build`/`cargo test` (629 lib tests + all
integration files, 0 failures, including the new regression test) /
`cargo clippy --all-targets -- -D warnings` (0 warnings) / `cargo fmt
--check` all clean. `npm run quality` (794/794 tests, typecheck/lint/
format/architecture clean), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), `git diff --check` — all clean.

## Active Task (2026-09-01, this session — Wave 3J: SF4 Export UI Trigger, complete)

User-directed continuation, following the merges below. Full scope:
the recommended next slice from the Wave 3m reconciliation entry —
wire an "Export SF4" trigger into `MonthlySummaryScreen.tsx`, the same
school-wide, month-scoped screen that already triggers the SF2 export.

**What shipped**: a second export button, "Export SF4 (CSV, whole
school)", next to the existing "Export SF2 (CSV)" one in
`MonthlySummaryScreen.tsx`. Calls the already-existing
`exportService.exportSchoolMonthlyAttendanceSf4(year, month)` (backend
shipped in Wave 3m with no UI trigger, deliberately, per ADR-0059).
Deliberately **not** gated on the currently-selected section or its
report data — SF4 is school-wide, unlike SF2's section scope — so it's
enabled whenever a valid month is selected, independent of which
section the teacher happens to have picked. Gets its own request-
invalidation ref (`exportSf4RequestRef`), invalidated on month change
but not section change, mirroring the existing SF2 pattern's
stale-response guard. Also wired `FixtureExportRepository.exportSchoolMonthlyAttendanceSf4`
in `src/dev-preview/fixtures.ts` (previously an unwired "not wired"
throw stub) with a real synthetic result, so the dev-preview screen
actually demonstrates the new button end-to-end — matching the
fixture's existing SF2 convention.

**Self-correction, same session**: PR #19's own body (and this entry,
before this edit) incorrectly claimed "SF5/SF6 UI triggers remain
deliberately unwired... matching ADR-0059's zero-UI-first precedent for
those two forms." **That was wrong** — checked only the dev-preview
fixture's stub methods, not the real product screens. ADR-0059's "no
UI trigger" claim was **only ever about SF4**; ADR-0057/0058's own
"Addendum" sections record that SF5 (`SectionRosterScreen.tsx`,
"Export SF5 (Promotion & Level of Proficiency)") and SF6
(`SectionsScreen.tsx`, "Export SF6 (Promotion & Proficiency Summary)")
already shipped real UI triggers during the Wave 3m reconciliation
itself — confirmed by direct grep of both files on `main` after
merging PR #19. SF4 (this PR) was the only one of the three actually
missing a trigger. Corrected here so a future session doesn't inherit
the false claim; PR #19 is already merged, so its body can't be
edited, but this is the durable-memory correction.

**Verified this wave**: `npm run quality` — typecheck, eslint,
`prettier --check`, `check:architecture`, `vitest run` all clean,
**794/794 tests passing** (3 new: successful SF4 export, school-not-
resolved error path, and the button not being gated on section-report
data). `npm run build`, `npm run check:dev-preview-isolation`, `npm run
harness:verify` (100/100), and `git diff --check` all also clean. No
Rust files touched — this was a pure TS/UI change against an
already-shipped, already-CI-verified Rust command.

**Not done**: SF5/SF6 in the dev-preview fixture still throw
"not wired" stubs (their real product-screen UI is already shipped —
see the self-correction above; only the _dev-preview demo_ fixture for
those two lags). No other product-code change beyond the two files
above plus the dev-preview fixture.

## Active Task (2026-09-01, this session — Merge PR #18 and PR #11, real Rust verification, complete)

User-directed: merge both green PRs, resolve any conflicts, continue
waves after. **PR #18 merged clean** (no conflicts). **PR #11 hit a
real merge conflict** against the new `main` (both branches had prepended
entries to the same four project-state docs): resolved by hand,
preserving both PRs' entries in chronological order (newest first) in
`CURRENT-HANDOFF.md`, `ACTIVE-PLAN.md`, `PROJECT-MEMORY.md`,
`VERIFICATION-DEBT.md` — nothing dropped. Also found and fixed a real
**ADR-number collision**: PR #11's `docs/adr/0057-admin-assisted-password-reset.md`
collided with PR #18's already-merged `docs/adr/0057-sf5-promotion-foundation.md`.
Renamed PR #11's ADR to `0061-admin-assisted-password-reset.md` and
updated every reference to it (`src-tauri/src/{auth/mod.rs,db/migrations.rs}`,
`src/{domain/session.ts,domain/ports/school-member-repository.ts,
application/school-member-service.ts,infrastructure/tauri/school-member-repository.ts,
ui/AdminPasswordResetScreen.tsx}`, and the three docs above).

**Real Rust verification finally ran, for the first time this
project's history** — this sandbox unexpectedly had a working
`sudo -n apt-get install` path (no interactive prompt, unlike every
prior session): installed the GTK/WebKit system packages, ran `rustup
update stable` (1.94.1 → 1.98.0, the workspace needs 1.95+), then
directly ran `cargo build` (clean), `cargo test` (629 lib tests + every
integration test file, **0 failures**), `cargo clippy --all-targets --
-D warnings` (**0 warnings**), `cargo fmt --check` (clean) against the
fully-merged tree (Wave 3m reconciliation + Wave 3I password reset
together). This closes the `docs/VERIFICATION-DEBT.md` entries both
PRs had recorded for "no local Rust build" — see the updated entries
there. `npm run quality` (791 tests), `npm run build`,
`npm run check:dev-preview-isolation`, `npm run harness:verify`
(100/100), and `git diff --check` all also re-ran clean on the merged
tree.

Pushed the conflict-resolution commit to `claude/issue-9-20260831-1305`
(PR #11's branch); next action is merging PR #11 once GitHub's own CI
re-confirms green on the new head, then continuing autonomous wave
development per the user's standing instruction.

## Active Task (2026-09-01, this session — Wave 3m Reconciliation, complete)

From GitHub issue #16, branch `claude/issue-16-20260901-1208`. Full
record: `docs/adr/0060-wave-3m-reconciliation.md`.

**Repository truth at trigger time**: `main` at `fd437e5` (Wave 3H +
the ChatGPT/Codex-automation-switch-and-restore saga, `41e1af9`/
`fd437e5`); `antigravity/likha-sis-wave3m-sf4-monthly-attendance-foundation`
(a different coding agent's independent lineage) at `35ed7f0`, 12
commits ahead of and 21 commits behind `main`, both diverged from the
same Wave 3E checkpoint (`4de3973`).

**What happened**: both lineages had independently rebuilt Adviser View
(Wave 3F) and Section Adviser Management UI (Wave 3G) from that same
starting point, then diverged — `main` into harness restoration, Wave
3m into SF2 class-adviser-byline integration → SF5 (School Form 5,
Report on Promotion and Level of Proficiency) → SF6 (School Form 6,
Summarized Promotion Report) → SF4 (School Form 4, Monthly Attendance
Consolidation). A blind merge was rejected (the two lineages' Adviser
View reimplementations conflict at the content level, not just the
line level). Instead, every changed file was classified and
reconciled by hand — see the ADR for the full file-by-file record.

**Decision**: kept `main`'s own Adviser View/Section Adviser
Management implementation (already reviewed, already Playwright-
verified, and free of a real regression Wave 3m's parallel version
still carries — see the ADR's "Investigation"/"Decision" sections for
the concrete evidence). Brought forward everything Wave 3m built that
`main` didn't already have: the SF2/report-card adviser byline, SF5
(ADR-0057), SF6 (ADR-0058), and SF4 (ADR-0059) — all layered onto
`main`'s existing, unmodified Section Advisory foundation (ADR-0056),
not a parallel copy of it.

**Verification actually run this session**: `npm run quality` —
typecheck/lint/format/`check:architecture`/vitest all clean, **777/777
tests passing**. `cargo fmt --check` clean (one pure-whitespace `cargo
fmt` pass reconciled the two lineages' formatting). `git diff --check`
clean. `cargo build`/`cargo test`/`cargo clippy` **could not run** —
this sandbox is missing the Tauri/GTK system libraries
(`glib-2.0`) `docs/adr/0041-minimal-ci-foundation.md`'s own CI job
installs via `sudo apt-get`, and installing them here needed
interactive approval unavailable in this unattended session. Every
non-trivial Rust type/function signature the ported code depends on
was instead hand-verified against this repository's actual current
source (not the source branch's possibly-stale version) — see the ADR
for the full list checked. This is real, disclosed verification debt
(`docs/VERIFICATION-DEBT.md`), not a claimed pass.

**Gate decision**: reconciliation is complete and locally green on
every check this sandbox can run. Merged as PR #18 (2026-09-01) after
Quality Gate and Security Gate both confirmed green on the exact head
SHA, with zero open review threads.

**Recommended next slice (not started)**: SF4 shipped with no UI
trigger (deliberately, matching this project's zero-UI-first
precedent — see ADR-0059). The natural next slice is wiring an
"Export SF4" action into `MonthlySummaryScreen.tsx` (the same
school-wide, month-scoped screen that already triggers the SF2
export), giving School Heads a School Form 4 button next to the
section-level SF2 one. Runner-up: closing the still-open Wave
2Z-3H-era review/verification debt items already recorded further down
this file, none of which this reconciliation touched.

## Active Task (2026-08-31, this session — Wave 3I: Admin-Assisted Password Reset, complete)

Implementation wave, run from GitHub issue #9 (a delivery-retry of an
earlier same-issue run whose ephemeral session produced no durable
artifact — that run's uncommitted work was independently reconstructed
and re-verified from scratch here, not merely re-pushed). Branch
`claude/issue-9-20260831-1305`, starting `HEAD` `fa8d21c` (confirmed
exactly the issue's expected checkpoint). `main` not fetched/switched/
merged/modified. Full scope contract: `docs/product/WAVE-3H-DECISION.md`'s
Wave 3I section. Full decision record: `docs/adr/0061-admin-assisted-password-reset.md`.

**What shipped**: `admin_reset_teacher_password` (Rust command,
`src-tauri/src/commands/user.rs`) lets a School Head set a new password
directly for a colleague in their own school, effective immediately —
the Recommended mechanism from ADR-0061's 10-scenario decision process
(Next Best, explicitly deferred not rejected: a system-generated
temporary password with forced change at next login). Gated by the
existing `Capability::ManageSchoolMembership` (no new capability
variant — reuses the same authority tier as onboarding a member).
Target school membership is re-verified server-side on every call; an
unknown target and a target in a different school collapse to an
identical `Ok(false)` with no audit write, so neither can be used to
enumerate accounts in another school. Reuses the existing Argon2id
hashing path unchanged; the raw password is zeroized in the command
layer. A successful reset also clears any lockout in effect on the
target account (`repository::user::set_password_and_clear_lockout`) —
a locked-out account is very often exactly why the reset was requested.
Migration 24 widens `audit_log` (the same 12-step recreate-table
pattern migration 5 established, since SQLite cannot `ALTER` a `CHECK`
constraint in place) with a nullable `actor_user_id` column and a new
`password_reset_by_admin` event type; every pre-existing row is
preserved losslessly with `actor_user_id = NULL`.
`admin_reset_teacher_password` was added to `invoke.ts`'s session-
expiry exemption set in the same commit (Wave 3B's own recorded debt:
every new capability-gated command must be added by hand). A new
`AdminPasswordResetScreen` (reached from the "Security" nav group)
shows the same form to every authenticated school member, following
`SectionAdviserScreen`'s established generic-error/no-client-side-
enforcement convention.

**Verified this wave**: `npm run quality` 770/770 (typecheck, lint,
format, architecture, vitest all clean); `npm run build` clean; `npm
run check:dev-preview-isolation` clean; `npm run harness:verify`
100/100; `cargo fmt --check` clean; `git diff --check` clean. New Rust
command-boundary tests cover same-school authorized success,
cross-school denial (returns `false`, not an error, with no audit
write), non-School-Head denial (`Unauthorized`), no-session denial,
an unknown-target vs. cross-school-target indistinguishability
assertion, lockout clearing on reset, and audit actor/target
attribution. New TS tests cover the application-service validation
layer, the Tauri adapter's exact `invoke` call shape, the UI screen's
success/generic-failure/validation paths, and accessibility.
**`cargo test`/`cargo clippy` could not run in this session's sandbox**
(no `libglib2.0-dev`/`libgtk-3-dev`/`libwebkit2gtk-4.1-dev` — the exact
packages `.github/workflows/quality.yml` installs for CI — and
`apt-get install` requires interactive approval unavailable in this
unattended run) — mitigated with careful manual review of every
changed `.rs` file and an independent security review (see below);
retained as debt in `docs/VERIFICATION-DEBT.md`; GitHub CI is
authoritative for this check.

**Independent security review**: dispatched to a fresh
`security-reviewer` agent, scoped to authorization correctness,
cross-school isolation, enumeration safety, password handling, the
lockout side effect, audit correctness, the `invoke.ts` exemption
change, and the frontend's UI-hiding-is-not-security posture — see this
session's own final report for the actual outcome (recorded honestly,
including if the known agent-retrieval failure recurred).

**Non-goals respected**: no self-service forgot-password flow; no
DPAPI/SQLCipher/database-key changes; no change to account-lockout
_policy_ (ADR-0019) or idle-timeout behavior (ADR-0020) — only one
already-authorized write path's side effect on one specific account; no
Sync/cloud/billing/backup work; synthetic fixtures only.

**Gate decision: WAVE 3I COMPLETE.** Persisted durably to the
issue-managed branch (commit SHA and PR link in this session's own
final report — not duplicated here to avoid drift). Next planned slice
(not started, from `docs/product/WAVE-3H-DECISION.md`'s own recorded
runner-up, re-confirmed still current by this session): Wave 3J —
Adviser View dev-preview/Playwright verification debt closure. Stopping
here per the wave contract.

## Active Task (2026-08-31, this session — Wave 3H: Fresh Roadmap Survey, complete)

Planning-only wave, run from GitHub issue #6, on branch
`claude/issue-6-20260831-1042` at `HEAD` `9ff7c09` (confirmed exactly the
issue's expected checkpoint — not merely an ancestor). No product source,
Rust source, tests, dependencies, migrations, workflows, or harness
metadata touched. `main` not fetched/switched/merged.

Full record: `docs/product/WAVE-3H-DECISION.md`. Surveyed
`CLAUDE.md`/`.claude/rules/`, `docs/CURRENT-HANDOFF.md`,
`docs/ACTIVE-PLAN.md`, `docs/PROJECT-MEMORY.md`, `docs/PROGRESS-MAP.md`,
`docs/product/PRODUCT-CONTRACT.md`, `docs/VERIFICATION-DEBT.md`, ADR-0035
(the authoritative Wave 0-7 roadmap), and a direct source-code grep of
`src-tauri/src` to confirm current state rather than trust doc summaries.
Evaluated 11 candidates (the 10 the issue named plus one this survey
surfaced).

**Selected via LIKHA's priority order and the project's evidence-first
discipline**: the "password reset" candidate was previously scored low
(4.20, 2026-08-25) specifically because a safe admin-reset flow "needs
the deferred Roles & Permissions decision" — RBAC has since shipped
(ADR-0036), and a fresh grep confirms zero password-reset/change command
exists anywhere in the codebase today. The original blocker no longer
holds and the roadmap was never revisited to reflect it — exactly the
"newly discovered evidence changes the best sequence" case
`.claude/rules/autonomous-development.md` calls out.

**Recommended next slice (Wave 3I, not started)**: Admin-Assisted
Password Reset — a School Head resets a colleague's LIKHA login password
within their own school, reusing the existing `Capability::ManageSchoolMembership`
gate, Argon2id hashing, school-scoping, and audit-log patterns unchanged.
**Runner-up**: close the Adviser View dev-preview/Playwright verification
debt named in this file's prior entry below. Both Wave 5 Sync's
10-scenario decision and the raw-database backup/recovery design question
were evaluated and deliberately not selected — both are decision-shaped,
not narrow-implementation-shaped, and each needs its own dedicated
scenario-process wave first (same reasoning already applied to Sync).
Full scope/non-goals/risks/acceptance-checks for Wave 3I, current
completion-percentage and mock-pilot-readiness estimates, and the exact
recommended Wave 3I prompt are all in `docs/product/WAVE-3H-DECISION.md`
— not duplicated here.

**Verification this wave**: doc-only change; `npm run harness:verify`,
`npm run quality`, and `git diff --check` run as this wave's own gate
(see the session's final report for actual results); a changed-path
review confirms only planning/brain documents changed.

**Gate decision: WAVE 3H COMPLETE.** Per the issue's explicit
instruction, Wave 3I is not implemented here. Stopping and waiting for
the next continuation instruction.

## Active Task (2026-08-31, this session — Section Adviser Browser-Rendered Verification, complete)

Continued directly after the Wave 3E/3F/3G review debt closure below,
on `main` at `40170e7`. Full record: `docs/VERIFICATION-DEBT.md`'s new
top entry.

Closed the recommended next slice named at the end of the Integration
Review entry below: real browser-rendered Playwright verification of
the Section Adviser screen. This session's environment turned out to
have Chromium pre-installed (confirmed live, not assumed), unlike prior
sessions that recorded this as a hard blocker.

**What shipped**: `src/dev-preview/fixtures.ts` gained
`FixtureSchoolMemberRepository` and a genuinely stateful
`FixtureSectionAdvisoryRepository` (in-memory, mutated by `assign()`/
`end()` — not a read-only stub, so the full end-then-reassign cycle is
actually interactive in the fixture). `src/dev-preview/DevPreviewApp.tsx`
gained a `sections` tab (previously unwired, despite
`TeacherWorkspaceScreen`'s existing "Manage sections" button already
pointing at it — a real, if minor, pre-existing gap this closes as a
side effect) wired through to a new `section-adviser` tab rendering
the real `SectionAdviserScreen`, reached the same way production does
(Sections → "Manage adviser" button), not an artificial always-on tab.

**Verified live via Playwright** (1366×900, light + dark, Comfortable
and Guided modes, driven against `vite`'s dev server on
`dev-preview.html`): the full flow — Sections list → Manage adviser →
current-adviser state → End advisory → confirmation + empty state →
Assign adviser form → new adviser confirmed — renders correctly in
every combination checked, no console errors, no visual defects.
Screenshots sent to the user directly.

**Re-verified after the fixture change**: `npm run quality` 735/735,
typecheck/lint/format/architecture clean; `npm run build` clean;
`npm run check:dev-preview-isolation` clean (the fixture additions do
not leak into the production bundle).

**Not done this slice, deliberately deferred**: `AdviserViewScreen`
itself still has no dev-preview fixture — it needs a
`SubjectAttendanceApplicationService` fixture that doesn't exist yet in
`fixtures.ts`, a materially larger addition than Section Adviser's two
small repositories. Recorded as retained debt, not scope-crept into
this slice.

**Gate decision: SECTION ADVISER FEATURE LINE FULLY BUILT, REVIEWED,
AND VISUALLY VERIFIED.** No code-change work remains open on this
feature line. Next candidate (not started): extend the dev-preview
fixture for Adviser View itself (needs the Subject Attendance fixture
first), or begin the next macro-wave candidate named in the Integration
Review entry's evaluation (Wave 5 Sync's 10-scenario decision, Key
Stage 1 descriptive grading research, etc.) — no single one clearly
wins without a fresh evaluation pass, so none is pre-selected here.

## Active Task (2026-08-31, this session — Wave 3E/3F/3G Individual Review Debt Closure, complete)

Continued directly after the Integration Review below, on `main` at
`c34fef0`. Full record: `docs/VERIFICATION-DEBT.md`'s new top entry.

Dispatched a `security-reviewer` specifically for the three still-open
individual-wave review debts the Integration Review's own composition
check did not close: Wave 3E's owed independent review (its first
dispatch had hit the known agent-retrieval problem, self-review
substituted at the time), Wave 3F's owed independent review (same
situation), and Wave 3G (never had a dedicated review requested at
all, since it was assessed as UI-only reusing existing gates). Scoped
to `auth::authorize_adviser_of_section`, `repository::section_advisory`,
the section-advisory commands, `resolve_adviser_view_scope`/the
Adviser View overview command, and `src/ui/SectionAdviserScreen.tsx`.

**Result: no BLOCKING findings, no SHOULD-FIX findings.** The reviewer
confirmed by direct source reading: the cross-school isolation fix in
`authorize_adviser_of_section` (caught by TDD during Wave 3E) is real
and intact; `section_advisory::assign`'s "one active adviser per
section" guarantee is backed by the real unique index under this app's
single `Mutex<Connection>` serialization, not merely an app-level
pre-check racing a write; no `INSERT OR IGNORE` masking a constraint
violation; the Adviser View overview command independently
re-authorizes the selected section rather than trusting an
already-filtered picker as the boundary; and `SectionAdviserScreen.tsx`
enforces nothing client-side, showing the same form to every school
member and surfacing only a generic error on backend rejection.

This closes all review debt opened by the section-adviser feature line
(Waves 3E-3G) and the separate cross-wave composition question the
Integration Review closed below. No code changes this session — review
only.

**Gate decision: SECTION ADVISER FEATURE LINE FULLY REVIEWED.** No
outstanding review debt remains for Waves 2Z-3G. This is a wave
boundary per `.claude/rules/autonomous-development.md` (checkpoint
recorded, review debt closed, CI green on `main`) — recording the
exact next slice and stopping here rather than starting a new
open-ended macro wave without it being named first.

**Recommended next slice, not started**: close
`docs/VERIFICATION-DEBT.md`'s Wave 3F item 2 — real browser-rendered
Playwright verification of Adviser View and the new Section Adviser
Management screen (light/dark, all three teacher modes), which every
prior session recorded as blocked by Chromium being unavailable in
that environment. This session's environment has Chromium pre-installed
(confirmed via the system prompt's tooling description, not yet
verified live), so this may now be genuinely closeable rather than
still blocked — worth checking fresh before assuming the old blocker
still applies. Scope: extend `src/dev-preview/` with Adviser View and
Section Adviser fixture states (neither currently has one), then
capture/verify via Playwright the same way UX-02 through UX-04
established. Alternative candidates evaluated and set aside for now:
Wave 5 (Sync) requires its own 10-scenario cloud-target decision before
any code — a large, separate undertaking, not a quick next slice; Wave
3's macro "Authoritative-template Form Engine" scope is largely already
covered by the already-shipped Wave 2T (SF1/SF9 official-form
generation UI); Key Stage 1 descriptive grading and Grade 12 DO 8
carryover both need a fresh DepEd research pass before they're
actionable; password reset is blocked on a real product/security policy
decision (no out-of-band recovery channel exists yet).

## Active Task (2026-08-31, this session — Integration Review + Main Fast-Forward, complete)

**`main` is now the verified integration baseline at `9c1514c`**,
fast-forwarded from `d9ab036` (previous baseline) through Waves 2Z,
3A-3G — 79 commits, no merge commit, no squash, no rebase, no force
push (one small reconciliation merge was needed first, see below).

**Repository truth verified first**: `main`/`origin/main` were at
`7365180` (the `.skills` commit, one commit ahead of the prior
recorded baseline `d9ab036`), while this session's branch
(`claude/continue-working-v7xzb3`, reset onto the most-advanced
CI-verified line per the entry below) had 78 commits including its own
independent `.skills` cherry-pick, diverged from `main` at the same
`d9ab036` point — not a clean ancestor relationship. Fixed by merging
`origin/main` into the branch (`b2602fd`): since both sides' `.skills`
content was byte-identical (confirmed via `git diff origin/main --
.agents .codex AGENTS.md` returning empty), the merge produced zero
conflicts and an unchanged tree, restoring `main` as a strict ancestor
without discarding or duplicating anything.

**A real, pre-existing CI failure was found and fixed, not assumed
away**: `main`'s own `.skills` commit (`7365180`) had never been run
through `npm run quality` before landing and was failing Quality Gate
CI on `main` itself (run `33322328528`, conclusion `failure`) — 133
files under `.agents/` violated `prettier --check`. Fixed with a
formatting-only `prettier --write` pass confined entirely to
`.agents/` (product source untouched), committed as `9c1514c`.

**Cross-milestone integration delta reviewed**: automated checks
(migration chain `src-tauri/src/db/migrations.rs` — pure appends only
vs. `d9ab036`, zero lines removed; `Cargo.lock` diff is new
dependencies only — `calamine`/`aes`/`cbc`/etc. for SF1 xlsx import and
encryption, no removals/downgrades; no `LIKHA-SIS 2.0` stale naming
beyond pre-existing historical confirmations; no stray junk files) all
clean. A `security-reviewer` was dispatched for the specific
cross-milestone question this gate exists to answer (does every
`authorize_*` gate/capability added since `d9ab036` — RBAC composition
across Teaching Assignments, Schedule Meetings, Teacher Load, the Wave
3B session-expiry exemption list, Section Advisories, and Adviser
View — still compose correctly and fail closed once every wave's
commands are combined) — it completed and, after being asked to
restate its findings as plain text (the project's known
ReportFindings-retrieval issue recurred once, resolved the same way as
prior sessions), reported **no BLOCKING findings, no SHOULD-FIX
findings**.

**Pre-integration CI, actually run on the exact commit integrated**:
branch push `9c1514c` — Quality Gate (`33325361836`) and Security Gate
(`33325361859`) both green. Local `npm run quality` 735/735,
`npm run build`, `check:dev-preview-isolation`, `git diff --check` all
PASS, all actually run this session.

**Fast-forward performed** (`git checkout main && git pull --ff-only
origin main && git merge --ff-only origin/claude/continue-working-v7xzb3`)
— Git itself reported `Fast-forward`. Pushed; `origin/main` confirmed
at `9c1514c`, matching local exactly.

**`main` CI verified green on the new baseline, not assumed**: push
event runs `33326788531` (Quality Gate) and `33326788538` (Security
Gate), both `success` at `9c1514c` — this is also the run that proves
the `.skills` formatting fix actually resolved the pre-existing `main`
CI failure.

**Feature branches** (`claude/likha-sis-wave3e-...` through
`codex/likha-sis-wave3f-adviser-view`, and this session's own
`claude/continue-working-v7xzb3`) are now fully integrated into `main`.
Not deleted this milestone — retained until the user approves removal.

**Gate decision: INTEGRATION PASSED — MAIN IS THE NEW VERIFIED
BASELINE THROUGH WAVE 3G.** Independent-review debt narrows slightly
(this integration-composition question is now closed) but per-wave
review debt for 3E/3F/3G individually (a fresh reviewer dedicated to
each wave's own diff) remains open in `docs/VERIFICATION-DEBT.md`.
Recommended next milestone: see this session's evaluation below.

## Active Task (2026-08-31, this session — Wave 3G: Section Adviser Management UI, complete)

**Branch-line note, read first**: this session's designated harness
branch (`claude/continue-working-v7xzb3`) started from an old
integration checkpoint (`d9ab036` + a trivial `.skills` commit), far
behind the project's actual front line — a separate, more advanced
development line (`codex/likha-sis-wave3f-adviser-view`, Waves 2Z
through 3F) had progressed with its own CI-verified checkpoints but was
never fast-forwarded into `main`. Verified via `git log`/`git fetch`
before touching anything: `main`/`origin/main` are both still at
`d9ab036`, unaware of any wave past 3F. This session reset its own
branch onto `codex/likha-sis-wave3f-adviser-view`'s tip (`0c62884`) and
continued from there — the `.skills` commit was not reapplied (trivial,
Codex-only tooling compatibility, not product code). `main` was not
touched. **A real integration decision (fast-forwarding `main` to catch
up through Wave 3G) remains open and is not made here** — flagging it
explicitly for the next session/human decision, since it spans several
waves of work never reviewed together as one integration delta (the
same kind of review the Integration Review entry further below performed
for the prior gap).

Full record: `docs/PROJECT-MEMORY.md` Wave 3G entry;
`docs/ACTIVE-PLAN.md`'s new top section.

**Delivered**: the exact next slice Wave 3F's own report named — Section
Adviser Management UI. New TS domain/port/application/Tauri-adapter
layers for `SectionAdvisory`/`AssignAdviserOutcome`/`EndAdvisoryOutcome`
mirror Wave 2Y's Teaching Assignments pattern exactly. A new
`SectionAdviserScreen`, reached from `SectionsScreen`'s new "Manage
adviser" button, shows the current adviser with an "End advisory"
action, or an assign form once none is active — reassignment is
deliberately explicit end-then-assign, not a one-step replace,
preserving advisory history the same way `TeachingAssignmentsScreen`'s
remove-then-create already does. Wired into `App.tsx` as a new
contextual `section-adviser` tab, same pattern as `teaching-assignments`.

**Zero Rust changes, zero new authorization surface**: every command
this screen calls (`assign_section_adviser`/`end_section_adviser`/
`current_section_adviser`) already existed, already gated by
`ManageSectionAdvisories`/session-only, and already tested from Wave 3E.
This milestone is UI-only.

**Verification, all actually run this session**: `npm run quality`
**735/735** (up from 714 — 21 new tests), typecheck/lint/format/
architecture all clean; `npm run build` clean; `npm run
check:dev-preview-isolation` clean; `npx knip` unchanged from the
pre-existing baseline (zero new findings); `cargo fmt --check` clean (no
Rust files touched this session). GitHub Actions CI on this push had not
yet reported by the time this was recorded — check before trusting it
green.

**Not done this milestone**: a fresh independent security review (this
slice's own risk is low — no new authorization logic, every command
reused unchanged — but the project's general independent-review debt in
`docs/VERIFICATION-DEBT.md` is not closed by that alone).

**Gate decision: WAVE 3G COMPLETE, LOCAL VERIFICATION GREEN.** No next
milestone pre-selected — the open integration-decision flagged above
(main fast-forward through Wave 3G) is real work worth evaluating first,
per this project's own autonomous-development priority order.

## Active Task (2026-08-30 — Wave 3F: Adviser View, COMPLETE)

Wave 3F continued from Wave 3E's exact pushed checkpoint `4de3973` on
`codex/likha-sis-wave3f-adviser-view`. `main` remains untouched at
`d9ab036`. GitHub feature checkpoint:
`874a630b82bec22611584f10aa8c3a56eeebd765` (equivalent local commit
`d5ff4f3`; hashes differ because the GitHub connector created the remote
commit object).

**Delivered**: Adviser View is now a first-class Daily Teaching screen.
`list_adviser_view_sections` gives an adviser only their active advisory
section(s), while a School Head receives only their own school's
sections. `adviser_subject_attendance_overview` independently reuses
Wave 3E's `authorize_adviser_of_section` gate before returning raw
Present/Absent/Late/Excused totals across all subjects, subject names
with recorded absences, and the highest current single-subject absence
streak for each currently enrolled learner.

**Boundaries held**: no write path was broadened; no notes are disclosed;
no SF2, grade, conduct, or enrollment record is changed; picker filtering
is usability only; every trusted read is school-scoped; unrelated
teachers and cross-school School Heads fail closed. The resource-gated
command joined the Wave 3B session-expiry exemption list.

**Correctness fix**: `monitor_for_assignment` now excludes sessions and
entries after `as_of_date`. Previously the roster was date-scoped but a
future held session could still inflate counts/streaks. A dedicated
regression test proves it cannot.

**Verification**: local `npm run quality` green at **714/714** tests;
TypeScript, ESLint, Prettier, architecture, production build,
dev-preview isolation, `cargo fmt --check`, and harness **100/100** pass.
Local native compilation was blocked by missing container system
packages; local security tools were unavailable; local Playwright
browser download timed out. GitHub Security Gate `33317574476` passed
gitleaks, cargo-deny, and OSV. GitHub Quality Gate `33317574392` is
completed/success: Ubuntu ran 598 Rust lib tests plus all integration
binaries, clippy, and Playwright/axe; Windows ran 602 Rust lib tests plus
all integration binaries, clippy, and the native Tauri build. All green.

**Review**: self-review covered forged/cross-school section ids, stale
advisory dates, School-Head scope, parameterized SQL, absence of notes/
writes, session-expiry classification, and a stale UI-request race
(fixed by invalidating an in-flight overview when a date leaves no
authorized section). No blocker remained. A fresh independent security
review remains owed in `docs/VERIFICATION-DEBT.md`.

**Exact next slice (recorded, not started)**: Wave 3G — **Section Adviser
Management UI**. Wire the already-tested assign/end commands into the
School Head's Sections workflow using the existing school-member teacher
picker, effective dates, explicit end-before-reassign behavior, and all
three comfort modes. This closes the setup gap: Adviser View works once
advisories exist, but no production UI creates them yet.

## Active Task (2026-08-30 — Wave 3E: Section Advisory Foundation, COMPLETE)

Full record: `docs/adr/0056-section-advisory-foundation.md`;
`docs/PROJECT-MEMORY.md` Wave 3E entry; `docs/VERIFICATION-DEBT.md`
Wave 3E entry. **New dedicated branch**
`claude/likha-sis-wave3e-section-advisory-foundation`, created from
Wave 3D's own final, CI-confirmed checkpoint
(`00b4040d9fb856ac7621a3d848165144a64b7173`) — that branch itself was
not modified. Harness v2 stayed locked and still computes **100/100**.

**Scope chosen**: the exact next slice Wave 3D's report recorded —
Adviser View, deferred because it needs a genuinely new "adviser of a
section" authorization shape that has never existed in this codebase.
Ran the project's own established 10-scenario evaluation process
(`.claude/rules/autonomous-development.md`) to decide how to represent
and authorize that relationship, before writing any code. **This wave
is foundation only** — schema, repository, a new `Capability`, and a
new authorization gate, with zero UI and zero change to any existing
Subject Attendance code path — matching this project's own established
zero-UI-first precedent for a new domain. The actual Adviser View read
of Subject Attendance data is the next slice, not attempted here.

**Decision**: `section_advisories`, a half-open temporal interval table
mirroring `section_memberships` exactly (`starts_on`/`ends_on`
nullable, "at most one active adviser per section" enforced as a real
unique partial index). Chosen over a bare `sections.adviser_user_id`
column (the Next Best candidate) because DepEd schools reassign
advisers by school year, and a mutable column would silently lose
prior years' history the moment it's overwritten — the same reasoning
ADR-0008 already established for `section_memberships` over a bare
column on `learners`. Full 10-scenario record in ADR-0056.

**What shipped**: migration 23 (`section_advisories` table + indexes +
unique partial index); `repository::section_advisory` (`assign`/`end`/
`current_adviser_for_section`/`is_current_adviser`); a new
`Capability::ManageSectionAdvisories` (School Head only, its own
variant rather than reusing `ManageTeachingAssignments`, matching that
variant's own established reasoning); a new
`auth::authorize_adviser_of_section` gate (self-or-School-Head, mirrors
`authorize_view_teacher_load` exactly) — not yet called by any command,
ready for the next wave's Adviser View read; three new commands
(`assign_section_adviser`/`end_section_adviser`, capability-gated;
`current_section_adviser`, session-only-gated reference data, matching
`list_teaching_assignments_by_section`'s convention).

**A real cross-school isolation bug was caught by TDD before
shipping**: the first `authorize_adviser_of_section` implementation
checked the caller's role in their own school but never verified that
the `section_id` argument actually belonged to that school — a School
Head could have been incorrectly authorized against a same-shaped
section id belonging to a _different_ school. A dedicated test,
`authorize_adviser_of_section_denies_a_school_head_for_a_different_schools_section`,
caught this on first run (the exact same bug class
`authorize_view_teacher_load`'s own TDD pass caught during an earlier
wave). Fixed by resolving `section_id` against the caller's school
before authorizing via either path. Full detail in ADR-0056.

**Verification** (all run this session): `cargo test`: **594 lib
tests** (+15: 9 new `repository::section_advisory` tests, 6 new
`auth::authorize_adviser_of_section` tests) and all integration
binaries green, including 7 new command-boundary tests in
`tests/section_advisory.rs`. `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean. `npm run quality` —
705/705 vitest, unchanged (this wave is backend-only except the
`invoke.ts` exemption-list addition below). `npm run harness:verify`
still exactly 100/100, unchanged — not reopened.

**A correctness check made mid-wave, not deferred to review**: the two
new capability-gated write commands
(`assign_section_adviser`/`end_section_adviser`) were added to
`invoke.ts`'s `COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` set in the
same wave — Wave 3B's own recorded debt item #1 (no Rust-side type
split) staying open but not allowed to lapse into a live bug for these
new commands. `current_section_adviser` (session-only-gated) was
correctly left out, matching `list_teaching_assignments_by_section`'s
own precedent.

**Scope guard held**: no UI screen (deliberate, see above); no change
to any existing Subject Attendance/Teaching Assignment code path
(confirmed by `git diff --stat` on the feature commit); no seed/
migration path from prior data (correct — no prior version of this
codebase ever recorded who advised a section, so there is no history to
lose); `main` not touched; no unrelated refactor.

**Review**: an independent `security-reviewer` agent was dispatched,
scoped to this wave's new gate, repository, commands, and the
`invoke.ts` change. Its findings could not be retrieved after one
retry — the known reviewer-harness resume/retrieval problem this
project's own rules already anticipate
(`.claude/rules/autonomous-development.md`). Per that protocol, a
rigorous self-review was performed instead, confirming the cross-school
isolation fix against the dedicated failing-then-passing test described
above, the "at most one active adviser per section" invariant (proven
by a dedicated test), that a future-dated advisory is not treated as
current before it takes effect (proven), that
`section_advisory::assign`/`end` correctly reject a cross-school
`section_id`/`teacher_user_id` and scope `end` by `(id, school_id,
section_id)` together, that `current_section_adviser` discloses nothing
for an id it cannot resolve within the caller's school, and that the
two write commands were correctly added to `invoke.ts`'s exemption set.
The independent review itself remains owed — retained as
higher-priority debt in `docs/VERIFICATION-DEBT.md` (not the usual
recurring "no independent review" item; this wave actually attempted
one and the harness failed to deliver it).

**Exact next slice** (recorded, not started): the actual **Adviser
View read** — a new repository function and command reusing
`authorize_adviser_of_section` to return read-only Subject Attendance
signals across an adviser's own advisory section, per
`docs/product/SUBJECT-ATTENDANCE-SPEC.md`'s "Adviser View" screen, plus
a UI screen. This wave deliberately stopped short of that read so the
authorization foundation could be reviewed and tested as its own
focused unit. The native **NVDA/Narrator accessibility pass** remains
carried forward and genuinely infeasible in this remote Linux-container
session.

**Genuinely deferred, not a candidate for any near-term wave**:
**Official School Repository** remains blocked on external material
only the owner can supply (Microsoft 365 tenant/consent confirmation),
a genuine human-approval gate per
`.claude/rules/autonomous-development.md`. Unchanged from prior waves'
evaluation.

Note — Wave 3D (Subject Monitor) is superseded above; its own record
remains at `docs/adr/0055-subject-attendance-foundation.md` Wave 3D
addendum.

## Note (2026-08-30 — Wave 3D: Subject Monitor, COMPLETE, superseded above)

Full record: `docs/adr/0055-subject-attendance-foundation.md` Wave 3D
addendum; `docs/PROJECT-MEMORY.md` Wave 3D entry;
`docs/VERIFICATION-DEBT.md` Wave 3D entry. **New dedicated branch**
`claude/likha-sis-wave3d-subject-monitor`, created from Wave 3C's own
final, CI-confirmed checkpoint (`f7d7029864b506cb468cbc76509b2dbc99cdc4c2`)
— that branch itself was not modified. Harness v2 stayed locked and
still computes **100/100**.

**Scope chosen**: the spec's own "Subject Monitor" — deliberately split
from "Adviser View", the other half of the candidate Wave 3C's report
carried forward. Subject Monitor reuses `authorize_own_assignment`
unchanged (a reporting view over data the caller already owns, zero new
authorization design). Adviser View needs a genuinely new "adviser of a
section" relationship that does not exist anywhere in this codebase's
schema — confirmed by an exhaustive grep, including SF2's own command
file, which gates only on `require_active_school_scope` despite being
informally called "adviser-facing" in `PRODUCT-CONTRACT.md`. Adviser
View remains deferred as its own, larger, cross-cutting design question
(SF2, SF5, SF9, general RBAC) — recorded as the exact next-slice
candidate below, not attempted here.

**What shipped**: `subject_attendance::monitor_for_assignment` (Rust) —
present/absent/late/excused counts and a current consecutive-absence
streak per learner on the roster as of a requested date, scoped to one
teaching assignment. New `subject_attendance_monitor` command, gated
identically to every other command in that file. Frontend:
`SubjectAttendanceMonitor`/`SubjectAttendanceMonitorRow` domain types,
a `monitor` port/adapter/service method, and a new
`SubjectMonitorScreen` reachable directly from the Daily Teaching nav
group.

**A real correctness bug was caught by TDD before shipping**: the first
streak implementation only walked entry rows that exist for a learner
(an inner join), so a `held` session the teacher opened but never
marked for one learner was invisible to the streak instead of breaking
it — silently bridging two non-adjacent absences into a false
"consecutive" streak. A dedicated test written before the fix caught it
(expected streak `1`, got `2`). Fixed by walking every `held` session
id for the assignment and looking up each learner's entry by
`(session_id, membership_id)` — a missing entry now explicitly breaks
the streak. Full detail in the ADR-0055 Wave 3D addendum.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **705/705 vitest** (74 files; +9 net from Wave 3C's
696/696). `cargo test`: **579 lib tests** (+8, the monitor repository
tests including the streak/gap-handling case) and all integration
binaries green, including 2 new command-boundary tests in
`tests/subject_attendance.rs`. `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean, all as part of `npm
run quality:full` (exit 0). `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged — not reopened.

**Scope guard held**: no dev-preview-fixture wiring (same disclosed,
consistent gap recent waves' new UI left open); no configurable
absence-streak threshold or automatic flag — the spec explicitly defers
this as a later, separately-designed enhancement; Adviser View not
attempted (see above); `main` not touched; no unrelated refactor.

**Review**: a bounded self-review confirmed `monitor_for_assignment`'s
gap-handling fix against the dedicated failing-then-passing test, that
a transferred-out learner no longer appears (proven by a dedicated
test), and that the new command's authorization gate matches every
other Subject Attendance command exactly (`authorize_own_assignment`,
proven by a dedicated command-boundary denial test). No independent
(non-self) review was dispatched for this bounded slice — retained as
debt in `docs/VERIFICATION-DEBT.md`, consistent with the pattern recent
waves have established.

**Exact next slice** (recorded, not started): **Adviser View** — a
colleague/School Head viewing _someone else's_ Subject Attendance data.
Requires first designing an "adviser of a section" authorization shape
that has never existed in this codebase, cross-cutting SF2, SF5, SF9,
and general RBAC — real design work warranting the project's own
established 10-scenario evaluation process, not a quick implementation.
The native **NVDA/Narrator accessibility pass** remains carried forward
and genuinely infeasible in this remote Linux-container session (no
Windows machine, no screen reader available). No candidate has been
pre-selected between these two; Adviser View is real design work and
will take the time that deserves rather than being rushed alongside a
thin wiring wave.

**Genuinely deferred, not a candidate for any near-term wave**:
**Official School Repository** remains blocked on external material
only the owner can supply (Microsoft 365 tenant/consent confirmation),
a genuine human-approval gate per
`.claude/rules/autonomous-development.md`. Unchanged from prior waves'
evaluation.

Note — Wave 3C (School Head views a colleague's Teacher Load) is
superseded above; its own record remains at
`docs/adr/0039-teacher-load-class-schedule-foundation.md` Wave 3C
addendum.

## Note (2026-08-30 — Wave 3C: School Head views a colleague's Teacher Load, COMPLETE, superseded above)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`
Wave 3C addendum; `docs/PROJECT-MEMORY.md` Wave 3C entry;
`docs/VERIFICATION-DEBT.md` Wave 3C entry. **New dedicated branch**
`claude/likha-sis-wave3c-teacher-load-colleague-view`, created from
exactly `72fc3cceb14c25662b87b011e68ed9a6de3a725d` (Wave 3B's own
final, CI-confirmed checkpoint) — that branch itself was not modified.
Harness v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 3B's own final Security
Gate `33295817717` and Quality Gate `33295817715` reconfirmed
`completed/success` for the exact HEAD commit `72fc3cc` before any Wave
3C work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 3C work began.

**Scope chosen**: the original Wave 3B candidate, now safe to build —
per the owner's own standing instruction to continue directly into the
next wave with a notification at each boundary. `get_teacher_load`
already supported a School Head viewing a colleague's load
server-side; Wave 3B's fix (closing the false-positive global-logout
bug this exact path would otherwise have hit constantly) was the
blocker, not any missing backend capability.

**What shipped**: `TeacherLoadScreen` gained a "View" picker
(`list_school_members`, reused unchanged from Wave 2Y's Teaching
Assignments picker, filtered to the `teacher` role — the same
usability filter, not a new pattern). Selecting a colleague re-runs
`get_teacher_load`/`listMyAssignments` for that colleague's id; the
heading updates to "`<Name>`'s Teaching Load". The picker is hidden
only when there is no other teacher to view — a usability nicety, not
a security boundary. **Zero new backend surface**: `get_teacher_load`
and `list_teacher_assignments` already supported any authorized target
id; this wave is a pure UI extension, no Rust file touched. Security
must not rely on UI hiding, applied identically to Wave 2Y's own
precedent: every school member sees the same picker, and a Teacher
session that selects a colleague is still denied by
`auth::authorize_view_teacher_load` exactly as before — now surfaced
as this screen's own specific message ("Could not load this teacher's
load — you may not have permission to view it.") instead of Wave 3B's
now-fixed false-positive logout.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **696/696 vitest** (73 files; +4 net: the existing 5
`TeacherLoadScreen` tests extended to 9, covering the picker's
presence/absence, switching to a colleague with the heading updating,
and the permission-denial message on a refused view). **Zero Rust
files touched this wave** — confirmed by `git status`; `cargo test`
reconfirmed 571/571 unchanged as part of `npm run quality:full`. `npm
run build` + `check:dev-preview-isolation` pass. `npm run
quality:security` clean, no new dependency. `npm run harness:verify`
still exactly 100/100, unchanged — not reopened. `npm run
quality:full` green end to end, exit code 0.

**Scope guard held**: no dev-preview-fixture wiring (same disclosed,
consistent gap as Waves 2U/2W/2X/2Y/2Z); no overload-threshold
warning/enforcement (ADR-0039's own long-standing non-goal); zero
change to any prior wave's backend code, and the only UI change beyond
`TeacherLoadScreen` itself is threading the already-composed
`schoolMemberService` through as one more prop; `main` not touched; no
unrelated refactor.

**Review**: a bounded self-review confirmed the picker filters to the
`teacher` role only (a School Head or Registrar in the member list is
never offered as a load target, proven by a dedicated test), that the
picker correctly hides itself when the signed-in teacher is the
school's only teacher (proven), that switching the selection actually
re-fetches both the load and the assignment list for the new target
id rather than only one of them (proven), and that a refused colleague
view shows the screen's own specific denial message rather than any
generic fallback (proven). No independent (non-self) review was
dispatched for this bounded UI slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with the pattern recent waves
have established.

**Exact next slice** (recorded, not started): Subject Monitor /
Adviser View (Subject Attendance's own later spec steps — the last
major deferred piece of that domain; note ADR-0055's own Wave 2V
addendum flagged this as needing a genuinely new authorization shape,
real design work rather than a thin wiring wave); or the native
NVDA/Narrator pass. No candidate pre-selected. Per the owner's own
standing instruction this session, work continues directly into the
next wave without a separate stop-and-wait — a notification is sent at
each wave boundary instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply —
unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-30 — Wave 3B: Session-Expiry False-Positive Fix, COMPLETE, superseded above)

Full record: `docs/adr/0022-global-session-expiry-handling.md` Wave 3B
addendum; `docs/PROJECT-MEMORY.md` Wave 3B entry;
`docs/VERIFICATION-DEBT.md` Wave 3B entry. **New dedicated branch**
`claude/likha-sis-wave3b-session-expiry-fix`, created from exactly
`e465a4282c4ff23f7498614c40793336fadeb570` (Wave 3A's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 3A's own final Security
Gate `33284814035` and Quality Gate `33284814060` reconfirmed
`completed/success` for the exact HEAD commit `e465a42` before any Wave
3B work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 3B work began.

**Scope chosen — a foundational defect discovered while designing the
next feature, fixed before it, per this project's own standing
instruction to prefer repairing the foundation over building on top of
it.** While planning Wave 3B's original candidate (School Head views a
colleague's teaching load), inspecting `authorize_view_teacher_load`
and `src/infrastructure/tauri/invoke.ts` together surfaced a real,
already-shipped bug: `AppError::Unauthorized` serializes identically
whether a session is genuinely invalid or merely lacks permission for
one specific action, and the frontend's session-expiry wrapper
(ADR-0022) could not tell the two apart. Every `Capability`-gated
write, every `authorize_view_teacher_load`-gated read, and every
`authorize_own_assignment`-gated Subject Attendance command (31 in
total) was silently forcing a global "session expired, please sign in
again" logout on an ordinary permission denial — not just the
about-to-be-built colleague's-load feature, but already-shipped
Sections, Learners, SF1 Import, Teaching Assignments, and Class
Schedule writes too.

**What shipped**: `src/infrastructure/tauri/invoke.ts`'s
`COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING` set, previously
containing only `"login"`, extended to all 31 commands gated by
`Capability`, `authorize_view_teacher_load`, or
`authorize_own_assignment` — enumerated explicitly by grepping every
`commands::*` file for these three gate functions, cross-checked
against every `pub fn authorize_*` in `auth/mod.rs` to confirm
completeness. A command gated only by `require_active_session`/
`require_active_school_scope` (no additional permission check) is
deliberately **not** exempted, since its `Unauthorized` really can
only mean the session itself is invalid. **This is not a security
loosening** — no `authorize_*` gate in Rust changed; every command
still refuses exactly the same callers it always did. The fix only
changes which frontend mechanism reports that refusal: a local,
in-screen message instead of an unrelated global logout. A genuinely
expired session is still caught promptly, since almost every screen
also calls at least one non-exempted, session-only-gated read in the
same load cycle.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **692/692 vitest** (73 files; +6: a parameterized test
proving 5 representative newly-exempted commands across all three gate
shapes no longer notify the global listener, plus one proving a
session-only-gated command still does). **Zero Rust files touched** —
confirmed by `git status`; no `authorize_*` function or any command's
gate changed; `cargo test` reconfirmed 571/571 unchanged as part of
`npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged — not reopened. `npm run quality:full` green end to end,
exit code 0.

**Scope guard held**: the deeper architectural fix (a Rust-side
`Forbidden` error variant distinct from `Unauthorized`, letting this
distinction be made once at the type level instead of an enumerated
frontend list every future gated command must remember to join) was
deliberately **not** attempted — it touches every `authorize_*` call
site and the error serialization contract, properly requiring the
independent security review `.claude/rules/security-privacy.md` calls
for on auth-touching milestones, and is out of proportion to a
bounded, foundation-repair wave. Recorded as debt, not silently
dropped. Zero change to any prior wave's backend or UI code beyond
`invoke.ts` and its own test file; `main` not touched; no unrelated
refactor.

**Review**: a bounded self-review confirmed the enumerated command
list is complete (cross-checked two independent ways: grepping every
`commands::*` file for the three gate-function names, and separately
listing every `pub fn authorize_*` in `auth/mod.rs` to confirm no
fourth gate shape was missed), that a representative command from each
of the three gate shapes is covered by a test, and that the one
session-only-gated command used as the negative-control test
(`list_teaching_assignments_by_section`) genuinely has no capability
or ownership gate (confirmed by re-reading its command body). No
independent (non-self) review was dispatched — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with the pattern recent waves
have established, and explicitly not a substitute for the deferred
Rust-side fix's own future independent review.

**Exact next slice** (recorded, not started): the School-Head-views-a-
colleague's-load extension to Teacher Load — Wave 3B's own original
candidate, now safe to build without inheriting this false-positive
logout; Subject Monitor / Adviser View; or the native NVDA/Narrator
pass. No candidate pre-selected. Per the owner's own standing
instruction this session, work continues directly into the next wave
without a separate stop-and-wait — a notification is sent at each wave
boundary instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply —
unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-30 — Wave 3A: Teacher Load, COMPLETE, superseded above)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`
Wave 3A addendum; `docs/PROJECT-MEMORY.md` Wave 3A entry;
`docs/VERIFICATION-DEBT.md` Wave 3A entry. **New dedicated branch**
`claude/likha-sis-wave3a-teacher-load`, created from exactly
`62c58e06a6a9467d5ea39a42f9595b733b2bba07` (Wave 2Z's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2Z's own final Security
Gate `33267923807` and Quality Gate `33267923872` reconfirmed
`completed/success` for the exact HEAD commit `62c58e0` before any Wave
3A work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 3A work began.

**Scope chosen**: the top recorded candidate at the end of Wave 2Z —
Teacher Load, per the owner's own standing instruction to continue
directly into the next wave with a notification at each boundary.
`get_teacher_load`'s three derived numbers were designed and
implemented at ADR-0039's original milestone but had nothing real to
compute from until Teaching Assignments (2Y) and Class Schedule (2Z)
existed — this closes the Teacher Load/Class Schedule track's last
remaining unbuilt read surface.

**What shipped**: one new screen, `TeacherLoadScreen.tsx` — a teacher
views their own derived load (assignment count, distinct subjects,
weekly instructional time formatted as "Xh Ym") plus the list of
assignments counted toward it, reusing the already-built
`SubjectAttendanceApplicationService.listMyAssignments` rather than
inventing a second "my assignments" read. Reachable as a normal
top-level "My Teaching Load" nav tab — unlike every Wave 2Y/2Z screen,
this one needs no contextual handoff, since a teacher always views
their own load with nothing to select first. **Zero new backend
surface**: `get_teacher_load` already existed, already gated
(`auth::authorize_view_teacher_load`, self-or-School-Head), already
unit-tested since ADR-0039's original milestone — this wave adds no
Rust code at all. Deliberately **self-view only**: the screen is given
the signed-in teacher's own `session.userId`, never a client-supplied
target id, so there is no new surface for a Teacher to probe a
colleague's load; a School Head viewing a colleague's load is a
deferred candidate.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **686/686 vitest** (73 files; +8: 1 more
`TeachingAssignmentRepository` adapter test, 2
`TeachingAssignmentApplicationService.getLoad` tests, 5
`TeacherLoadScreen` tests incl. 1 axe accessibility pass and a
retryable-error case). **Zero Rust files touched this wave** —
confirmed by `git status`; `cargo test` reconfirmed 571/571 unchanged
as part of `npm run quality:full`. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged — not reopened. `npm run quality:full` green end to end,
exit code 0.

**Scope guard held**: no School-Head-views-a-colleague's-load UI
(deferred); no dev-preview-fixture wiring (same disclosed, consistent
gap as Waves 2U/2W/2X/2Y/2Z); no overload-threshold warning/
enforcement (ADR-0039's own long-standing, deliberate non-goal —
whether to warn or block on RA 4670's 6-hour/day threshold remains an
unanswered product-policy question); zero change to any prior wave's
backend or UI code beyond the new `TeacherLoadScreen` and its
`getLoad` passthrough; `main` not touched; no unrelated refactor.

**Review**: a bounded self-review confirmed the screen never accepts a
client-supplied teacher id (always `session.userId`, matching every
other self-scoped screen's convention), that the three numbers are
displayed separately rather than combined into one score (matching
PRODUCT-CONTRACT §6's explicit requirement, unchanged since ADR-0039),
and that `formatMinutes`'s zero/hour-only/minute-only branches are
each covered by a dedicated test. No independent (non-self) review was
dispatched for this bounded UI slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with the same retained-debt
pattern Waves 2V/2W/2X/2Y/2Z already established.

**Exact next slice** (recorded, not started): Subject Monitor /
Adviser View (Subject Attendance's own later spec steps — the last
major deferred piece of that domain); the School-Head-views-a-
colleague's-load extension to Teacher Load; or the native
NVDA/Narrator pass. No candidate pre-selected. Per the owner's own
standing instruction this session, work continues directly into the
next wave without a separate stop-and-wait — a notification is sent at
each wave boundary instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply —
unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-29 — Wave 2Z: Class Schedule, COMPLETE, superseded above)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`
Wave 2Z addendum; `docs/PROJECT-MEMORY.md` Wave 2Z entry;
`docs/VERIFICATION-DEBT.md` Wave 2Z entry. **New dedicated branch**
`claude/likha-sis-wave2z-class-schedule`, created from exactly
`cbc3f746a9ece8541d259dfbd565b52f22a9df9b` (Wave 2Y's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2Y's own final Security
Gate `33265788114` and Quality Gate `33265788109` reconfirmed
`completed/success` for the exact HEAD commit `cbc3f74` before any Wave
2Z work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 2Z work began.

**Scope chosen**: the top recorded candidate at the end of Wave 2Y —
Class Schedule, per the owner's own standing instruction to continue
directly into the next wave with a notification at each boundary.
Assignments could be created (Wave 2Y) but not scheduled; this also
lets the Wave 2X weekday convention finally be verified end-to-end
against a real write path, closing that wave's own recorded
verification debt.

**What shipped**: one new screen, `ScheduleMeetingsScreen.tsx` — a
School Head schedules/unschedules one class's weekly meeting times
(weekday, start/end time, optional room), reached from
`TeachingAssignmentsScreen`'s new "Manage schedule" per-row action.
Wires `create_schedule_meeting`/`list_schedule_meetings_by_assignment`
(existed since ADR-0039, never reachable from any screen, and — like
Wave 2Y's own commands — had **zero test coverage at the command
boundary** before this wave). New backend surface:
`remove_schedule_meeting` + `repository::schedule_meeting::remove`,
since no removal function existed for schedule meetings at all. The
weekday picker's options come from one new exported constant,
`WEEKDAY_LABELS`, so the 0=Sunday convention is never hand-duplicated.
`CreateMeetingOutcome`'s eight typed variants (designed at ADR-0039's
original milestone but never consumed past the repository layer) now
reach the UI unchanged via a mirrored TS discriminated union, and
`ScheduleMeetingsScreen` shows a distinct message per conflict type
(teacher/section/room double-booking, an exact duplicate, an invalid
weekday/time).

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **678/678 vitest** (72 files; +20: 3 more
`TeachingAssignmentRepository` adapter tests, 8
`TeachingAssignmentApplicationService` tests for
`listMeetings`/`createMeeting`/`removeMeeting` incl. weekday/time
validation, 8 `ScheduleMeetingsScreen` tests incl. 2 axe accessibility
passes, 1 more `TeachingAssignmentsScreen` test). `cargo test`: **571
lib tests** (+3: `schedule_meeting::remove`'s own unit tests) plus a new
`tests/schedule_meeting_management.rs` (9/9 — closing the second
pre-existing command-boundary test gap this program has found) — zero
regression to any existing suite. `cargo fmt --check` / `cargo clippy
--all-targets -- -D warnings` clean. `npm run build` +
`check:dev-preview-isolation` pass. `npm run quality:security` clean,
no new dependency. `npm run harness:verify` still exactly 100/100,
unchanged — not reopened. `npm run quality:full` green end to end,
exit code 0.

**Scope guard held**: no dev-preview-fixture wiring (same disclosed,
consistent gap as Waves 2U/2W/2X/2Y); no `get_teacher_load` view; no
one-off exceptional-date schedule overrides (ADR-0039's own long-
standing non-goal); zero change to any prior wave's backend or UI code
beyond the new `remove_schedule_meeting` surface and the
`TeachingAssignmentsScreen` handoff addition; `main` not touched; no
unrelated refactor.

**Review**: a bounded self-review confirmed `remove_schedule_meeting`
never deletes a different school's meeting (proven), that a Teacher is
denied on both create and remove while a teacher can list their own
schedule but not a colleague's and a School Head can list any teacher's
(all proven at the command boundary — the narrower rule
`list_schedule_meetings_by_assignment` actually uses, distinct from
Wave 2Y's open reference-data rule for assignments), that a duplicate
meeting returns the typed `Duplicate` outcome at the command boundary
(not just the repository layer, proven), and that
`ScheduleMeetingsScreen`'s conflict-message mapping actually covers all
eight `CreateMeetingOutcome` variants. No independent (non-self) review
was dispatched for this bounded UI slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with the same retained-debt
pattern Waves 2V/2W/2X/2Y already established.

**Exact next slice** (recorded, not started): `get_teacher_load` (the
derived-load view — the three independent numbers ADR-0039 already
computes but no screen shows); Subject Monitor / Adviser View (Subject
Attendance's own later spec steps); or the native NVDA/Narrator pass.
No candidate pre-selected. Per the owner's own standing instruction
this session, work continues directly into the next wave without a
separate stop-and-wait — a notification is sent at each wave boundary
instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply —
unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-29 — Wave 2Y: Teaching Assignments, COMPLETE, superseded above)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`
Wave 2Y addendum; `docs/PROJECT-MEMORY.md` Wave 2Y entry;
`docs/VERIFICATION-DEBT.md` Wave 2Y entry. **New dedicated branch**
`claude/likha-sis-wave2y-teaching-assignments`, created from exactly
`361a2ba4ebe45af51f94d9761721a8564c8e689b` (Wave 2X's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2X's own final Security
Gate `33257720197` and Quality Gate `33257720189` reconfirmed
`completed/success` for the exact HEAD commit `361a2ba` before any Wave
2Y work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 2Y work began.

**Scope chosen**: the highest-priority viable candidate recorded at the
end of Wave 2X — Teaching Assignments management, per the owner's own
standing instruction to continue directly into the next wave with a
notification at each boundary. Without this, Subject Attendance (2V)
and Today's Classes (2X) were only usable against dev-fixture/test
data — no real school could create the `teaching_assignments` rows
those screens depend on.

**What shipped**: one new screen, `TeachingAssignmentsScreen.tsx` — a
School Head assigns/unassigns which teacher teaches which subject for
a section, reached from `SectionsScreen`'s new "Manage assignments"
action (mirroring the existing "Open roster" handoff exactly). Wires
three commands that existed since Teacher Load/Class Schedule
Foundation (ADR-0039) but had never been reachable from any screen —
`create_teaching_assignment`, `remove_teaching_assignment`,
`list_teaching_assignments_by_section` — and had **zero test coverage
at the command boundary** before this wave (only the underlying
repository functions were unit-tested, bypassing the
`ManageTeachingAssignments` authorization gate entirely). New backend
surface: `list_school_members` (+ `repository::user::list_members_in_school`),
since no command anywhere previously enumerated a school's own members
— needed so the teacher picker has something to pick from. Gated the
same "reference data any authenticated school member may read" way as
`list_teaching_assignments_by_section`. The picker filters to members
holding the `teacher` role client-side; the backend's own `create`
stays intentionally not role-gated (an existing, unchanged ADR-0039
decision) — the UI filter is a usability guard, not a security
boundary. Reassignment is the explicit remove-then-create ADR-0039
always intended, not a new "replace" flow.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **658/658 vitest** (71 files; +21: `SchoolMemberRepository`
adapter + `SchoolMemberApplicationService` tests, 4 more
`TeachingAssignmentRepository` adapter tests, 6
`TeachingAssignmentApplicationService` tests, 8
`TeachingAssignmentsScreen` tests incl. 2 axe passes, 1 more
`SectionsScreen` test). `cargo test`: **568 lib tests** (+4:
`list_members_in_school`'s own unit tests) plus a new
`tests/teaching_assignment_management.rs` (9/9 — closing the pre-
existing command-boundary test gap) — zero regression to any existing
suite. `cargo fmt --check` / `cargo clippy --all-targets -- -D
warnings` clean. `npm run build` + `check:dev-preview-isolation` pass.
`npm run quality:security` clean, no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged — not reopened. `npm
run quality:full` green end to end, exit code 0.

**Scope guard held**: no dev-preview-fixture wiring (same disclosed,
consistent gap as Waves 2U/2W/2X); no `replace_teacher_assignment`
wiring (explicit remove-then-create is ADR-0039's own intended shape,
not a gap); no schedule-meeting create/edit UI; no teacher-load view;
zero change to any prior wave's backend or UI code beyond the new,
narrowly-typed `list_school_members` surface and the `SectionsScreen`
handoff addition; `main` not touched; no unrelated refactor.

**Review**: a bounded self-review confirmed `list_school_members` never
leaks a different school's members (proven by dedicated test), that a
Teacher session is denied on both create and remove while any school
member can list (proven), that a duplicate `(section_id, subject_id)`
assignment is rejected by the schema's own constraint (proven), and
that the teacher picker's client-side role filter is correctly
documented as a usability guard, not the security boundary (the
backend gate is). No independent (non-self) review was dispatched for
this bounded UI slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with the same retained-debt
pattern Waves 2V/2W/2X already established.

**Exact next slice** (recorded, not started): `create_schedule_meeting`
(the weekly schedule builder — now that assignments can actually be
created, a real school needs to schedule them next, and this also lets
the Wave 2X weekday convention finally be verified end-to-end against a
real schedule-creation UI); `get_teacher_load` (the derived-load view);
Subject Monitor / Adviser View (Subject Attendance's own later steps);
or the native NVDA/Narrator pass. No candidate pre-selected. Per the
owner's own standing instruction this session, work continues directly
into the next wave without a separate stop-and-wait — a notification is
sent at each wave boundary instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply —
unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-29 — Wave 2X: Today's Classes, COMPLETE, superseded above)

Full record: `docs/adr/0055-subject-attendance-foundation.md` Wave 2X
addendum; `docs/PROJECT-MEMORY.md` Wave 2X entry;
`docs/VERIFICATION-DEBT.md` Wave 2X entry. **New dedicated branch**
`claude/likha-sis-wave2x-todays-classes`, created from exactly
`bde802f6abf25aaaae41c3df0cee211e9460b5d6` (Wave 2W's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2W's own final Security
Gate `33252525215` and Quality Gate `33252525239` reconfirmed
`completed/success` for the exact HEAD commit `bde802f` before any Wave
2X work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 2X work began.

**Scope chosen**: the natural next slice recorded at the end of Wave
2W — Today's Classes, which gives the "not checked" state Subject
Attendance already relies on its first real UI purpose, per the
owner's own standing instruction to continue directly into the next
wave with a notification at each boundary rather than a stop-and-wait.

**What shipped**: one new screen, `TodaysClassesScreen.tsx` — the
spec's own "Today's Classes" main screen — listing every class the
signed-in teacher meets today, in schedule order, with each one's
Subject Attendance status (Not checked / Checked / No class) and a
"Check attendance" action that hands off to `SubjectAttendanceScreen`
with that class preselected (today's date is already
`SubjectAttendanceScreen`'s own default). No new backend command: the
screen reuses the existing `list_schedule_meetings_by_assignment` and
`list_subject_attendance_sessions` commands, computing "does this class
meet today, and has it been checked" entirely client-side.

**A real correctness question surfaced and was resolved before writing
any UI code**: `schedule_meetings.weekday` has never had a documented
calendar meaning anywhere in this codebase (confirmed by an exhaustive
search of the Rust source, its migration tests, and ADR-0039, none of
which assign a specific day to any of its six values). This screen is
the first code to read the column outside its own table, and needed a
real interpretation to compare against JavaScript's `Date.getDay()`.
Established, not assumed, and documented at its single point of use
(`src/domain/schedule-meeting.ts`) and in the ADR-0055 Wave 2X
addendum: **0 = Sunday … 6 = Saturday**, matching `Date.getDay()`
exactly — binding for any future schedule-creation UI.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **637/637 vitest** (+12: 2 new
`SubjectAttendanceApplicationService.listMeetings` tests, 1 new
`TauriTeachingAssignmentRepository.listMeetings` adapter test, 1 new
`SubjectAttendanceScreen` `initialAssignmentId` test, 8
`TodaysClassesScreen` tests including 2 axe accessibility passes).
**Zero Rust files touched this wave** — confirmed by `git status`;
`cargo test` reconfirmed 564/564 unchanged, `cargo fmt --check` /
`cargo clippy --all-targets -- -D warnings` clean, all as part of `npm
run quality:full`. `npm run build` + `check:dev-preview-isolation`
pass. `npm run quality:security` clean (gitleaks + `cargo deny check` +
OSV-Scanner), no new dependency. `npm run harness:verify` still exactly
100/100, unchanged — not reopened. `npm run quality:full` green end to
end, exit code 0.

**Scope guard held**: no dev-preview-fixture wiring (same disclosed,
consistent gap as Waves 2U and 2W); no change to
`TeacherWorkspaceScreen` to add a Today's Classes entry point (left for
a future wave once the daily-teaching entry-point flow is reconsidered
together, not as an ad hoc add); no Subject Monitor/Adviser View; zero
change to any Wave 2V/2W backend or UI code beyond the two new,
narrowly-typed reuse points (`listMeetings`, `initialAssignmentId`);
`main` not touched; no unrelated refactor.

**Review**: a bounded self-review confirmed the weekday-convention
decision is documented at its point of use and in the ADR (not merely
assumed), that `listMeetings` reuses an existing, already-authorized
command rather than adding new authorization surface, that the
today's-occurrence computation correctly excludes meetings on other
weekdays (proven by a dedicated test using two different assignments
and a meeting deliberately on a different day), and that the
`initialAssignmentId` handoff is verified against the loaded assignment
list before use, mirroring `AttendanceScreen`'s own established
pattern. No independent (non-self) review was dispatched for this
bounded UI slice — retained as debt in `docs/VERIFICATION-DEBT.md`,
consistent with several recent waves' own retained-debt pattern.

**Exact next slice** (recorded, not started): the carried Teaching
Assignment/Class Schedule UI (the remaining unwired commands for
creating/editing assignments and schedule meetings themselves); Subject
Monitor / Adviser View (the spec's own later steps); or the native
NVDA/Narrator pass. No candidate pre-selected. Per the owner's own
standing instruction this session, work continues directly into the
next wave without a separate stop-and-wait — a notification is sent at
each wave boundary instead.

**Genuinely deferred, not a candidate**: Official School Repository
remains blocked on external material only the owner can supply
(confirming an organization-managed Microsoft 365 tenant, who can grant
Graph/site consent) — unchanged from Wave 2V's own evaluation.

## Note — Active Task (2026-08-29 — Wave 2W: Subject Attendance first UI increment, COMPLETE, superseded above)

Full record: `docs/adr/0055-subject-attendance-foundation.md` Wave 2W
addendum; `docs/PROJECT-MEMORY.md` Wave 2W entry;
`docs/VERIFICATION-DEBT.md` Wave 2W entry. **New dedicated branch**
`claude/likha-sis-wave2w-subject-attendance-ui`, created from exactly
`4a7629e38dff2bcc0feabf5a04d6c7b414032038` (Wave 2V's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2V's own final Security
Gate `33244243900` and Quality Gate `33244243895` reconfirmed
`completed/success` for the exact HEAD commit `4a7629e` before any Wave
2W work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 2W work began.

**Scope chosen**: the natural next slice recorded at the end of Wave
2V — a scoped first UI increment for Subject Attendance, per the
owner's own standing instruction to continue directly into the next
wave with a notification at each boundary rather than a stop-and-wait.

**What shipped**: one new screen, `SubjectAttendanceScreen.tsx`,
covering the spec's own recommended-order steps 3-4 (local/offline
session creation + the Attendance Check screen) in one slice, since a
session must exist before there's a roster to check. A teacher picks
one of their own teaching assignments and a date; the screen calls the
existing, non-mutating `list_subject_attendance_sessions` command
first — **never** eagerly opening a session just from browsing to a
date, which would have silently converted every visited date into
"checked" and destroyed the "not checked" (no row) signal a future
Today's Classes list needs to stay meaningful. If no session exists yet
for that date, two explicit teacher-initiated actions appear ("Check
attendance" opens a `Held` session; "No class today" marks `NoClass`);
if one already exists, the roster (or the no-class message) shows
directly. Zero backend change was needed for this design — the session-
existence check reuses a Wave 2V command unchanged. Roster/mark/mark-
all-present interaction directly mirrors `AttendanceScreen.tsx`'s
existing, already-proven pattern (per-learner write-generation guard
against out-of-order responses, `role="group"` status-button clusters,
the same "Mark all present never overwrites" copy/disabled-state logic)
— no new interaction pattern was invented. A new narrow
`TeachingAssignmentRepository` port (one method, `listMine`) reuses the
already-built, already-tested `list_teacher_assignments` command from
Teacher Load/Class Schedule Foundation — this is explicitly not the
still-deferred full Teaching Assignment/Class Schedule UI, only enough
for a teacher to pick which of their own classes they're checking.

**Verification** (all run this session): `npx tsc -b --noEmit`/`eslint
.`/`prettier --check .`/`check:architecture` all clean. `npm run
quality` — **625/625 vitest** (66 files; +25: 8
`SubjectAttendanceApplicationService`, 6
`TauriSubjectAttendanceRepository` adapter, 1
`TauriTeachingAssignmentRepository` adapter, 9
`SubjectAttendanceScreen` including 2 new axe accessibility passes for
the not-checked-yet state and a populated roster). **Zero Rust files
touched this wave** — confirmed by `git status`; `cargo test`
reconfirmed 564/564 unchanged as part of `npm run quality:full`. `npm
run build` + `check:dev-preview-isolation` pass. `npm run
quality:security` clean, no new dependency. `npm run harness:verify`
still exactly 100/100, unchanged — not reopened. `npm run quality:full`
green end to end, exit code 0.

**Scope guard held**: no dev-preview-fixture wiring (no real browser-
rendered screenshot coverage this wave — jsdom + axe-core only, the
same disclosed gap Wave 2U's own new UI left open, judged an
acceptable, consistent tradeoff rather than expanding this wave's scope
further); no Today's Classes list; no Subject Monitor/Adviser View; no
amendment/audit-trail UI beyond what the backend's existing upsert
already supports; zero change to any Wave 2V backend code; `main` not
touched; no unrelated refactor.

**Review**: a bounded self-review confirmed the session-existence-check
design (no eager session creation from browsing), that
`TeachingAssignmentRepository` correctly reuses an existing, already-
authorized command rather than adding new authorization surface, and
that the mark/mark-all-present logic correctly mirrors
`AttendanceScreen.tsx`'s proven guards. No independent (non-self) review
was dispatched for this bounded UI slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with several recent waves' own
retained-debt pattern.

**Exact next slice** (recorded, not started): Today's Classes (a
schedule-driven list of a teacher's own classes across dates, which
would give the "not checked" state built into this wave its first real
UI purpose); the carried Teaching Assignment/Class Schedule UI (7
unwired commands); or the native NVDA/Narrator pass. No candidate
pre-selected. Per the owner's own standing instruction this session,
work continues directly into the next wave without a separate
stop-and-wait — a notification is sent at each wave boundary instead.

## Note — Active Task (2026-08-29 — Wave 2V: Subject Attendance Foundation, COMPLETE, superseded above)

Full record: `docs/adr/0055-subject-attendance-foundation.md`;
`docs/product/SUBJECT-ATTENDANCE-SPEC.md`;
`docs/product/OFFICIAL-SCHOOL-REPOSITORY-SPEC.md`;
`docs/PROJECT-MEMORY.md` Wave 2V entry; `docs/VERIFICATION-DEBT.md` Wave
2V entry. **New dedicated branch**
`claude/likha-sis-wave2v-subject-attendance-foundation`, created from
exactly `647ba0932b2043757cd71e599fb000a7e8dfd2ec` (Wave 2U's own final,
CI-confirmed checkpoint) — that branch itself was not modified. Harness
v2 stayed locked and still computes **100/100**.

**Owner-directed, not autonomously selected**: mid-session the owner
supplied two full product specifications (Subject Attendance, Official
School Repository) and explicitly directed continued autonomous work
across waves, with a notification at the end of each wave boundary
rather than a stop-and-wait, since their separate research assistant's
own usage was exhausted. Both specs were recorded into
`docs/product/` and pointed to from `docs/product/PRODUCT-CONTRACT.md`
§16.5.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Wave 2U's own final Security
Gate `33241731694` and Quality Gate `33241731693` reconfirmed
`completed/success` for the exact HEAD commit `647ba09` before any Wave
2V work began. `npm run harness:verify` reconfirmed exactly 100/100,
certified, before any Wave 2V work began.

**Candidate chosen from the two owner-supplied specs**: Subject
Attendance, not Official School Repository. Official School Repository
requires external material only the school/owner can supply
(confirming an organization-managed Microsoft 365 tenant, who can grant
Graph/site consent) before any implementation is safe to begin, per
`.claude/rules/autonomous-development.md`'s external-material approval
gate — recorded, not started. Subject Attendance needs no such material
and reuses foundations LIKHA already has (Section Roster, enrollment
history, Teaching Assignments, the existing authorization patterns).

**What shipped**: a session-centered schema (migration 22:
`subject_attendance_sessions` + `subject_attendance_entries`,
deliberately not columns on `attendance_records` — Subject Attendance
must never be able to become SF2 by sharing storage) and
`repository::subject_attendance`: `open_or_get_session`/`mark_no_class`
(idempotent via `INSERT ... ON CONFLICT DO NOTHING`, a retry never
creates a duplicate session), `record_entry` (a typed
`RecordEntryOutcome` — `Recorded`/`SessionNotFound`/`SessionIsNoClass`/
`MembershipNotInSession` — refuses a `NoClass` session or a membership
belonging to a different section rather than silently accepting one),
`mark_all_present` (reuses the `attendance::bulk_mark_present`
"never overwrite an existing mark" idiom), and `roster_for_session`
(reuses `section_membership::current_roster` unchanged — no second,
competing roster query). New authorization gate
`subject_attendance::authorize_own_assignment` — deliberately not a
`Capability` match arm, since whether a write is authorized depends on
_which_ teaching assignment is targeted, the same shape
`auth::authorize_view_teacher_load`'s "self" branch already uses. Six
new Tauri commands in `commands::subject_attendance`, every one gated
on this same rule; where a command also takes a `session_id`, the
resolved session's own `teaching_assignment_id` is cross-checked against
the caller-supplied one so a caller cannot pair an assignment they own
with a `session_id` belonging to a different one.

**Verification** (all run this session): `cargo test` — **564 lib**
(+18, up from 546: 14 new `repository::subject_attendance` unit tests +
4 new migration tests) + all integration binaries green, including new
`tests/subject_attendance.rs` **7/7** (own-assignment success; a
different teacher denied; no session denied; cross-teacher entry-write
denied; `mark_all_present` never overwrites an existing mark; a
cross-school session listing denied; re-opening an existing session is
idempotent, not a duplicate) — zero regression to any existing suite.
`cargo fmt --check`/`cargo clippy --all-targets -- -D warnings` clean.
`npm run quality` — **600/600 vitest**, unchanged (this wave is
Rust-only; zero frontend files touched, confirmed by `git status`).
`npm run quality:security` (gitleaks/cargo-deny/OSV) clean, no new
dependency. `npm run harness:verify` still exactly 100/100,
unchanged — not reopened. `npm run build` + `check:dev-preview-isolation`
pass (unaffected, no frontend change).

**Scope guard held**: no UI was built this wave (matches this project's
established zero-UI-first precedent for a new domain — RBAC,
Curriculum, Teacher Load, and Wave 2A all shipped their first increment
this same way); no adviser/School-Head read access to another teacher's
Subject Attendance records (the spec's own "Adviser View" is a later
implementation-order step, not this wave's); no amendment/audit-trail
beyond basic actor/timestamp columns; no sync/offline-conflict handling
(no cloud sync exists anywhere in this codebase yet to test one
against); zero change to `attendance_records`, `AttendanceStatus`, SF2
export, or any existing attendance code path — confirmed by `git diff
--stat` touching only new files plus three registration lines.

**Review**: a bounded self-review covered the two schema-level
uniqueness invariants (proven by migration tests: a second session for
the same assignment+date is rejected; a second entry for the same
learner in one session is rejected), own-assignment authorization
denial for a different teacher (proven), school-scoping on every
read/list function (proven — a different school never sees another
school's sessions), the `NoClass`-session write refusal (proven), and
the cross-section/not-yet-enrolled membership refusal (both proven with
dedicated tests). No independent (non-self) review was dispatched for
this bounded foundation slice — retained as debt in
`docs/VERIFICATION-DEBT.md`, consistent with several recent waves' own
retained-debt pattern.

**Exact next slice** (recorded, not started): a scoped first UI
increment (Today's Classes + Attendance Check screens, per the spec's
own recommended implementation order steps 3-4); the Teaching
Assignment/Class Schedule UI carried from Wave 2T/2U (7 unwired
commands); or the native NVDA/Narrator pass. No candidate pre-selected.
Per the owner's own standing instruction this session, work continues
directly into the next wave without a separate stop-and-wait — a
notification is sent at each wave boundary instead.

## Note — Active Task (2026-08-29 — Wave 2U: Create Learner duplicate-candidate warning, COMPLETE, superseded above)

Full record: `docs/adr/0042-*` Wave 2U addendum; `docs/PROJECT-MEMORY.md`
Wave 2U entry; `docs/ACTIVE-PLAN.md` Wave 2U entry;
`docs/VERIFICATION-DEBT.md` Wave 2U entry. **New dedicated branch**
`claude/likha-sis-wave2u-duplicate-warning`, created from exactly
`c51b46c209fbbf561a7b6915328e7159d06297fc` (Wave 2T's own final,
independently-verified checkpoint on
`claude/likha-sis-wave2t-teacher-slice`) — that branch itself was not
modified or force-updated. Harness v2 stayed locked and still computes
**100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`. Before any Wave 2U work
began, `c51b46c`'s own 5-point pre-push checklist was independently
re-verified (clean tree; HEAD exactly `c51b46c`; ancestry contains both
`820d1b2` and `54dc8fc`; `main` untouched at the exact SHA above; the
`c51b46c` diff contains only the reported delivery/documentation
changes) and pushed unmodified — not amended, squashed, or recreated.

**No candidate was pre-selected for implementation** — Wave 2T's own
candidate table (ADR-0049 addendum) had already scored "a duplicate-
learner-candidate warning on Create Learner" as **Next Best**, and this
wave picked up exactly that named candidate rather than re-running the
scoring process.

**Required reconnaissance before design** (this wave's own explicit
instruction): read `repository::learner::find_candidates` (Wave 2A,
already school-scoped and deterministic — exact LRN or exact
case-insensitive trimmed name), `import::matching::classify_row`
(Wave 2C, wraps `find_candidates` into `MatchKind::ExactLrn`/
`SuspectedDuplicate`/`New` for SF1 import), and `learner::create`
(no pre-check at all — a duplicate LRN surfaced as a raw, untyped DB
constraint error). Confirmed `find_learner_candidates`
(`commands::learner.rs`) was already registered but had zero frontend
caller — the exact gap this wave closes.

**What shipped**: `repository::learner::create_with_duplicate_check`
reuses `find_candidates` (no new SQL, no second detection engine) and
returns a typed `CreateLearnerOutcome` (`Created`/`LrnConflict`/
`DuplicateCandidates`, mirroring the `CorrectPlacementOutcome`/
`TransferOutcome` convention) instead of a raw DB error. An exact LRN
match is always `LrnConflict` — hard, never overridable, even by the
teacher's explicit "confirm" retry; any other name/LRN overlap is
`DuplicateCandidates`, blocking creation until a `confirmed: true` retry.
Candidates are re-fetched fresh on every call, so a confirmed retry
still atomically re-catches a conflict that appeared after the warning
was shown. New Tauri command `create_learner_with_duplicate_check`
(same `ManageLearners` gate as `create_learner`) is what
`LearnerListScreen`'s Create Learner form now calls; `create_learner`
itself, and every SF1-import code path
(`import::matching::classify_row`, `import::commit`'s direct calls to
`learner::create`), are unchanged. `LearnerListScreen` gained an inline
`role="alert"` warning panel (not a modal, matching the house
Transfer/End/Correct confirmation-panel convention) that receives
focus, lists the candidate(s), and offers "Create separate learner" /
"Cancel" for `duplicateCandidates`, or shows the conflicting learner's
name with no override affordance at all for `lrnConflict`. Three-mode
parity is presentation-only (an extra Guided-mode hint sentence); the
underlying detection/authorization/outcome never varies by mode.

**Verification** (all run this session): 7 new `repository::learner`
unit tests + 6 new `learner_management.rs` integration tests (546 lib +
every integration binary green, up from 539 lib; `learner_management.rs`
13/13, up from 7); `cargo fmt --check`/`cargo clippy --all-targets -- -D
warnings`/`cargo test` all clean. `npm run quality` — **600/600 vitest**
(62 files; +2 `TauriLearnerRepository` adapter, +6
`LearnerApplicationService`, +8 `LearnerListScreen` including 2 new axe
passes for the duplicate-candidate and LRN-conflict warning states),
typecheck/eslint/format/architecture clean. `npm run quality:security`
(gitleaks/cargo-deny/OSV) green — no new dependency. `npm run
harness:verify` still exactly 100/100, unchanged — not reopened. `npm
run quality:full` (harness + quality + `cargo fmt --check` + `cargo
test` + clippy) green end to end, exit code 0. `npm run quality:ui`'s
Playwright browser launch hit the same pre-existing
`chromium-1237`-vs-installed-`chromium-1194` mismatch already recorded
in `docs/VERIFICATION-DEBT.md`; the documented workaround
(`executablePath: "/opt/pw-browsers/chromium"`) was re-run against the
existing, unmodified smoke script and passed with zero axe violations,
confirming no regression to `LearnerListScreen`'s already-covered flows.
The new duplicate-warning UI itself has no local browser-rendered
screenshot this session — the dev-preview fixture's
`createWithDuplicateCheck` deliberately throws "not wired" (same as
every other write method on that read-only fixture) — so it is covered
by jsdom + axe-core only pending a CI/native pass.

**Scope guard held**: no learner-merging capability was added (there is
still no merge/delete for learners in this codebase); no probabilistic/
fuzzy/AI matching was introduced (`find_candidates`'s existing exact-
match rule is unchanged); SF1/SF9/SF10 fidelity, UI, and matching
(`MatchKind`, `LearnerMatchResult`, `classify_row`) were not touched;
no schema/migration change was needed (`create_with_duplicate_check`
is a pure read-then-write over the existing `learners` table and its
existing unique index); `main` was not touched; no unrelated refactor
landed — `git status` shows exactly the 15 files this feature required
across Rust and TypeScript, all four layers (domain → application →
repository/adapter → UI), following the existing `LearnerRepository`
port shape.

**Review**: a bounded self-review covered school isolation (
`create_with_duplicate_check_never_flags_a_different_schools_learner`/
`create_learner_with_duplicate_check_never_flags_a_different_schools_learner_as_a_conflict`
prove a shared name/LRN in a different school is never surfaced as a
false duplicate), the non-overridability of `LrnConflict` under both
`confirmed: true` and `confirmed: false`, the stale-candidate re-check
(a new conflict introduced between the warning and the confirmed retry
is still caught, proven with a real two-step test rather than asserted),
and that no existing SF1-import test regressed (`tests/sf1_import.rs`
stayed 12/12, unchanged). No independent (non-self) review was
dispatched for this bounded, narrowly-scoped slice — retained as debt
in `docs/VERIFICATION-DEBT.md`, consistent with several recent waves'
own retained-debt pattern under the documented reviewer-harness-failure
rule.

**Exact next slice** (recorded, not started — see `docs/ACTIVE-PLAN.md`):
Wave 2T's own candidate table names the Teaching Assignment/Class
Schedule UI (7 unwired commands) as the next-largest evidenced gap,
still assessed as too large for one bounded slice; a scoped first cut
of it (e.g. read-only class schedule display before any assignment-
editing UI) is the leading candidate for Wave 2V, pending the next
autonomous-wave instruction.

## Note — Active Task (2026-08-28 — Wave 2T: SF1/SF9 official-form generation UI, COMPLETE, superseded above)

Full record: `docs/adr/0049-*` Wave 2T addendum; `docs/PROJECT-MEMORY.md`
Wave 2T entry; `docs/ACTIVE-PLAN.md` Wave 2T entry;
`docs/VERIFICATION-DEBT.md` Wave 2T entry. **New dedicated branch**
`claude/likha-sis-wave2t-teacher-slice`, created from exactly
`49695d3a8547daacaa31c9b7506792e04ed3a267` (Wave 2S's own final,
CI-confirmed HEAD on `claude/likha-sis-wave2a-learner-core`/
`claude/likha-sis-wave2s-placement-0ixw5v`) — the Wave 2S branch itself
was not modified or force-updated. Harness v2 stayed locked and still
computes **100/100**.

**Repository truth verified first**: `main` confirmed untouched at
`d9ab0368dbc9218186578c9617810f48fe7a41fc`; the assigned checkpoint
`49695d3a` confirmed a genuine ancestor of the live
`claude/likha-sis-wave2s-placement-0ixw5v` branch tip (`8258c8c`, one
purely-documentation commit ahead, itself independently CI-green) — the
checkpoint was not stale or divergent. Final Security Gate `33208042186`
and final Quality Gate `33208042221` reconfirmed `completed/success` for
`49695d3a` (both the Ubuntu canonical `quality:full` + Playwright/axe UI
gate and the Windows canonical `quality:full` + native Tauri build, per
each job's own step list). `npm run harness:verify` reconfirmed exactly
100/100, certified, unchanged, before any Wave 2T work began.

**No candidate was pre-selected.** Every registered Tauri command (69)
was cross-checked against every frontend `invoke()` call site to find
real, evidence-backed unfinished teacher workflows rather than inferring
gaps from filenames — 16 commands had zero frontend caller. At least six
credible candidates were scored against LIKHA's priorities (full table
in the ADR-0049 Wave 2T addendum): SF1/SF9 official-form generation UI
(**Recommended**); a duplicate-learner-candidate warning on Create
Learner (**Next Best**); a Teaching Assignment/Class Schedule UI (7
unwired commands — real value, but too large for one bounded slice);
a PSGC/address-entry UI (rejected — no shipped form/export reads address
data, repeating a "collect ahead of evidenced need" mistake this project
already declined once at M17); the carried SF1-importer-integrity debt
(repository evidence does not currently justify reopening the importer —
`tests/sf1_import.rs` stayed 12/12 green, no new defect found); and the
carried native NVDA/Narrator verification (genuinely infeasible in this
remote Linux-container session — no Windows machine, no screen reader,
no physical device — recorded honestly, not faked or silently skipped).

**What shipped**: `SectionRosterScreen` gained a section-level "Generate
SF1 (School Register)" button and a per-row "Generate SF9 (Report Card)"
action, exposing the already-built, already-tested
`generate_sf1_form`/`generate_sf9_form` Tauri commands (Wave 3/2I) to
teachers for the first time. **No Rust change was needed at all** — the
commands, their session-only authorization convention (already matching
every sibling export command), and their command-boundary test coverage
already existed; this wave is purely a new TS port
(`FormGenerationRepository`, kept separate from `SectionRepository`/
`ExportRepository` per this codebase's one-port-per-concern convention)
→ Tauri adapter → `FormGenerationApplicationService` → UI. Neither
action opens a confirmation panel (unlike Transfer/End/Correct — form
generation mutates no membership state and is safely repeatable), and
both share the screen's existing `anyActionInFlight` gate with every
membership action so nothing can run concurrently. An always-visible
(all three modes) disclosure states both templates are synthetic and
`NOT_VERIFIED` against an authoritative DepEd source — not a new policy
call, but the same disclosure-not-refusal stance this project has
shipped since M10's SF2 export, applied to a new surface.

**Verification** (all run this session): no Rust change; `cargo test`
re-confirmed zero regression — 539 lib + every integration binary,
including `tests/formgen.rs` 10/10, unchanged from the Wave 2S
checkpoint. `cargo fmt --check`/`cargo clippy --all-targets -- -D
warnings` clean. `npm run quality` — **585/585 vitest** (60 files; +22:
4 adapter, 8 service, ~10 net new UI tests covering action visibility,
success/error/recovery for both forms, the shared in-flight gate, three-
mode parity, and one axe pass), typecheck/eslint/format/architecture
clean. `npm run build` + `check:dev-preview-isolation` pass. `npm run
harness:verify` still exactly 100/100, unchanged — not reopened. `npm
run quality:full` green end to end. `gitleaks`/`cargo-deny`/
`osv-scanner` (installed in the Wave 2S session, still present this
session) all ran clean — no new dependency was added this wave.
`git diff --check` clean. `npx knip` — no new findings.

**Review**: a bounded self-review covered authorization (unchanged,
session-only, matching every sibling export command's own already-
reviewed convention), staleness (a `null` result from either command —
a section/learner/membership no longer resolving — surfaces as a plain-
language recovery message, never a crash or silent no-op), concurrency
(the shared `anyActionInFlight` gate proven by a dedicated test), the
`Alert` component's existing `role="alert"`/`role="status"` convention
(confirmed correct for both success and error banners, no new ARIA
authored), and teacher-facing copy (the SF9 button's visible label was
widened from "Generate SF9" to "Generate SF9 (Report Card)" during this
review, for the same explicit clarity the SF1 button's label already
had — its `aria-label` was already fully descriptive, so this was a
visible-label-only fix, not an accessibility defect). No independent
(non-self) agent review was dispatched for this bounded slice.

**Checkpoint**: feature commit `820d1b2` (full SHA
`820d1b22616a8836d5553d5ed496039724a7aa65`); docs commit `54dc8fc` (full
SHA `54dc8fc5964745f10ed9ff68ae0c27546d862ba2`) is the pushed branch
HEAD. Owner-authorized push completed. **Final Security Gate
`33212130131` and final Quality Gate `33212130223`, both
`completed/success`**, confirmed via each job's own step list: Ubuntu
canonical `npm run quality:full` + the Playwright/axe UI-and-
accessibility smoke gate, both green; Windows canonical `npm run
quality:full` + the native Tauri application build, both green.
`npm run harness:verify` reconfirmed exactly 100/100, certified,
unchanged, immediately after this push. `main`
`d9ab0368dbc9218186578c9617810f48fe7a41fc` untouched throughout,
confirmed both before and after this wave's work.

**Exact next wave (not started)**: the Next Best candidate from this
wave — a duplicate-learner-candidate warning wired into `LearnerListScreen`'s
existing Create Learner flow, using the already-built, already-tested
`find_learner_candidates` command (currently unreachable from any UI, exactly
like SF1/SF9 were before this wave). Alternatives by LIKHA priority order,
carried forward: the native NVDA/Narrator pass (now also covering the SF1/SF9
actions); a narrower, purpose-scoped slice of the Teaching Assignment/Class
Schedule UI, if a bounded first increment can be identified; the SF1-importer
debt, once genuine evidence justifies reopening it.

---

## Note — Active Task (2026-08-28 — Wave 2S: same-day placement correction, COMPLETE, superseded above)

Full record: `docs/adr/0042-*` Wave 2S addendum; `docs/PROJECT-MEMORY.md`
Wave 2S entry; `docs/ACTIVE-PLAN.md` Wave 2S entry;
`docs/VERIFICATION-DEBT.md` Wave 2S entry. Same branch
(`claude/likha-sis-wave2a-learner-core`, continued this session as
`claude/likha-sis-wave2s-placement-0ixw5v`). Harness v2 stayed locked and
still computes **100/100**.

**Repository truth verified first:** the assigned working branch
(`claude/likha-sis-wave2s-placement-0ixw5v`) had been freshly cut from
`main` (`d9ab036`) with no divergent work, a strict ancestor of the
expected checkpoint `4282669` — fast-forwarded cleanly, 0 commits lost.
Feature Security `33180045501` + Quality `33180045507` and final Security
`33200842358` + Quality `33200842375` (Wave 2R's own checkpoint) all
independently reconfirmed `completed/success` for that exact commit
before any Wave 2S work began. `npm run harness:verify` reconfirmed
exactly 100/100, certified, unchanged.

**What shipped** (feature commit `1ca2103`):

- Evaluated 8 concrete same-day-correction representations against
  LIKHA's priority order (full scoring table in the ADR-0042 Wave 2S
  addendum). **Recommended and built**: an in-place, single-use
  correction of a same-day membership's `section_id` — no new row, no
  deletion, no change to any existing "is this membership open/current"
  query anywhere in the codebase. **Next Best, not built**: a retained
  void/re-open representation, recorded with an explicit switch
  condition (a placement with real dependent records, or outside the
  same-day window) rather than built speculatively.
- `section_membership::correct_same_day_placement` (NEW) — one
  transaction, one guarded `UPDATE`, gated on: the membership resolving
  for `(id, school_id, learner_id)` (forged/cross-school/wrong-learner →
  `NotFound`, indistinguishable from unknown); still open (`NotCurrent`);
  `starts_on` equal to the caller's `as_of_date` (`NotEnteredToday`); not
  already corrected (`AlreadyCorrected` — a correction is one-time, not
  repeatable); the destination resolving in-school and differing from
  the current section (`DestinationNotFound`/`SameSection`); and no
  attendance/scored-grade record already in the current section
  (`DependentRecordConflict`) — reusing the existing
  `dependent_records_stranded` helper with a **zero-width interval**
  rather than new SQL. Migration 21 adds nullable
  `original_section_id`/`corrected_at` provenance columns (written, not
  yet surfaced in any UI — disclosed in `VERIFICATION-DEBT.md`).
- Command `correct_same_day_placement`, gated `Capability::ManageLearners`
  (same as Enroll/Transfer/End), `school_id` session-derived.
- TS: `CorrectPlacementResult` mirrors the Rust outcome exactly;
  `SectionRepository` port + `TauriSectionRepository` adapter +
  `SectionApplicationService` (shape validation only) gain
  `correctSameDayPlacement`; all 9 existing `SectionRepository`
  implementers updated for the widened port.
- `SectionRosterScreen.tsx` gains a third row action, "Correct today's
  placement," shown only when a row's `startsOn` equals the roster's own
  frozen "today" — every other row is unchanged. Reuses the exact
  Transfer/End inline-panel house pattern (destination picker from the
  same `otherSections` list, no effective-date field since there is
  nothing to date, stale-conflict refresh recovery, inline field errors,
  focus management, 3-mode parity). The pre-existing zero-length-interval
  Transfer/End error message now also points a teacher at this new
  action instead of leaving them stuck with no next step.

**Verification** (all run this session): `cargo test` — **539 lib**
(+15 new: in-place update; forged learner/cross-school/forged-membership-
id rejection; stale-already-ended row; not-entered-today; double-submit

- a second differently-targeted attempt both refused after one
  correction; unknown/cross-school destination; same-section refusal; a
  real attendance conflict; attendance from a retained prior stint
  correctly _not_ flagged; a real scored-grade conflict built through the
  full grading-computation chain; malformed date shapes; a genuine
  two-SQLCipher-connection race proving exactly one correction commits) +
  all integration binaries, incl. `tests/enrollment.rs` **39/39** (+9
  command-boundary tests: authorized Registrar/School Head success,
  Teacher rejection, no-session rejection, cross-school membership id,
  forged membership id, stale + already-corrected double submit,
  not-entered-today). `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality` — **563/563**
  vitest (60 files, +20: 7 `section-service`, 2 `section-repository`
  adapter, 1 dev-preview fixture wiring implicit, 1 zero-length cross-
  reference message, and 19 `SectorRosterScreen` UI/focus/mode/axe tests).
  `npm run build` + `check:dev-preview-isolation` pass. `npm run
harness:verify` still exactly 100/100, certified, unchanged — not
  reopened. `npm run quality:full` green end to end, locally, in this
  session (harness verify → quality → `cargo fmt --check` → `cargo test`
  → `cargo clippy`). `git diff --check` clean.

**Security tooling — a first for this project**: `gitleaks` (`8.16.0`,
via `apt-get`), `cargo-deny` (via `cargo install --locked`), and
`osv-scanner` (**v2.5.1** official static binary, SHA-256 independently
verified against the value already recorded in `docs/SOURCE-REGISTRY.md`
— `f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be`)
were all **installed fresh this session** (none present at session
start) and all three ran clean: gitleaks found no leaks; `cargo-deny`
reported advisories/bans/licenses/sources all `ok`; `osv-scanner` found
"No issues found" after its pre-existing, already-justified ignore list.
Every prior wave in this project recorded these three as a standing
per-machine gap with CI as the sole authority — this session closes that
gap **for this machine only** (a future session's environment is not
guaranteed to retain them; CI remains authoritative regardless).

**Review:** a bounded self-review covered school/cross-tenant isolation
and probe resistance (forged membership + forged learner both collapse
to `NotFound`, matching every sibling verb's convention); the atomic
guarded-`UPDATE` race behavior (proven with a real two-connection test,
not merely asserted); that reusing `dependent_records_stranded` with a
zero-width interval is sound reasoning, not a coincidental pass; that no
existing "is this membership current" query definition changed anywhere;
and UI stale-conflict/focus/mode-parity conventions matching Transfer/End
exactly. One real gap found and fixed before commit: the existing
zero-length-interval Transfer/End error left a teacher with no next
step; it now names the new correction action. No independent (non-self)
agent review was dispatched for this bounded, narrowly-scoped slice —
recorded as retained debt in `docs/VERIFICATION-DEBT.md`.

**Checkpoint**: feature commit `1ca2103` — Security Gate `33207512841`
`completed/success`; Quality Gate `33207512883` confirmed green (see
below). `main` `d9ab036` untouched throughout.

**Exact next wave (not started):** no candidate pre-selected. By LIKHA
priority order, carried from this wave and prior ones: (a) the native
NVDA/Narrator pass, now covering Enroll + Transfer + End + Correct; (b)
apply the strict zero-length rule and the `l.school_id` JOIN predicate to
`enroll`/`roster_for_section*` when the SF1 importer is next reworked;
(c) a new teacher-facing production slice, now that the enrollment
lifecycle (enroll/transfer/end/correct/history) is complete end to end.

---

## Note — Active Task (2026-08-28 — Wave 2R: read-only learner enrollment history, COMPLETE, superseded above)

Full record: `docs/adr/0042-*` Wave 2R addendum;
`docs/PROJECT-MEMORY.md` Wave 2R entry; `docs/ACTIVE-PLAN.md` Wave 2R
entry; `docs/VERIFICATION-DEBT.md` Wave 2R entry. Same branch
(`claude/likha-sis-wave2a-learner-core`). Harness v2 stayed locked and
still computes **100/100**.

**Repository truth verified first:** branch and fresh clone both started
at certified lock commit `cd6462b`; Security `33177160647` and Quality
`33177160646` completed successfully (Ubuntu canonical + Playwright/axe;
Windows canonical + native Tauri build). `main` remained untouched.

**What shipped** (feature commit `05ad2e85`):

- Reused the existing Rust/SQLite path exactly as scoped:
  `list_learner_enrollment_history` →
  `section_membership::list_by_learner_in_school`. No migration, new
  command, history editor, deletion, or authorization-policy change.
- Added a narrow TS `EnrollmentHistoryRepository`, Tauri adapter, and
  `EnrollmentHistoryApplicationService`. The service validates the
  learner id, discards raw school/learner ids from its UI projection,
  and joins same-school section name/grade/year labels. Empty history is
  authoritative without requiring the label lookup; a missing retained
  section label remains visible as `Section record unavailable` rather
  than dropping the history row.
- Learner List now has one per-row disclosure. It loads on demand and
  shows oldest-first past/current placements, teacher-friendly dates,
  loading, empty, error + retry, and stale-request protection. Efficient,
  Comfortable, and Guided keep identical functionality; Guided adds one
  read-only explanation. Editing closes the disclosure rather than
  allowing competing row modes.
- The synthetic dev preview now wires this exact production screen and
  repository seam. `quality:ui` opens Ana Santos's two-span history,
  verifies past/current copy, checks phone-width horizontal reflow, and
  runs axe WCAG A/AA.

**Verification:** local `npm run quality` completed with **543/543**
Vitest tests (60 files), plus build, dev-preview isolation, targeted
history 31/31, `git diff --check`, and `npm run harness:verify` exactly
100/100. One loaded full-suite attempt exposed three pre-existing
user-event timing flakes; all passed in isolation and the unchanged
canonical rerun passed; the final post-record run passed 543/543. Local Playwright execution was unavailable
because this machine has no Chromium binary; CI ran it authoritatively.
Feature CI: Security `33180045501` + Quality `33180045507`, both
`completed/success`, including all Rust tests, Ubuntu browser/a11y/reflow,
Windows canonical checks, and the native Tauri build.

**Review:** bounded self-review covered school isolation/probe resistance,
architecture boundaries, stale async responses, empty/error recovery,
three-mode parity, heading order, keyboard disclosure semantics, and
phone overflow. The heading-order defect found by axe was fixed before
the feature checkpoint. No independent agent review was performed for
this read-only reuse slice; native NVDA/Narrator remains recorded debt.

**Exact next wave (not started): Wave 2S — controlled same-day placement
correction decision + proof.** First evaluate a narrowly authorized,
auditable way to correct a current placement entered today without a
general history editor or silent deletion. Implement only if the policy
preserves membership/history integrity and blocks corrections once
dependent attendance/grade records exist. No learner deletion, bulk
history editing, SF1 redesign, cloud sync, or learner-photo work.

---

## Harness v2 certification (2026-08-28 — COMPLETE, 100/100, LOCKED)

Full record: `docs/adr/0054-final-harness-v2-certification.md`;
`.harness/{state,inventory,scorecard}.json`.

- Owner-authorized final unlock completed without changing ADR-0052's
  weights or fatal overrides.
- Corrected candidate `5a4b75d3` passed Quality Gate `33175058626`
  (Ubuntu canonical + Playwright/axe; Windows canonical + native Tauri
  build) and Security Gate `33175058671` (gitleaks, cargo-deny, OSV), all
  `completed/success`.
- `npm run harness:verify` computes exactly **100/100**, certification
  `certified`, with zero fatal overrides. Harness v2 is relocked; future
  changes require a new owner-authorized unlock and full recertification.
- Operating mode revised by owner: work autonomously within one wave;
  after final CI green, write the wave report, identify the next slice,
  and stop. Never begin the next wave without a new user instruction.

Wave 2R completed at feature checkpoint `05ad2e85` without reopening the
harness. Wave 2S completed at feature checkpoint `1ca2103`, also without
reopening the harness (`npm run harness:verify` reconfirmed exactly
100/100 both before and after Wave 2S). No candidate is pre-selected for
the wave after Wave 2S — see the Wave 2S entry above for carried
candidates.

---

## Active Task (2026-08-28 — Wave 2Q: safe learner enrollment + membership-integrity closure, COMPLETE)

Full record: `docs/adr/0042-*` Wave 2Q addendum; `docs/PROJECT-MEMORY.md`
Wave 2Q entry; `docs/ACTIVE-PLAN.md` Wave 2Q entry; `docs/VERIFICATION-DEBT.md`
Wave 2Q entry. Same branch (`claude/likha-sis-wave2a-learner-core`).
Frozen harness not reopened.

**Repository/CI truth verified first**: HEAD `7807e5e` = origin, 0/0;
`main` `d9ab036` untouched; tree clean; untracked paths all gitignored.
Wave 2P CI re-confirmed `completed/success` for `7807e5e` — Quality Gate
`33049989425` + Security Gate `33049989470`.

**What was built** (feature commit `<FEATURE_SHA>`):

- **`section_membership::enroll_membership` (NEW)** — typed,
  transactional, stale-safe verb to place an existing eligible learner
  into a section. `EnrollOutcome` (`Enrolled` / `LearnerNotFound` /
  `SectionNotFound` / `AlreadyEnrolled{currentMembershipId,
currentSectionId}` — never moved implicitly / `OverlappingMembership`
  / `InvalidStartDate` / `DependentRecordConflict{record}`). Command
  `enroll_learner_membership`, gated `ManageLearners`, `school_id`
  session-derived, forged-row `learner::find_by_id_in_school` check.
- **`section_membership::enrollable_learners` (NEW)** — one `LEFT JOIN`
  learners→open membership→sections, `school_id` on all three, ordered
  in SQL. Command `list_enrollable_learners`, gated `ManageLearners`.
- **Zero-length policy = STRICT** — `ZeroLengthInterval` added to
  `TransferOutcome` / `EndMembershipOutcome`; same-day change rejected.
  3 pinned tests renamed/rewritten. `enroll` primitive keeps a
  documented `[D,D)` exemption.
- **Dependent-record guard** — `dependent_records_stranded()` blocks a
  backdated `starts_on`/`effective_on` that would strand an
  `attendance_records` or scored `learner_scores` row, typed
  `DependentRecordConflict{record}`. Wired into enroll/transfer/end.
- **`enroll` hardened** — `is_iso_date` guard + `SAVEPOINT` around
  close-old/open-new.
- **`tests/enrollment_concurrency.rs` (NEW, 5)** — two `db::open`
  connections on one SQLCipher file; exactly one write commits; loser
  gets a typed conflict or clean `SQLITE_BUSY_SNAPSHOT` rollback;
  guarded `UPDATE` writes 0 on a closed row; refreshed retry
  deterministic.
- **TS** — `EnrollMembershipResult` / `DependentRecordKind` /
  `EnrollmentCandidate` in `domain/section.ts`; `ZeroLengthInterval` +
  `dependentRecordConflict` added to `TransferResult` /
  `EndEnrollmentResult`; `SectionRepository` gained `enrollMembership` /
  `listEnrollableLearners`; adapter + `SectionApplicationService`
  methods; 8 other `SectionRepository` stubs updated.
- **UI** (`SectionRosterScreen.tsx`) — one "Enroll learner" button +
  inline panel: name/LRN filter, candidate `<select>` annotated with
  state, start-date capped at today, one Confirm, double-submit block,
  transfer-required guidance, typed-outcome handling, focus management,
  3-mode parity.

**Verification** (all run this session): `npm run quality` green — 534
vitest, typecheck, eslint, `prettier --check .`, `check:architecture`.
`cargo test` — 528 lib + every integration binary (`enrollment` 31,
`enrollment_concurrency` 5). `cargo nextest` `section_membership` 55.
`cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings`
clean. `check:dev-preview-isolation` pass; `knip` no new findings;
`cargo deny check` ok (no dependency change); gitleaks/OSV not on this
machine's PATH — CI authoritative.

**Independent review**: five fresh reviewers (security/isolation,
SQLite concurrency, domain/architecture, teacher-UX/mode parity,
accessibility) — [outcome + fixes recorded at review-fix commit].

**Checkpoint**: [feature commit `<FEATURE_SHA>` — Quality Gate
`<Q1>` + Security Gate `<S1>`; review-fix+docs commit `<DOCS_SHA>` —
Quality Gate `<Q2>` + Security Gate `<S2>`, all `completed/success`].
`main` `d9ab036` untouched.

**Exact next task**: no milestone pre-selected. Candidates by LIKHA
priority order — (a) a "correct a placement entered in error" affordance
(closes the Wave 2Q retained debt: no same-day undo under the strict
zero-length rule); (b) a learner enrollment-history view (read-only,
reuses `list_learner_enrollment_history`); (c) apply the `l.school_id`
JOIN predicate + strict zero-length rule to `enroll` /
`roster_for_section*` when the SF1 importer is next reworked. Pick using
current evidence per `.claude/rules/autonomous-development.md`.

---

## Active Task (2026-08-27 — Wave 2P: transfer learner + end enrollment, COMPLETE)

Full record: `docs/adr/0042-*` Wave 2P addendum; `docs/PROJECT-MEMORY.md`
Wave 2P entry; `docs/ACTIVE-PLAN.md` Wave 2P verification record;
`docs/VERIFICATION-DEBT.md` Wave 2P entry. Same branch
(`claude/likha-sis-wave2a-learner-core`). Frozen harness not reopened.
SF10 research not reopened.

**Repository/CI truth verified first**: at start, HEAD `eabed41` =
origin, 0 ahead / 0 behind; `main` `d9ab036` (untouched throughout).
Wave 2O CI independently re-confirmed `completed/success`: `8e782e4` —
Quality `33042106266` + Security `33042106188`; docs `eabed41` — Quality
`33043125049` + Security `33043125095`.

**What was built** (feature commit `59f9440`):

- **`section_membership::transfer_membership` / `end_membership` (NEW)**
  — transactional (`&mut Connection` + `conn.transaction()`), targeting
  an exact `membership_id`, returning typed outcomes
  (`TransferOutcome` / `EndMembershipOutcome`, serde `tag = "kind"`).
  A stale roster row is refused, never applied to a different
  membership; the source close is `UPDATE ... WHERE ends_on IS NULL`
  with an affected-row check; a double-submit yields exactly one change.
  History rows are end-dated, never deleted. `enroll`,
  `roster_for_section`, `roster_for_section_over_range` untouched.
  `CurrentRosterMember` gained `membership_id`.
- **Commands `transfer_learner_membership` / `end_learner_membership`**
  — gated by `Capability::ManageLearners` (Registrar / School Head),
  `school_id` session-derived, registered in `lib.rs`.
- **TS**: `TransferResult` / `EndEnrollmentResult` discriminated unions
  in `domain/section.ts`; `SectionRepository` + `SectionApplicationService`
  gained `transferMembership` / `endMembership` (shape + date-format
  validation only; Rust authoritative). Tauri adapter invokes the two
  new commands. Six other `SectionRepository` stub implementations
  (fixtures + 5 test fakes) updated for the widened port.
- **UI** (`SectionRosterScreen.tsx`): per-row "Transfer" / "End
  enrollment" opening one inline confirmation panel (effective-date
  input default today / `min` = start / `max` = today; school-scoped
  destination `<select>`; plain-language consequence; Guided help).
  Stale/gone → a refresh recovery whose buttons both reload the roster;
  `sameSection` / `invalidEffectiveDate` → inline field error
  (`aria-invalid` + `aria-describedby`) with the panel kept open; thrown
  → generic retry. Focus moves into the panel on open and on any
  error/conflict; back to the trigger on cancel. Class list stays
  visible during the post-action refresh. 3-mode parity; 44px mobile
  targets. `App.tsx` unchanged.

**Independent review**: five fresh reviewers (security, reliability,
architecture, teacher-ux, accessibility) ran against `59f9440`.
**No blocking findings.** Review-fix commit acted on: Rust
`effective_on` shape validation (`is_iso_date`) in both new functions,
an independent `learner::find_by_id_in_school` check (forged-row
defense), focus-to-panel-heading on error outcomes, `destinationNotFound`
routed to the refresh recovery, the date `max` cap, `aria-invalid` /
`aria-describedby` on panel fields, roster kept visible during refresh,
consistent "Family, Given" naming (panel vs. success banner), an
all-modes effective-date hint, a "you can re-enroll from Sections"
correction note, and added axe coverage for the error / stale-conflict /
Guided panel states. Deferred to `docs/VERIFICATION-DEBT.md`: native
NVDA/Narrator pass for the interactive surface, a two-connection
guarded-`UPDATE` race test, the pre-existing `enroll` date/transaction
gaps, the no-lower-bound-vs-existing-records backdating gap, and the
zero-length-membership product question.

**Verification** (all run this session): `npm run quality` green — 514
vitest, typecheck, eslint, `prettier --check .`, `check:architecture`;
`cargo test` 509 lib + all integration binaries (24 in
`tests/enrollment.rs`); `cargo nextest run` on `section_membership`
(36) + `enrollment` (24); `cargo fmt --check` clean; `cargo clippy
--all-targets -- -D warnings` clean; `check:dev-preview-isolation` pass;
`knip` — no new findings. `quality:security`: `cargo deny check` pass
(no dependency change); gitleaks + OSV not on this machine's PATH (CI
authoritative, same disclosed per-machine gap as prior waves).

**Checkpoint**: feature commit `59f9440` — Quality Gate `33046336519` +
Security Gate `33046336518`, both `completed/success`. Review-fix +
docs commit `b3b6262` — Quality Gate `33048615959` + Security Gate
`33048615965`, both `completed/success`. `b3b6262` is the final Wave 2P
HEAD; `main` `d9ab036` untouched.

**Exact next task**: no milestone pre-selected. Highest-value candidates
by LIKHA priority order — (a) harden `enroll` (Rust date-shape check +
transactional close), closing the debt this wave opened; (b) the
two-connection membership-race test; (c) the next teacher-visible
enrollment slice (e.g. a learner's enrollment-history view, or SF1
export of the current roster). Pick using current evidence per
`.claude/rules/autonomous-development.md`.

---

## Superseded — Active Task (2026-08-27 — Wave 2O: Section Roster read-only foundation, COMPLETE)

Full record: `docs/adr/0042-*` Wave 2O addendum; `docs/PROJECT-MEMORY.md`
Wave 2O entry; `docs/ACTIVE-PLAN.md` Wave 2O verification record. Same
branch (`claude/likha-sis-wave2a-learner-core`). Frozen harness not
reopened. SF10 research not reopened.

**Repository/CI truth verified first**: HEAD `2bc0d7b` = origin, 0
ahead/0 behind; `main` `d9ab036`; working tree clean. Wave 2N CI
independently re-confirmed `completed/success` for both feature commits:
`6f1bdb5` — Quality `33033895580` + Security `33033895620`; `92142c9` —
Quality `33034888077` + Security `33034888093`.

**Central finding**: the roster data pipeline already existed end to end
(`section_membership::roster_for_section` + `commands::section::
section_roster`; the TS `SectionRosterMember` type, port, Tauri adapter,
and `SectionApplicationService.roster()` — all from Wave 2A / attendance
work, and `AttendanceScreen` already consumes an equivalent). Wave 2O
added the missing **UI** plus a small projection enrichment; it did not
build a new query or a parallel enrollment model.

**What was built**:

- **`section_membership::current_roster(school_id, section_id,
as_of_date)` (NEW)** returning a **separate `CurrentRosterMember`
  projection** (identity + `lrn` + `sex` + `starts_on`). Same query
  shape as `roster_for_section` (one indexed JOIN, `ORDER BY
family_name, given_name`, scoped by `school_id` AND `section_id`
  together) so `roster_for_section` / `roster_for_section_over_range`
  (used by `formgen::sf1` + attendance-adjacent callers) stay
  untouched. The brief's §5 proposed `list_current_members_in_school`;
  reusing the proven shape under a name that fits the domain was the
  deliberate call — recorded in the ADR-0042 addendum, in the same
  spirit as Wave 3's departure from its Java/POI hypothesis.
- **`commands::section::section_roster`** rewired to `current_roster`;
  still session-derived `school_id`, ungated beyond an active session
  (reads-open convention, matching `list_learner_enrollment_history`).
- **`SectionRosterScreen.tsx` (NEW)** — reached from `SectionsScreen`
  via a per-section "Open roster" button (`App.tsx` `rosterSectionId`
  handoff, same narrowly-typed pattern as Attendance→Monthly Summary);
  its own "← Back to sections". `"section-roster"` is a `SignedInTab`
  value but not a `NAV_GROUPS` destination (needs a selected section);
  `WorkbenchNav` keeps "Sections" active while it is open. States:
  loading / populated / empty ("no learners as of <date>" + route to
  Sections) / section-not-found recovery / roster-load error + retry.
  Efficient / Comfortable / Guided parity (density is global CSS vars;
  the component varies only explanatory copy). Desktop `<table>` →
  `@media (max-width: 640px)` stacked-card layout mirroring
  `.attendance-roster`.
- **`SectionApplicationService.roster()`** now trims `sectionId` and
  validates the `YYYY-MM-DD` date (parity with `enrollLearner`).
- Decisions: **no search** (one section = tens of learners; a stable
  sorted list scans faster than it filters). **Sort** = family then
  given name, already this project's convention (`export::report_card`
  formats `"{family}, {given}"`; `formgen::sf1`), applied in SQL, never
  re-sorted client-side. **`sex` dropped** from the projection (no
  consumer — security + architecture review); `lrn` shown for identity
  confirmation. Dates shown `2 Jun 2025` via a small screen-local
  formatter.

**"Current member"** is the existing half-open-interval definition
(`starts_on <= as_of_date < ends_on`, NULL `ends_on` = open) — not a new
temporal semantic. Future-dated enrollments and ended memberships are
correctly absent; the screen shows the "as of" date so a teacher can
see why (covered by unit + command-boundary tests).

**Independent review**: teacher-ux, accessibility, security, and
architecture reviewers ran in parallel and **all four returned complete
findings** before the shared session hit its usage limit. **One
BLOCKING** (accessibility): the `@media (max-width: 640px)`
`display:block` layout strips implicit ARIA table roles (reachable at
400% zoom, not only phones), leaving `data-label` generated content as
the sole column-label carrier — **fixed** by adding explicit
`role="table|rowgroup|row|columnheader|rowheader|cell"`. No blocking
from security / architecture / teacher-ux; ~15 non-blocking items acted
on (status live region + focus-on-retry; `l.school_id` JOIN predicate +
forged-row regression test; `sex` removed; `TAB_LABELS` exhaustive
literal; `App.tsx` no longer falls through to audit-log for an unhandled
tab; all-mode purpose line; "Enrolled since"; friendly dates; Guided
hint above the table + `aria-describedby`; section-load-error Retry;
duplicate in-alert back buttons removed; axe extended to not-found +
roster-error states). Retained debt (`docs/VERIFICATION-DEBT.md` Wave
2O): native NVDA/Narrator pass at 400% zoom; no Rust-side `as_of_date`
shape check (TS boundary per `architecture.md`; non-exploitable);
`roster_for_section*` not given the same `l.school_id` predicate
(pre-existing, `formgen`-shared, out of scope); half-open predicate now
in 4 functions (shared const not extracted — no unrelated refactor);
not-found state cannot name the section.

**Verification (actually run this session)**: `cargo fmt --check` clean;
`cargo clippy --all-targets -- -D warnings` clean; `cargo test` — 491
lib (+7 `current_roster` unit tests: open member w/ enrollment date,
future-dated excluded, ended excluded, empty section, cross-school
section → empty, forged-row cross-school → empty, family-then-given
order) + all integration binaries incl. `tests/enrollment.rs` 17 (+4
command-boundary: authorized same-school read, no session denied,
nonexistent `section_id` → `[]`, cross-school `section_id` → `[]`), 0
doctests; `cargo nextest run` 595/595. One transient
`learner_management.rs` `db::open` flake on a single full-suite run
(SQLCipher key derivation under parallel load; not reproduced;
unrelated — no db/crypto code touched). `npm run quality` green —
typecheck / lint / format:check / architecture check + 484 vitest
tests. `npm run check:dev-preview-isolation` pass; `npx knip` — zero new
findings. `cargo-deny` clean (no dependency change); `gitleaks` /
`osv-scanner` not on PATH locally (standing gap — CI Security Gate
authoritative). No packaged-native Tauri run (standing environment gap;
`quality:ui` is an explicit placeholder — recorded, not claimed).

**Committed and CI-confirmed**: `8e782e4` — Quality Gate `33042106266`

- Security Gate `33042106188`, both `completed/success` for this exact
  commit. Wave 2O is fully closed.

**Deliberately NOT built** (Wave 2P onward): transfer between sections,
end enrollment, bulk enrollment, CSV/XLS import, drag-and-drop, SF1
export, learner editing/deletion, historical membership editor. The
transfer/end-enrollment seam is documented in prose in the screen's doc
comment; no dead buttons.

**Exact next highest-value production slice**: **Wave 2P — Transfer
learner + End enrollment** on top of this roster. The seam is already
shaped: a selected `SectionRosterScreen` row → a membership action
(transfer to another section / end enrollment as of a date), driven by
new capability-gated commands over `section_membership::enroll` (which
already performs a transfer as a close-old-open-new atomic step) plus a
new `end_membership` verb. Add `membership_id` to `CurrentRosterMember`
at that point (deferred here — no consumer yet). Then reuse the
resulting learner-list / membership patterns in attendance, class
records, and official-form workflows. Re-evaluate against repository
evidence at the checkpoint before committing to the label.

## Active Task (2026-08-27 — Wave 2N: SF10 Evidence Closure, COMPLETE — SF10 = PARTIALLY READY)

Full record: `docs/adr/0053-*` Wave 2N addendum,
`docs/form-evidence/sf10/README.md`, `docs/VERIFICATION-DEBT.md` top
entry. Same branch. Frozen harness not reopened.

**Repository/CI truth verified first**: HEAD `0c6aaf8` = origin, 0/0;
`main` `d9ab036`; tree clean. Wave 2M CI (`33031801131` Quality +
`33031801110` Security) re-confirmed `completed/success`.

**What changed**:

- **DM 020, s. 2026 page 2 read verbatim** (`pdftotext`, a Git-bundled
  tool — no harness change). Para 5(b): official filename
  `SSHS SF 10 v2026.xlsx`. Para 4: modified SF10 used exclusively by
  SSHS Pilot Schools; non-Strengthened SHS keeps the DO 69 s. 2016
  SF10. Pages 1/3/4 unread (scanned images).
- **`SF10_SSHS_V2026_CANDIDATE_EVIDENCE` promoted → `AuthoritativeSourceConfirmed`**
  (guard-satisfying, tested). **Fidelity unchanged: `NotVerified`.**
- **`track: None` for SSHS is now evidence-backed** — no template-level
  Academic/TechPro split on current evidence.
- **JHS applicability corrected** Grades 7-10 → **Grade 7 only**
  (MATATAG per-grade phase-in; DO 010 s. 2024). JHS stays
  `CandidateUnverified` — **EVIDENCE BLOCKED** (national Joint
  Memorandum PDF not obtained; community-touched files; LIS listing
  403).
- **MATATAG transition rule modeled**: completed old SF10 preserved &
  attached, not rewritten; revised SF10 forward.

**Verification (actually run)**: `cargo fmt --check` clean; `cargo
clippy --all-targets -- -D warnings` clean; `cargo test` 484 lib + all
integration + 0 doctests pass (~18 SF10-touching tests incl.
guard-satisfying-promotion, provenance-didn't-touch-fidelity,
registry-wide promotion-guard invariant, JHS-unpromotable,
Grade-8-10-fails-closed). `npm run quality` — clean (462/462 TS tests,
architecture check, format:check). No dependency / migration / command
/ UI / learner data.

**Independent review**: security + architecture reviewers **both
returned findings in full — no BLOCKING from either.** Non-blocking
items acted on this checkpoint (const rename, registry-wide
promotion-guard invariant test, unverified-issuance wording softened,
ADR doc-integrity). No Wave 2N independent-review debt. Detail in
`docs/VERIFICATION-DEBT.md` Wave 2N entry + ADR-0053 addendum.

**Committed and CI-confirmed green**: `6f1bdb5` (Wave 2N) — Quality
Gate `33033895580` + Security Gate `33033895620` `completed/success`;
`92142c9` (review fixes) — Quality Gate `33034888077` + Security Gate
`33034888093` `completed/success`. Wave 2N is fully closed.

**SF10 readiness = PARTIALLY READY.** SSHS provenance confirmed
(fidelity not); JHS EVIDENCE BLOCKED; pre-MATATAG templates not
acquired. Per the Wave 2N directive, **SF10 research stops here** — no
generator was built (Part G/H); the fail-closed `resolve` seam is
preserved.

**Exact next production vertical slice** (teacher-facing, local-first,
verified foundation, no form-fidelity dependency):
**Section Roster + Enrollment Management** (Wave 2O). Wave 2A shipped
the learner-core/enrollment domain at the repository + command layer
"no UI"; `SectionsScreen` only does create-section + enroll-one.
The gap a registrar/teacher hits daily: seeing who is currently in a
section, transferring a learner between sections, and ending an
enrollment. Build on the **verified** `section_membership` domain
(half-open `[starts_on, ends_on)` intervals; the `UNIQUE ... WHERE
ends_on IS NULL` one-open-membership invariant — ADR-0008/ADR-0042).
Smallest first increment: a read-only **Section Roster view** — a new
`section_membership::list_current_members_in_school(section_id)` query

- narrow command + a `SectionRosterScreen` (Efficient/Comfortable/
  Guided parity), then add transfer/end-enrollment as follow-ups.
  Dispatch teacher-ux + accessibility reviewers for the UI.

_(Wave 2N deliberately did not start this slice: SF10 evidence closure
is a complete compliance-critical unit, and a UI vertical deserves its
own wave scoping — screen design + teacher-UX/a11y review — rather than
being tacked on. A wave boundary is a valid checkpoint per
`.claude/rules/autonomous-development.md`.)_

## Active Task (2026-08-27 — Wave 2M: SF10 Authoritative Template Intake & Version Applicability, COMPLETE)

Full record: `docs/adr/0053-sf10-template-applicability-and-versioning.md`,
`docs/form-evidence/sf10/README.md`, `docs/VERIFICATION-DEBT.md` top
entry. Same branch (`claude/likha-sis-wave2a-learner-core`).

**Repository/CI truth verified first**: branch/HEAD `ce15a2e` = `origin`,
0 ahead/behind; `main` `d9ab036`; tree clean. Wave 2L code checkpoint
`e04f64f` re-confirmed via `gh run view` — Quality Gate `33028634953`

- Security Gate `33028634929` both `completed/success`. Harness not
  reopened.

**What was built**:

- Four DepEd-hosted SF10 `.xlsx` candidates acquired from
  `support.lis.deped.gov.ph`, hashed, structurally inspected. All
  `CandidateUnverified` / `NotVerified` — **none promoted** (governing
  issuance bodies unreadable — scanned PDFs, no OCR in the frozen
  harness). Manifest + structural findings + issuance research:
  `docs/form-evidence/sf10/README.md`.
- `formgen::evidence`: +2 real SF10 candidate `TemplateEvidence`
  records (`SF10_SSHS_V2026_CANDIDATE_EVIDENCE`,
  `SF10_JHS_CANDIDATE_EVIDENCE`) — the registry's **first real external
  consumer**.
- `formgen::template_version` (NEW pure-domain module): `resolve()`
  picks the template authoritative for a record's own
  (form/SY/grade/curriculum/track) context and **fails explicitly**
  rather than falling back to newest. 10 resolver tests.
- `examples/inspect_template_candidate.rs` extended (umya API only, no
  new dep) with per-sheet formulas / defined names / data validation /
  hidden rows-cols / page setup + workbook named ranges.
- ADR-0053 with the 10-scenario decision (Recommended: evidence-backed
  version registry + applicability resolver; Next Best: per-record
  frozen template-version stamp, adopt when SF10 records are persisted).

**Verification (all actually run)**: `cargo fmt --check` clean; `cargo
clippy --all-targets -- -D warnings` clean; `cargo test` — 478 lib +
all integration binaries + 0 doctests pass, incl. 13 new tests. One
transient `rustc` ICE observed once right after `cargo fmt` rewrote a
file mid-build; did not reproduce on clean rebuild (recorded honestly,
not a code defect). `npm run quality` — clean (462/462 TS tests). No
new dependency, no migration, no Tauri command, no UI, no learner data.

**Independent review**: architecture-reviewer returned findings in full
(no BLOCKING; non-blocking items acted on — dead fields removed,
`Synthetic` now refused by `resolve`, doc corrections). security-reviewer
returned "no BLOCKING findings" + confirmed no PII-leak / promotion-bypass
recurrence, but its itemized NB-1..NB-7 text hit the documented
reviewer-retrieval bug and was unrecoverable — self-review substituted,
that specific debt retained. Full detail: `docs/VERIFICATION-DEBT.md`'s
Wave 2M entry.

**Committed and CI-confirmed green**: review-fix checkpoint `16ff902` —
Quality Gate `33031801131` (Windows + Ubuntu) and Security Gate
`33031801110`, both `completed/success`. (Feature commit `368bdaa`
Security Gate `33030879756` also green; its Quality Gate was superseded
by `16ff902`'s.) Wave 2M is fully closed.

**Exact next product action**: SF10 is evidence-gated, not
feature-gated — do **not** start SF10 generation yet. Highest-value
next steps, in order: (1) obtain a readable copy of DepEd Memorandum
No. 020, s. 2026 (and the JHS MATATAG SF10 governing issuance) so the
SSHS/JHS candidates can be promoted and the `track: None` assumption
confirmed or split — this unblocks everything SF10; (2) if that stays
blocked, return to LIKHA's priority order and pick the next
highest-value milestone that does not depend on unproven SF10
authority (e.g. a learner-profile or attendance/grading refinement),
recording the SF10 evidence debt as carried. Do not fabricate SF10
completion.

## Active Task (2026-08-27 — Wave 2L: Final Harness Consolidation + LIKHA Production Harness v1.0 + ProjectForge Extraction, COMPLETE and FROZEN)

Full record: `docs/adr/0052-wave2l-production-harness-v1.md`. Portable
extraction: `docs/harness/`. Same branch
(`claude/likha-sis-wave2a-learner-core`).

**Repository/CI truth verified first**: branch/HEAD `27dc534` matched
`origin`, 0 ahead/behind; `main` unchanged at `d9ab036`; working tree
clean. Wave 2K **code** checkpoint `10d5efc` re-confirmed directly via
`gh run view` — Quality Gate `33026121743` and Security Gate
`33026121791` both `completed/success`. HEAD `27dc534` (docs commit):
Security Gate `33027657317` green; Quality Gate `33027657304` was
`in_progress` at inventory start (docs-only, non-blocking).

**What changed in the harness**: exactly one thing — removed the dead
`security-guidance@claude-plugins-official` line from
`.claude/settings.json` (enabled but never installed; `claude-security`
covers the need). Everything else: KEEP. Full disposition table for
every plugin / MCP / agent / skill / hook / script / CI gate in
ADR-0052.

**Recommended architecture S1** ("current harness + targeted cleanup",
92/100) selected from a 40-architecture rubric review + 4 elimination
rounds. **Next Best S3** ("CLI-first minimal") with a documented switch
condition. The harness is now **frozen** (ADR-0052 §"Harness
experimentation freeze").

**Runtime-verified this wave**: `git`/`gh` CI re-confirmation; `node
scripts/memory/health.mjs` (all HEALTHY) + `recall.mjs` smoke;
`claude plugin list` (4 official plugins enabled, claude-mem disabled,
security-guidance absent); `npx knip --version` 6.32.2; `cargo-deny`
present (`gitleaks`/`osv-scanner` absent this machine — per-machine, CI
authoritative); MCP inspection (no `.mcp.json`; one user-scope
`codebase-memory-mcp` only). Independent `architecture-reviewer`
dispatched for harness structure — recurring retrieval bug hit;
self-review substituted; debt retained (`docs/VERIFICATION-DEBT.md`).

**ProjectForge v0.1** created as **private** repo
`312810-spec/projectforge` (https://github.com/312810-spec/projectforge,
initial commit `feb9997`) — provider-independent core + Claude Code
adapter + 11 project-type profile recipes + portable templates +
independent memory + provenance. Not coupled to LIKHA at runtime.

**Wave 2L LIKHA checkpoint committed and pushed: `e04f64f`. CI
confirmed green for this exact commit** — Quality Gate `33028634953`
and Security Gate `33028634929`, both `completed/success`. Wave 2L is
fully closed and the harness is frozen.

**Exact next product action** (harness work is done — resume LIKHA
product development from here): take the **SF10 lead** recorded in
ADR-0051 / `docs/VERIFICATION-DEBT.md`'s Wave 2K entry. Download one of
the four `support.lis.deped.gov.ph/support/downloads/schoolforms/`
SF10 `.xlsx` URLs locally, run `cargo run --example
inspect_template_candidate -- <path>` against it, and register its
manifest as a `ProvenanceState::CandidateUnverified` `TemplateEvidence`
entry in `formgen::evidence` (do **not** promote to
`AuthoritativeSourceConfirmed` without a confirmed DepEd
Order/Memorandum citation). This also gives `formgen::evidence` its
first real consumer. If SF10 turns out blocked, the alternatives are
unchanged from Wave 2K: retry the still-owed independent architecture
review under a healthy harness, or live-smoke-test claude-mem's
disable — both in `docs/VERIFICATION-DEBT.md`.

## Active Task (2026-08-27, this session — Wave 2K: Official-Form Template Evidence & Provenance Registry, complete, ready to commit)

Full record: `docs/adr/0051-official-form-template-evidence-registry.md`.

**Mandatory Wave 2J checkpoint gate, verified first**: `git fetch`
clean; branch/HEAD at `fb07797` (Wave 2J's commit), matching `origin`;
`main` unchanged at `d9ab036`; working tree clean; 0 ahead/behind. Both
Wave 2J CI runs (Quality Gate `33015766489`, Security Gate
`33015766459`) confirmed genuinely `completed`/`success` before any
Wave 2K implementation began — Quality Gate briefly re-showed
`in_progress` on a re-check (likely a stale/cached `gh` read; not
investigated further), and work was correctly held until it resolved.

**What was built**: `src-tauri/src/formgen/evidence.rs` (NEW) — two
independent enums, `ProvenanceState` and `FidelityState`, on a
`TemplateEvidence` struct, deliberately never collapsed into one status
field (the wave's non-negotiable design rule). `confirm_authoritative_
source(current, authoritative_issuance)` is the only function that may
promote a template to `AuthoritativeSourceConfirmed`, and refuses
without a real DepEd issuance citation or for an already-`Rejected`
source. `SF1_SYNTHETIC_V1_EVIDENCE`/`SF9_SYNTHETIC_V1_EVIDENCE` are the
two registered records (both `Synthetic`/`NotVerified`, every optional
evidence field explicitly `None` with a gap note explaining why).
`src-tauri/examples/inspect_template_candidate.rs` (NEW) — a dev-only
intake tool (not a Tauri command, not UI) that hashes/inspects a local
candidate file and prints a suggested-starting-classification report;
refuses files over 25MB before parsing (zip-bomb defense); never
registers anything itself.

**Research**: two new search angles tried beyond prior waves' repeated
`deped.gov.ph` homepage searches. Found no authoritative SF1/SF9
template (unchanged verification debt). Found a genuine lead for
**SF10**: four `.xlsx` files on `support.lis.deped.gov.ph` (a verified
`*.deped.gov.ph` subdomain), personally confirmed by direct fetch as
valid xlsx containers — not registered as evidence this wave (no SF10
generator exists; the brief explicitly said not to build one merely to
exercise the framework). Full gaps disclosed in
`docs/VERIFICATION-DEBT.md`.

**Local verification (all re-run this wave)**: `cargo fmt --check`
clean; `cargo clippy --all-targets -- -D warnings` clean; `cargo test`
— all Rust tests pass, including 11 new `formgen::evidence` tests
covering the 18-item required test list (promotion-guard rejection/
acceptance, rejected-cannot-repromote, provenance/fidelity independence,
SF1/SF9 debt preservation, no-PII-required, malformed-file/gap
reporting). `npm run quality` — clean (typecheck, lint, format,
architecture check, 462/462 TS tests, no regression; TS side untouched
this wave). Manually smoke-tested `inspect_template_candidate` against
the SF1 fixture (reproduces its known hash/structure correctly), a
non-spreadsheet file (handled as a gap, no panic), and a 26MB file
(refused before parsing).

**Independent review**: security-reviewer and architecture-reviewer
dispatched in parallel, both closed, **no BLOCKING findings from
either**. Security: 2 non-blocking items, both accepted as reasonable
tradeoffs for dev-only tooling with no runtime/security-boundary role
(compressed-vs-decompressed size-cap caveat now documented; the
promotion-guard bypass, see next item). Architecture: 6 non-blocking
items — 5 fixed this wave (added a `Superseded` guard to
`confirm_authoritative_source`, closing a latent re-promotion gap;
corrected this ADR's overstated "only function permitted" wording to
"only sanctioned path" since `TemplateEvidence`'s `pub` fields mean it's
convention, not compiler-enforced; wired the intake example to print
real enum values via `{:?}` instead of hardcoded strings; removed the
unused `EvidenceKind` enum and its tautological test, folding its
content into the module doc comment; fixed a misleading comment
placement in `mod.rs`), 1 accepted as expected-not-a-defect (zero
external consumers of `formgen::evidence` yet — expected for a pipeline
built ahead of its second real use). Full detail in ADR-0051's
"Independent review" section.

**Verification re-run after review fixes**: `cargo fmt --check` clean;
`cargo clippy --all-targets -- -D warnings` clean; `cargo test` — all
Rust tests pass, 11 `formgen::evidence` tests (net +1 after removing the
tautological test and adding the `Superseded` regression test).

**Committed and pushed**: `10d5efc`. **CI confirmed green for this exact
commit**: Quality Gate `33026121743` and Security Gate `33026121791`,
both `completed`/`success`. Wave 2K is fully closed.

**Exact next action**: this session is ending at a practical
session/context boundary (three waves, a compaction, and a usage-limit
interruption already in this session) — a valid stopping point per
`.claude/rules/autonomous-development.md`. The concrete next step for a
future session, not just a priority-order restatement: pick one of the
two retained-debt items below and act on it. Recommended first: take
the SF10 lead from ADR-0051/this wave's entry above — download one of
the four `support.lis.deped.gov.ph` SF10 URLs locally, run `cargo run
--example inspect_template_candidate -- <path>` against it, and record
its manifest as a `ProvenanceState::CandidateUnverified` evidence entry
in `formgen::evidence` (do NOT promote to `AuthoritativeSourceConfirmed`
without a confirmed DepEd Order/Memorandum citation) — this also gives
the evidence registry its first real consumer. Alternative: retry the
still-undispatched architecture/harness review owed since Wave 2J, or
live-smoke-test claude-mem's disable (both recorded in
`docs/VERIFICATION-DEBT.md`).

## Note: Wave 2J — Resilient Zero-Cost Memory Observer + Project-Brain Hardening, complete (superseded as "Active Task" by Wave 2K above, kept for history)

Full record: `docs/adr/0050-resilient-zero-cost-memory-observer.md`.
Harness/developer-infrastructure milestone — no learner-facing change.

**Mandatory Wave 2I checkpoint gate, verified first**: `git fetch`
clean; branch/HEAD both at `287a0f2` (Wave 2I's commit), matching
`origin`; `main` unchanged at `d9ab036`; working tree clean; 0
ahead/behind. Both Wave 2I CI runs (Quality Gate `33011365970`,
Security Gate `33011365972`) confirmed genuinely `completed`/`success`
before any Wave 2J implementation began — Quality Gate was still
`in_progress` on first check; work was correctly held until it finished.

**Incident**: `claude-mem` (a third-party, inference-backed, OPTIONAL
Claude Code plugin) exhausted its free-trial allowance ~3 days ago.
**Empirical finding**: this repository's actual durable memory
(`docs/*.md`, ADRs) was never affected — every wave in this session
(2G–2I) updated it successfully throughout the outage, because it was
never dependent on claude-mem or any external inference call.

**Ten-scenario decision**: repository-brain-authoritative + a new
deterministic local journal (`scripts/memory/`), with claude-mem
disabled entirely (not deleted) rather than wrapped in a circuit
breaker — because no external inference call exists anywhere in the
new code's path, most of the required failure-state machine describes
states this architecture cannot enter; that absence is documented
directly rather than built around. `d2a8k3u/claude-code-memory`
evaluated and classified REFERENCE (not needed at this scale). Full
scoring in ADR-0050.

**What was built**: `scripts/memory/journal.mjs` (deterministic,
replay-safe capture — SHA-256 id from normalized project/session/type/
content, never a timestamp), `scripts/memory/recall.mjs` (grep-based,
verbatim retrieval — no LLM, no embeddings), `scripts/memory/
health.mjs` (`/memory-health` skill, zero-cost diagnostic, no network
call), `scripts/memory/capture-session-stop.mjs` (new project-scoped
`Stop` hook — captures only git HEAD sha/subject + changed file PATHS,
never file contents/env vars/Bash output; secret-shaped paths dropped
before recording). `.claude/memory/` gitignored. Global
`~/.claude/settings.json`: `claude-mem@thedotmack` flipped to `false`
(reversible, data preserved) — **this is a machine-wide change, not
repository-scoped**, disclosed plainly.

**Highest-value test this wave**: `recall.test.mjs`'s "NOT_VERIFIED
must never be corrupted" suite, run against the REAL
`docs/VERIFICATION-DEBT.md` — proves SF1 fidelity, SF9 fidelity, and
Windows packaging are all still recoverable as `NOT_VERIFIED`, that
recall returns only verbatim substrings of source lines, and that none
of the canonical docs contain fabricated "PASSED/VERIFIED/confirmed"
phrasings for those three facts.

**Two independent reviews dispatched in parallel this wave** (security;
failure-mode/silent-failure) — correcting Wave 2I's own disclosed
process gap of dispatching reviews sequentially/incompletely. **A
third role (architecture/harness review) was NOT dispatched — recorded
honestly as retained debt, not omitted from this report**, per the
brief's explicit instruction not to repeat Wave 2I's under-recording.
**Both reviews closed, no blocking findings.** Security review: 3
non-blocking items, all fixed/corrected (commit-subject redaction added;
claude-mem disable-certainty corrected in ADR-0050; fail-open doc
comment narrowed). Failure-mode review found and fixed 2 REAL bugs with
new regression tests: a truncated mid-write journal line could silently
destroy the next valid observation too (fixed via a trailing-newline
check before append); `computeHealth()` was not actually crash-safe
against a directory-level read failure (fixed by wrapping directory/
file reads in try/catch). Full detail in ADR-0050's "Independent
review" section.

**Verification (re-run after the review fixes)**: `npx vitest run
scripts/memory` — 24/24 passed (22 + 2 new regression tests for the
bugs the failure-mode review found). `npm run quality` — clean, 462 TS
tests (up from 438; no regression). No Rust code touched this wave —
Rust gates not re-run (nothing to verify there).

**Exact next action**: commit/push this checkpoint (branch
`claude/likha-sis-wave2a-learner-core`) with the remaining review debt
(undispatched architecture role; claude-mem disable not empirically
live-tested; unbounded journal growth; theoretical cross-process race)
explicitly retained in `docs/VERIFICATION-DEBT.md`. Confirm CI green
for the exact commit before considering this wave fully closed.

## Note: Wave 2I — Multi-Form Official-Form Contract + SF9 Readiness, complete (superseded as "Active Task" by Wave 2J above, kept for history)

Full record: `docs/adr/0049-multi-form-official-form-contract.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`). Note: the directing prompt
called the prior checkpoint (commit `313ac0f`) "Wave 2H"; this
repository's own continuous numbering calls it "Wave 3" — both labels
refer to the same commit; ADR-0049 records this explicitly.

**Repository-truth/CI verified first**: `git fetch` clean; branch and
local HEAD both at `313ac0f068d0c8aafbcf9025492562550fd65eb1`, matching
`origin`; `main` unchanged at `d9ab036`; working tree clean before work
began. Both Wave 3 CI runs re-confirmed genuinely `completed`/`success`
for that exact commit (Quality Gate `33006880512`, Security Gate
`33006880522`).

**SF9 evidence gate**: no authoritative DepEd SF9 template exists in
this repository or was obtainable from `deped.gov.ph` (a direct fetch of
the department's own homepage found no School Forms/SF9 link). Every
other source found was a third-party/community recreation —
COMMUNITY/UNVERIFIED, never OFFICIAL. **`OFFICIAL_SF9_FIDELITY =
NOT_VERIFIED`**, unconditionally — SF9 work this wave is architecture-
readiness only, against a clearly synthetic fixture.

**Ten-scenario decision**: kept `OfficialFormGenerator` (SF1) and added
a separate `Sf9FormGenerator` trait rather than one generic multi-form
port with a shared/generic request type — a shared type is exactly how
an SF9 field could silently compile as SF1 data. Generalized only
`TemplateDescriptor`: added `workbook_format: WorkbookFormat` (`Xlsx` |
`LegacyXls`, the concrete, tested expression of the "`.xlsx` does not
imply Java, `.xls` does not imply Rust" adapter policy — see
`umya_adapter::reject_unsupported_format`), and widened
`data_columns`/`header_cells` from SF1-shaped fixed arrays to
`&'static` slices. Full scoring in ADR-0049.

**What was built**: `formgen::sf9` (domain contract) →
`formgen::Sf9FormGenerator` (port) → `formgen::umya_adapter::
UmyaSf9Generator` → a SHA-256-hash-pinned bundled SYNTHETIC template
(`resources/sf9/`, registered in `tauri.conf.json`).
`formgen::sf9_projection::subject_term_grades_for_learner` (new,
read-only) builds SF9's subject/term grade rows by calling the
EXISTING `repository::grading_computation::compute_term_grade` once per
class record via the new `repository::class_record::
list_by_section_in_school` — no grading rule is reimplemented anywhere
in `formgen`. `commands::formgen::generate_sf9_form` mirrors
`generate_sf1_form`'s authorization/output-path discipline exactly (no
caller-supplied output path; `school_id` session-derived;
`section_id`/`learner_id` resolved only within that school).

**One independent review dispatched (security — SF9 authorization
parity, atomic-write correctness, projection-query isolation,
format-rejection ordering, log/error PII exposure): CLOSED, no
`BLOCKING` findings.** One `NON-BLOCKING` should-fix, fixed: `formgen::
sf9_projection` had a stated-but-unenforced precondition that
`learner_id` belongs to `school_id` — fixed by adding a direct
`learner::find_by_id_in_school` check as the first thing the function
does (defense in depth, independent of the caller), proven by two new
tests (a nonexistent learner id, and a REAL learner id from a
DIFFERENT school, both rejected). The other three roles the brief's own
§12 names (workbook/template fidelity, architecture/maintainability,
and a confirmation pass) were NOT dispatched this wave — retained as
verification debt, not dropped, per this project's established
reviewer-harness fallback rule.

**Verification**: `cargo nextest run` — 557/557 passed (up from Wave
3's 546; SF1's own suite unchanged and still green — the descriptor's
array→slice widening did not regress SF1). `cargo test` (stable-
checkpoint gate) — green, 0 doctests. `cargo fmt --check`/`cargo clippy
--all-targets -D warnings` — clean. `cargo deny check` — clean, no new
dependency. `npm run quality` — clean, 438 TS tests, no frontend
regression (no UI added this wave — deliberate, per the brief's
minimal-UI-only guidance and "no full SF9 UI" scope guard).

**Exact next action**: commit and push this checkpoint (branch
`claude/likha-sis-wave2a-learner-core`), confirm CI green for the exact
commit, then return to LIKHA's priority order for the next
highest-value work. Do not begin SF10 — no candidate pre-selected for
the next wave.

## Note: Wave 3 — Authoritative-Template SF1 Form Engine, complete (superseded as "Active Task" by Wave 2I above, kept for history)

Full record: `docs/adr/0048-official-form-engine-sf1.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 3 section. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first**: `git fetch` clean;
branch and HEAD both at `c23cf16` (Wave 2G's checkpoint); `main`
unchanged at `d9ab036`; working tree clean. Both Wave 2G CI runs
re-confirmed genuinely `completed`/`success` for that exact commit
(Quality Gate `32982080979`, Security Gate `32982080980`) before any
Wave 3 work began.

**Authoritative-template evidence gate**: no official SF1 template
exists anywhere in this repository or was obtainable from this
environment (same disclosed gap ADR-0043 already recorded for the
import direction). The engine was built and tested against a synthetic
fixture instead — **official SF1 fidelity remains `NOT_VERIFIED`**,
recorded as verification debt rather than claimed.

**Ten-scenario decision**: departed from the brief's own named working
hypothesis (Java + Apache POI/HSSF sidecar) on the strength of this
repo's own prior evidence — a real, in-use `CONSO SF v2025.xlsx` DepEd
workbook (inspected during M8) is `.xlsx`, not legacy `.xls`. Adopted
`umya-spreadsheet` (MIT, pure Rust, zero new runtime/packaging/process-
invocation surface) instead; Java/POI retained as documented Next Best
with an explicit switch condition. Full scoring in ADR-0048.

**What was built**: `formgen::sf1` (domain contract) →
`formgen::OfficialFormGenerator` (port) → `formgen::umya_adapter`
(the only production module coupled to `umya-spreadsheet`) → a
SHA-256-hash-pinned bundled template resource (`resources/sf1/`,
registered in `tauri.conf.json`). `commands::formgen::generate_sf1_form`
resolves the output path itself from sanitized, authorized data (no
caller-supplied path at all), reads roster data through existing
repositories, and writes atomically. `formgen::fidelity` (test-only)
proves structural fidelity — sheet names/merges/formulas/sizing/defined-
names — survives generation, including at the full 30-learner capacity.
No new migration; no UI screen (deliberately deferred).

**Three independent reviews, all CLOSED, no blocking findings** (form
fidelity, security/native-boundary, architecture/maintainability — all
three hit this project's recurring reviewer-retrieval bug, recovered
via the established protocol). Fixed: a genuine temp-file-cleanup gap
(rename failures weren't cleaned up, only write failures were); four
tests whose names claimed more than their bodies proved; an inaccurate
"only module" doc claim (fixed by gating `formgen::fidelity` test-only);
an unimplemented "defined names" fidelity claim (now implemented); two
dangling ADR-section citations in code comments. Newly disclosed:
generated files are unencrypted (a deliberate, now-explicit data-
exposure boundary); the generation authorization gate matches sibling
export commands' existing convention. Full detail:
`docs/VERIFICATION-DEBT.md`'s Wave 3 entry.

**Verification**: `cargo nextest run` — 546/546 passed (up from 521
pre-milestone). `cargo test` (stable-checkpoint gate) — green, 0
doctests. `cargo fmt --check`/`cargo clippy --all-targets -D warnings`
— clean. `cargo deny check` — clean (advisories/bans/licenses/sources
all ok). `npm run quality` — clean, 438 TS tests, no frontend
regression. `npm run build` — clean production build. `npm run
quality:security` — `cargo-deny` clean locally; `gitleaks`/`osv-scanner`
not installed on PATH this session (disclosed, not new — CI's Security
Gate is authoritative).

**Exact next action**: return to LIKHA's priority order for the next
highest-value work. Candidates: expanding the SF1 form engine's UI
surface (a minimal "Generate SF1" screen, deferred this wave), pursuing
a real authoritative SF1 template to close the `NOT_VERIFIED` fidelity
gap, or a genuinely new milestone per the project's standing autonomous-
selection process — no candidate is pre-selected here; select using
current evidence at the start of the next session, per
`.claude/rules/autonomous-development.md`.

## Note: Wave 2G — External API & Government Reference-Data Foundation, complete (superseded as "Active Task" by Wave 3 above, kept for history)

Full record: `docs/adr/0047-psgc-reference-data-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top entry, `docs/SOURCE-REGISTRY.md`'s
Wave 2G section. Same branch as prior waves
(`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first**: `git fetch` clean;
branch and HEAD both at `c00bc15` (Wave 2F's checkpoint); `main`
unchanged at `d9ab036`; working tree clean. Both Wave 2F CI runs
re-confirmed genuinely `completed`/`success` for that exact commit
(Quality Gate `32964519995`, Security Gate `32964520041`) before any
Wave 2G work began.

**Ten-scenario decision**: Recommended = a local-file PSGC importer
(no live PSA network call) — explicitly the brief's own "Next Best"
hypothesis, taken because PSA's own API site returned HTTP 403 from
this environment (couldn't even be reached to inspect, let alone build
a live-sync importer against). Full scoring of all ten designs in
ADR-0047.

**What was built**: `reference_geo_snapshots`/`reference_geo_units`
(migration 20) — deliberately global (no `school_id`, the only tables
in this schema without one) and append-only/versioned (old generations
never deleted, only one `is_current` per source, enforced by both
application logic and a schema-level partial unique index).
`import::psgc` (parse/validate an untrusted JSON snapshot file) →
`repository::reference_geo` (transactional versioned commit, same
all-or-nothing shape as SF1's `commit_import`) → `commands::reference_geo`
(3 commands: import gated behind `ManageLearners` with actor
attribution, reads gated behind only an active session). **Zero
dependencies added.** No UI screen built this wave (deliberately
deferred, per the brief's own permission).

**12 external providers classified** (PSGC ADOPT/implemented; PSCED,
OpenSTAT REFERENCE/PILOT; Turnstile, Biometric, Updater ADOPT-direction/
deferred; Barcode/QR PILOT; DepEd Integration, eGov WATCH; GeoRisk
REFERENCE/PILOT; scraping REJECT; AI providers DEFER) — full table in
`docs/SOURCE-REGISTRY.md`.

**Three independent reviews, all CLOSED, one blocking finding fixed**
(security/privacy, reliability/architecture, teacher/compliance — two
of the three independently converged on the same root defect, both hit
this project's recurring reviewer-retrieval bug and were recovered via
the established protocol). Blocking: read commands hardcoded
`"PSA PSGC"` while the importer accepted any `sourceName` — a
mismatched import silently succeeded then became permanently invisible
to every read. Fixed with an `EXPECTED_SOURCE_NAME` constant enforced
at parse time plus a schema-level partial unique index. Also fixed:
two test-quality gaps (a rollback test that never called the function
it claimed to prove; a "reconnect" test that never reconnected), a
level-adjacency validation gap (same-level malformed hierarchy
acceptance was file-order-dependent), missing actor attribution, zero
command-layer test coverage (added), and a misleading `unit_count: 0`
on no-op re-imports. Full detail: `docs/VERIFICATION-DEBT.md`'s Wave
2G entry.

**Verification**: `cargo nextest run` — 521/521 passed (up from 501
pre-milestone). `cargo test` (stable-checkpoint gate) — green,
including 0 doctests. `cargo fmt --check` — clean. `cargo clippy
--all-targets -- -D warnings` — clean. `npm run quality` — clean, 438
TS tests, no frontend regression (no frontend files touched).
`npm run build` — clean production build. `npm run quality:security`
— `cargo-deny` clean locally; `gitleaks`/`osv-scanner` not installed
on PATH this session (disclosed, not new — CI's Security Gate is
authoritative for this zero-new-dependency diff).

**Exact next action**: Wave 3 — Authoritative-Template SF1 Form Engine
(per this project's own priority order and the milestone's own explicit
instruction that Wave 2G must not begin it automatically). Before
starting, read `docs/adr/0047-psgc-reference-data-foundation.md`'s
"Remaining verification debt" section — it records a concrete
constraint the SF1/address work must honor: any future learner-address
field must key on `reference_geo_units.code`, never `.id`/`snapshot_id`.

## Note: Wave 2F — harness closure + security CI gate (2026-08-26) — separate from the feature track below

Two non-feature milestones ran after Wave 2E, neither touching
`src/`/`src-tauri/` product code:

1. **Harness audit** (`docs/adr/0045-claude-code-harness-audit.md`):
   enabled `typescript-lsp`/`rust-analyzer-lsp`/`claude-code-setup`/
   `claude-security` in `.claude/settings.json`.
2. **Wave 2F closure** (same ADR's addendum,
   `docs/adr/0046-security-ci-gate.md`): closed the harness audit's own
   disclosed LSP live-behavior gap (both LSP servers demonstrated and
   `grep`-cross-checked working — see `docs/VERIFICATION-DEBT.md`); ran
   a controlled MCP pilot (zero MCP servers installed — `gh` CLI,
   `playwright-cli`, and ordinary web lookup all beat their MCP
   alternative on real evidence); wired `gitleaks`/`cargo-deny`/
   `osv-scanner` into a new, separate `.github/workflows/security.yml`
   CI gate, closing Wave 2E's own recorded verification debt.

**This does not change the "Active Task"/"exact next action" below**
— Wave 2E is still the most recently completed LIKHA _feature_
milestone; resume LIKHA product work from its own "exact next action"
as normal, not from this note.

## Active Task (2026-08-26, this session — Wave 2E: SF1 Import Operational Hardening & Auditability, complete)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A/2A.1/2B/2C/2D (`claude/likha-sis-wave2a-learner-core`).

**Repository-truth/CI hard gate verified first, per this milestone's
own explicit instruction**: `git fetch` clean; branch and `origin`
both at `364214f` (Wave 2D's checkpoint) as reported; `main` unchanged
at `d9ab036`; working tree clean. CI run `32951314150` for that exact
commit was polled until it genuinely reached `completed`/`success`
(it was still `in_progress` at the start of this session) before any
Wave 2E implementation began.

**What was built**: `sf1_import_history` (migration 19), written
inside `import::commit::commit_import`'s existing single transaction
so a history row exists if and only if the batch it describes actually
committed — deliberately no `status` column. A SHA-256 content
fingerprint (`import::fingerprint`, a zero-build-cost `sha2` direct
dependency already resolved transitively via `tauri-codegen`) for an
advisory-only re-import notice, compared by content never filename,
never blocking a commit. New `list_sf1_import_history` command, same
`ManageLearners` gate and session-derived `school_id` as every other
SF1 command. `commit_sf1_import` re-reads the file server-side for
provenance rather than trusting a client-supplied filename/hash.
Teacher-facing: a non-blocking advisory banner on the preview screen
and a minimal "View past imports" panel (no raw SF1 content, no
learner PII).

**Two independent reviews, both CLOSED** (both hit this project's
recurring reviewer-retrieval bug on the standard notification channel
— empty/stub first reply for both — and both recovered in full on one
retry via direct message). Security review: no blocking findings
across all 8 requested angles; 2 non-blocking doc-comment-accuracy
should-fix items, both fixed in this checkpoint. Architecture review:
no blocking findings across all 8 requested angles, but one real gap
found and fixed — `commit_import` had no server-side guard against an
empty `plans` slice (only the frontend guarded against it), which
would have written a phantom "0 rows, 0 learners" history row; now
rejected server-side with a dedicated test. Full detail:
`docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2E addendum.

**A real CI-only bug was caught and fixed after the first push** (see
`docs/VERIFICATION-DEBT.md`'s top entry for full detail): `Quality
(Ubuntu)` failed one new test because `safe_filename`'s first cut
delegated to `std::path::Path::file_name()`, whose `\`-as-separator
handling is Windows-only at compile time — this app's own CI also runs
the same suite on `ubuntu-latest` (ADR-0041), where a hardcoded
Windows-style test path came back unsplit. Fixed by splitting on `/`
and `\` explicitly instead of relying on host-OS path semantics, with
two new tests (forward-slash path, trailing-separator edge case)
proving both cases directly rather than incidentally.

**Verification, all actually run**: `cargo nextest run` 501/501 (up
from 498 — the empty-plans guard test plus two new cross-platform
`safe_filename` tests) + plain `cargo test` (includes doctests) also
green; `cargo fmt --check`/`cargo clippy --all-targets -- -D warnings`
PASS, clean; native `cargo build` (debug, full binary) PASS — `cargo
build --release` failed on a local Perl/OpenSSL toolchain gap in this
session's shell specifically, unrelated to this milestone's code (see
`docs/VERIFICATION-DEBT.md`); `npm run test` 438/438 (one transient
`App.test.tsx` flake observed once, re-confirmed clean on immediate
re-run, unrelated to any file this milestone touched); `tsc -b
--noEmit`/`eslint .`/`prettier --check .`/`npm run check:architecture`
all clean; `npm run build` (production Vite build) PASS.
`gitleaks`/`cargo-deny`/`osv-scanner` re-run against
the changed dependency graph (new `sha2`) — all clean.

**Not done this session, deliberately**: wiring the three security
tools into CI (a concrete named plan recorded instead of a repeated
deferral — see the ADR addendum); cloud sync; Android key store; SF10;
unrelated attendance/grading work; a full-codebase PII-logging audit
(explicit non-goals).

## Active Task (2026-08-26, this session — Wave 2D: Local Data Security Verification, complete)

Full record: `docs/adr/0044-local-data-security-verification.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A/2A.1/2B/2C (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: branch/`origin` HEAD both at
`3be4ef3` as reported, `main` unchanged at `d9ab036`, working tree
clean. Wave 2C's CI run (`32941620676`) confirmed genuinely
`completed success` (17m56s) before any Wave 2D work began.

**Critical repository-truth correction the directive got wrong**: this
milestone's brief assumed local-data encryption did not exist yet. **It
already did** — SQLCipher + DPAPI, built and accepted in M2
(`docs/adr/0003-encryption-at-rest.md`). This session re-scoped
accordingly: verify/harden the existing architecture rather than build
a new one. See ADR-0044's "Repository truth" section for the full
correction.

**What was actually new this session**:

1. **Primary-evidence proof using real `sqlite3.org` CLI tooling**
   (freshly `winget`-installed) against a genuine encrypted LIKHA
   database file with synthetic data — `.tables` empty, raw `SELECT`
   fails with "file is not a database," raw byte-level `grep` finds
   zero plaintext occurrences of the synthetic name/LRN/school-name
   anywhere in the file. The literal "ordinary SQLite tooling" scenario
   from the brief, proven with primary evidence, not only the app's own
   `rusqlite`-based test suite.
2. **One genuine coverage gap found and closed**: WAL/SHM sidecar files
   (enabled since M1/M2, unrelated to encryption) had never been
   checked for plaintext leakage. New test
   (`wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`,
   `src-tauri/src/db/mod.rs`) proves neither sidecar file leaks
   plaintext while the WAL file genuinely holds unflushed content.
3. **Long-carried dependency-security debt (unavailable since M6) —
   closed for this session**: `gitleaks`/`cargo-deny`/`osv-scanner` all
   installed via `winget`/`cargo install` (network access available)
   and actually run. `gitleaks`: 55 commits, no leaks. `cargo-deny`:
   advisories/bans/licenses/sources all ok. `osv-scanner`: no
   unaccounted-for issues (17 known, all pre-documented). Directly
   confirms `calamine`/`tauri-plugin-dialog` (Wave 2B/2C additions) have
   no flagged advisories. **Not wired into CI** — deliberately deferred
   (see VERIFICATION-DEBT.md) to avoid untested cross-platform CI
   changes against a currently-green pipeline.
4. **Full 17-scenario threat model documented explicitly** in ADR-0044,
   with an honest in-scope/out-of-scope boundary. No local self-service
   recovery path exists for a lost key or device/profile change —
   deliberately not solved with an insecure workaround, deferred to
   future authenticated cloud-sync infrastructure.

**Independent reviews — both CLOSED, no blocking findings.** Security
review (9 angles) found all 8 adversarial angles FALSE-POSITIVE and one
legitimate should-fix (this ADR's first draft understated its own
logging-surface audit — corrected in place). Architecture review (7
questions) found GOOD across the board, including catching and closing
its own thin first-pass sampling before confirming no production
layering violation. Both hit this project's recurring
reviewer-retrieval bug on the standard notification channel; recovered
in full from each agent's raw transcript file both times. Full detail:
`docs/adr/0044-local-data-security-verification.md`'s review sections.

**Verification, all actually run**: full `cargo test` 394 lib tests (up
from 393 — the one new WAL/SHM test) + all integration binaries PASS;
`cargo fmt --check`/`cargo clippy --all-targets -D warnings` PASS;
native `cargo build` succeeds; `npm run quality` PASS (unaffected — no
frontend changes this milestone).

## Active Task (2026-08-26, this session — Wave 2C: SF1 Import Preview + Duplicate Review UX, complete)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`'s Wave 2C
addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as
Wave 2A/2A.1/2B (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: branch/`origin` HEAD both at
`926eddc` as reported, `main` unchanged at `d9ab036`, working tree
clean. **Wave 2B's own CI run (`32938597210`) had actually failed** —
Prettier drift in three docs edited after the last local `npm run
quality` pass, the exact same class of gap this project's own prior
lesson already named ("run the full gate before every push, including
docs-only edits"). Fixed immediately (`5105cef`, confirmed green
`32939416520`) before starting any Wave 2C work, per this milestone's
own instruction not to build UI on an unconfirmed checkpoint.

**What was built**: `src/ui/Sf1ImportScreen.tsx` (workflow screen) +
`src/ui/components/Sf1DuplicateReview.tsx` (side-by-side duplicate
comparison), under a new "SF1: Enrollment" nav tab. Full domain/
application/infrastructure layers added
(`src/domain/sf1-import.ts`, `src/application/sf1-import-service.ts`,
`src/infrastructure/tauri/sf1-import-repository.ts`) mirroring Wave
2B's Rust contract exactly, including the serde externally-tagged wire
format for `Sf1RowAction`. New native file-picker port
(`src/domain/ports/file-picker.ts` /
`src/infrastructure/tauri/file-picker.ts`) backed by
`tauri-plugin-dialog`/`@tauri-apps/plugin-dialog` (first-party Tauri
plugins, `dialog:allow-open` permission only).

**No backend changed**: the UI adapts to Wave 2B's existing
preview/commit contract; no new Tauri command, no schema change, no
re-implementation of parsing/validation/matching in TypeScript. No
merge option anywhere (matches Wave 2A.1's finding that this codebase
has no merge capability). UI never supplies `school_id` or a
capability — proven by both existing backend tests and new UI-level
assertions.

**Independent teacher-UX review — CLOSED**: found and fixed 4 real
issues this same session (only the first of possibly several duplicate
candidates was ever shown/decided against; the safety reassurance was
Guided-only instead of all-mode; a whole-file failure gave one generic
message instead of recognizing the backend's `import_error` category;
inconsistent "not tracked"/"not stored" phrasing). Standard
notification channel hit this project's recurring reviewer-retrieval
bug again; recovered in full from the agent's raw transcript file, same
technique as Wave 2B's security review. Full detail:
`docs/VERIFICATION-DEBT.md`.

**Verification, all actually run**: 25 new tests (application service,
2 infra adapters, screen component) all passing; full `npm run test`
429/429 PASS (up from 404 pre-Wave-2C); `tsc -b --noEmit`/`eslint .`/
`prettier --check .`/`check:architecture` all clean; `cargo fmt
--check`/`cargo test` (393 lib tests, unchanged — no Rust logic
changed)/`cargo clippy --all-targets -D warnings` all PASS; native
`cargo build` succeeds; `npm run build` succeeds. Android kept
deliberately out of scope — no Android build target exists in this
codebase yet, so there is nothing to evaluate feasibility against, per
`CLAUDE.md`'s "Windows first; Android later."

**Deliberately not built this checkpoint**: a Playwright/native visual
pass on the compiled Tauri binary (no browser/screenshot tool available
for it in this environment, same standing disclosed gap as every prior
UI milestone) — recorded honestly in `docs/VERIFICATION-DEBT.md`, not
claimed as covered.

## Active Task (2026-08-26, this session — Wave 2B: SF1 Bulk Import Engine, engine checkpoint complete, UI deferred)

Full record: `docs/adr/0043-sf1-bulk-import-engine.md`. Same branch as
Wave 2A/2A.1 (`claude/likha-sis-wave2a-learner-core`).

**What was built**: the full SF1 bulk-import engine —
`src-tauri/src/import/{workbook,normalize,validate,matching,preview,commit,sf1}.rs`
— plus `commands::import::{preview_sf1_import,commit_sf1_import}`
(both `ManageLearners`-gated), registered in `lib.rs`'s
`invoke_handler`. Pipeline: `.xls`/`.xlsx` workbook → `calamine`
adapter → safe normalization → row validation (errors block commit,
warnings don't) → duplicate matching (reuses `learner::find_candidates`
from Wave 2A) → preview → one-transaction commit (reuses
`learner::create`/`section_membership::enroll` completely unchanged,
via `Transaction`'s deref-coercion to `Connection`, verified directly
before the pipeline was designed around it).

**Parser decision**: `calamine` (pure Rust, MIT, read-only), not the
Java/Apache-POI sidecar the roadmap names for **export** — that sidecar
infrastructure doesn't exist anywhere in this codebase yet, so there was
nothing to reuse; reading only needs cell values, a materially smaller
job than POI's template-preserving-write use case. Full reasoning in
ADR-0043.

**Fidelity disclosure (important, read before touching
`import::workbook`)**: no official DepEd SF1 `.xls` template exists in
this repo or was reachable from this environment — the column layout
`import::workbook` searches for is this project's own invented
structure, verified only against a synthetic fixture
(`tests/fixtures/sf1_synthetic_*.xls`, generated by
`tests/fixtures/generate_sf1_fixtures.py`, SYNTHETIC DATA ONLY). The
engine above `import::workbook` is fully verified; the exact real-form
mapping is not. Recorded as external material only the user can
provide, not guessed at.

**No merge, no import-fingerprint table**: `DuplicateResolution` is
`UseExisting`/`CreateSeparate` only (Wave 2A.1's own audit already
established this codebase has no learner merge/delete capability, and
this milestone doesn't invent one). Re-import dedup relies entirely on
existing DB invariants (`idx_learners_school_lrn`,
`idx_one_active_membership_per_learner`, `enroll()`'s own idempotency)
rather than a new table — proven end-to-end by a same-file-twice
integration test.

**Verification, all actually run**: 43 new `import::*` unit tests + 8
new `tests/sf1_import.rs` integration tests, all passing; full `cargo
test` 393 lib tests + all integration binaries PASS; `cargo fmt
--check`/`clippy --all-targets -D warnings` PASS; `npm run quality`
PASS (390 vitest tests, unaffected — no frontend/TS changes this
milestone). A dedicated failure-injection test proves whole-batch
rollback (a later row's LRN-uniqueness violation leaves zero rows from
earlier in the same batch committed). `gitleaks`/`cargo-deny`/
`osv-scanner` remain unavailable (same disclosed gap as every prior
dependency addition) — `calamine`'s supply-chain check has not run;
recorded in `docs/VERIFICATION-DEBT.md`.

**Deliberately not built this checkpoint**: the import-preview UI
screen. This follows this project's own established zero-or-minimal-UI-
first precedent (RBAC, Curriculum Foundation, Teacher Load, Wave 2A) and
the autonomous-development session-safety rule — the engine + full
authorized vertical slice (commands, not just repository functions) is
a stable, independently useful checkpoint on its own. Next actionable
step: build the import-preview screen (New/Existing/Needs
Review/Errors, Efficient/Comfortable/Guided parity) on top of this
already-tested contract — no engine redesign needed first.

**One independent security review — CLOSED**: dispatched narrow-scope
with numbered questions; the standard notification channel again hit
this project's recurring reviewer-retrieval bug, but the findings were
recovered this time by reading the agent's raw transcript file directly
rather than falling back to self-review. 7 of 8 questions FALSE
POSITIVE with direct file:line citations; one real should-fix
(`import::workbook.rs`'s row-count cap is checked only after `calamine`
has already materialized the sheet into memory — `calamine` has no
cheaper API to count rows first) addressed by disclosure in place and
in `docs/VERIFICATION-DEBT.md`, since the file-size cap remains the real
bound on that specific risk shape for this single-tenant desktop app.
Full breakdown: `docs/adr/0043-sf1-bulk-import-engine.md`'s Security
Review section.

## Active Task (2026-08-26, this session — Wave 2A.1: Authorization Closure, complete)

Full record: `docs/adr/0042-learner-core-enrollment-domain-foundation.md`'s
Addendum, `docs/VERIFICATION-DEBT.md`'s top entry. Same branch as Wave
2A (`claude/likha-sis-wave2a-learner-core`).

**Repository truth verified first**: `main` unchanged at `d9ab036`,
branch clean, both expected Wave 2A commits (`f337d8f`, `8b83932`)
present exactly as reported.

**The reported gap confirmed and fixed**: `create_section` had no
capability check at all (same class of bug as Wave 2A's
`enroll_learner_in_section` fix) — any Teacher could create sections.
Fixed to `Capability::ManageTeachingAssignments` (School Head only,
reusing the existing Teacher Load capability — no new capability
invented, per instruction). Six new authorization tests added,
including the explicit adversarial proof (Teacher rejected, no partial
mutation) and a Registrar-alone-denied test confirming the
`ManageLearners`/`ManageTeachingAssignments` split is intentional.

**Bounded Wave 2A mutation-surface audit**: all 11 commands across
`commands/section.rs`/`commands/learner.rs` inventoried — every write
now capability-gated, every read correctly stays session-scoped-only
(the established convention, not a gap), no client-supplied
`school_id` anywhere, no IDOR found. No further defect discovered; no
scope expansion needed.

**Independent `security-reviewer` — CLOSED, real findings retrieved**
(this specific dispatch broke the retrieval-failure streak the
Integration Review and Wave 2A milestones both hit). 5 of 6 adversarial
questions FALSE-POSITIVE with direct citations; one non-security
SHOULD-FIX (document the capability split as deliberate) — addressed
in ADR-0042's addendum. No BLOCKING findings.

**Verification, all actually run**: `enrollment.rs` 13/13 PASS (up
from 7); full `cargo test` 350 lib tests + all integration binaries
PASS; `cargo fmt --check`/`clippy -D warnings` PASS; native `cargo
build` succeeds; `npm run quality:full` PASS; `git diff --check`
clean. `gitleaks`/`cargo-deny`/`osv-scanner` confirmed still
unavailable (`check-security.mjs`: 0 ok, 3 missing, honestly
disclosed, not installed). Codex Pilot: BLOCKED (not logged in, same
unchanged condition as prior sessions, not re-probed).

**Gate decision: WAVE 2A.1 AUTHORIZATION CLOSURE PASSED — READY FOR
WAVE 2B SF1 BULK IMPORT ENGINE.** `main` untouched. Per explicit
instruction, Wave 2B is **not** started — this session stops here and
waits for approval.

## Active Task (2026-08-26, this session — Wave 2A: Learner Core + Enrollment Domain Foundation, complete)

Full record: `docs/adr/0042-learner-core-enrollment-domain-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top entry. Branch
`claude/likha-sis-wave2a-learner-core`, branched from verified `main`
at `d9ab036`.

**Repository truth verified first**: `main`/`origin/main` both at
`d9ab036`, clean, CI green — matched the expected baseline exactly.

**Inspected the existing learner model before designing anything, and
found the domain foundation already substantially built**: `learners`
(identity only — name/LRN/sex, never grade/section/school_year) and
`section_memberships` (already the enrollment-history model — half-open
interval `[starts_on, ends_on)`, a `UNIQUE INDEX ... WHERE ends_on IS
NULL` enforcing "one current placement" as a database invariant,
transfer/history already correct and already tested) already correctly
separate identity from placement. The 10-scenario domain decision
(full record in ADR-0042) concluded: **no new table, no migration** —
building a parallel `enrollments` table would have created exactly the
"two systems representing who's placed where" duplication risk the
prior Integration Review milestone was watching for.

**DepEd/SF1 research** (secondary sources, `deped.gov.ph` unreachable
this session — disclosed, not primary-source-verified): confirmed
LRN's permanent, 12-digit, transfer-surviving shape (already correctly
built, ADR-0017); confirmed SF1's own Remarks column tracks
transfer/drop/Balik-Aral status — deliberately **not** encoded now
(the taxonomy mixes placement-reason and unrelated learner-flag
concerns; belongs to Wave 3's Form Engine, which will need SF1's exact
field requirements). The schema is additive-only, so this is deferred
with zero destructive-redesign risk, not precluded.

**A real, previously undiscovered authorization gap was found and
closed**: `commands::section::enroll_learner_in_section` was gated
only by an active session — no role check at all, so any Teacher could
enroll or transfer any learner into any section. Fixed to reuse
`Capability::ManageLearners` (same gate as `create_learner`/
`update_learner`, per this codebase's own established "same capability,
not a separate one" convention). `create_section`'s identical gap was
found in passing and spawned as a separate follow-up task, not fixed
here (a different, adjacent decision — section _definition_ is closer
to scheduling/admin than learner enrollment).

**Vertical slice delivered, repository/command layer, no UI**: an
authorized Registrar or School Head creates a learner, enrolls them
into a section, and retrieves both their current enrollment and full
history — proven end-to-end by a new integration test file
(`src-tauri/tests/enrollment.rs`, 7 tests, including the explicit
adversarial proof that a Teacher session is now rejected where it
previously would have succeeded). Two new read-only repository
functions (`section_membership::list_by_learner_in_school`/
`current_membership_for_learner_in_school`) and one duplicate-candidate
lookup (`learner::find_candidates` — exact-LRN or exact-name match,
school-scoped, never auto-merges) back three new commands.

**Verification, all actually run this session**: targeted repository
tests (10 new, `section_membership::`/`learner::`) PASS; new
integration suite (`enrollment.rs`, 7/7) PASS; full `cargo test` PASS
(350 lib tests, up from 342, + all integration binaries incl. the new
one); `cargo fmt --check` PASS; `cargo clippy --all-targets -- -D
warnings` PASS, 0 warnings; native `cargo build` succeeds (harmless
pre-existing PDB warning only); `npm run quality:full` PASS end-to-end;
`git diff --check` clean. Two stray 0-byte junk files (`(String`,
`Connection` — the same accidental-artifact class documented earlier
in this project's history) were found untracked and deleted, not
committed.

**Independent `security-reviewer`** dispatched for the authorization
gap and the three new commands; hit the recurring agent-resume/
retrieval failure on both the initial dispatch and the one permitted
retry. Rigorous self-review substituted, answering all six adversarial
questions the dispatch was given — no BLOCKING or SHOULD-FIX findings;
real independent-review debt recorded as open in
`docs/VERIFICATION-DEBT.md`.

**Gate decision: WAVE 2A LEARNER CORE + ENROLLMENT FOUNDATION PASSED —
READY FOR SF1 BULK IMPORT ENGINE.** `main` untouched. Per explicit
instruction, Wave 2B (SF1 bulk import) is **not** started — this
session stops here and waits for approval.

## Active Task (2026-08-26, this session — Integration Review + Main Fast-Forward Decision, complete)

**`main` is now the verified integration baseline at `3951c3d`.**
Previous baseline: `f02bce5` (account-transition checkpoint, pre-UX-03).
30 commits, 89 files (+14094/-727) fast-forwarded — no merge commit,
no squash, no rebase, no force push.

**Repository truth verified first**: `main`/`origin/main` were both at
`f02bce5`, an unmodified strict ancestor of the feature branch (0
commits behind, 30 ahead) — no divergence, safe to integrate without
reconciliation.

**Cross-milestone integration delta reviewed**: automated checks
(junk/generated files, `Cargo.lock` byte-identical to `main` — zero
dependency drift, migration chain — 15→18, pure appends only, no
reordering/destructive changes, no `LIKHA-SIS 2.0` stale naming, no
hardcoded secrets/credentials, three-term grading confirmed as the
seeded default) all clean. An `architecture-reviewer` was dispatched
for the specific cross-milestone question this gate exists to answer
(does RBAC compose correctly with every command added after it landed
— Teacher Load, Curriculum) and hit this project's recurring
agent-resume/retrieval failure on both the initial attempt and the one
permitted retry (documented since M7). A rigorous self-review was
substituted: read every command in `commands::teaching_assignment.rs`
directly — all eight are correctly and consistently gated (four
via `authorize_capability(ManageTeachingAssignments)`, two via
`authorize_view_teacher_load`, one reference-data read intentionally
open, matching the codebase's established convention, and the one
previously-fixed cross-teacher leak in
`list_schedule_meetings_by_assignment` reconfirmed still fixed);
`authorize_view_teacher_load`/`authorize_capability` themselves
reconfirmed fail-closed and session-derived only; `node
scripts/check-architecture.mjs` passed with zero restricted imports.
No BLOCKING or SHOULD-FIX findings — real, non-self independent-review
debt for this specific integration-delta question remains open (see
`docs/VERIFICATION-DEBT.md`).

**One real documentation-truth gap found and fixed**: `docs/PROGRESS-MAP.md`'s
`CURRENT` pointer still said "Wave 0 complete, recommended next: RBAC
foundation" — stale since RBAC, Curriculum, Teacher Load, and the
`windows-future` compiler blocker have all since closed. Fixed to
point at the closed ADRs.

**Pre-integration CI, actually run on the exact HEAD integrated**:
feature-branch run `32921475227` (HEAD `3951c3d`) — Ubuntu and Windows
both green. Local `npm run quality:full`, `cargo check --lib`, native
`cargo build`, `git diff --check` — all PASS, all actually run this
session.

**Fast-forward performed** (`git checkout main && git pull --ff-only
origin main && git merge --ff-only claude/likha-sis-ux03-plan-plv80c`)
— Git itself reported `Fast-forward`, not a merge commit. Pushed;
`origin/main` confirmed at `3951c3d`, matching local exactly.

**`main` CI verified green on the new baseline, not assumed**: run
`32922664816` (push event, HEAD `3951c3d`) — Ubuntu and Windows both
`success`.

**Feature branch status**: `claude/likha-sis-ux03-plan-plv80c` is
fully integrated into `main`. Not deleted this milestone, per explicit
instruction — retained until the user approves removal. It is no
longer the development baseline; the next product milestone starts
from fresh `main` on a new branch.

**Gate decision: INTEGRATION PASSED — MAIN IS THE NEW VERIFIED
BASELINE.** Per explicit instruction, no product feature work has
begun. Recommended next milestone (not started): see this session's
final report.

## Active Task (2026-08-26, this session — Minimal CI Foundation, complete)

Full record: `docs/adr/0041-minimal-ci-foundation.md`,
`docs/VERIFICATION-DEBT.md`'s top two entries.

**Repository truth verified first**: branch
`claude/likha-sis-ux03-plan-plv80c`, local HEAD `62e0948`, matching
`origin`, working tree clean — exactly the expected checkpoint, not
assumed.

**Teacher Load review-debt reconciled**: found **STALE, CORRECTED**
(full reasoning: `docs/VERIFICATION-DEBT.md`'s top entry). The "Teacher
Load's own `security-reviewer` re-run still owed" line was accurate
when written (the milestone's own dedicated review had failed
retrieval) but two later, successfully-retrieved independent reviews —
Native Rust Verification Recovery's `security-reviewer` (fixed a real
missing-`school_id`-scope gap in `schedule_meeting.rs`'s
`has_exact_duplicate`) and RBAC Foundation's `security-reviewer`
closure (fixed a real cross-teacher schedule leak in
`list_schedule_meetings_by_assignment`) — collectively covered both
halves of Teacher Load's actual security surface (data-integrity and
authorization) with real, non-self findings, fixed. No new reviewer
was dispatched to reach this conclusion, per the explicit instruction
not to duplicate a completed review.

**GitHub Actions billing researched from official docs, not assumed**:
this repository is **public** (confirmed via `gh repo view`), and
GitHub's own billing documentation states standard-runner minutes are
free/unmetered for public repositories — Windows included. This
removed the usual private-repo "spend Windows minutes sparingly"
constraint entirely; zero-billing gate passed unconditionally (no
spending limit configuration needed, none possible to circumvent since
the workflow structurally can't generate a charge).

**10-scenario CI decision**: two jobs (Ubuntu, Windows), each running
`npm run quality:full` verbatim, on `push`/`pull_request`/
`workflow_dispatch`, `permissions: contents: read` only, no secrets,
concurrency-cancel per ref. Full scoring in ADR-0041.

**Actually executed on GitHub Actions, evidence not claimed**: first
real run (32915080360) genuinely failed on Ubuntu — `ubuntu-latest`
lacks the GTK/glib system packages Tauri's Linux backend needs
(`gobject-sys`/`glib-sys` `pkg-config` failures); the _same run_'s
Windows job passed `npm run quality:full` end-to-end on the first
try. Fixed by adding the exact `apt-get` package list from Tauri's own
official prerequisites docs (fetched directly, quoted, not
remembered). Re-pushed; run 32916282825 is **green on both jobs**
(Ubuntu 6m9s, Windows 17m17s). A second real, non-CI-config finding
followed: the docs checkpoint commit itself failed `prettier --check`
(this session hadn't run the local gate on doc edits) — fixed with
`prettier --write`, re-verified locally, and reconfirmed green on
GitHub Actions (run 32917911205, Ubuntu 7m18s, Windows 17m41s).

**Gate decision: MINIMAL CI FOUNDATION PASSED — READY FOR INTEGRATION
REVIEW / MAIN FAST-FORWARD DECISION.** `main` remains a strict ancestor
of this branch (27 commits ahead, 0 behind) — untouched, not
fast-forwarded, not merged, per explicit instruction. Per the same
instruction, the next milestone (Integration Review + `main`
Fast-Forward Decision) has **not** been started — this session stops
here and waits for approval.

## Active Task (2026-08-26, this session — Rust Formatting + Quality Gate Normalization, complete)

Full record: `docs/VERIFICATION-DEBT.md`'s top entry.

**Repository truth verified first**: local branch was already at
`ce22c08`, matching origin, with the prior session's Curriculum/RBAC
review-fix checkpoint uncommitted as expected. Diffed it against what
that session's report described — matched exactly — then committed and
pushed it (`ce22c08`) before touching formatting, so the security/
architecture fixes are preserved independent of this milestone.

**Formatting baseline re-measured, not assumed**: 265 `cargo fmt --check`
diff hunks across 35 first-party files (rustfmt 1.9.0-stable, no
`rustfmt.toml`). Ran plain `cargo fmt` — no manual restyling, no
opportunistic refactors. Proven semantic-free by a stricter method than
a simple `git diff -w` (which under-proves when rustfmt reflows a call
across multiple lines — line-count changes defeat a naive whitespace-
ignoring diff): every changed file was compared with all whitespace and
rustfmt's trailing commas stripped, confirming the only remaining
differences were `use`-statement reordering (not semantic in Rust) and
standard single-expression closure/match-arm brace add/remove (also not
semantic). Committed in isolation (`139c36d`), separate from the
quality-gate wiring change (`8ee1187`) that added `cargo fmt --check`
to `npm run quality:full` (the milestone/release gate) and updated
`.claude/rules/testing.md` to match, per its own "keep in sync" rule.

**Verification, all actually run this session**: `cargo fmt --check`
PASS (was FAIL); `cargo check --lib` PASS; `cargo test` PASS (342 lib +
all integration binaries, identical counts to the pre-format baseline);
`cargo nextest run` 403/403 PASS; `cargo clippy --all-targets -- -D
warnings` PASS, 0 warnings; `cargo build` (native) succeeds; `npm run
quality` 390/390 PASS; `npm run quality:full` PASS end-to-end (proves
the new gate is actually wired in — a formatting regression would have
stopped the chain before `cargo test`); `git diff --check` clean;
`gitleaks` secret scan NOT RUN (still unavailable on `PATH`).

**Gate decision: RUST FORMATTING + QUALITY GATE PASSED — READY FOR
MINIMAL CI FOUNDATION.** Recommended next milestone (not started, per
this session's explicit instruction to stop and wait for approval):
Minimal CI Foundation (`.github/workflows/`, running the existing
`npm run quality:full` gate on push/PR against this branch).

## Active Task (2026-08-26, this session — Foundation Independent Review Debt Closure, complete)

Full record: `docs/VERIFICATION-DEBT.md`'s top entry.

**Repository truth verified before reviewing anything**: local branch
`claude/likha-sis-ux03-plan-plv80c` was 2 commits behind
`origin/claude/likha-sis-ux03-plan-plv80c` and carried uncommitted
working-tree edits to 6 files. Diff comparison confirmed these were
stale, pre-fix duplicates of work already merged upstream in `caf850b`
(the compiler-recovery commit) — not in-progress work. Discarded (with
explicit user confirmation, since this session's auto-mode classifier
correctly blocked the discard as a destructive git action) and pulled
to `096dcfc`. Also removed five stray 0-byte junk files (`(String`,
`ComputedTermGrade`, `MonthlyAttendanceReport`, `button`,
`src-tauri/MonthlyAttendanceReport`) and an untracked 4.9MB
`repomix-output.xml` — accidental artifacts from an unrelated prior
tool invocation, not source.

**Both previously-owed independent reviews actually completed and
retrieved this session** — full record in `docs/VERIFICATION-DEBT.md`'s
top entry. Curriculum Foundation `architecture-reviewer`: no BLOCKING
findings, one SHOULD-FIX (a doc-comment overclaim in
`repository::curriculum.rs`'s `default_version_id`, fixed). RBAC
Foundation `security-reviewer`: no BLOCKING findings, one SHOULD-FIX
(teacher schedule reconstructable by any Teacher session bypassing
`authorize_view_teacher_load`, fixed in
`commands::teaching_assignment::list_schedule_meetings_by_assignment`).
Both previously-fixed regressions (`add_user_to_school` self-grant,
Teacher Load cross-school view leak) reconfirmed intact by the RBAC
reviewer via direct code read.

**A process finding worth recording for future sessions**: the
recurring agent-resume/retrieval failure documented since M7 did _not_
recur here — both reviewer agents completed and could be resumed via
`SendMessage`. What did initially fail was retrieving their findings as
usable text: the first response from each resumed agent was a terse
one-line acknowledgment, not the full report. The reviewers had likely
already communicated their findings via `ReportFindings`, a tool whose
output renders to a UI channel this orchestrating session can't read
back. Explicitly asking each agent to restate its findings as plain
text (not via `ReportFindings`) in a follow-up `SendMessage` worked.
Future sessions dispatching `architecture-reviewer`/`security-reviewer`
as background agents should anticipate this and ask for a plain-text
report explicitly in the original dispatch prompt to avoid the extra
round trip.

**Verification, all actually run this session**: `cargo check --lib`
PASS; targeted tests (81, `auth::`/`curriculum::`/`teaching_assignment::`/
`schedule_meeting::`) PASS; full `cargo test` PASS (342 lib + all
integration binaries); `cargo clippy --all-targets -- -D warnings` PASS;
`npm run quality` PASS, 390/390; `cargo fmt --check` — 265 pre-existing
diffs, unchanged by this session's edits, not corrected (out of scope,
recommended follow-up milestone below); `git diff --check` clean;
`gitleaks` secret scan NOT RUN (binary unavailable on `PATH`, not
installed per project policy).

**Gate decision: FOUNDATION REVIEW DEBT CLOSED — READY FOR
FORMATTING/CI HARDENING.** Recommended next milestone (not started, per
this session's explicit instruction to stop and wait for approval):
Rust Formatting + Quality Gate Normalization (the ~265-file `cargo fmt`
diff, then a minimal CI foundation, per the sequence recorded in
`docs/VERIFICATION-DEBT.md`).

## Active Task (2026-08-25, this session — Native Rust Verification Recovery, complete)

Full record: `docs/adr/0040-windows-only-dependency-target-gating.md`.

**Root cause confirmed with evidence, not guessed**: every prior
session's "windows-future/windows-core version mismatch" framing was
wrong. `cargo tree -i windows@<ver> --target all` showed each `windows`
version's own dependency edges were internally consistent; the real
problem was that `src-tauri/Cargo.toml` declared LIKHA's own
`windows = "0.62.2"` (used for DPAPI key protection) **unconditionally**
— no `[target.'cfg(windows)'.dependencies]` gate — forcing Windows-only
COM/async code to compile on every host, including this Linux sandbox.
Tauri's own Windows-only webview backend (`tao`/`wry`/`webview2-com`,
which locks `windows` 0.61.3) was already correctly target-gated in the
same `Cargo.lock` — proof the pattern works, LIKHA's own declaration
just never used it.

**Fix applied — Category E (platform/target-specific dependency
problem), minimal-change, zero lockfile diff**: moved `windows` to
`[target.'cfg(windows)'.dependencies]`; `#[cfg(windows)]`-gated
`mod dpapi;`/`DpapiKeyStore` in `crypto/mod.rs`; split
`db::open_app_db` so the `#[cfg(not(windows))]` path fails closed with a
`KeyStore` error rather than opening an unprotected database (Windows
is the only shipping desktop target). `git diff --stat`: 6 files
changed, 71 insertions, 10 deletions — `Cargo.toml`, `crypto/mod.rs`,
`db/mod.rs`, plus 3 files touched only to fix bugs restored compilation
revealed (below). `Cargo.lock` is byte-identical to before the fix.

**Compiler Recovery:**

| Check                                                                     | Result        | Evidence                                                                                                                           |
| ------------------------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `cargo check --lib`                                                       | PASS          | 0 warnings, 0 errors                                                                                                               |
| Targeted RBAC/auth tests (`cargo test --lib auth::`)                      | PASS          | 57/57                                                                                                                              |
| Targeted Teacher Load tests (`teaching_assignment::`, `schedule_meeting`) | PASS          | 9/9 + 13/13                                                                                                                        |
| Full `cargo test`                                                         | PASS          | 338 lib tests + all integration binaries, 0 failed                                                                                 |
| `cargo clippy --all-targets -- -D warnings`                               | PASS          | 0 warnings                                                                                                                         |
| `npm run quality`                                                         | PASS          | typecheck/lint/format/architecture/vitest all green, 390 tests                                                                     |
| Tauri/native build                                                        | NOT ATTEMPTED | out of scope — `cargo check`/`test`/`clippy` were this milestone's success criteria; a full GUI build was not required and not run |

**Product bugs revealed and fixed (direct correctness issues in
already-shipped foundation code, not scope expansion)**:

1. `class_record::find_detail_by_id_in_school` — type-inference
   ambiguity (`Err(e.into())`) fixed to `Err(AppError::from(e))`, no
   behavior change.
2. `schedule_meeting::create` — `CreateMeetingOutcome::Duplicate` was
   dead code (an exact duplicate always shares its teacher with itself,
   so `has_teacher_conflict` always fired first, despite an existing
   regression test asserting `Duplicate` should be returned). Fixed
   with a `has_exact_duplicate` check run before the conflict checks.
3. Four `assessment_item` tests used a literal `"teacher-1"` for
   `recorded_by_user_id`, which could never satisfy the real
   `learner_scores.recorded_by_user_id REFERENCES users(id)` FK once it
   actually ran. Fixed by creating a real `user::create_user(...)` row,
   matching `learner_score.rs`'s own correct test pattern.

**Verification debt closed**: the entire "Rust toolchain cannot compile
in this environment" entry in `docs/VERIFICATION-DEBT.md` (open since
before this session's visible window, reproduced and diagnosed but not
fixed in the RBAC milestone). **New debt opened**: `cargo fmt --check`
(never part of `quality:full`) found ~264 pre-existing formatting diffs
across most of the crate — not corrected in this milestone (out of
scope; recommend a dedicated follow-up commit). Independent
`security-reviewer` dispatched for the crypto/key-store boundary change
— outcome recorded in `docs/VERIFICATION-DEBT.md` once it returns.

**Gate decision: RUST VERIFICATION RECOVERED — READY TO RESUME PRODUCT
WAVE.** Recommended next milestone (not started, per explicit
instruction to stop and wait for approval): link `class_records` to
`teaching_assignments` where a matching assignment exists (surfacing
"who teaches this" on the class record itself), OR — given verification
was the whole point of this milestone — re-run the two previously-owed
independent reviews (Curriculum Foundation's `architecture-reviewer`,
RBAC's `security-reviewer`) now that a healthy compiler signal exists to
ground them in, closing that debt before adding new surface area.

## Active Task (2026-08-25, this session — Teacher Load / Class Schedule Foundation, complete)

Full record: `docs/adr/0039-teacher-load-class-schedule-foundation.md`.

**Repository truth confirmed before designing anything**: `class_records`
has no teacher/owner column at all; no `teachers` table, schedule, or
assignment concept existed anywhere. "Teacher" is fully represented by
the existing `users` + `user_school_memberships` + `user_school_roles`.

**Domain model**: three distinct concepts, two new tables, load always
derived. `teaching_assignments` (who teaches what, school-year-long,
`UNIQUE(section_id, subject_id)`, no `school_year` column of its own —
derived via `section_id`, same single-source-of-truth pattern as
`class_records`). `schedule_meetings` (when/where, one row per weekly
slot, local wall-clock `HH:MM` text, not UTC). `TeacherLoad` is always
computed fresh (assignment count, distinct-subject/preparation count,
weekly instructional minutes) — no stored running total. Deliberately
**not** linked to `class_records` this milestone (different lifecycle:
term-scoped vs. year-long; a real FK would force retrofitting an
already-stable four-ADR-deep table for a benefit nothing yet needs).
Advisory/ancillary duties explicitly excluded — DepEd Order No. 005,
s. 2024 itself classifies advisory as non-instructional.

**Authorization**: new `Capability::ManageTeachingAssignments` (School
Head only, deliberately not reusing `ManageSchoolMembership`). New
`auth::authorize_view_teacher_load` (self, or School Head viewing within
their own school). **A real cross-school leak was caught and fixed
during this function's own TDD pass**: the first draft authorized a
School Head to view any `target_teacher_user_id` based on their own
role alone, without checking the target actually belongs to the
caller's school — fixed by adding an explicit `is_member_of_school`
check before the fix was ever committed, not discovered later.

**A second real bug was caught by adversarial self-review before
dispatching the independent reviewer**: `schedule_meeting::create` used
`INSERT OR IGNORE` for its final insert with no Rust-side weekday
validation — the exact `INSERT OR IGNORE`-swallows-a-`CHECK`-violation
mistake this project already documented as a lesson after the RBAC
milestone's `role::grant` bug. Fixed: explicit weekday-range validation
in Rust, `INSERT ... ON CONFLICT (...) DO NOTHING` instead of `OR
IGNORE`. A regression test pins the fix.

**No UI this milestone** — the vertical slice ("School Head assigns a
teacher, sees it reflected in load") is proven at the repository/command
layer with tests, the same zero-UI proof shape RBAC and Curriculum
Foundation both already used.

**Verification**: `npm run quality` 390/390, `check:dev-preview-isolation`,
`knip`, `git diff --check` all clean (Rust-only change). `cargo check
--lib` reconfirmed **BLOCKED** — fails at the pre-existing
`windows-future` dependency-compile stage, before this crate's own
source is even type-checked, so there is literally zero compiler signal
on this new code, not even partial. Independent `security-reviewer`
dispatched for an adversarial pass; outcome recorded in
`docs/VERIFICATION-DEBT.md`. Codex remains PILOT — not re-probed beyond
one login-status check (unchanged: not logged in), per explicit
instruction not to repeatedly probe a known condition.

**Per explicit instruction: do not begin the next milestone
automatically.** See this session's final report for the gate decision
and recommended next milestone.

## Active Task (2026-08-25, this session — RBAC Authorization Corrective Gate, complete)

**Reported `add_user_to_school` gap: CONFIRMED and fixed.** Full record:
`docs/VERIFICATION-DEBT.md`'s updated RBAC entry (no new ADR — this is
an ordinary bug fix, the existing ADR-0036 capability architecture
already specified the correct shape, just applied incompletely).

**Confirmed, not assumed**: `authorize_school_membership_grant`
(`src-tauri/src/auth/mod.rs`) checked only "an active session scoped to
the same school" — no role check. Traced a real, complete exploit chain
using only two already-existing commands: any authenticated session
(any role) calls `register_user` to mint a fresh account, then
`add_user_to_school` (same school, any role accepted) to self-grant that
account membership. Grepped every production caller of
`user::add_school_membership`/`role::grant` — only two exist
(`bootstrap_installation`, already correctly gated; and
`add_user_to_school`, the confirmed defect) — no sibling vulnerability
found elsewhere in the authorization family (there is no remove-
membership, change-role, or deactivate command in this codebase at all
yet, and `user_school_memberships` has no active/revoked flag — those
authorization-family questions don't yet apply to anything that exists).

**Fix**: new `Capability::ManageSchoolMembership`, School Head only
(deliberately excludes Registrar — the conservative choice; onboarding a
new school member is treated as a School Head personnel matter, not
Registrar's enrollment/records scope). `authorize_school_membership_grant`
now routes through the existing `authorize_capability` gate — same
pattern as every other capability check, no new mechanism. Six
regression tests prove: School Head succeeds; Teacher-only denied (the
exact defect); no-role-at-all denied; Registrar-only denied; cross-school
denied (with a corrected fixture that now isolates the cross-school
check from the role check); role revoked mid-session denied on the very
next call (no caching). TOCTOU: none introduced or found — the whole
command runs under one held `Mutex<Connection>` lock, same as every
other command in this codebase.

**Verification**: `npm run quality` 390/390, `check:dev-preview-isolation`,
`knip` all re-run clean (unaffected — Rust-only fix). `cargo check --lib`
reconfirmed **BLOCKED**, identical pre-existing `windows-future` conflict
— this fix is written and manually reviewed, not compiler-verified.
Independent `security-reviewer` dispatched for an adversarial pass
attempting to break the fix; outcome recorded in `docs/VERIFICATION-DEBT.md`.

**Codex remains PILOT** — not promoted; no live Codex task was run this
milestone (network/credential blockers unchanged, not re-probed per
explicit instruction not to re-test a known condition).

**RBAC gate decision and next milestone**: see this session's final
report. Per explicit instruction, do not begin Teacher Load / Class
Schedule until that decision is delivered and approved.

## Active Task (2026-08-25, this session — Codex Delegation Harness, complete, PILOT)

**Harness-only milestone, no product code changed.** Full record:
`docs/adr/0038-codex-delegation-harness.md`, `.claude/skills/codex-delegation/SKILL.md`,
`docs/SOURCE-REGISTRY.md`'s new entry.

**Verified real, not assumed**: initial web research on "the Codex
plugin for Claude Code" surfaced mostly SEO/content-farm sites with an
inflated-star-count pattern this project already rejected once before
(`Graphify-Labs/graphify`) — not trusted at face value. Verified
directly instead: `claude plugin marketplace add openai/codex-plugin-cc`
performed a real `git clone` against the real GitHub repo, and
`claude plugin install codex@openai-codex` succeeded, exposing a real,
versioned (v1.0.6), Apache-2.0 plugin with 11 skills, 1 agent, 3 hooks,
0 MCP servers.

**Decision: PILOT, not ADOPT.** Codex is a bounded worker under Claude
orchestration for LOW/MEDIUM-risk implementation, and — a genuine,
LIKHA-specific reason, not a generic "more review" argument — a
second-vendor adversarial reviewer for HIGH-risk work, directly
addressing this project's own long, recurring same-vendor
reviewer-agent retrieval failure (documented since M7, hit again twice
this same session). Risk-routing policy, implementation contract,
return contract, and stop conditions are recorded in
`.claude/skills/codex-delegation/SKILL.md`. **Not promoted to ADOPT**:
no live, credentialed task could actually be delegated in this session
— confirmed via a real (harmless) probe that this sandbox's network
egress policy returns `HTTP 403` for `wss://api.openai.com/v1/responses`,
a structural block independent of credentials. A real pilot task must
run on a machine without that restriction before promotion.

**Real risk found, not just theorized**: read directly from this
repo's own hook source that LIKHA's `PreToolUse` secret/PII-pattern
hooks are wired to Claude Code's own `Write`/`Edit`/`Bash` tool calls —
Codex edits files as an external local process per its own
documentation, so those hooks almost certainly do not fire for
Codex-originated writes. Independent Claude review of the actual diff
is therefore the only real safety net for anything Codex touches, not a
formality — recorded as a hard rule in the new skill.

**No stale "LIKHA-SIS 2.0" references found** — re-checked per this
milestone's own instruction; the two existing hits in this repo are
historical confirmations that no such error exists, not actual mistakes.

**Global (not repository) state changed on this machine**: one
marketplace (`openai-codex`) and one plugin (`codex@openai-codex`)
installed at user scope — both fully reversible, nothing in this
repository depends on either.

**Per explicit instruction: return to the existing product roadmap,
do not silently start it.** Recommended next milestone, awaiting
approval: **Teacher Load / Class Schedule Foundation** (Wave 1's next
slice per `docs/adr/0035-...md`) — re-verify this still leads once
repository evidence is checked fresh, since the RBAC milestone's
`add_user_to_school` role-authorization gap remains open debt that
could also justify a prerequisite corrective milestone instead.

## Active Task (2026-08-25, this session — Curriculum / Key-Stage Versioning Foundation, complete)

**Curriculum / Key-Stage Versioning Foundation is complete.** Full
record: `docs/adr/0037-curriculum-key-stage-versioning.md`,
`docs/VERIFICATION-DEBT.md`'s new top entry, `docs/SOURCE-REGISTRY.md`'s
new curriculum-sources section.

**Architecture**: two deliberately un-joined reference axes — `key_stages`
(KS1 Grades 1-3, KS2 4-6, KS3 7-10, KS4 11-12; global, curriculum-
independent, since Key Stage banding is a stable K-12 structural concern,
not a curriculum-content one) and `curriculum_versions` (two seeded rows:
"K to 12 Basic Education Curriculum," sole default, and "MATATAG
Curriculum," not default). `curriculum_learning_areas` lists named
learning areas per curriculum version — deliberately not joined to
`subjects` (a school's own freeform subject list still has no DepEd
classification, the same gap ADR-0015 left open for weight groups; not
widened here either). `class_records.curriculum_version_id` pins which
version applies, mirroring `weight_policy_id`'s exact nullable-for-
migration-safety/COALESCE-to-default shape — with one deliberate
deviation: it auto-resolves to the default rather than requiring an
always-visible picker, since nothing yet reads which version is pinned
to make a different decision (no learning-area validation, no grade-
computation difference). **Zero UI/TypeScript change** — the same "does
a normal teacher actually need to configure this" reasoning RBAC already
established; a teacher never sees an internal curriculum-version id.

**Representative proof**: two curriculum versions are explicitly pinned
to two different class records; flipping which one is the system-wide
default (simulating a newer curriculum becoming active) leaves both
already-pinned records' resolved curriculum unchanged, while a
never-pinned legacy row correctly follows the new default — proving
historical stability and coexistence with zero string-based branching
(`class_record.rs`'s
`two_curriculum_versions_coexist_and_changing_the_default_does_not_rewrite_an_already_pinned_record`).

**Research**: Key Stage grade bands were already primary-source-verified
by a prior milestone (ADR-0013, DepEd Order No. 015, s. 2026's own PDF)
and reused directly. MATATAG's phased rollout (SY 2024-2025 → 2026-2027,
completing K-10; SHS on a separate, not-yet-released schedule) was
triangulated across multiple independent secondary sources — `deped.gov.ph`
itself was unreachable (`WebFetch` blocked by this environment's network
egress policy), so this falls short of ADR-0013's primary-source bar and
is disclosed as such, not overstated. No specific MATATAG-vs-prior
learning-area-name difference was confirmed — none is encoded; both
curriculum versions seed identical learning-area names.

**Verification**: `npm run quality` (390/390), `check:architecture`,
`check:dev-preview-isolation`, `knip` all actually re-run clean (Rust-
only change, so this is a real but partial signal). `cargo check --lib`/
`cargo test --lib` reconfirmed **BLOCKED**, identical to every prior
session — this milestone's new Rust is written and manually reviewed,
not compiler-verified. `deped-researcher` hit this project's recurring
agent-resume failure on both the initial attempt and one retry (now
confirmed on this agent type too); direct `WebSearch`/`WebFetch` was
substituted per the established fallback rule. `architecture-reviewer`
was dispatched for architecture/data-integrity review — see
`docs/VERIFICATION-DEBT.md` for the outcome.

**Explicit durable clarification (per this milestone's own instruction)**:
`school_year` is never treated as the curriculum itself — a curriculum
can span multiple years, overlap during transition, or cover only part
of the school (SHS stays on the K to 12 curriculum while K-10 phases
into MATATAG). Automatic curriculum selection by grade level is
deliberately not attempted — `sections.grade_level` remains unconstrained
free text, so any `if grade_level >= 7`-style resolution would be exactly
the "infer from label" mistake this milestone was told to avoid; that is
a disclosed prerequisite for a future milestone, not solved here.

**Per explicit instruction: do not begin the next milestone
automatically.** Recommended next milestone, awaiting approval: see
`docs/ACTIVE-PLAN.md`'s new top section for the full evaluation — **Teacher
Load / Class Schedule Foundation** is the leading candidate per the Wave
1 sequence, but repository evidence should be re-checked before assuming
it automatically wins over closing the RBAC `add_user_to_school`
role-authorization gap first.

## Active Task (2026-08-25, this session — Wave 1A: RBAC Foundation, complete)

**RBAC Foundation (Teacher / Registrar / School Head) is complete.**
Full record: `docs/adr/0036-rbac-foundation.md` (architecture decision),
`docs/VERIFICATION-DEBT.md`'s Wave 1A entries (reproduced Cargo blocker,
`security-reviewer` findings), `docs/SOURCE-REGISTRY.md`'s Wave 1A
harness-tooling-audit section.

**Repository truth confirmed this task**: branch
`claude/likha-sis-ux03-plan-plv80c`, working tree clean apart from this
milestone's own changes before commit. `npm run quality` 390/390 (no
regression — this milestone's application code is Rust-only), `npx knip`
shows the same pre-existing findings, zero new. `cargo check --lib`/
`cargo test --lib` were both actually run and both **reconfirmed the
pre-existing blocker** — `windows-future` 0.3.2 fails to compile against
the `windows-core` 0.62.2/`windows-threading` 0.2.1 pair Cargo.lock
resolves it to. Root cause traced further than before: `Cargo.toml`
declares `windows = "0.62.2"` **unconditionally** (no
`[target.'cfg(windows)'.dependencies]` section exists), and
`crypto/dpapi.rs` (Windows DPAPI key protection, ADR-0003) is compiled
unconditionally too (no `#[cfg(windows)]`) — so this crate cannot compile
on any non-Windows host regardless of the specific version conflict. A
real fix needs a genuine architecture decision (target-gate the
dependency and the module, decide what non-Windows dev/CI does for
`KeyStore`) — per this milestone's explicit instruction, **not** made
here; recorded as the reproduced blocker for a future dedicated session.

**RBAC implementation**: new `user_school_roles` join table (migration
16, composite PK `(user_id, school_id, role)`, `CHECK` on role, cascading
FK to `user_school_memberships`) — a separate table, not a role column,
specifically so one person can hold more than one role in the same
school without a schema change. New `auth::Capability` enum (one
variant, `ManageLearners`) and `auth::authorize_capability()`, mirroring
the existing `authorize_user_registration`/`authorize_school_membership_grant`
gate pattern exactly — the only place a role is ever mapped to what it's
allowed to do. Representative proof: `create_learner`/`update_learner`
now require Registrar or School Head; learner reads stay ungated (no
regression for Teachers). `bootstrap_installation` grants its founding
user all three roles; `add_user_to_school` grants `teacher` only
(least-privilege default). Role membership is always a fresh DB lookup,
never cached on `Session` — closes the stale-assignment/revocation class
of threat the same way `require_active_session`'s existing independent
revocation check already does. No TypeScript/UI change was needed —
`LearnerListScreen`'s existing generic error handling already degrades an
`Unauthorized` rejection gracefully; security is enforced entirely below
React.

**Independent `security-reviewer` review**: dispatched and returned real
findings (unlike several prior sessions' agent-resume failures — this one
completed) before hitting a session-limit API error mid-follow-up. Found
and fixed: `role::grant()` used `INSERT OR IGNORE`, which silently
swallows a `CHECK` constraint violation (not just the intended
primary-key conflict) — independently reproduced against real SQLite
before trusting the claim, then fixed to `ON CONFLICT (...) DO NOTHING`,
which does still raise on a `CHECK` failure. Recorded, not fixed (Wave
1A's own explicit scope boundary): `add_user_to_school` authorizes only
"same school," not "same school AND an appropriate role" — a pre-existing
gap (the check itself predates this milestone), not currently reachable
from any UI, and deciding who may grant membership is exactly the kind of
authority-boundary question this milestone deferred beyond its one
representative proof. Full detail in `docs/VERIFICATION-DEBT.md`.

**Explicit durable clarification (per this milestone's own instruction)**:
Teacher/Registrar/School Head are the **initial RBAC proof set**, not the
final LIKHA functional-role universe — Adviser, LIS Coordinator, ICT
Coordinator, Master Teacher/Department Head, and other school-authorized
responsibilities are expected later, added via new role-constant values
and widened `CHECK` constraints, never a redesign of `user_school_roles`,
`Capability`, or `authorize_capability`.

**Harness**: audited ast-grep, dependency-cruiser, repomix, and
cargo-mutants against actual repository evidence and adopted **none of
them** this milestone — `check-architecture.mjs` already covers the one
import-direction rule that matters, the repo is small enough that
Grep/Glob are already token-efficient, and `cargo` cannot compile here at
all, so a mutation-testing pilot has nothing to run against. Full
reasoning in `docs/SOURCE-REGISTRY.md`'s Wave 1A section — a deliberate
"add nothing new" conclusion, not a shortfall against the instruction to
consider harness improvements.

**Per explicit instruction: do not begin the next milestone
automatically.** Recommended next milestone, awaiting approval:
**Curriculum / Key-Stage Versioning Foundation** (Wave 1's next slice per
`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md`) — no
repository evidence surfaced this session that demands a prerequisite
corrective milestone instead (the one real defect found, `role::grant`'s
`INSERT OR IGNORE` bug, was fixed within this same milestone, not left
open).

## Active Task (2026-08-25, this session — Post-UX-04 Roadmap Reconciliation, complete)

Immediately after UX-04 completed (checkpoint `c91a45e`), the user
directed a full roadmap reconciliation — repository truth-check,
capture an expanded product definition, and replace the flat
UX-05..UX-08 queue with an evidence-based execution plan — before any
further implementation. **No feature code was changed in this task**,
per explicit instruction. Full record:
`docs/adr/0035-roadmap-reconciliation-and-execution-waves.md` (the
architecture/sequencing decision), `docs/product/PRODUCT-CONTRACT.md`
(durable product facts, with BUILT/DIRECTION SET/HYPOTHESIS status per
item), `docs/product/ROADMAP-RECONCILIATION-DECISION.md` (the
scenario-scoring pass).

**Repository truth confirmed this task**: branch
`claude/likha-sis-ux03-plan-plv80c` at `c91a45e`, 13 commits ahead of
`origin/main` (still at `f02bce5`, pre-UX-03), working tree clean.
`npm run quality` 390/390, `npm run build`, `check:dev-preview-isolation`,
`npx knip` all re-verified clean. `cargo check`/`test`/`clippy` still
blocked by the pre-existing `windows-future`/`windows-core` conflict
(`docs/VERIFICATION-DEBT.md`, unchanged from UX-04). Confirmed via
direct code/schema inspection: RBAC, curriculum versioning, Teacher
Load/schedule, sync, SF1 bulk import, and SF10 all have zero code in
the repo; SF9 is a non-authoritative CSV only; `School` has no branding
fields; the app is Tauri-only.

**Decision**: adopt the user's "reusable engines + representative
vertical slices + architecture freeze" strategy (scored 7.55 vs. 7.30
for "just continue old UX-05," a real but modest margin — see the
decision doc for the full comparison and why it's not a rubber stamp).
Old UX-05 (Learners/Search/Sections/Editing/Export) is merged with the
new SF1 Enrollment scope into one wave, not run as two competing
efforts. Full Wave 0-7 sequence in ADR-0035.

**Per explicit instruction: no implementation has begun.** The
recommended next milestone, awaiting approval:

### Recommended next milestone: RBAC Foundation (Teacher / Registrar / School Head)

- **Objective**: prove real, enforced role-based access control exists
  end-to-end — schema, session, and one representative gated feature —
  as the first slice of Wave 1 (`docs/adr/0035-...md`), unblocking Wave
  2's Registrar-gated bulk import.
- **Scope**: add a `role` column (or equivalent) to
  `user_school_memberships` with the three already-confirmed roles
  (Teacher, Registrar, School Head — confirmed with the user during M8,
  do not re-ask); extend `SessionManager`/the session domain type to
  carry the caller's role; add an `authorize_role`-style gate mirroring
  the existing `require_active_school_scope` pattern
  (`docs/adr/0004-authentication-and-local-session.md`); pick **one**
  already-existing feature to actually gate as the representative proof
  (candidate: `LearnerListScreen`'s bulk-capable operations, or a
  School-Head-only view of another teacher's section — decide against
  real repository shape when this milestone starts, not assumed here).
- **Explicit non-goals**: do not attempt to fully scope every
  Teacher/Registrar/School-Head authority boundary in one pass — only
  what the one representative gated feature needs; do not build SF1
  bulk import itself (that's Wave 2); do not build curriculum
  versioning or school branding in the same milestone (separate Wave 1
  slices — sequence one at a time per ADR-0035 Decision 1); do not
  invent a fourth role; do not touch cloud/sync.
- **Tests/verification required**: TDD for the new authorization gate
  (a session without the required role must be rejected, matching this
  project's fail-closed convention); Rust repository/command tests for
  the role column and gate; TS domain/application tests for the
  session-shape change; `npm run quality`, `npm run build`,
  `check:architecture`, `check:dev-preview-isolation`, `npx knip`;
  `cargo test`/`clippy` attempted (disclose plainly if still blocked by
  the pre-existing dependency conflict, do not claim it passed);
  independent `security-reviewer` dispatch (this touches authorization
  directly — required per `.claude/rules/security-privacy.md`, not
  optional).
- **Completion criteria**: a session's role is derivable server-side
  only (never client-supplied, matching `school_id`'s existing
  convention); the one representative gated feature demonstrably denies
  an unauthorized role and allows an authorized one, proven by a test;
  no existing screen's functionality regresses for the Teacher role
  (today's default, unchanged behavior for the common case); ADR
  recording the exact authority boundaries actually implemented (not
  just the three-role names).

## Active Task (2026-08-25, this session — UX-04, complete)

**UX-04 — Class Records, Assessments, Score Entry, Grade Output —
complete.** Baseline SHA `0634421` (UX-03 completion), start checkpoint
`bf93185`, completion checkpoint `c91a45e` (final synchronized head —
confirmed identical locally and on `origin` at that SHA). Full checklist
in `docs/ACTIVE-PLAN.md`'s "UX-04" section; decisions in
`docs/adr/0034-class-records-assessments-score-entry-grade-output.md`.

Fixed all four confirmed correctness defects found by direct code
inspection during discovery, each via TDD: stale roster after a failed
assessment-item switch; overlapping score writes reachable via two
separate trigger paths (the score input and the exception-status
buttons, guarded by one shared per-learner write-generation counter
inside `handleRecord` rather than duplicated per call site); redundant
duplicate exception writes; term grades that stayed looking current
after a score changed (fixed with an automatic single-learner
recompute, gated behind "term grades have already been shown," plus a
non-flickery "(just updated)" flash — confirmed working live in a real
browser, not just in tests).

Added assessment-item correction (approved scope expansion): rename is
always safe (verified by grepping every grade-computation/export code
path for a read of the name field, plus checking the schema for a
uniqueness constraint — found neither); a full edit or delete is
permitted only while the item has zero recorded scores of any status.
Added completion-count readouts at the per-item, per-roster, and (a
second, investigated-then-implemented addition) per-class-record list
level. Re-verified grade-completeness handling against the explicit
worry that "category has an assessment" might get conflated with "grade
is meaningfully complete" — no defect found; the existing ADR-0013
interpretation already handles blank/zero/exception/missing-category/
partial-scoring correctly.

Two real bugs were found and fixed along the way, neither part of the
original four: the Class Records list didn't re-fetch after returning
from a workspace, so its new Progress column could show stale counts
(caught by a dedicated test before a human would have); and, found via
real browser-rendered visual verification (not reachable from jsdom
tests), the scored-item rename form's label/input overlapped its
explanatory text at any width, plus the assessment-item list's action
row ran together illegibly at phone width — both fixed.

`npm run quality` 390/390 (up from 379 at the UX-03 baseline),
`npm run build` clean, `check:dev-preview-isolation` clean, `npx knip`
clean of every new finding this session introduced. `cargo test`/`cargo
build`/`cargo clippy` could **not** run — a pre-existing, unrelated
`windows-future`/`windows-core` Cargo.lock dependency conflict blocks
compilation in this environment (not caused by, and not fixable from,
any file changed this session); Rust changes were verified by careful
manual review instead — see `docs/VERIFICATION-DEBT.md`. The dev-preview
fixture (`src/dev-preview/`) was extended from scratch to cover Class
Records/Assessments/Learner Scores (previously zero coverage) and used
for real browser-rendered verification via Playwright (working around a
`playwright-cli` browser-version mismatch in this environment by driving
the `playwright` package directly against the pre-installed Chromium) at
1366-wide and 390-wide, light/dark, and all three teacher modes, across
the empty/partial/fully-scored workspace states, locked-vs-unlocked item
editing, two-step delete, a live term-grade table with a floored grade,
and the grade-freshness flash after a real edit.

`teacher-ux-reviewer`/`accessibility-reviewer` were dispatched in
parallel and both hit the same recurring agent-resume/retrieval failure
documented since M7 on both the initial attempt and one permitted retry
each; a rigorous self-review was substituted and found and fixed one
real, must-fix accessibility gap (every assessment item's Edit/Delete
buttons shared an identical accessible name across the whole list —
fixed with a named `role="group"`, matching this file's own Excused/N/A
pattern) — real independent-review debt remains open, recorded in
`docs/VERIFICATION-DEBT.md`. Worked on branch
`claude/likha-sis-ux03-plan-plv80c` per this session's harness
assignment, re-verified (not assumed) to still be current.

**Explicit instruction for this session: do not begin UX-05 or any
other milestone after completing UX-04.** Recommended next milestone
(named, not started): **UX-05 — Learners, Search, Sections, Editing,
Export** — the next item on the UI-First Program roadmap depending only
on UX-01 (already complete), continuing the same
discovery→fix→polish→dev-preview→verify pattern this and the prior two
milestones established.

## Active Task (2026-08-25, this session — UX-03, complete)

**UX-03 — Daily Attendance + Monthly Attendance Summary Polish —
complete.** Baseline SHA `f02bce5`, start checkpoint `c0124f0`, feature
commit `d77089f` (exact final synchronized head recorded once pushed —
see the completion-checkpoint note below). Full checklist in
`docs/ACTIVE-PLAN.md`'s "UX-03" section; decisions in
`docs/adr/0033-daily-attendance-and-monthly-summary-polish.md`. Fixed
three confirmed correctness defects found by direct code inspection
before implementation (stale context after a failed section/date/month
change; overlapping same-learner writes with no ordering guard; "Mark
all present" not serialized against concurrent individual writes),
then the hierarchy/keyboard/mobile/legend/transition polish work the
milestone brief specified, then a self-review-found fix (the "Mark all
present preserves existing marks" reassurance is now visible in every
teacher mode, not just Guided). `npm run quality` 365/365,
`npm run build` clean, `check:dev-preview-isolation` clean, `npx knip`
4 findings (down from 5, zero new). Browser-rendered visual
verification performed via Playwright against the dev-preview fixture
(this remote session has Chromium pre-installed) at three viewports,
light/dark, and all three teacher modes, across loading/empty/success/
write-in-progress/bulk/failure/retry/mobile-ledger states — native
Windows/WebView2 verification remains a disclosed, separate gap.
`teacher-ux-reviewer`/`accessibility-reviewer` were dispatched in
parallel and both hit the same recurring agent-resume/retrieval failure
documented since M7 on both the initial attempt and one permitted retry
each; a rigorous self-review was substituted (found and fixed the one
real gap above) — real independent-review debt remains open, recorded
in `docs/VERIFICATION-DEBT.md`. Worked on branch
`claude/likha-sis-ux03-plan-plv80c` per this session's harness
assignment, not `origin/main` directly. **Next queued milestone:
UX-04 — Class Records, Assessments, Score Entry, Grade Output** (not
started — per explicit instruction, do not begin it automatically).

**Naming note**: verified this session (grep across the whole repo,
case-insensitive) that no "LIKHA-SIS 2.0"/"LIKHA SIS 2.0" naming errors
exist anywhere in the repository — the product has always been recorded
correctly as **LIKHA-SIS 0.2** in every durable document. Nothing to
correct.

## Account-Transition Note (2026-08-25)

This session is at ~97% of its weekly usage limit and is handing off to
a fresh Claude Code account/session. **Verified remote state at
handoff**: branch `main`, local and `origin/main` both at `14e7e5d`
(confirmed via `git fetch origin` + `git log`/`git status --short
--branch`; clean working tree apart from long-standing harmless 0-byte
junk files — `(String`, `ComputedTermGrade`, `MonthlyAttendanceReport`,
`src-tauri/MonthlyAttendanceReport`, `button`, `repomix-output.xml` —
untracked, not real changes; leave them as-is). **UX-02 is complete**,
not in progress — a handoff request received mid-session assumed the
remote HEAD was still at `2418099` (UX-02's start commit), which was
already three commits stale by the time it arrived; see
`docs/PROJECT-MEMORY.md`'s "UX-02 Complete; Account-Transition
Verification Note" entry for the full correction. **First action for
the next account: read this file, `docs/ACTIVE-PLAN.md`, and
`docs/PROGRESS-MAP.md`, verify the current remote HEAD for real via
`git fetch origin` before trusting any SHA stated in a prompt, then
begin UX-03 — Daily Attendance + Monthly Summary** (queued, not
started — see `docs/PROGRESS-MAP.md`'s UI-First Tranche table). Keep
the Browser pane visible for real screenshot verification, per the same
contract UX-01/UX-02 used. Impeccable remains project-local and
hook-free — do not enable or modify its hook. Preserve the
`src/dev-preview/` synthetic-fixture safety architecture (isolated
entry point, throw-guards, two automated isolation proofs) rather than
rebuilding it for future UX milestones.

**Durable future direction recorded this session** (not yet
actionable): after UX-00 through UX-08 all complete, run an
evidence-based reassessment and begin a Forms, UI, and Interaction
Deepening Program focused on making real teacher workflows easier,
faster, safer, and more pleasant — full scope and exclusions recorded
in `docs/PROJECT-MEMORY.md`'s "Post-UX-08 Direction" entry. This does
not change UX-03's scope or start any new milestone numbering now.

## Active Task (2026-08-25)

**UX-02 — Teacher Workspace Polish — complete.** Start SHA `826bf7d`
(UX-01's completion commit). See `docs/adr/0032-teacher-workspace-polish.md`
for full decisions and verification record. Built the safety-hardened
dev-only visual fixture (`src/dev-preview/`) as the first slice, then
redesigned `TeacherWorkspaceScreen` into a three-level hierarchy
(priority-ranked "Today's attendance" rail with direct one-click
actions, compact overview line, quiet recent-activity list), split
resilient data loading (a failure on either the overview or activity
path never erases the other's already-loaded content — verified
symmetric in both directions), and section preselection into
Attendance. `npm run quality` 352/352, real browser-rendered visual
verification performed across 3 viewports/2 color schemes/3 teacher
modes via the fixture. **Next queued milestone: UX-03 — Daily
Attendance + Monthly Summary** (not yet started).

**Previously completed**: UX-01 — Design Tokens, Shared Components, and
App Shell (start `cb644ef`, completion `826bf7d`) — see
`docs/adr/0031-design-system-and-app-shell.md`. UX-00 (start `603863b`,
completion `fcf26ca`) — see `docs/adr/0030-ui-first-program-and-ux00.md`.
`PRODUCT.md` and `DESIGN.md` exist at the repo root.

## Status

**Proptest pilot on the account-lockout invariant — complete
(2026-08-25)**, fourth pick from the post-sequence scoring pass (score
4.85, see `docs/adr/0029-proptest-lockout-pilot.md`). Resumes
Compounding Engineering's own deferred Phase B: two property tests in
`repository::user`'s `lockout_properties` module generalize the
existing example-based lockout tests into real invariants — lock state
exactly matches the threshold for any attempt count, and an unknown
username never locks regardless of content or attempt count. Kept to 8
cases per property (proptest's default is 256) since every case runs
real, deliberately-expensive Argon2id verification, not a mocked
lighter one — measured ~20-25s combined, not assumed. `cargo nextest
run` 312/312 (up from 310), `cargo clippy -D warnings` clean, plain
`cargo test` (the stable-checkpoint gate) also green with 0 doctest
failures. `cargo deny check` unavailable on this machine's PATH this
session — same disclosed per-machine gap noted in prior sessions, not
new. No independent-review dispatch — reasoning in the ADR (dev-
dependency-only test code, no production-code or authorization-surface
change).

**Teacher Workspace: currently-open grading period per section —
complete (2026-08-25)**, third pick from the post-sequence scoring pass
(score 5.70, see `docs/adr/0028-workspace-grading-period-status.md`).
Closes the deliberate gap ADR-0024 disclosed: each section on the
Workspace screen now shows its own currently-open grading period (e.g.
"1st Term is open") or "no grading period currently open," resolved per
section's own school year — no new Rust command, purely a frontend join
of `listSections()` and `listPeriodsBySchoolYear()`, both already used
elsewhere. `npm run quality` 316 TS tests (up from 313) green,
typecheck/lint/format/architecture clean; `npm run build` succeeds;
`npx knip` shows the same 5 pre-existing findings, zero new; no Rust
change. No independent-review dispatch — self-review only, reasoning in
the ADR (re-dispatching immediately after two failed retrieval attempts
this session wasn't a good use of the review budget for a small,
read-only, no-new-authorization-surface change).

**M12c-M26 UI review pass — complete (2026-08-25)**: both
teacher-ux-reviewer and accessibility-reviewer were dispatched, and both
attempted and failed to return retrievable findings (the same recurring
agent-resume issue documented since M7) — one resume attempt each, per
the established escalation rule, before falling back to self-review.
The two self-reviews together found and fixed two real gaps: (1) raw
ISO timestamps shown to teachers in `AuditLogScreen`/
`TeacherWorkspaceScreen`; (2) `IdleTimeoutWarning`'s `role="alertdialog"`
overclaiming modal semantics it doesn't have, fixed to `role="alert"`.
Full detail: `docs/adr/0027-audit-timestamp-readability-fix.md`. Real,
non-self review debt for this UI sweep remains open — see "Next Action"
below.

**Idle-Timeout Warning Before Logout — complete (2026-08-25)**, second
pick from the post-sequence evidence-based scoring pass (score 6.30 —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` and
`docs/adr/0026-idle-timeout-warning.md`). Closes the disclosed gap
ADR-0020 left: a teacher's session now warns 2 minutes before ADR-0020's
30-minute idle timeout, with a one-click "Stay signed in" button, instead
of silently expiring on the next click. `CurrentSession` gained
`idleExpiresAtUnixMs` (a pure peek — computed, never itself slides the
idle window); a new `extend_session` command lets a teacher explicitly
renew without needing to navigate anywhere; the new
`IdleTimeoutWarning.tsx` component polls the peek every 30 seconds and
shares the same "return to sign-in with a clear reason" path
(`onExpired`) ADR-0022's `onSessionExpired` handler already uses. `cargo
nextest run` 310/310 (up from 308), `cargo clippy -D warnings` clean;
`npm run quality` 310 TS tests (up from 302) green, typecheck/lint/
format/architecture clean; `npm run build` succeeds; `npx knip` shows
the same 5 pre-existing findings, zero new. Browser-pane visual
verification attempted and unavailable this session (navigation denied
even on retry) — disclosed, not glossed over, same standing gap since
M5/M12c. No independent-review dispatch (standing agent-resume note
below); self-review performed instead, full checklist in ADR-0026.

**Learner Roster CSV Export — complete (2026-08-25)**, selected by a
fresh evidence-based 20-scenario-style scoring pass run after the
user-directed sequence's own "reassess" checkpoint (see
`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
scoring table, and `docs/adr/0025-learner-roster-export.md` for the
implementation). Closes item #15 ("data export/backup") from
`docs/product/M8-DECISION.md`'s original candidate list — deliberately
scoped to a CSV export of already-visible learner data (Given Name,
Family Name, LRN, Sex, Enrolled On) via a new "Export learner list
(CSV)" button on `LearnerListScreen`, reusing M10/M14's `export::csv`/
`FieldDisclosure` architecture exactly. **Not** a raw database/
encryption-key backup — that interpretation was considered and
deliberately rejected this pass as its own unresolved security design
question (SQLCipher's key is DPAPI machine/user-bound; see the ADR's
"Decision" section). `cargo nextest run` 308/308 (up from 305), `cargo
clippy -D warnings` clean; `npm run quality` 302 TS tests (up from 295)
green, typecheck/lint/format/architecture clean; `npm run build`
succeeds; `npx knip` shows the same 5 pre-existing findings, zero new.
No independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0025.

**Teacher Workspace / home screen — complete (2026-08-25)**, fourth and
final named item in the user-directed sequence. See
`docs/adr/0024-teacher-workspace.md`. `TeacherWorkspaceScreen.tsx` is
now the default landing tab after sign-in — a greeting, learner/section
counts, today's attendance-marking status per section ("not yet marked
today" / "N of M marked" / "all M marked," the single most useful
at-a-glance fact for a teacher's morning), and recent sign-in activity
(reusing the audit log from earlier this session). Built entirely from
data other screens already fetch — no new Rust command, no new
migration. Deliberately did not attempt showing "currently open grading
period(s)": correctly resolving that per section would need a
non-trivial school-year-aware join this session had no evidence was
worth building yet — recorded as a real, deliberate gap. `npm run
quality` 295 TS tests (up from 286) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; `npx knip` shows the same
5 pre-existing findings, zero new (confirms the wiring is real); no
Rust change. No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0024.

**This closes the user-directed sequence (Audit Log → Global Session
Expiry Handling → Learner Search → Teacher Workspace → reassess).**
Per the user's own instruction, the next step is to reassess rather
than autonomously picking a fifth item — see "Next Action" below.

**Learner Search / filter for large rosters — complete (2026-08-25)**,
third item in the user-directed sequence. See
`docs/adr/0023-learner-search.md`. A client-side search box above
`LearnerListScreen`'s roster filters by given name, family name, or LRN
— case-insensitive substring match, no new backend query (M17's own
test already proves the data layer stays correct at 500 rows, so this
is purely a UI filtering problem). Three deliberate small choices: the
search box only appears once a learner exists, "no matches" is a
distinct message from "no learners enrolled yet," and the search box
disables while an edit is in progress (so it can never filter the
row being edited out of view, leaving the edit orphaned). `npm run
quality` 286 TS tests (up from 280) green, typecheck/lint/format/
architecture clean; `npm run build` succeeds; no Rust change. No
independent-review dispatch (standing agent-resume note below);
self-review performed instead, full checklist in ADR-0023.

**Global Session Expiry Handling — complete (2026-08-25)**, second item
in the user-directed sequence (Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess). See
`docs/adr/0022-global-session-expiry-handling.md`. Closed the exact gap
ADR-0020 flagged: every screen used to fail its own in-flight request
with a generic error when a session expired for any reason (idle,
absolute TTL, revocation) — a teacher had no idea why. A centralized
`invoke` wrapper (`src/infrastructure/tauri/invoke.ts`, all 13
repository files now import through it) notices any `Unauthorized`
rejection (except `login`'s own, a different, already-handled case) and
returns the app to `LoginScreen` with a clear "Your session has expired.
Please sign in again." banner. A real bug was caught mid-implementation
by the test suite itself: the wrapper's first draft always forwarded
`args` even as `undefined`, an observably different call shape than
omitting it, breaking 12 existing tests — fixed and recorded as a
durable lesson (`docs/learning/ERROR-PATTERNS.md`). `npm run quality`
280 TS tests (up from 271) green, typecheck/lint/format/architecture
clean; `npm run build` succeeds; `npx knip` shows no new dead code
(confirms the wiring is real); `cargo nextest run` 299/299 unaffected
(TS-only change). No independent-review dispatch (standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0022.

**Audit Log (authentication events) — complete (2026-08-25)**, first
item in the user-directed sequence: Audit Log → Global Session Expiry
Handling → Learner Search → Teacher Workspace → reassess. See
`docs/adr/0021-authentication-audit-log.md`. Scoped tightly to
authentication events only (`login_success`/`login_failed`/
`account_locked`/`logout`) — not a general data-mutation trail, a
separate future milestone. Migration 15 (`audit_log` table),
`repository::audit_log` (`record`/`list_for_school`),
`auth::login`/`auth::logout` instrumented to record every real outcome,
`commands::auth::list_audit_log` (session-scoped, 200-row cap, same
convention as every other command), and a new "Sign-in Activity" tab
(`AuditLogScreen.tsx`). A real ordering bug was caught by a genuine test
failure during development (millisecond-precision `created_at` ties
among rows written in the same test), fixed with `id DESC` as a
UUIDv7-based tiebreaker — not assumed correct, verified. `cargo nextest
run` 299/299 green (up from 288), `cargo clippy -D warnings` clean;
`npm run quality` 271 TS tests (up from 262) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0021.

**Compounding Engineering tooling pass complete (2026-08-25)** — see
`docs/product/COMPOUNDING-ENGINEERING-DECISION.md` for the full
20-scenario evaluation of a large external-tooling shortlist (Nextest,
cargo-mutants, proptest, Impeccable, Playwright/native-UI-regression,
Ponytail, Compound Engineering plugin, awesome-llm-apps components,
Beads, Serena, SQLCipher/key-storage, and more). Followed the directing
prompt's own phasing discipline strictly: executed only Phase A
(low-risk productivity, no architecture change, no hooks) this session,
deferred the rest with documented resumption criteria rather than
rushing a partial attempt at everything. **Adopted**: `cargo-nextest`
(measured ~26% faster than `cargo test` on this crate's suite, 17.5s →
13.0s post-build — fast inner loop; `cargo test` remains the
stable-checkpoint command since nextest skips doctests, of which this
crate currently has zero); `knip` v6.32.2 (ran against the real project
first per "investigate first" — found 2 genuine unused exports + 3
unused exported types, wired as `npm run check:deadcode`, deliberately
**not** in the blocking `quality` gate since findings need human
triage). **Adapted as project-local skills** (not plugins):
`.claude/skills/scope-drift-review/` (Ponytail + Scope Creep Detector
concepts) and `.claude/skills/commit-archaeology/` (git/ADR-history
research method before touching unfamiliar old code). **Started**
`docs/learning/ERROR-PATTERNS.md` — a small, deliberately non-transcript
registry of generalized lessons, each pointing at its real prevention
(a test, a constraint, an ADR) rather than duplicating detail.
Confirmed already-adopted: cargo-deny, gitleaks (2026-08-24), SQLCipher

- Windows DPAPI key protection (ADR-0003) — the directing prompt's
  Production PII Security Track item was already substantially resolved,
  not a gap. **A real bug was found and fixed by simply running actual
  verification**: `AttendanceScreen.test.tsx`/`MonthlySummaryScreen.test.tsx`
  each inject a fixed clock into their service but not into the
  component's own `new Date()` call, so the two "today"s silently drifted
  apart when the real date advanced mid-session — 3 tests failed, root-
  caused, fixed with `vi.useFakeTimers`/`vi.setSystemTime` in both files,
  and recorded as a durable lesson (not just patched and forgotten). `cargo
nextest run` 283/283 passing, `npm run quality` 262/262 passing, `npm
run build` succeeds — all actually run this session, not assumed.
  Security tooling (gitleaks/cargo-deny/osv-scanner) confirmed missing
  from this machine's `PATH` again (same disclosed per-machine gap as the
  2026-08-24 note below) — not fixed, out of scope for this pass.

**Operating mode (2026-08-24): Autonomous Continuous Development.** See
`.claude/rules/autonomous-development.md` for the full rule. Milestone
completion is a checkpoint, not a stopping point — verify, record,
autonomously select the next highest-value work, and continue. Stop only
for a genuine human approval gate or a session/context boundary, both
defined in that rule. This supersedes any older text below implying
"stop and ask which milestone is next."

**Roadmap directed by the user (2026-08-24)**: M15 (mainstream K-10
grading-policy coverage) → M16 (SHS + exceptional grading policies) →
M17 (Learner Profile Enrichment, when required by report cards/forms) →
M18 (Bulk Attendance / Teacher Productivity) → Roles & Permissions once
the needed human product decisions are settled. This supersedes the
prior "no milestone pre-selected, pick a candidate" note — M16 is next
after M15, not an open choice. **Roadmap now complete**: Roles &
Permissions was asked about directly and resolved as "deferred, not
built" (see `docs/product/M8-DECISION.md`'s follow-up section) — the
user then confirmed (2026-08-24) that for any future recommended-vs-
alternatives decision, Claude should pick the recommended option
automatically and continue, rather than pausing to ask, with the user
reviewing/adjusting afterward. Work since then is autonomously selected
from `docs/product/M8-DECISION.md`'s existing 20-scenario candidate
list and current evidence, per `.claude/rules/autonomous-development.md`.

**The `Stop` hook that echoed a verification reminder as a stopping
point was removed (2026-08-24)**, per explicit user instruction. It
lived in `.claude/settings.json`'s `hooks.Stop` array; deleted entirely.
The substantive rule it existed to enforce — never claim complete
without the checks actually having run — is unaffected and still lives,
non-blocking, in `.claude/skills/completion-verification/SKILL.md`.
Confirmed via direct file read: the JSON is well-formed and no `Stop`
key remains in `hooks`. (One intermediate manual edit briefly left the
file with invalid JSON — missing closing braces and a trailing comma;
caught and fixed before continuing.) No other hook (SessionStart,
PreToolUse, PostToolUse, PreCompact, SubagentStop) was touched.

**Account Lockout After Failed Logins is complete (2026-08-24, same
continuation session as M13-M18)** — see
`docs/adr/0019-account-lockout.md`. Autonomously selected: this was
already scenario #12 in `docs/product/M8-DECISION.md`'s original
20-scenario scoring (Security-first, ~5.8) and — unlike Roles &
Permissions — is not disqualified from autonomous selection, since a
lockout threshold/duration is a standard security-engineering default
(OWASP), not an organizational policy only the user can set. Closes a
real, previously-undefended gap: `auth::login` had no brute-force
mitigation at all, and this app's own documented deployment model
(shared school computers, multiple teacher accounts) makes local
password-guessing a real threat, not hypothetical. Five wrong passwords
against one known username locks it for 15 minutes, with immediate
feedback on the triggering attempt; a locked account rejects even the
correct password without running Argon2id at all (saves CPU on an
attempt that can't succeed); a successful login resets the counter; an
unknown username is completely unaffected by any of this and always
returns the same generic failure it always has. `LoginScreen` now shows
a distinct, specific message for a lockout rather than folding it into
the generic "couldn't sign you in" text. `cargo test` 226 lib (up from 220) + 54 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 262 TS tests (up from 259) green; `npm run build`
succeeds. No independent-review dispatch — see the agent-resume note
below; a careful self-review was performed instead (full detail in
ADR-0019), which also caught and fixed two real, unrelated UX/
accessibility gaps in M17's `LearnerListScreen` edit affordance (no
focus management when entering edit mode; a second "Edit" click could
silently discard a first learner's unsaved changes).

**Idle-Timeout Session Hardening is complete (2026-08-24, same
continuation session)** — see
`docs/adr/0020-idle-timeout-session-hardening.md`. The other half of the
shared-school-computer threat model ADR-0004 explicitly deferred
("[a session is] valid for this long after login regardless of
activity"): a session now also expires after 30 minutes of no
protected-command activity, independent of and in addition to the
existing fixed 8-hour absolute cap — both must hold. Only the one check
every protected command already goes through
(`SessionManager::require_active_session`) counts as activity and
slides the window forward; `commands::auth::current_session` (a
session-status peek) deliberately does not touch it, or polling session
state would itself defeat idle timeout. No schema change, no new
command, no frontend change (an idle-expired session fails the same
generic `Unauthorized` path every other session failure already does —
a pre-existing UX gap this milestone doesn't newly introduce, not
overlooked). `cargo test` 229 lib (up from 226) + 54 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 262 TS tests
(unchanged — confirms zero frontend impact) green; `npm run build`
succeeds. No independent-review dispatch (same standing agent-resume
note below); self-review performed instead, full checklist in
ADR-0020.

**Independent-review agent-resume issue recurred this session
(2026-08-24)**: `teacher-ux-reviewer` and `accessibility-reviewer` were
both dispatched in parallel for the M12c-M18 UI (real, previously-owed
review debt). Both completed real work (17 and 16 tool uses
respectively per their own usage reporting), but neither returned
retrievable findings text via the normal completion path or a resume
attempt — the same class of issue already documented for `security-reviewer`/
`architecture-reviewer` episodes across M7/M8/M12a/M12b. Per this
session's own established escalation rule, no further retry was
attempted; a self-review was performed instead for the account-lockout
work (see above) but **not yet for the broader M12c-M18 UI sweep those
two agents were originally asked to cover** — that remains real,
undischarged review debt, distinct from (and larger in scope than) the
two specific findings the self-review incidentally caught while working
on something else. Re-run both reviewers for real once agent-resume
behavior is confirmed working in a future session.

**M18 Bulk Attendance / Teacher Productivity is complete (2026-08-24,
same continuation session as M13-M17)** — see
`docs/adr/0018-bulk-attendance-mark-all-present.md`. Directly closes the
concrete example `docs/PROGRESS-MAP.md` had already named as
out-of-scope: "bulk attendance actions (e.g. 'mark all present')."
Before implementing, checked whether an unmarked day already behaves
like Present anywhere in this app (it does, in the SF2 export's blank
rendering and its totals) — the real value of an explicit mark is
auditability (a `recorded_at` timestamp proving the day was actually
checked), not export correctness, so the feature is genuinely about
teacher productivity, not a compliance fix. `AttendanceScreen` gained a
"Mark all present" button that marks every currently-unmarked learner on
the roster Present and **never overwrites an existing mark** — a
teacher who already flagged one Absent before clicking the bulk button
keeps that mark, proven by a dedicated repository test, not just
asserted. Reuses the existing `record()`/`roster_for_section_date`
isolation-checked read/write paths — no new query pattern, no new
authorization surface. `cargo test` 220 lib (up from 217) + 54
integration tests (up from 51) green — one transient parallel-execution
flake in an unrelated pre-existing auth test, confirmed not a regression
by an isolated rerun and a full-suite rerun, matching the flakiness
class already documented in `docs/PROJECT-MEMORY.md`'s M12b note.
`cargo clippy -D warnings` clean; `npm run quality` 256 TS tests (up
from 249) green; `npm run build` succeeds. No independent-review
dispatch (no new authorization surface or write path). Visual
verification not attempted, same standing gap as every UI milestone
since M5/M12c.

**M17 Learner Profile Enrichment (LRN + Sex only) is complete
(2026-08-24, same continuation session as M13-M16)** — see
`docs/adr/0017-learner-reference-number-and-sex.md`. Scoped strictly to
the roadmap's own "when required by report cards/forms" qualifier: this
app's already-shipped exports (`export::report_card`, `export::sf2`)
were checked first, and neither had ever disclosed LRN, birthdate, or
guardian contact as missing before this milestone. Research (two
independent secondary sources per field, matching the bar M10 already
set for SF2's own field layout) confirmed LRN and Sex are the only two
fields those two exports actually need — SF2's per-learner roster lists
both, and the SF9-style report card header needs LRN. Birthdate and
guardian contact are **not** added — no shipped export discloses either
as missing, so adding them now would be exactly the "expand PII
collection unnecessarily" the security-privacy rule prohibits. Both new
`learners` columns (`lrn`, `sex`, migration 13) are nullable with DB-
level format enforcement (`CHECK` constraints for the 12-digit LRN shape
and the M/F domain, plus a partial unique index on `(school_id, lrn)` —
a data-entry sanity check within one school's own visible data, not a
claim of verified national uniqueness). `export::sf2` and
`export::report_card` now populate LRN/Sex when present and disclose
per-row (not globally) when a specific learner doesn't have one yet;
SF2's old "does not track learner gender... at all" disclosure text was
corrected, since that stopped being true (drop-out/transfer _events_,
and the by-sex breakdown DepEd's statistics need from them, remain
untracked — Sex itself is now tracked). `cargo test` 217 lib (up from 208) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 249 TS tests (up from 242) green; `npm run build`
succeeds. No independent-review dispatch (no new authorization surface
or command pattern — `create_learner`/`update_learner` already existed);
an inline security self-check confirmed no new field bypasses session-
derived school scope and no LRN/Sex value is ever logged or placed in a
URL. **Disclosed gap, not an oversight**: the repository/service/command
plumbing to edit an _existing_ learner's LRN/Sex (`updateProfile`/
`updateLearnerProfile`) is built and tested, but no UI screen calls it
yet — a learner enrolled before this migration, or without LRN/Sex
filled in at enrollment, has no way to gain them until such a screen
exists. Worth closing alongside a future learner-detail-UI milestone,
not worth a rushed addition here.

**M16 SHS + Exceptional Grading Policies is complete (2026-08-24, same
continuation session as M13-M15)** — see
`docs/adr/0016-shs-and-exceptional-grading-policies.md`. Confirms
ADR-0015's own prediction empirically, not just by inspection: all six
DepEd Order No. 015, s. 2026 Table 10 (SHS/Key Stage 4) weight groups
were added as pure seed data (migration 12) against the _existing_
schema and algorithm — zero changes to
`grading_computation::compute_term_grade`, zero TS/UI changes at all
(`ClassRecordsScreen`'s picker and `ClassRecordWorkspace`'s policy-name
display are already fully data-driven, so all 8 policies now appear
automatically). Two of the six groups are structurally exceptional, not
just different percentages: Field Exposure/Arts Apprenticeship/Creative
Production weights Examinations as a Term Examination only (no Summative
Tests); Research Electives/Design and Innovation and Work Immersion have
no Examinations component at all. Both shapes are proven correct with
new end-to-end tests, not assumed. Source data reused from M13's
original primary-source PDF reading (not re-fetched — already fully
transcribed and verified at full resolution). Caveats carried into every
new policy's own citation text: DepEd itself defers detailed item-level
SHS specifications to a separate, not-yet-obtained implementation-
guidelines issuance (Annex D paragraph 47), and these policies apply to
Grade 11 (and Grade 12 only once it adopts the Strengthened SHS
Curriculum — Grade 12 under the prior curriculum still needs DO 8, s.
2015 weights, still unimplemented, still no primary source located).
`cargo test` 208 lib (up from 201) + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 242 TS tests (unchanged —
confirms no TS/UI impact) green; `npm run build` succeeds. No
independent-review dispatch (purely additive seed data against an
already-reviewed schema, no new command or code path). Visual
verification not attempted, same standing gap as M12c-M15.

**M15 Expand DepEd Grading Policy Coverage is complete (2026-08-24, same
continuation session as M13/M14)** — see
`docs/adr/0015-expand-grading-policy-coverage.md`. A class record now
explicitly pins which DepEd weight policy applies (`class_records.weight_policy_id`,
migration 11) instead of every class record silently sharing whichever
policy happens to be marked default — the real architectural gap
ADR-0014 identified. A second policy is now seeded: EPP/TLE & MAPEH
(20%/60%/20%, DO 015 s.2026 Table 9's second row, verified against the
same primary-source PDF reading M13 already did — not re-fetched).
`grading_computation::compute_term_grade` now resolves each class
record's own pinned policy; proven not just by inspection but by a test
giving the _same_ raw scores to both policies and asserting the results
differ. `ClassRecordsScreen`'s create form gained a required, always-
visible "DepEd grading weighting" picker (never inferred from a subject
name), and `ClassRecordWorkspace` now shows the actual policy in effect
in place of M14's hardcoded (and now-inaccurate) "assumes core K-10 for
everything" text. **Correction to the record**: ADR-0013/0014 both
over-flagged "GMRC/VE's domain split" as a grade-correctness gap — on
re-check, GMRC/VE is already inside the K-10 core weight group (same
20/50/30), so those grades were already DepEd-compliant since M13; the
domain split is an assessment-design tagging feature, not a different
formula. `cargo test` 201 lib (up from 192) + 51 integration tests
green, `cargo clippy -D warnings` clean; `npm run quality` 242 TS tests
(up from 239) green; `npm run build` succeeds. No new independent-review
dispatch (identical authorization pattern to every existing
reference-data command). Visual verification not attempted, same
standing gap as M12c/M13/M14.

**M14 Report Card / Official Grade Output is complete (2026-08-24, same
continuation session as M13)** — see `docs/adr/0014-report-card-export.md`.
A teacher can now export a class record's computed term grades as CSV
(`export_class_record_report_card`), reusing M10's `export::csv`/
`FieldDisclosure` architecture exactly (that struct was relocated from
`export::sf2` to the shared `export::mod`, since a second export now
needs it — a non-breaking move, `sf2.rs`'s own tests unchanged). Every
learner on the class record's roster gets a row — an explicit "Not yet
available" marker if their grade isn't computable yet, never silently
dropped. **Scope correction made during implementation**: the M13
session's end-of-turn proposal to "gate" this export to only the one
DepEd weight group M13 implements turned out not to be buildable without
new scope — `Subject` has no DepEd weight-group classification, and
`compute_term_grade` already applies the single seeded policy uniformly
to every class record, so there is nothing to gate on. Corrected to
inherit M13's own already-accepted choice instead: disclose the
limitation prominently (an always-visible warning in
`ClassRecordWorkspace.tsx`, not just a Guided-mode hint, since it's
correctness-affecting for every mode), don't silently refuse. Also
newly disclosed as omitted, more conservatively than strictly required:
DepEd's Qualitative Descriptor table, since M13's research only read it
at low resolution, not the same rigor as the tables actually
implemented — full detail in ADR-0014. `cargo test` 192 lib (up from 184) + 51 integration tests green, `cargo clippy -D warnings` clean;
`npm run quality` 239 TS tests (up from 233) green; `npm run build`
succeeds. No new independent-review dispatch (identical authorization
pattern to every existing export command, no new pattern introduced).
Visual verification not attempted, same standing gap as M12c/M13.

**M13 DepEd Grade Computation is complete (2026-08-24, continuation
session)** — see `docs/adr/0013-deped-grade-computation.md` for the full
research record and architecture decision, `docs/ACTIVE-PLAN.md`'s "M13"
section for the verification record. Compliance-sensitive: researched
against the primary source directly (downloaded and visually transcribed
the actual DepEd Order No. 015, s. 2026 PDF — a 60-page scanned document
with no text layer — not a secondary summary), verified two independent
worked examples from the Order reproduce exactly end-to-end through this
implementation. Grade computation lives in
`src-tauri/src/repository/grading_computation.rs`, pure and DB-touching
functions coexisting in one file (matching `attendance.rs`'s existing
convention): `Percentage Score = pooled raw/max × 100` per category,
`Weighted Score = PS × weight%`, `Initial Grade = sum of WS`, then either
the Order's own 41-band Adjusted Transmutation Table (SY 2026-2027) or
direct rounding under the Zero-Based Grading System (SY 2027-2028
onward, selected from the already-existing `grading_periods.school_year`
field — no new "policy effective year" table needed). A real architecture
decision — how to model Examinations' internal Summative Test 1/2 + Term
Examination sub-weighting — was resolved via the 10-scenario process:
chose a nullable self-referencing `parent_category_id` on the existing
`assessment_categories` table (reuses 100% of M12b's item/category
machinery unchanged) over a separate join table. Implements exactly one
DepEd weight group (the core K-10 English/Filipino/Math/Science/AP/GMRC
cluster, 20/50/30) — explicitly disclosed as not covering EPP/TLE/MAPEH,
any SHS group, GMRC/VE's domain split, KS1 descriptive grading, or Grade
12's DO 8 carryover (that order's exact percentages could not be
confirmed from a primary source this session and were deliberately not
guessed at). `cargo test` 184 lib + 51 integration tests green, `cargo
clippy -D warnings` clean; `npm run quality` 233 TS tests green (two real
bugs caught by the tests themselves during development: a worked-example
fixture transcription slip, and `computeTermGrade` missing `async` —
same bug class already documented from M8's `monthlySummary`). No new
independent-review dispatch (no new authorization pattern introduced);
`teacher-ux-reviewer` on the new "Show term grades" UI is additional owed
debt alongside M12c's standing one. Visual verification not possible,
same standing gap as M12c.

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, prior continuation session)** — see `docs/ACTIVE-PLAN.md`'s
"M12c" section. Summary retained below for continuity; full detail there.

**M8 Monthly Attendance Summary is complete (2026-08-24, this session)**
— see `docs/ACTIVE-PLAN.md`'s "M8 Monthly Attendance Summary" section
and `docs/product/M8-DECISION.md` (the 20-scenario decision record) for
full detail. Selected via an autonomous evidence-based product-decision
process, not user-picked. A real DepEd `CONSO SF v2025.xlsx` the user
provided was used to verify SF2's actual structure — corrected the
milestone's scope to a school-wide overview (not section-level) with an
honest on-screen disclaimer, rather than an unverified guess at an
official template. **↺ INDEPENDENT REVIEW REQUIRED** for M8:
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
were not attempted this milestone; one `security-reviewer` attempt hit
the same agent-resume issue described below and was not retried
further (self-review performed instead — see `docs/ACTIVE-PLAN.md` for
what it covered).

**M7 Attendance Tracking is complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M7 Attendance Tracking" section for full detail.
Independent review (`security-reviewer`, `architecture-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer`) was launched in parallel
and all four agents did real, substantial work, but their findings text
was not retrievable via the normal completion-notification/resume path —
a session-wide agent-harness issue (also hit earlier this session with
the Windows-migration checkpoint's `reliability-reviewer`). Per this
session's own escalation rule (attempt once more, don't repeatedly
retry), one fresh single-attempt re-run of `security-reviewer` was made
afterward — that one **did** surface a usable summary this time: **no
blocking findings**; tenant scoping and the ownership pre-check were
confirmed correct (matches this project's `require_active_school_scope`
invariant, no TOCTOU, no recurrence of the M4/M6 bug classes), plus two
non-blocking informational notes, both fixed on the spot: (1) `record()`'s
post-write re-fetch `SELECT` didn't filter by `school_id` (safe in
practice, since `learner_id` alone already resolves to one school, but
inconsistent with this codebase's explicit-scoping convention — added
`AND school_id = ?3`); (2) `AttendanceStatus::from_db_str` used
`unreachable!()` for a value outside the DB `CHECK` constraint — changed
to return a `rusqlite::Result` so a hypothetical constraint-bypass (a
dropped constraint, a manual DB edit) fails one command with an
`AppError::Database`, not the whole process with a panic. Re-verified
after these fixes: `cargo test` 98/98, `cargo clippy -D warnings` clean.
**`architecture-reviewer`, `teacher-ux-reviewer`, `accessibility-reviewer`
remain ↺ INDEPENDENT REVIEW REQUIRED** — replaced with the careful
self-review recorded in `docs/ACTIVE-PLAN.md`, not a substitute for a
real second set of eyes. Re-run these three for real once agent-resume
behavior is confirmed working in a future session.

M0–M6 are all complete and verified. `git log` shows `a70915b` (harness
upgrade) as HEAD, matching `origin/main` — the M0–M6 + harness work is
committed. A pre-existing uncommitted change to `src-tauri/Cargo.toml`
(adds `features = []` to the `tauri`/`tauri-build` dependency entries,
disabling their default features) was present at the start of this
session, is unrelated to this session's work, and was left as-is for the
user to review — verified (by temporarily stashing it and doing a full
clean rebuild) that it is **not** load-bearing for anything fixed this
session.

**Windows machine-migration checkpoint (2026-08-24), this session:**
verified this is the canonical repo on a new/re-set-up Windows PC, fixed
a real cross-machine reproducibility defect and a real local build defect
found in the process. Summary below; full verification record in
`docs/ACTIVE-PLAN.md`.

- **Line-ending reproducibility, fixed.** No `.gitattributes` existed.
  This machine's global `git config core.autocrlf` is `true` (the common
  Windows default) but this specific repo's local `core.autocrlf` was
  already `false`, so the defect wasn't reproducing on this exact clone —
  but a fresh clone without that local override would hit it: CRLF
  checkout of LF source, failing `prettier --check` (part of `npm run
quality`) across nearly the whole repo. Added `.gitattributes`
  (`* text=auto eol=lf`, with `.cmd`/`.bat` pinned to CRLF and binary
  assets marked `binary`) — verified with `git ls-files --eol`: sampled
  text files now show `attr/text=auto eol=lf`, `.ico` shows `-text`. No
  `.cmd`/`.bat` files are currently tracked, so that guard is
  forward-looking, not yet exercised.
- **Stale absolute-path build cache, fixed.** `src-tauri/target/`
  contained cached Rust build-script `output` files (e.g. for
  `openssl-sys`, `tauri`) whose embedded absolute paths pointed at a
  different directory name (`...\likha-sis-0.2-lf\...` — evidently a
  sibling directory from an earlier line-ending-migration clone, per the
  session's own briefing). This produced a cryptic `cargo build`/`cargo
test` failure: "failed to read plugin permissions... file not found"
  referencing the wrong directory, because a dependency's build script
  had cached output describing a location that no longer exists — cargo
  doesn't always rerun a build script if it doesn't detect an input
  change, so it kept reusing the stale cached path. Fix: delete
  `src-tauri/target/` entirely and do a full clean rebuild — this makes
  every build script rerun, and their reported OUT_DIR/paths get
  recomputed against the actual current directory. (Two of three deletion
  attempts this session still hit the stale error immediately after
  deleting — the first two `cargo`/`cargo build` invocations were launched
  as overlapping background processes racing on the same freshly-deleted
  target dir; only a fully sequential delete-then-build, waited on to
  completion before starting anything else against the same directory,
  actually cleared it.) Verified clean afterward: `cargo test` 85/85 (up
  from 72 recorded in M6 — see below), `cargo clippy --all-targets -D
warnings` clean, twice, including once with the pre-existing
  `Cargo.toml` diff temporarily stashed out to confirm that diff wasn't
  the actual fix.
- Added `scripts/verify-dev-environment.ps1` (read-only PASS/WARN/FAIL
  doctor: Git, Node/npm, Rust/Cargo, MSVC Build Tools + Windows SDK via
  `vswhere`, Strawberry Perl, the `.gitattributes` line-ending policy, and
  a regression check that scans `src-tauri/target/debug/build/*/output`
  for cached absolute paths referencing a `src-tauri` directory other than
  the current repo root — the exact class of bug just described. Run
  clean on this machine: 0 FAIL, 2 WARN (cargo and perl are correctly
  installed and on the persistent Windows User `PATH`, but were not on
  _this shell session's_ `PATH` — a real, reproducible distinction: a
  fresh terminal picks them up, the terminal used mid-session did not).
  Also added `scripts/setup-windows.ps1` (idempotent `winget install` for
  the same prerequisite list; diagnosis-only philosophy — does not
  auto-verify, tells the user to run the doctor script from a fresh
  terminal afterward). Both independently reviewed
  (`security-reviewer`: no blocking findings, two should-fix items in
  `setup-windows.ps1` fixed — pin `--source winget`, and a failed winget
  install now sets a failure flag and causes a non-zero exit instead of
  silently exiting 0; `reliability-reviewer`: two independent attempts
  both entered a confused state — misinterpreting genuinely new follow-up
  messages as repeated automated hook reminders and returning no usable
  findings — replaced with rigorous self-review, the same fallback M6
  used when an independent review hit a session limit. Self-review
  covered: the stale-build-cache regex was actually run against this real
  repo and caught a real false positive (see next sentence); the
  cargo/perl PATH-vs-installed distinction was verified empirically
  (`[Environment]::GetEnvironmentVariable(...,"User")` confirms both are
  on the persistent Windows User `PATH`; `$env:PATH` in the actual running
  shell confirms they were absent from it); `setup-windows.ps1`'s
  `$script:hadFailure` exit-code logic was reasoned through against
  PowerShell scoping rules (a top-level `foreach` doesn't create a new
  scope, so the explicit `$script:` prefix is correct-but-redundant, not
  broken) but not executed, since running it installs software and wasn't
  warranted for this checkpoint. `architecture-reviewer` not invoked — no
  application code changed, only new scripts and repo config. The
  doctor script itself caught and helped fix a real bug in its own first
  draft: the stale-build-cache regex initially flagged a false positive
  against OpenSSL's own C-escaped (doubled-backslash) path strings in its
  build output — fixed by normalizing double backslashes before
  comparing.
- Rust/Perl/MSVC toolchain: all present and working (`cargo 1.98.0`,
  `rustc 1.98.0`, Strawberry `perl 5.42.2`, VS 2022 Build Tools with the
  C++ workload, Windows SDK `10.0.26100.0` via `vswhere`) — this machine's
  winget installs from a prior session did carry over correctly; only the
  PATH-visibility-per-shell-session gap above was new.
- Security tooling gap, disclosed: Gitleaks/OSV-Scanner/cargo-deny are
  **not** currently on this machine's PATH — `npm run quality:security`
  was not run this session (would only report "tool missing", not real
  coverage). `docs/PROJECT-MEMORY.md`'s prior claim that they're
  "installed" describes the repo-side wiring (`scripts/check-security.mjs`,
  `.gitleaks.toml`, `src-tauri/deny.toml`, `osv-scanner.toml`), which is
  still correct and unchanged — it does not mean the binaries are present
  on every machine that clones this repo. Not reinstalled this session
  (out of scope for the environment checkpoint; `setup-windows.ps1`
  deliberately does not include them, since Phase 3 was scoped to build
  prerequisites, not the separate security-tooling list).

Previously recorded harness-upgrade context (2026-08-24, prior session):

A Claude Code development harness upgrade is also complete (2026-08-24):
see `docs/adr/0007-claude-code-harness-architecture.md` and
`docs/PROJECT-MEMORY.md`'s "Claude Code Development Harness" section for
what exists (`.claude/rules/`, `.claude/skills/` — 16, `.claude/agents/`
— 8 read-only, `.claude/settings.json` + hooks, security tooling). This
was infrastructure work, not an application milestone — no M0–M6
application behavior was changed, one line was added to
`src-tauri/Cargo.toml` (`publish = false`, a real `cargo deny` finding).
Independently reviewed (security/architecture/reliability agents, then a
fresh `evaluator` pass) — the evaluator's first pass correctly FAILed on
a claim that had been recorded as adopted (the `security-guidance`
plugin) before any config for it actually existed; that's now fixed
(declared in `.claude/settings.json`) and disclosed with the same
not-yet-runtime-verified caveat as the hooks below.

**Known, disclosed gap**: `.claude/settings.json` (hooks and the
`security-guidance` plugin declaration) did not exist when this session
started, so neither was observed actually active in this same session —
the settings-file watcher only watches directories that existed at
session start. Run `/hooks` once, or start a fresh session, to activate
them, then spot-check: e.g. try a destructive-looking Bash command and
confirm it prompts instead of running silently.

**Graphify code-graph tool — evaluated and REJECTED (2026-08-24), no
installation occurred.** Independently verified via `gh api` (not just
the research summary): 109,806 stars / 10,675 forks on a repo created
4.5 months prior — a ~245x gap over the next most-starred same-named
project, consistent with fake-star reputation laundering — plus the
maintainers explicitly declining to fix a live, acknowledged PyPI
typosquat vector on their own install path. No code from that project
was downloaded, cloned, or executed. Full writeup:
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`. No
harness change resulted from this beyond documenting the rejection —
`.claude/`'s skill/agent/hook set is unchanged from the prior session.

## Current Goal

**M12c Score-Entry Keyboard, Mobile, and Audit Polish is complete
(2026-08-24, continuation session)** — see `docs/ACTIVE-PLAN.md`'s "M12c"
section for full detail. UI-only: `ClassRecordWorkspace.tsx`'s score
entry now commits on Enter/blur (dirty-checked, so an unchanged value is
never re-sent), Enter/ArrowDown/ArrowUp move focus between learners'
score fields spreadsheet-style, Escape reverts an uncommitted edit, and a
narrow-width (≤640px) layout re-flows the roster into stacked
full-width/44px-touch-target rows instead of shrinking the desktop
table — the first deliberately mobile-specific CSS in this app. Each row
also now shows a "Saved HH:MM" note from the existing `updatedAt` field
(no schema change). Before starting, re-verified directly against
`src-tauri/src/commands/learner_score.rs` (not just trusted from the
prior note) that `record_learner_score` takes `user_id`/`school_id` only
from `sessions.require_active_session`, never as a client parameter —
confirmed accurate. `npm run quality` clean (226 tests, up from 221). A
real double-save bug (programmatic focus-move firing a synchronous
native `blur` that re-entered the commit function before the first
call's cleanup ran) was found by a new test and fixed with an imperative
in-flight guard — a plain React-state dirty-check could not have caught
it reliably. Attempted real-browser verification via the Browser pane
(added `.claude/launch.json` for `npm run dev`): confirmed the bundle
builds/serves and the login screen renders correctly (with the expected
"no backend" message, since a plain browser has no Tauri IPC bridge), but
could not screenshot/render the page in this session ("the Browser pane
is not displayed") and could not reach `ClassRecordWorkspace` without a
real backend session chain — the 640px breakpoint's actual rendered
appearance is **not** visually confirmed, same standing gap as M5. No
independent reviewer dispatched (no authorization/persistence surface
touched); `teacher-ux-reviewer` on the new interaction model is owed, see
below.

**M12b Assessment Items and Learner Scores is complete (2026-08-24, prior
session)** — see `docs/adr/0012-assessment-items-and-scores.md`. Inline
research (same method as M10/M11) found DepEd Order No. 8, s. 2015
(Written Work/Performance Task/Quarterly Assessment) has been repealed
by DepEd Order No. 015, s. 2026, which renames the categories to Written
Works/Performance Tasks/Examinations — so, per M11's own precedent and
advisor guidance, category names are seeded reference data (two sets,
DO 015 default), never a hardcoded enum. A teacher can now add
assessment items to a class record and record each learner's score
(Scored/Excused/Not Applicable), with eligibility checked against the
grading period's actual date range and every score attributed to the
session's own `user_id` (never client-supplied). `cargo test` 163 lib +
6 new integration tests + 3 new migration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (221 TS tests,
39 files). **Independent review**: `security-reviewer` was dispatched
(per advisor guidance) but hit the same agent-resume issue on both the
initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (`recorded_by_user_id` cannot be spoofed — traced the actual
Tauri command parameters, confirmed only session-derived; the
`max_score` bound and status/score pairing are enforced before any
write; roster eligibility genuinely blocks an ineligible learner; no new
injection surface); full detail in ADR-0012. Still owed: a real
(non-self) `security-reviewer` pass for M12b once agent-resume behavior
is confirmed reliably working.

**M12a Gradebook/Class Record Foundation is complete (2026-08-24, this
session)** — see `docs/adr/0011-gradebook-class-record-foundation.md`.
User directed the full M12/M13/M14 roadmap in one message; per advisor
consultation before implementation, M12 was split into phases (M12a
Subject+ClassRecord foundation now, M12b assessment items/scores next,
M12c keyboard/mobile/audit polish after that) so M13's computation work
doesn't force a rework of a schema built in one pass. A teacher can now
open a class record (one section + one subject + one grading period);
`ClassRecord` stores no `school_year` of its own — the section's and the
grading period's `school_year` are verified to match at creation instead,
so there is one source of truth, not three copies that could drift.
`cargo test` 141 lib + 5 new integration tests green, `cargo clippy -D
warnings` clean, `npm run quality`/`npm run build` clean (189 TS tests,
34 files). **Independent review**: `architecture-reviewer` was
dispatched (owed since M7) but hit the same agent-resume issue on both
the initial attempt and one resume-retry (real work done — confirmed via
token/tool-use counts — but no retrievable findings text either time).
Per this session's established escalation rule, a careful self-review
was performed instead — **no blocking findings** across the four areas
checked (layering, the school-year single-source-of-truth logic,
isolation/session-derivation convention, M12b setup risk); full detail
in ADR-0011. Still owed: a real (non-self) `architecture-reviewer` pass
for M12a once agent-resume behavior is confirmed reliably working.

**M11 Grading-Period Foundation is complete (2026-08-24, this
session)** — see `docs/ACTIVE-PLAN.md`'s "M11" section for the full
verification record and `docs/adr/0010-grading-period-foundation.md` for
the technical decision, source citations, and scope boundaries.
User-directed (named as the explicit next-best in the same message that
directed M10). Schools can now record grading periods per school year,
instantiated from a versioned, DepEd-sourced policy — the current
default cites DepEd Order No. 9, s. 2026 (four quarters → three terms),
chosen deliberately over hardcoding either structure once research
showed DepEd's own terminology is genuinely in transition. No grade
computation or gradebook yet.

**Independent review for M11**: one `security-reviewer` episode,
succeeded on the **first attempt** — no resume-retry needed, no
findings. `architecture-reviewer`/`teacher-ux-reviewer`/
`accessibility-reviewer` still not attempted, same standing debt as
M7/M8/M9/M10.

**M10 Local Section-Level SF2 Export + Reusable Official-Form Engine
Foundation is also complete (2026-08-24, this session)** — see
`docs/ACTIVE-PLAN.md`'s "M10" section and
`docs/adr/0009-sf2-export-and-official-form-engine.md`. A teacher can
export a section's monthly attendance as a DepEd-SF2-inspired CSV to
`Documents\LIKHA-SIS\`, with every field the schema can't honestly
populate disclosed (not fabricated) via a `FieldDisclosure` struct
shared between the CSV's trailing comment block and the on-screen
disclaimer. Independent review found and fixed two real should-fix
issues (CSV/formula injection; an unstripped `:` enabling a Windows/NTFS
alternate-data-stream filename) — see ADR-0009.

**Superseded (historical, kept for record only — do not act on this
paragraph):** "Next milestone not yet chosen... No candidate is
pre-selected — ask the user for a pick, or run a fresh evidence-based
scoring pass, before implementing." This was written when M12 candidates
were still open; the roadmap has since been directed (see "Status"
above) and the project now operates in Autonomous Continuous Development
Mode (`.claude/rules/autonomous-development.md`, adopted 2026-08-24) —
milestone completion is a checkpoint, not an automatic stop, and the
next milestone is selected autonomously from current evidence rather
than asked for. See "Next Action" below for the actual current
direction.

## Constraints

- Do not import or depend on old application code.
- Use synthetic data only.
- Keep dependencies minimal.
- Do not add paid services or billing-enabled infrastructure.
- Preserve architecture boundaries from `PROJECT-MEMORY.md`.
- **Commit and push after every completed milestone (2026-08-25,
  standing instruction, supersedes the prior "do not commit" default)**:
  once a milestone is verified and its ADR/handoff docs are updated,
  commit it with a descriptive message and push before continuing to
  the next autonomously-selected milestone — not a separately-requested
  action anymore.

## Environment Notes

- **Development resource assumption (revised 2026-08-24)**: two Claude
  Pro accounts are now available for this window, not one — see
  `docs/PROJECT-MEMORY.md`'s "Development Resource Assumption" for the
  full statement and what it does/doesn't change. In short: more budget
  for review/testing/research depth, not more concurrent scope.
- Rust `stable-x86_64-pc-windows-msvc`, Visual Studio Build Tools 2022
  (C++ workload), and Strawberry Perl (needed to compile vendored OpenSSL
  for SQLCipher) are all installed on this machine via winget.
- `tauri.conf.json` uses a placeholder identifier `org.likhasis.app` —
  fine for local development; revisit before any real distribution or
  code signing.
- `npm run quality` is the canonical local TS check (typecheck, lint,
  format:check, an architecture-boundary check, test). For Rust:
  `cargo test`, then `cargo clippy --all-targets -- -D warnings`. New
  tiers from the harness upgrade: `npm run quality:security` (Gitleaks +
  cargo-deny + OSV-Scanner, via `scripts/check-security.mjs` — explicitly
  distinguishes "tool missing" from "tool ran clean"), `npm run
quality:ui` (currently an honest placeholder — no Playwright UI-smoke
  suite exists yet), `npm run quality:full` (adds the Rust checks). All
  four security tools (Gitleaks, cargo-deny, OSV-Scanner,
  `@playwright/cli`) require a fresh shell/session to be on `PATH` after
  this session's winget/cargo/npm installs.
- The working SQLite database is encrypted (SQLCipher) and keyed via
  Windows DPAPI — see `docs/adr/0003-encryption-at-rest.md`.
- All SQL lives in Rust (`src-tauri/src/repository/`); the frontend never
  constructs SQL — see `docs/adr/0002-local-database-foundation.md`.
- **Authentication/authorization** — see
  `docs/adr/0004-authentication-and-local-session.md` before touching
  `src-tauri/src/auth/`, `commands/{auth,user,learner}.rs`, or any TS
  `AuthApplicationService`/`LearnerApplicationService` usage. Any Tauri
  command reading/writing tenant data must derive scope from
  `sessions.require_active_school_scope(&conn)`, never accept it as a
  parameter; any command creating accounts/memberships must go through an
  `authorize_*` gate in `auth/mod.rs`. This exact gap (unauthenticated
  bootstrap commands with no limit) was found and fixed once already —
  don't reintroduce it.
- **UI** — see `docs/adr/0005-app-shell-and-first-ui-slice.md` and
  `docs/adr/0006-first-run-bootstrap.md`. New screens go in `src/ui/`,
  receive their `*ApplicationService`s as props (never import
  `composition.ts` directly, so they stay testable with fakes), and
  should check `useTeacherMode()` before assuming `Guided`-only content
  isn't needed. `src/composition.ts` is the only file allowed to import
  concrete `infrastructure/tauri/*` classes — enforced by
  `npm run check:architecture` now, not just convention.
- **Visual verification gap, standing**: this environment has no
  browser/screenshot/rendering tool for the compiled native app. Every
  future UI milestone will hit the same limitation M5/M6 did — plan to
  flag it the same way (verify everything objectively checkable, state
  plainly what wasn't), not to work around it by guessing. `@playwright/cli`
  (adopted this session) can partially help for the browser-rendered
  `vite dev` surface only — it cannot attach to the compiled Tauri
  webview. See `docs/VERIFICATION-DEBT.md`.
- `vitest-axe` was tried and dropped (unmaintained, v0.1.0, types don't
  match Vitest 4.x) in favor of a direct `axe-core` wrapper at
  `src/test/a11y.ts` — use `expectNoAccessibilityViolations(container)`
  for new screens' structural accessibility tests.

## Next Action

**Post-sequence evidence-based scoring pass complete (2026-08-25)** —
see `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md` for the full
table. Top two picks are both implemented: Learner Roster CSV Export
(8.10, ADR-0025) and Idle-Timeout Warning Before Logout (6.30,
ADR-0026). Per the user's own standing preference ("just select the
recommended automatically, will adjust after all milestone has
achieved"), the next-highest-scoring runner-up remains the default next
pick:

1. **teacher-ux-reviewer/accessibility-reviewer dispatched (2026-08-25)**
   on the M12c-M26 UI sweep. **`teacher-ux-reviewer` outcome**: hit the
   same recurring agent-resume/retrieval failure this project has
   documented since M7 — real work done (26 tool uses, ~94k tokens
   across the initial run and one resume attempt), but no findings text
   ever retrievable, even after the one resume this project's
   escalation rule allows. Per that rule, a careful self-review was
   performed instead — see `docs/adr/0027-audit-timestamp-readability-fix.md`.
   It found and fixed one real, concrete gap: `AuditLogScreen.tsx` and
   `TeacherWorkspaceScreen.tsx` were both showing a teacher a raw ISO
   timestamp (`2026-08-25T08:00:00.000Z`) instead of a readable date,
   the same class of bug M12c already fixed once for
   `ClassRecordWorkspace.tsx`'s "Saved HH:MM" note but never carried
   forward to the screens added after it. Fixed in both places; 4 new
   tests. **`accessibility-reviewer` outcome**: hit the identical
   agent-resume/retrieval failure (real work, 31 tool uses, ~124k
   tokens across the initial run and one resume, no retrievable
   findings text either time). Per the same escalation rule, another
   self-review was performed, covering contrast, focus management,
   keyboard operability, ARIA correctness, and touch-target sizing. It
   found and fixed one real issue: `IdleTimeoutWarning.tsx` used
   `role="alertdialog"`, which per ARIA authoring practices implies
   modal focus-trapping behavior the component never actually provides
   (it's a dismissible, non-blocking banner, same as every other banner
   in this app) — changed to `role="alert"`, matching the
   `error-banner`/`confirmation-banner` convention already established.
   Hand-computed contrast for the new `--color-warning` tokens passed
   comfortably in both light (≈5.3:1) and dark (≈7.7:1) mode — no fix
   needed there. `npm run quality` 313 TS tests (up from 302 before
   this dispatch) green throughout. **Both `teacher-ux-reviewer` and
   `accessibility-reviewer` remain owed a real (non-self) pass** on
   this UI sweep once agent-resume behavior is confirmed reliably
   working in a future session — recorded as standing debt, not
   discharged by the self-reviews above.
2. **Grading-period-aware Teacher Workspace enhancement — complete
   (5.70)**. See `docs/adr/0028-workspace-grading-period-status.md`.
3. **Proptest pilot on auth/lockout invariants — complete (4.85)**. See
   `docs/adr/0029-proptest-lockout-pilot.md`.

**All scored candidates from the post-sequence pass above the ~4.0
threshold are now complete.** The two remaining entries in that pass's
table — password reset/account recovery (4.20) and a Trail of Bits
second-opinion pilot (3.25) — both scored low specifically because
they're blocked on something other than raw implementation effort
(password reset needs a genuine product/security decision this app has
no out-of-band recovery channel for yet; the Trail of Bits pilot needs
external-tool research this session didn't do). Per the same "reassess
rather than default to whatever's next on a now-stale list" discipline
this project has used at every real checkpoint, this is another
legitimate point to run a fresh evidence-based scoring pass (or ask the
user for direction) before picking a fifth item, rather than reaching
for password reset or Trail of Bits just because they're what's left on
an old list. Real candidates worth weighing in that fresh pass: the
still-open `teacher-ux-reviewer`/`accessibility-reviewer` review debt
(once agent-resume behavior can be spot-checked as healthy first), the
remaining Compounding Engineering Phase B/C/E/F/G items, data
export/backup's original raw-database-backup interpretation (explicitly
deferred as its own security-design question in ADR-0025), and any
newly-relevant DepEd research if a primary source for KS1/DO 8 surfaces.

Still-standing context, unchanged since the last reassessment:

- The shared-computer/session-security thread (Account Lockout →
  Idle-Timeout → Audit Log → Global Session Expiry) remains coherent
  and closed — no known open gap.
- Password reset/account recovery (scored 4.20 — low specifically
  because this local-only, no-email/SMS app has no safe out-of-band
  recovery channel without either an admin-reset flow, which needs the
  still-deferred Roles & Permissions decision, or a weak
  security-question mechanism this project's posture shouldn't adopt)
  needs a genuine product/security decision before it's actionable.
- DepEd weight-group work remains genuinely blocked, not deprioritized:
  Key Stage 1 descriptive grading and Grade 12's DO 8 carryover both
  still lack a usable primary source — see "Remaining DepEd weight-group
  work" below before attempting either again.
- The Compounding Engineering tooling pass
  (`docs/product/COMPOUNDING-ENGINEERING-DECISION.md`) deliberately
  deferred Phases B-H (proptest — scored 4.85 this pass, cargo-mutants,
  UI regression testing, agent-regression suite, Trail of Bits second
  opinion — scored 3.25 this pass, Beads/Serena piloting) with
  documented resumption criteria.

Other done/available items, none blocking:

- **Done (2026-08-24)**: Account Lockout After Failed Logins — see
  `docs/adr/0019-account-lockout.md`.
- **Done (2026-08-24)**: Idle-Timeout Session Hardening — see
  `docs/adr/0020-idle-timeout-session-hardening.md`. Closes both
  shared-computer threat-model gaps ADR-0004 originally deferred
  (lockout for the login step, idle timeout for an already-authenticated
  abandoned session).
- **Done (2026-08-25)**: Audit Log — see
  `docs/adr/0021-authentication-audit-log.md`.
- **Done (2026-08-25)**: Global Session Expiry Handling — see
  `docs/adr/0022-global-session-expiry-handling.md`.
- **Done (2026-08-25)**: Learner Search / filter for large rosters —
  see `docs/adr/0023-learner-search.md`.
- **Done (2026-08-24)**: a `LearnerListScreen` edit affordance closing
  M17's disclosed gap, plus two self-review-caught fixes (focus
  management entering edit mode; a second "Edit" click could silently
  discard a first learner's unsaved changes).
- Dispatch a fresh `teacher-ux-reviewer` and `accessibility-reviewer`
  pass on the M12c-M21 UI sweep once agent-resume behavior is confirmed
  working — real, undischarged review debt, not blocking.
- Other candidates from `docs/product/M8-DECISION.md`'s original
  20-scenario list, not yet built and not in the current directed
  sequence: a teacher dashboard/home screen (#6, though this overlaps
  with the directed "Teacher Workspace" item — reconcile when reached
  rather than building twice), data export/backup (#15), password
  reset/account recovery (#17).
- Remaining DepEd weight-group work, **not** purely additive after
  further research (2026-08-24): Key Stage 1 descriptive grading (a
  structurally different computation — rubric evidence, not weighted
  scores). Grade 12's DO 8, s. 2015 carryover was re-investigated this
  session — the weight percentages ARE now findable (multiple
  corroborating secondary sources: Languages/AP/ESP 30/50/20,
  Science/Math 20/60/20, MAPEH 40/40/20 for grades 1-10; SHS Core/Track
  25/50/25 for grades 11-12 — the last being the only one actually
  relevant, since DO 015 already supersedes the K-10 figures). **But
  this is not purely additive like the SHS groups were**: DO 8's own
  1.6-point-increment transmutation table is a structurally different
  curve from DO 015's Adjusted Transmutation Table already implemented
  in `grading_computation::ADJUSTED_TRANSMUTATION_TABLE` (different
  floor behavior even — one secondary source claimed DO 8 floors 60→75,
  another claimed 60→60 matching DO 015's own table; these directly
  contradict each other, which is itself a sign neither should be
  trusted without a primary source). `compute_term_grade` currently
  selects a transmutation approach purely from `grading_periods.school_year`
  (SY2026-2027 → DO 015's Adjusted Table; SY2027-2028+ → Zero-Based
  rounding) — there is no third path for "this class record uses DO 8's
  own transmutation table," and adding one is a real architecture
  decision (how does a class record signal it's under DO 8, not just
  which weight percentages it uses?), not a seed-data-only change.
  **Do not implement the weight percentages alone and reuse the existing
  transmutation logic** — that would silently apply the wrong curve to
  Grade 12's grades. Needs a dedicated research pass to pin down DO 8's
  actual transmutation table from a primary or clearly-reliable source,
  followed by the 10-scenario process for the selection mechanism,
  before any schema change. **Two further research attempts this
  session (2026-08-24) still failed to produce a trustworthy full
  table**: secondary sources disagree even on the transmuted-grade
  range itself (one claims 60-99, another 60-100), a page specifically
  about "D.O. No. 8 s.2015" cites only a Facebook post as its source
  (not the Order), and no page reproduces the full ~40-row table. Per
  `.claude/rules/autonomous-development.md` gate #6, this is now a
  confirmed stop: do not attempt DO 8's transmutation table again from
  a web search — it needs the actual primary-source PDF (the way M13
  obtained DO 015's), which was not locatable this session.

If DepEd-specific research is needed for any of the above, prefer doing
it inline with `WebSearch`/`WebFetch` in the main session over spawning
`deped-researcher` — inline research (including, in M13, downloading and
visually transcribing the actual DepEd Order PDF, and in M17,
cross-checking two independent secondary sources before adding any
learner-profile field) has worked cleanly since M10, while this
session's agent-resume path remains inconsistent.

Also **owed from M7/M8/M9/M10/M11/M12a, not blocking but should be
revisited**: a real (non-self) `architecture-reviewer`/
`teacher-ux-reviewer`/`accessibility-reviewer` pass for M7, all four
review types for M8, all four for M9, and
`architecture-reviewer`/`teacher-ux-reviewer`/`accessibility-reviewer`
for M10 and M11 (both milestones' `security-reviewer` episodes did
succeed — see ADR-0009/0010), once agent-resume behavior is confirmed
reliably working in a session. M12a's `architecture-reviewer` self-review
fallback and M12b's dispatched `security-reviewer` (which never returned
usable output — self-review fallback recorded in ADR-0012, re-verified
directly against source in the M12c session) are the first two of these
actually attempted; none of M12c, M13, M14, M15, M16, M17, or M18 added
new review debt beyond the `teacher-ux-reviewer` note above — M17
touched a new PII field but no new authorization surface, and got its
own inline security self-check recorded in ADR-0017 rather than a full
dispatch; M18 reused an already-reviewed write path (`record()`) and
introduced no new authorization surface — see
ADR-0011/0012/0013/0014/0015/0016/0017/0018.

If instead asked to continue harness work: the harness itself is
complete per `docs/adr/0007-claude-code-harness-architecture.md`. An
`evaluator` pass FAILed once on a real gap (the `security-guidance`
plugin was documented as adopted before it was actually configured, plus
two stray junk files) — both fixed; see
`.planning/harness-upgrade/progress.md` for the full log and confirm a
re-run evaluator PASS is recorded there before treating this as settled.
Remaining optional/deferred items, not blockers:
piloting the `@wdio/tauri-service` native-binary smoke test (currently
just researched and adopted-as-PILOT, not yet executed — see
`docs/SOURCE-REGISTRY.md`), and confirming the hooks/`security-guidance`
plugin are actually live after a `/hooks` reload or restart.

## Completion Gate

An application milestone is complete only when: it's reachable from the
actual app (not just callable in isolation), `npm run quality`/
`cargo test` stay clean, an independent reviewer agent has checked it,
and — as with M5/M6 — the visual-verification limitation is reported
honestly rather than glossed over.
