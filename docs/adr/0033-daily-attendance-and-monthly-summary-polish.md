# ADR-0033 — Daily Attendance + Monthly Attendance Summary Polish (UX-03)

Status: Accepted

## Context

Fourth milestone of the UI-First World-Class Product Program (ADR-0030),
following UX-01 (ADR-0031) and UX-02 (ADR-0032). Baseline SHA `f02bce5`
(the account-transition checkpoint, one commit after UX-02's own
completion `14e7e5d` — no code changed in between). Scope: polish
`AttendanceScreen`/`MonthlySummaryScreen` — the same information
hierarchy, non-color-cue, and dev-preview-fixture disciplines UX-01/
UX-02 already established — while fixing three correctness defects
found during planning by direct inspection of the live code, not merely
hypothesized from the milestone brief.

Product name note: this project's product/version identity is
**LIKHA-SIS 0.2**. A repository-wide grep (case-insensitive, whole
repo) confirmed zero occurrences of "LIKHA-SIS 2.0"/"LIKHA SIS 2.0" —
there was no stale naming to correct anywhere in this project's durable
documents.

## Confirmed correctness defects (found before implementation began)

Direct reading of `src/ui/AttendanceScreen.tsx` and
`src/ui/MonthlySummaryScreen.tsx` at the pre-UX-03 baseline confirmed
three real, reproducible defects — not just theoretical risks:

1. **Stale context after a failed load.** Both screens call
   `setLoading(true)` on a section/date/month change but never clear the
   previous `roster`/`report` state. If the new fetch fails, `loading`
   becomes `false` again in the effect's `.finally`, and the component
   renders the _previous_ section's roster (or a _previous_ month's
   grid) underneath the new error banner — a teacher could mistake
   stale data for the current selection.
2. **Overlapping same-learner writes.** `AttendanceScreen`'s
   `savingLearnerId` is a single string with no per-request identity.
   Two writes for the same learner (e.g. two quick clicks before the
   first resolves) can have an older response's roster update land
   after a newer one's, since neither checks whether it is still the
   latest request for that learner. Re-selecting the already-active
   status also performs a redundant write today.
3. **Bulk vs. individual write race.** "Mark all present" disables only
   its own button; the per-row status buttons stay clickable during a
   bulk operation, so an individual write can race the bulk write with
   no serialization at all.

## Decisions

### 1. Correctness fixes — mechanism

All three defects share one root cause (no notion of "which request/
write is still current") and one fix shape:

- **Stale context**: both screens now clear the previous `roster`/
  `report` state synchronously in the same effect that starts a new
  section/date/month load, before the new request even settles — a
  failed load can then never leave a different context's data on
  screen. A request-identity ref (`sectionsRequestRef`/`rosterRequestRef`/
  `reportRequestRef`/`exportRequestRef`, one per async operation kind)
  guards every `.then`/`.catch`/`.finally` so a response is only applied
  if it's still the latest request for that operation — this also
  covers the Monthly Summary export result racing against a section/
  month change made while the export was in flight (a case the original
  milestone brief's examples didn't name explicitly but the same root
  cause applies to).
- **Overlapping same-learner writes**: `AttendanceScreen` replaced its
  single shared `savingLearnerId: string | null` with a per-learner
  "generation" counter (`writeGenerationRef: Map<learnerId, number>`).
  Starting a write for a learner increments that learner's own
  generation; the write's response is only applied if its captured
  generation still matches the learner's current one when it settles —
  an older, slower write for the same learner can never overwrite a
  newer one's result, regardless of response ordering. Selecting the
  already-active status is now a deliberate no-op (checked against the
  current roster entry before starting a write at all), not just an
  idempotent write.
- **Bulk vs. individual race**: the serialization rule chosen is the
  simplest one a teacher can actually reason about — while "Mark all
  present" is in flight (`bulkMarking === true`), every individual
  status button is disabled, matching the bulk button's own existing
  "Marking…" disabled state. This was chosen over a more clever
  fine-grained per-row exception (e.g. only disabling still-unmarked
  rows) because the bulk operation is fast and whole-roster in scope; a
  teacher does not need to reason about "am I about to race the bulk
  button on this specific row" — the answer is simply "wait a moment."
  Individual-write races were deliberately **not** solved via disabling
  (per the milestone brief's own instruction not to slow ordinary
  entry) — those are handled by the per-learner generation mechanism
  above instead, so a teacher can still mark several different learners
  in quick succession without waiting on each save.

Regression tests for all three (see `AttendanceScreen.test.tsx`/
`MonthlySummaryScreen.test.tsx`): a Section-A-loads/Section-B-fails
test, a Section/Month-load equivalent, an out-of-order-response test
for the same learner, a stale-export-after-context-change test, and a
bulk-disables-individual test — all written to fail against the
pre-fix code first (confirmed failing), then made to pass.

### 2. Daily Attendance hierarchy and per-row feedback

Reordered to section/date → "View monthly summary" transition →
completion count (`"X of Y marked · Z remaining"`, plain text, no
color dependency) → "Mark all present" → keyboard-shortcut hint →
roster table. Per-row feedback: an inline, quiet `role="status"`
"Saving…" text while a write is in flight (no persistent "Saved" label
afterward — the existing pressed-button-state change already is the
confirmation, per this app's established M7-era rationale, so an
additional label would be noise); a per-row inline `Alert` with a
same-action Retry button on failure (remembers which status was being
attempted, so Retry redoes exactly that). An explicit `StatusChip
tone="neutral"` reading "Not marked" now labels an unmarked learner
directly (previously only inferable from three unpressed buttons),
closing the "unmarked learners need a visible and screen-reader-
readable state" requirement.

### 3. Keyboard shortcuts

P/A/T mark Present/Absent/Tardy and ArrowUp/ArrowDown move focus to the
same status column on the neighboring learner row — implemented as
`onKeyDown` handlers attached directly to each status `<button>` (not a
document-level listener), so they structurally cannot fire while focus
is anywhere else (the section `<select>`, the date `<input>`, or
outside the roster entirely). A persistent, non-Guided-gated hint line
above the roster documents the shortcuts, since they matter most for
Efficient-mode keyboard-heavy use, not just Guided-mode discovery.

### 4. Mobile attendance ledger (~390px)

Mirrors `ClassRecordWorkspace`'s existing `.score-entry` mobile pattern
exactly (semantic table markup preserved; `<thead>` visually hidden via
the established clip-based technique, not `display:none`, so screen
readers keep the column semantics; row/cell tags become block-level so
each learner is a full-width labeled section with full-width/44px
status buttons) rather than inventing a second mobile pattern. Long
names wrap (`white-space: normal` on the row header) instead of
truncating.

### 5. Monthly Summary legend, retry, and the narrow-layout comparison

Legend text is written directly from `src/domain/attendance.ts`'s own
model (`AttendanceStatus | null`, where `null` genuinely means "no row
was ever written for this day" — verified by reading the type and its
doc comment, not assumed): "P Present · A Absent · T Tardy · — not
recorded (no attendance mark was made for that day — this does not
mean the learner was present)." Every day cell (marked or not) now has
an explicit `aria-label` — the previous `aria-hidden`+`&nbsp;` blank
cell had no accessible name at all, which this closes.

**Narrow-layout comparison** (required by the brief): two approaches
were weighed for the monthly grid specifically —

- **A — Horizontal scroll with a persistent (sticky) learner-name
  column and sticky day-header row.** Keeps the grid's actual task (scan
  a whole month, compare learners on a given day) intact; a teacher
  scrolling right never loses track of whose row they're reading
  because the name column stays pinned via CSS `position: sticky`.
- **B — Re-flow each learner into a stacked per-day block**, mirroring
  the Attendance roster's own mobile pattern.

**A was selected.** With up to ~23 school-day columns, option B would
turn one learner into 20+ tall stacked rows — far more total scrolling
than A, and it breaks the grid's actual job (scanning across a month
and across learners) the way the Attendance roster's simple two-column
layout doesn't have to worry about. Implemented via `position: sticky`
on `.monthly-summary th[scope="row"]` (`left: 0`) and `.monthly-summary
thead th` (`top: 0`), an opaque `var(--color-bg)` background on both so
scrolled content doesn't show through, and a bounded
`.monthly-summary-scroll` (`max-height: 70vh`, scrolls both axes) so a
long roster doesn't push the sticky header arbitrarily far down the
page.

### 6. Attendance → Monthly Summary transition

A "View monthly summary" button on `AttendanceScreen` invokes a new
`onViewMonthlySummary?(sectionId, year, month)` callback (parsed from
the screen's own currently-selected section and date) — `App.tsx` (and
`src/dev-preview/DevPreviewApp.tsx` identically) holds a narrowly-typed
`monthlySummaryContext` state and switches the active tab, passing it
into `MonthlySummaryScreen`'s new `initialSectionId`/`initialYearMonth`
props. This mirrors ADR-0032's `attendanceSectionId` pattern exactly —
no router, no URL parameter, no global store. `MonthlySummaryScreen`
verifies `initialSectionId` against the actually-loaded section list
before using it (falls back to the first section otherwise), the same
never-trust-blindly contract `AttendanceScreen`'s own `initialSectionId`
already established.

### 7. Dev-preview extension

`src/dev-preview/fixtures.ts`'s `FixtureAttendanceRepository` gained
real (in-memory, `structuredClone`-isolated) `record()`/
`bulkMarkPresent()` behavior instead of throwing, plus a
`monthlySummary()` built from a small deterministic per-learner day
pattern (`buildFixtureMonthlyReport`) so the P/A/T/— legend has a real
example of each code in the fixture. A new `FixtureExportRepository`
returns a synthetic (clearly-labeled "(synthetic)") SF2 export result;
its other two methods remain unwired (out of UX-03's scope), matching
this file's existing "not wired" convention. `DevPreviewApp.tsx` wires
`MonthlySummaryScreen` and the section/month-preserving transition
alongside the existing Workspace/Attendance/Sign-in-Activity
destinations — no new isolation risk (same fixture-repository pattern,
same production throw-guards, verified by the existing
`isolation.test.ts` and `check-dev-preview-isolation.mjs`, both re-run
clean after this change).

### 8. A real, pre-existing overflow bug found and fixed during visual verification

Browser-rendered verification at intermediate viewport widths
(roughly 640-900px, between the mobile breakpoint and typical desktop
widths) surfaced a genuine document-level horizontal-overflow defect,
confirmed via `git stash` to **predate this milestone** (present at the
UX-03 start baseline, not introduced by it): a `<select>` whose longest
`<option>` is a long section name (the dev-preview fixture's own
deliberately-long "Grade 10 - Kagitingan..." section, added in UX-02
specifically to probe this) does not shrink below its intrinsic content
width, because flex items default to `min-width: auto`. Fixed with two
small, targeted rules: `.form-row .field { min-width: 0 }` (lets the
flex item shrink) and a shared `select { max-width: 100% }` (stops the
select itself from sizing off its content) — together these let a long
option's text truncate with the browser's own ellipsis in the closed
control (the full text still shows once the dropdown is opened), rather
than overflowing the page. Verified via direct DOM measurement
(`scrollWidth` vs `clientWidth`) at 390/640/683/700/750/800/1024/1366px
before and after: overflow eliminated at every previously-affected
width, zero regression at the others. In scope for this milestone since
it directly affects the two screens being verified and the milestone's
own "no document-level horizontal clipping" requirement, even though
the root cause predates UX-03.

### 9. Independent review

`teacher-ux-reviewer` and `accessibility-reviewer` were dispatched in
parallel against this milestone's actual diff. Both did real work
(teacher-ux: 31 tool calls, ~71k then ~77k tokens across two attempts;
accessibility: 21 tool calls, ~110k then ~120k tokens across two
attempts), but neither returned retrievable findings text — the same
recurring agent-resume/retrieval failure documented since M7 (see
`docs/CURRENT-HANDOFF.md`'s repeated notes on this). Per this project's
established escalation rule, each was resumed once (asked directly to
restate its findings); both resumes also returned no retrievable
findings. Per the rule, they were not retried a third time.

A rigorous self-review was performed instead, covering the exact
questions each reviewer was asked. It found and fixed **one real,
should-fix teacher-UX gap**: "Mark all present"'s "never overwrites an
existing mark" reassurance previously only appeared in Guided mode's
extra explanatory paragraph — a Comfortable- or Efficient-mode teacher
had no such reassurance until _after_ clicking (the post-action
confirmation banner). Since the milestone brief requires this
communicated clearly regardless of mode, a persistent, non-mode-gated
one-line hint ("Only fills in learners with no mark yet — never changes
a mark you've already made.") was added beneath the button, with a
dedicated regression test (`AttendanceScreen.test.tsx`, "communicates
that Mark all present preserves existing marks in every teacher mode").

The rest of the self-review found no blocking issues: context clarity
(heading-focus-on-mount, section/date always visible), the count
readout and "Not marked"/pressed-button non-color cues, per-row
saving/failure+retry feedback, the P/A/T/Arrow keyboard scoping (bound
directly to each status button, structurally unable to fire in the
section/date form controls — also test-covered), full mode parity,
the Monthly Summary legend's accuracy against `src/domain/attendance.ts`'s
actual `AttendanceStatus | null` model, the new `aria-label` on every
day cell (marked and unrecorded), the mobile ledger's 44px targets and
preserved table semantics (`<thead>` visually hidden via the
established clip-based technique, not `display:none`), and the sticky
Monthly Summary header/column's contrast in both themes (confirmed via
the real screenshots already captured — see the completion report).

**Independent-review debt remains open** for this milestone specifically
(recorded in `docs/VERIFICATION-DEBT.md`) — the self-review is not a
substitute for a real second set of eyes. Retry both reviewers in a
future session once there's reason to believe the harness's agent-
resume behavior is fixed.
