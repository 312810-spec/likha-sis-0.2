# ADR-0032 — Teacher Workspace Polish (UX-02)

Status: Accepted

## Context

Third milestone of the UI-First World-Class Product Program (ADR-0030),
directed explicitly for UX-02 with baseline SHA `826bf7d` (UX-01's
completion commit). Scope: redesign `TeacherWorkspaceScreen` — not a
second dashboard — into a three-level information hierarchy ("Today's
priority" dominant, "useful overview" compact, "quiet secondary
information" for recent sign-in activity), give each section a direct
one-click action into its real workflow, make the screen resilient to a
partial data-loading failure, and finally close the authenticated-screen
visual-verification gap ADR-0031 §6 deliberately deferred — without
touching attendance rules, grading calculations, auth, school isolation,
the database schema, Rust commands, or exports.

## Decisions

### 1. First implementation slice: safety-hardened dev-only visual fixture

Built `src/dev-preview/` before any Workspace redesign work, per the
directing prompt's explicit ordering, so every subsequent visual claim
in this milestone rests on real evidence rather than inference.

Safety architecture, each layer independently verified (not just
asserted):

- **A fully separate Vite entry** (`dev-preview.html` + `src/dev-preview/main.tsx`),
  not registered in `vite.config.ts`'s build input (which was never
  configured and so defaults to `index.html` alone — empirically
  confirmed via `rm -rf dist && npm run build`: Vite does not
  auto-bundle sibling HTML files).
- **A production throw-guard**: `main.tsx` does `if (import.meta.env.PROD) throw`
  as an independent second defense even if the entry-point exclusion
  above were ever accidentally changed.
- **Fixture repositories that cannot reach real infrastructure**:
  `FixtureAuthRepository`'s `login`/`logout`/`extendSession`/`currentSession`
  methods throw unconditionally with an explicit safety-purpose message;
  every fixture repository is read-only synthetic data, never Tauri or
  SQLite.
- **`FIXTURE_SESSION` is a plain display prop**, the same pattern the
  existing test suite already uses throughout — never obtained through
  any real session mechanism.
- **Reuses, doesn't duplicate**: `DevPreviewApp.tsx` composes the real
  `AppShell`, `WorkbenchNav`, `TeacherWorkspaceScreen`, `AttendanceScreen`,
  and `AuditLogScreen` — only three destinations wired (enough to verify
  this milestone's own changes and the section-preselection flow between
  them), not a second app shell to maintain.
- **No URL/query-param unlock mechanism** — the fixture is reached only
  by loading `dev-preview.html` directly in a dev server; there is no
  code path from the production `index.html`/`App.tsx` route space into
  it.

Two independent, automated isolation proofs, not manual claims:

1. `src/dev-preview/isolation.test.ts` — fast, runs in every `npm test`
   via Vite's `?raw` import suffix, asserts `main.tsx`/`App.tsx`/
   `composition.ts`/`index.html` never reference `dev-preview`.
2. `scripts/check-dev-preview-isolation.mjs` (`npm run check:dev-preview-isolation`) —
   scans the actual built `dist/` output for an emitted `dev-preview.html`
   or any file content matching the fixture's own module/class names.
   Run against a real clean build this session: **21 files scanned, no
   trace of the fixture found.**

`knip.json`'s `entry` array was extended to include
`src/dev-preview/main.tsx` so knip treats the fixture subtree as
intentionally used rather than flagging it as dead code — verified: no
new knip findings beyond the same 5 pre-existing ones.

### 2. Section-preselection: verified prop, not a router/URL param

`AttendanceScreen` gained an `initialSectionId?: string` prop.
`App.tsx` (and the dev-preview fixture) hold a small piece of local
state set only by `TeacherWorkspaceScreen`'s own `onOpenAttendance`
callback — a narrowly-typed function prop, per the directing prompt's
explicit ban on a router/global-state/URL-param mechanism.
`AttendanceScreen` verifies the supplied ID still exists in the
freshly-loaded section list before using it, falling back to its
ordinary default (`result[0]?.id`) if it doesn't — the section could in
principle have been deleted between the Workspace load and the
Attendance navigation. The default is deliberately excluded from the
loading effect's dependency array (a mount-time-only default, not a
live binding that would re-select the section out from under a teacher
mid-edit), documented with an `eslint-disable-next-line react-hooks/exhaustive-deps`
placed on the literal line it applies to (an earlier placement — several
lines above the actual dependency array, separated by an explanatory
comment block — caused both an "unused directive" and a "missing
dependency" ESLint warning simultaneously; fixed by moving the comment
to immediately precede the array).

**Verified interactively, not just by test**: in the dev-preview
fixture, clicking "Mark attendance" on the Workspace's top-priority
section (Mabini — the not-started section) navigated to Attendance with
`combobox "Mabini — Grade 7"` already showing `(selected)` in the
accessibility tree — the exact section, correctly pre-selected, end to
end.

### 3. Three-level information hierarchy

- **Today's priority** (dominant): a ledger-row list
  (`.workspace-priority-rail`/`.workspace-priority-item`), one row per
  section, sorted by a documented deterministic rank — not started (0) →
  partial (1) → complete (2) → no learners enrolled (3), ties broken
  alphabetically by section name (`sortByPriority`, `ATTENDANCE_STATE_PRIORITY`).
  Each row shows the section name/grade, a `StatusChip`-rendered status
  (`"not yet marked today"` / `"N of M marked"` / `"all N marked"` /
  `"no learners enrolled"` — text, not color alone), the currently-open
  grading period for that section's own school year (reusing
  ADR-0028's per-section resolution), and one task-first action button
  whose label itself communicates state: "Mark attendance" / "Continue
  attendance" / "Review attendance" / "Manage sections" for the
  no-learners case.
- **Useful overview** (compact): one line, `"N learners across M
sections."` — no KPI cards, no decorative counters.
- **Quiet secondary information**: recent sign-in activity, visually
  secondary (reuses the existing `.learner-list` list styling rather
  than a new prominent treatment), capped at 5 entries, with a "View
  all sign-in activity" action into the existing Sign-in Activity
  screen.

Reordering sections by attendance-state rank is the only content
reordering this milestone performs, and it carries the required
documented deterministic teacher-benefit rationale in code (see
`sortByPriority`'s own comment): a teacher's most time-pressured
decision each morning is which section still needs marking, so that
state sorts first, ahead of alphabetical/creation order.

### 4. Resilient split loading

`TeacherWorkspaceScreen`'s single prior `load()` effect (UX-01 and
earlier) is now two fully independent `useEffect`s — `loadOverview`
(sections/attendance/grading/learner count) and `loadActivity` (recent
sign-in activity) — each with its own `loading`/`error` state and its
own retry-key counter incremented by a dedicated "Try again" button.
A failure in one path renders only that path's own `Alert`+retry,
leaving the other path's already-loaded content fully intact. Proven by
a dedicated test (`"shows an error with retry when recent activity
fails, without erasing a successfully loaded overview"`), not just
asserted from the code structure.

### 5. One authored focal treatment

The priority rail's `border-left: 4px solid` accent bar, colored per
attendance state (`.is-not-started`/`.is-partial`/`.is-complete`/
`.is-no-learners`), with `transition: border-left-color
var(--motion-duration-routine) var(--motion-easing-standard)` — the
ledger-continuity motion cue this milestone's one restrained treatment.
Collapses to `0.01ms` under the same shared `prefers-reduced-motion`
rule ADR-0031 established, so no per-component override was needed.

### 6. Impeccable usage this milestone

`node .claude/skills/impeccable/scripts/context.mjs` was run before
implementation; its output this session surfaced the native iOS/Android
platform reference sections rather than this project's own web-specific
DESIGN.md excerpt (a tool quirk on a Tauri-desktop-only project, not a
signal to act on). The Workspace redesign was checked directly against
the already-established Calm Civic Classroom anti-patterns instead: not
a card collection (a single bordered list, not N bordered boxes), not a
SaaS dashboard, no KPI-card decoration (the overview is one plain
sentence), status conveyed by text label plus color, not color alone.
A full interactive `critique`/`polish` conversational pass was not run
to completion this session (time budget, matching UX-01's own
disclosed limitation) — worth revisiting in a future session once more
UX milestones exist to compare visual consistency against.

### 7. Independent review

`teacher-ux-reviewer` and `accessibility-reviewer` were dispatched this
session (a fresh session, per the project's "periodically retry the
owed independent reviews... when the harness appears healthy" rule).
See "Consequences" below for their outcome and any findings acted on.

## Consequences

- New `src/dev-preview/` (fixture entry point, `fixtures.ts`,
  `DevPreviewApp.tsx`, `main.tsx`, `isolation.test.ts`) and
  `scripts/check-dev-preview-isolation.mjs` — a reusable, safety-proven
  pattern for authenticated-screen visual verification in every
  remaining UX milestone (UX-03 through UX-08), closing the gap ADR-0031
  §6 explicitly deferred.
- `src/ui/TeacherWorkspaceScreen.tsx`: fully rewritten (three-level
  hierarchy, priority sort, split resilient loading, three new callback
  props). `src/ui/AttendanceScreen.tsx`: `initialSectionId` prop with
  verify-then-fallback selection. `src/App.tsx`: wires the three new
  callbacks; `WorkbenchNav`'s `NAV_GROUPS`/`TAB_LABELS` extracted to
  `src/ui/components/workbench-nav-data.ts` to satisfy
  `react-refresh/only-export-components` after the nav component was
  touched.
- `src/ui/theme/styles.css`: `.workspace-summary`,
  `.workspace-priority-rail`/`-item`/`-main`/`-section`/`-period` (+
  4 state modifiers), `.workspace-activity-list`, and a
  `@media (max-width: 640px)` block giving priority-rail actions a 44px
  touch-target floor.
- `knip.json`: `entry` extended with `src/dev-preview/main.tsx`.
- **Verification actually run this session**: `npm run quality` —
  typecheck/lint/format/architecture all clean, **352/352 tests
  passing** (up from 339; +10 new `TeacherWorkspaceScreen` tests for
  priority sort order, per-state action callbacks, split-failure
  independence and retry, plus the 4 new `isolation.test.ts` tests).
  `rm -rf dist && npm run build` succeeds; `npm run check:dev-preview-isolation`
  passes against the fresh build (21 files scanned, fixture absent).
  `npx knip` — same 5 pre-existing findings, zero net-new.
  `npm run quality:security` — gitleaks/cargo-deny/osv-scanner all
  reported honestly as **unavailable** (not on PATH), matching this
  project's established "never convert 'not run' into 'passed'" rule —
  not a clean pass.
- **Real visual verification performed** (Browser pane, dev-preview
  fixture, genuinely rendered and screenshotted — labeled here as
  browser-rendered synthetic evidence, not native Tauri verification):
  1366×768, 1024×768, and 390×844, in both light and dark
  `prefers-color-scheme`, and in all three teacher modes
  (Efficient/Comfortable/Guided). Confirmed: correct priority order and
  per-state labels/colors at every viewport/theme/mode combination; the
  long synthetic section name and accented long learner name wrap
  cleanly with no horizontal overflow at 390px
  (`document.documentElement.scrollWidth === clientWidth`, verified via
  script, not eyeballed); the "Mark attendance" button's real rendered
  touch target measures exactly 44×340px at the mobile viewport; full
  functional parity confirmed across all three modes (Guided mode's
  extra explanatory paragraph and larger spacing push content below an
  un-scrolled fold, but the full section/activity list is present in
  the DOM and reachable by scrolling — verified via the accessibility
  tree, not assumed from a single viewport screenshot). Keyboard
  navigation verified by real `Tab` key presses (not simulated
  `focus()` calls): focus advances in a sensible order starting at the
  mode toggle, with a visible focus ring rendered on screen. The
  screen's mount-focus behavior (inherited from `PageHeader`, unchanged
  this milestone) was visually confirmed on the Guided-mode dark-theme
  capture. One tooling quirk was hit and diagnosed, not silently
  worked around: the Browser pane's synthetic `computer` click tool did
  not reliably trigger this app's React event handlers in this session
  (confirmed via `getBoundingClientRect()` matching the reported click
  coordinate exactly, so the click landed on the right pixel but still
  didn't fire); a native `element.click()` dispatch (verified via
  `read_page`'s accessibility tree afterward, not just a visual glance)
  was used to complete the interactive proof once this was identified —
  the navigation and section-preselection behavior itself is real
  application behavior, not fixture-specific, and is additionally
  covered by `AttendanceScreen.test.tsx`'s own preselection tests.
  Automated `axe-core` accessibility checks run via the existing jsdom
  test suite (`expectNoAccessibilityViolations`, part of the 352 passing
  tests) rather than injected into the live browser page (axe was never
  loaded there). Reduced-motion: verified by code inspection (the
  ledger-rail's `transition` property is driven entirely by the shared
  `--motion-duration-routine` token, collapsed under the single
  `prefers-reduced-motion` rule ADR-0031 established) — the Browser
  pane tooling used this session has no reduced-motion emulation
  control, matching ADR-0031's own disclosed limitation.
- **Independent review**: `teacher-ux-reviewer` and
  `accessibility-reviewer` were dispatched this session as background
  agents against the rewritten `TeacherWorkspaceScreen.tsx` and its
  supporting files (a fresh session, per the project's own "periodically
  retry the owed independent reviews... when the harness appears
  healthy" rule).

  **`teacher-ux-reviewer` returned real, independently-verified
  findings** (each traced to actual source lines, not relayed
  secondhand): one **blocking** finding — the Workspace's learner/section
  counts and "your sections" copy read as personalized-to-this-teacher
  when the underlying data is school-wide (no `teacher_id` column exists
  anywhere in the schema; every account in a school currently sees the
  whole school's sections/learners). Traced this to the screen's
  pre-UX-02 wording (`git show 826bf7d:...` confirms the same "your
  workspace"/"your sections" phrasing existed before this milestone) —
  a real product-model question (single-account-per-school today, since
  Roles & Permissions was explicitly deferred — see
  `docs/product/M8-DECISION.md`), not a UX-02 regression, and fixing it
  properly needs that deferred feature, not a copy patch. Recorded here
  rather than silently accepted. Four **moderate** findings, three
  triaged as reasonable-as-is with rationale (all priority-rail actions
  sharing `.button-primary` styling reflects that every listed action
  is a real, current teacher task, not a hierarchy bug; "no grading
  period currently open" has no per-row action because fixing it means
  navigating to the already-one-click-away Grading Periods screen, not
  a section-specific operation; Guided mode's shorter hint text here
  than on `AttendanceScreen` is a copy-depth difference, not a
  capability-parity violation — no control is added, removed, or
  restricted between modes) and **one genuinely fixed**: the reviewer
  caught that `TeacherWorkspaceScreen`'s own doc comment claimed the
  split overview/activity loading was independent in both directions,
  but the render JSX nested the entire "Recent sign-in activity"
  section inside the overview's own success branch — so a failed or
  still-loading overview hid a successfully-loaded activity list, the
  exact failure mode this milestone's own resilience requirement was
  meant to prevent (previously only tested in the other direction).
  Fixed by rendering the activity section as a sibling, gated only by
  its own loading/error state; a new symmetric regression test
  (`"shows an error with retry when the overview fails, without erasing
a successfully loaded activity list"`) was added and passes,
  bringing the suite to **352/352**. One minor finding (failed
  sign-in/lockout events render unframed in the activity list) reflects
  `AuditLogScreen`'s own existing intentional design (security
  transparency over visual softening) and was left as-is.

  **`accessibility-reviewer` hit the same recurring agent-resume/
  retrieval failure this project has documented since ADR-0027**: its
  first run and one permitted retry (`SendMessage` asking it to resend
  findings) both returned only "No new content to process" / "Task
  complete; final report already delivered above" with no findings
  ever actually delivered to this session. Per the project's own
  established rule, no further retries were spent chasing it. A
  self-review was performed instead, covering the areas the dispatch
  prompt itself asked for: contrast (no new colors were introduced this
  milestone — `StatusChip`'s tone→hex mapping and the priority-rail
  accent-bar colors reuse ADR-0031's already-computed, WCAG-AA-verified
  tokens unchanged); non-color status meaning (every attendance state
  is shown as a `StatusChip` text label — "not yet marked today" / "N
  of M marked" / "all N marked" / "no learners enrolled" — alongside
  its color, verified by reading the rendered accessibility tree, not
  assumed); focus management (`PageHeader`'s mount-focus behavior is
  unchanged from UX-01 and was visually confirmed via a real screenshot
  showing the focus ring on the heading after a Guided-mode load);
  touch targets (the "Mark attendance" button's real rendered
  `getBoundingClientRect()` at the 390px viewport measured exactly
  44×340px, verified by script, not eyeballed); keyboard operability
  (real `Tab` keypresses via the Browser pane, not simulated `.focus()`
  calls, advanced through the mode toggle and nav with a visible focus
  ring, confirmed by both screenshot and `document.activeElement`
  inspection); ARIA structure (the priority rail is a semantic
  `<ul>`/`<li>` list, each retry button is a real `<button>` inside the
  existing `Alert` component whose `role="alert"` mapping is unchanged
  from ADR-0031); automated coverage (`expectNoAccessibilityViolations`
  from `src/test/a11y.ts`, part of the 352 passing tests, runs
  `axe-core` against every screen state this test file renders,
  including the new symmetric-failure state). This self-review found no
  blocking issue, so — per the project's established harness-failure
  rule — an owed independent accessibility review remains open debt
  (recorded here and in `docs/VERIFICATION-DEBT.md`), not a blocker to
  completing this milestone; retry it in a future session once the
  agent-resume harness issue is confirmed fixed.
