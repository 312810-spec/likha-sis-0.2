# ADR-0031 — Design Tokens, Shared Components, and App Shell (UX-01)

Status: Accepted

## Context

Second milestone of the UI-First World-Class Product Program (ADR-0030),
directed explicitly for UX-01 with baseline SHA `fcf26ca`. Scope:
evolve the existing CSS-variable token system to the chosen Calm Civic
Classroom palette, build a small number of shared components backed by
real repetition, redesign the flat 8-button navigation into a grouped
teacher workbench, and add one restrained motion treatment — without
redesigning any individual screen's own information architecture
(that's UX-02 through UX-06).

## Decisions

### 1. Token palette — computed, not eyeballed

Every color pair below was verified with a hand-written WCAG relative-
luminance contrast calculator (`node` script, not a browser tool),
against the _actual final hex values_, before being written into
`src/ui/theme/styles.css`:

| Pair                                     | Light                                                        | Dark            |
| ---------------------------------------- | ------------------------------------------------------------ | --------------- |
| text / bg                                | 14.77:1                                                      | 14.69:1         |
| text / surface                           | 13.53:1                                                      | 13.33:1         |
| muted text / bg                          | 5.58:1                                                       | 7.87:1          |
| border / bg (non-text, ≥3:1)             | 3.71:1                                                       | 4.12:1          |
| border / surface (non-text, ≥3:1)        | 3.40:1                                                       | 3.74:1          |
| primary / bg                             | 10.85:1                                                      | 8.27:1          |
| primary-text / primary                   | 11.50:1                                                      | 8.39:1          |
| productive / bg                          | 6.04:1                                                       | 9.35:1          |
| success / bg                             | 4.95:1                                                       | 10.01:1         |
| warning / bg                             | 5.86:1 (first-pass `#8a5a00` only reached 4.10:1 — darkened) | 10.41:1         |
| danger / bg                              | 6.91:1                                                       | 8.86:1          |
| each tone's text on its own surface tint | 4.61:1 – 6.38:1                                              | 7.10:1 – 7.68:1 |

All clear WCAG 2.2 AA (4.5:1 text, 3:1 non-text); most clear AAA. Final
values: light `--color-bg:#fbf8f2`, `--color-surface:#f3eee3`,
`--color-border:#8a7f6e`, `--color-text:#1b2430`,
`--color-primary:#1e3a5f`, `--color-productive:#0f6b5c`,
`--color-success:#1d7a5f`, `--color-warning:#8f5209`,
`--color-danger:#a3271f` (unchanged). Dark-mode pair verified
separately with the same method — see `styles.css`'s inline
`/* Verified N:1 */` comments at each rule, which document the actual
number, not just an assertion that contrast was checked.

New tokens added beyond color: `--font-family`/`--font-numeric`,
`--font-size-small`, `--line-height-base`, `--content-width`/
`--content-width-wide`, `--radius-large`, `--elevation-1`,
`--focus-ring-width`/`--focus-ring-offset`, and the motion token group
below. The teacher-mode density mechanism (`--spacing-unit`,
`--font-size-base`, `--control-height` per `data-teacher-mode`) and the
24px checkbox/radio floor were left untouched — refinement, not
replacement, per the project's own design-system convention.

### 2. Typeface — Public Sans, self-hosted

Compared three permissively-licensed, locally-bundleable candidates via
`npm view` (all real, OFL-1.1, `@fontsource`-packaged): **Public Sans**
(chosen), Atkinson Hyperlegible Next, Inter. Public Sans chosen for its
civic/government-digital-service design heritage (fits "Calm Civic
Classroom" thematically without using any actual government mark),
strong legibility credentials, and good tabular-figure support for
grades/LRNs/dates/attendance counts. Installed as
`@fontsource/public-sans@5.3.0` (exact version pinned), imported via
`@import` in `styles.css` for only the three weights actually used (400,
600, 700) — no runtime webfont fetch, matching the directing prompt's
explicit constraint. `font-variant-numeric: tabular-nums` applied
globally on `body` so digit columns (grades, dates, LRNs) align.
Atkinson Hyperlegible Next remains a reasonable alternative if a
stronger low-vision accessibility need surfaces later (e.g. specifically
for Guided mode) — not chosen this pass since Public Sans already meets
the stated bar and better fits the civic tone. Recorded in
`docs/SOURCE-REGISTRY.md`.

### 3. Shared components — six, each backed by real repetition

| Component                                                | Real repetition before this milestone                                                                                                                          | Migrated call sites                                                                                                                                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Alert` (error/success/warning/info)                     | 12× `.error-banner`, 9× `.confirmation-banner`, 1× `.idle-timeout-warning` — three near-identical patterns                                                     | All of the above, every screen                                                                                                                                                                |
| `Loading`                                                | 13× `<p role="status">Loading X…</p>`                                                                                                                          | All 13                                                                                                                                                                                        |
| `EmptyState`                                             | 8× plain `<p>No X yet.</p>`                                                                                                                                    | 2 (`AuditLogScreen`, `SectionsScreen`) — proves reuse, not a full sweep; the other 6 are simple one-line JSX, safe to migrate opportunistically in UX-02+ as those screens are touched anyway |
| `StatusChip` (neutral/productive/success/warning/danger) | No prior chip pattern; applied to two genuinely short-state-word spots (`AuditLogScreen`'s event column, `TeacherWorkspaceScreen`'s attendance-marking status) | 2                                                                                                                                                                                             |
| `PageHeader`                                             | 13× identical heading+mount-focus+optional-Guided-hint pattern                                                                                                 | 2 (`AuditLogScreen`, `TeacherWorkspaceScreen`) — proves reuse without redesigning every screen's own heading, per the explicit non-goal boundary                                              |
| `NavItem`                                                | New (the flat 8-button nav row)                                                                                                                                | The redesigned `App.tsx` nav                                                                                                                                                                  |

**`Button` was deliberately not built as a new React component.** Every
call site already uses a plain `<button>` with the existing
`.button-primary` CSS-class-variant pattern consistently — there is no
markup duplication to consolidate, only a CSS class, which already
functions as the shared "component." Wrapping it in a React component
would add indirection without fixing a real inconsistency.

`Alert`'s biggest correction during implementation: it initially
defaulted to `display:flex` (copying `.idle-timeout-warning`'s own
layout), which broke multi-paragraph banners (e.g. the SF2/report-card
export disclosure lists) by laying their `<p>`/`<ul>` children out as
flex items in a row instead of stacking them — caught by actually
rendering and checking, not assumed correct. Fixed with a default block
layout and an opt-in `inline` prop for the one shape that genuinely
needs message-beside-button layout (`IdleTimeoutWarning`).

### 4. App shell / navigation

`App.tsx`'s flat `SIGNED_IN_TABS` row is replaced by `NAV_GROUPS`: four
labeled clusters matching a teacher's actual daily rhythm — **Daily
Teaching** (Workspace, Attendance, Monthly Summary), **Learner Records**
(Learners, Sections), **Grading** (Grading Periods, Class Records),
**Security** (Sign-in Activity). Every existing destination is
preserved verbatim (same IDs, same labels) — nothing removed or
renamed. `document.title` now updates per active tab
(`"<Tab> · LIKHA-SIS"`) as a cheap, real "obvious current location"
signal beyond the active nav item's own highlight.
`AppShell`'s already-existing teacher-name/school display, mode
switcher, sign-out, and `IdleTimeoutWarning` placement were
left functionally unchanged — only restyled via the new tokens.
`.app-shell-main`'s `max-width` widened from a hardcoded `720px` to the
new `--content-width-wide` (`1080px`) token — the prior width was
genuinely too narrow for roster/class-record tables on a desktop
viewport, a real fix, not a cosmetic one.

### 5. Motion — one "ledger continuity" treatment

A selection-rule underline beneath the active nav item, drawn in via
`transform: scaleX()` + `opacity` (never a layout-driving property) at
`--motion-duration-routine` (200ms) with `--motion-easing-standard`.
All motion tokens are defined once in `:root` and collapsed to
`0.01ms` under `@media (prefers-reduced-motion: reduce)` in a single
rule — every component using the tokens automatically complies, state
confirmation itself (the underline's final position) still renders
under reduced motion, just without the animated transition. Verified
by code inspection (the media query correctly targets the token
values, not a per-component override that could be missed) — not
visually toggled, since the Browser pane tooling used this session has
no reduced-motion emulation control.

### 6. Native visual-verification path — 10-scenario decision

Two candidates scored against this project's established weighted
criteria (Teacher Value 20%, DepEd Alignment 15%, Dependency Readiness
10%, Reuse 10%, Architectural Fit 10%, Security Safety 10%,
Implementation Risk 10%, Testing Confidence 5%, Future Leverage 5%,
Time-to-Value 5%):

- **A. Minimal `@wdio/tauri-service` native pilot** (launch → confirm
  bootstrap/login renders → close): 3.65. Real, unmatched long-term
  value (Future Leverage 8/10 — it's the only path that proves actual
  WebView2/Tauri-IPC behavior) but poor near-term feasibility this
  milestone (Dependency Readiness 4/10 — new WebDriver tooling, unverified
  in this environment; Time-to-Value 2/10 — realistic risk of burning
  most of the milestone's remaining budget on driver setup with no
  guarantee of success).
- **B. Dev-only synthetic visual fixture** (a session object passed
  directly as a prop to render `AppShell`+nav in isolation, bypassing
  nothing in the real auth/session code path): 5.30. Much better
  Dependency Readiness (8/10, no new dependency) and Time-to-Value
  (8/10), but Testing Confidence capped at 6/10 since it still doesn't
  prove real Tauri IPC behavior, and Security Safety only 6/10 — this
  is exactly the shape of thing the directing prompt explicitly warned
  against ("never create a production authentication bypass") if built
  carelessly.

**Recommended path: B, in a safety-hardened form (a fully separate
dev-only entry point, never imported by `main.tsx`/`App.tsx`, never
touching `authService.login` or any real session-issuance code path) —
selected, but its actual construction is deferred to whichever of
UX-02 through UX-06 first genuinely needs authenticated-screen pixel
verification.** This session's remaining time was spent on real,
already-available verification instead (see below) rather than rushing
a safety-sensitive fixture under time pressure — a smaller, safer
"useful verification slice" than building B this instant. Recorded here
so this decision doesn't need re-litigating: the next milestone that
needs it should build B in the isolated-entry-point form above, not
weaken any real auth code path to get there, and should re-run this
scoring if new evidence changes the picture (e.g. `@wdio/tauri-service`
setup becomes trivially available in a future session, which would
likely flip the recommendation toward A).

### 7. Impeccable usage this milestone

`node .claude/skills/impeccable/scripts/context.mjs` and one `shape`
pass were run before implementation (informed the nav-grouping/token
decisions above, no separate artifact produced). The bounded mechanical
detector (`node .claude/skills/impeccable/scripts/detect.mjs --json`)
was run against every touched file (the shell, `App.tsx`, `styles.css`,
all six new components, all 13 screens) as the audit step — **zero
findings** (no broken images, overflow/clip, contrast/legibility
failures, gradient text, glow shadows, or design-system drift detected
mechanically). The deeper interactive `critique`/`polish` conversational
passes were not run to completion this session (time budget); the
mechanical detector's clean pass plus the manual self-review in
"Independent review" below stand in as this milestone's correction/
confirmation pass. Worth a real interactive Impeccable critique pass in
a future session once more screens exist to compare against each other.

## Consequences

- `src/ui/theme/styles.css`: full Calm Civic Classroom token rewrite,
  Public Sans import, consolidated `.alert`/`.loading-state`/
  `.empty-state`/`.status-chip`/`.page-header`/`.workbench-nav`/
  `.nav-group`/`.nav-item` rules; `.error-banner`/`.confirmation-banner`/
  `.idle-timeout-warning`/`.section-switcher` removed (fully migrated,
  confirmed via grep — zero remaining references in any `.tsx` file).
- New `src/ui/components/{Alert,Loading,EmptyState,StatusChip,NavItem,PageHeader}.tsx`
  - matching `.test.tsx` files (21 new component tests).
- `src/App.tsx`: `NAV_GROUPS`, `TAB_LABELS`, `document.title` effect,
  grouped nav JSX.
- `src/ui/AppShell.tsx`: session-identity markup restyled via new
  classes, no behavior change.
- 13 screens migrated to `Alert`/`Loading` (all), 2 to `PageHeader`, 2
  to `EmptyState`, 2 to `StatusChip` — see table above for exactly
  which and why not all 13 for the latter three.
- `@fontsource/public-sans@5.3.0` added as a real dependency (not
  dev-only — it ships in the production bundle as local font assets).
- `docs/SOURCE-REGISTRY.md`: new Public Sans entry.
- `docs/VERIFICATION-DEBT.md`: updated — the `.claude/launch.json` port
  bug that broke Browser-pane verification is fixed and removed as a
  blocker; authenticated-screen (post-login) pixel verification remains
  open, now with a concrete recommended path (B above) instead of an
  open question.
- **Verification actually run this session**: `npm run quality` 339/339
  TS tests (up from 316; 21 new component tests + App.tsx nav tests +
  fixes to pre-existing TeacherWorkspaceScreen tests whose text-matching
  broke against the new StatusChip DOM structure), typecheck/lint/
  format/architecture all clean. `npm run build` succeeds (bundle:
  260.91 kB JS gzip 76.39 kB, up modestly from 258.42 kB; CSS 13.98 kB
  gzip 3.11 kB, up from 6.47 kB reflecting the new token/component
  rules — both increases are real and expected, not a regression).
  `npx knip` — same 5 pre-existing findings after two new ones were
  triaged and fixed (`@fontsource/public-sans` added to
  `ignoreDependencies` since knip can't see CSS `@import` usage; an
  unnecessarily-exported `AlertTone` type un-exported), zero net-new.
  **Real visual verification performed** (Browser pane, now working
  after the `.claude/launch.json` port fix, and with the pane visibly
  displayed client-side per the user's own action this session):
  `LoginScreen` screenshotted and inspected at 1366×768, 1024×768, and
  390×844, in both light and dark `prefers-color-scheme`, and in
  Efficient/Comfortable/Guided modes — confirmed the Calm Civic
  Classroom palette, Public Sans, responsive header wrapping, and
  Guided-mode hints all render correctly. A transient
  `ReferenceError: Alert is not defined` was observed once mid-edit
  (a stale Vite HMR artifact from before the `LoginScreen.tsx` edit
  fully landed) and confirmed resolved on reload — page text extraction
  after reload showed the full, correct Guided-mode content, which
  would be impossible if the error were still live. **Authenticated
  views (the new grouped nav, `AppShell`'s redesigned header) were not
  pixel-verified this session** — no live Tauri IPC bridge in the
  browser-only dev server, and see the 10-scenario decision above for
  why a fixture wasn't rushed to close that gap this milestone. Their
  structure/ARIA/behavior IS verified via the passing jsdom test suite
  (`App.test.tsx`'s new nav-grouping and document-title tests).
  Reduced-motion: verified by code inspection (the single `:root`
  token-collapse rule), not visually toggled — the Browser pane tooling
  used this session has no reduced-motion emulation control.
  `cargo`/Rust unaffected — no Rust/Tauri-command/application-boundary
  change this milestone.
- **Independent review**: not dispatched. Both `teacher-ux-reviewer` and
  `accessibility-reviewer` are documented as failing to return
  retrievable findings twice already this same session (ADR-0027,
  including one resume attempt each per the established escalation
  rule) — re-dispatching a third time immediately, with no evidence the
  underlying harness issue has changed, would not be a responsible use
  of the one-retry budget. A careful self-review was performed instead,
  covering: contrast (computed, not eyeballed, see above); focus
  management (`PageHeader`'s mount-focus behavior preserved exactly
  from each migrated screen's own prior inline version, proven by the
  existing focus-on-mount tests still passing unmodified); keyboard
  operability (`NavItem`/`Alert`/all new components are plain
  `<button>`/`<div role="...">` with no custom keyboard handling to get
  wrong); ARIA correctness (`Alert`'s role mapping traced 1:1 against
  every prior call site's own role, not a new choice; `nav-group-label`
  marked `aria-hidden` specifically to avoid double-announcement against
  each group's own `role="group" aria-label`); touch targets (the
  640px-narrow nav breakpoint gives `.nav-item` a 44px `min-height`,
  matching the existing convention from `ClassRecordWorkspace`'s score
  entry); architecture boundary (`node scripts/check-architecture.mjs`
  run directly, passed; no `src/ui/components/*` file imports Tauri or
  infrastructure code); scope drift (checked the full diff against
  UX-01's own declared non-goals — no individual screen's information
  architecture, interaction model, or DepEd-compliance behavior was
  changed, only shared visual elements and the app shell, matching the
  milestone's own boundary).
