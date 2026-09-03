# ADR-0057: UI Redesign Shell (Wave 1)

Status: Accepted

## Context

This implements Wave 1 of
`docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md`, the
approved design session that reshapes LIKHA's teacher-facing app around a
persistent sidebar, a KPI strip, a bento content grid, and
table-in-card layouts. Wave 1 delivers only the outer shell:
navigation chrome, the responsive layout, and the pre-auth container.
The layout primitives (`Page`, `KpiStrip`, `BentoGrid`, `DataTable`) and
the role-adaptive Home screen are later waves.

It supersedes the app-shell and navigation parts of ADR-0031 §4 (the
flat single-row workbench nav) and the flat-nav portion of ADR-0030's
programme. Both of those ADRs stay **Accepted** for their token and
design-system decisions — only their navigation/shell mechanics are
replaced here. The Calm Civic Classroom palette, density tokens, motion
tokens, and focus tokens are unchanged.

The redesign was seeded by a Behance "School Management Dashboard"
reference. Its **structural** ideas were adopted — a persistent left
sidebar, a KPI strip across the top of a screen, a bento grid for mixed
content, and tables rendered inside cards. Its **visual** styling was
not — no purple/orange gradients, no marketing chrome, no
admin-console framing. LIKHA stays a calm, teacher-first tool.

## Decision

### 1. Five additive, contrast-verified tokens

`src/ui/theme/styles.css` (the `:root` / dark-mode token blocks) gains
exactly five tokens. All are additive; no existing token is redefined or
removed.

- `--color-surface-2` — `#ffffff` light / `#222932` dark. The
  raised/card surface, one step off the page ground — laid down now for
  the Wave 2 layout primitives (`Card`) that will consume it. The
  sidebar and top bar use `--color-surface`.
- `--color-border-soft` — `#e4ddce` light / `#333c47` dark. **Hairline
  dividers and card outlines only.** It is never the sole cue that a
  control exists; real input and button borders keep `--color-border`.
- `--color-primary-wash` — `#eef2f7` light / `#1e2a38` dark. Nav
  hover/active fills and table-row hover. It never carries text meaning
  and never appears behind body text as the only background.
- `--elevation-2` — a drawer/overlay-only shadow token. Not used for
  resting cards.
- `--sidebar-width` — `264px`, narrowing to `224px` at the
  861–1080px breakpoint. Layout-only; not redefined for dark mode.

Contrast was computed with the same node method ADR-0031 established and
verified independently by the Wave 1 accessibility review:

| Pair                   | Light   | Dark    |
| ---------------------- | ------- | ------- |
| text / surface-2       | 15.65:1 | 12.09:1 |
| muted-text / surface-2 | 5.91:1  | 6.48:1  |
| text / primary-wash    | 13.92:1 | 11.99:1 |
| border / surface-2     | 3.93:1  | 3.39:1  |

All clear WCAG 2.2 AA — 4.5:1 for text, 3:1 for non-text. Density,
motion, and focus tokens are untouched.

### 2. Shell component split

Four components under `src/ui/shell/`, each receiving its data by props
and never importing `src/composition.ts`:

- **`AppLayout.tsx`** — the CSS-grid layout with the `<main>` landmark,
  the drawer open/closed state, and the drawer a11y contract:
  focus-move-in on open, focus trap while open, Escape-to-close,
  focus-return to the toggle on close. At phone width
  (`window.matchMedia("(max-width: 860px)")`, read on mount and updated
  on its `change` event) it gates reachability with the `inert`
  attribute (plus `aria-hidden`): the closed off-canvas sidebar wrapper
  is `inert`, and while the drawer is open `.app-layout-main` (which
  contains the bottom bar) is `inert` instead. At desktop width neither
  wrapper is inert.
- **`Sidebar.tsx`** — one instance, reused as the phone drawer purely
  through CSS. Brand wordmark, a pinned Home item above the groups, and
  four collapsible groups as `<button aria-expanded>` toggles whose
  collapsed/expanded state persists to `localStorage` under
  `likha-sis:nav-collapsed` (unreadable storage falls back to all
  expanded). The active destination is marked `aria-current="page"` and
  cued by a left rule plus heavier weight — not colour alone.
- **`TopBar.tsx`** — breadcrumb (group + screen), the density-mode
  switcher on desktop, the identity line, a sign-out button, and the
  hamburger (`data-drawer-toggle`, labelled "Open navigation").
- **`BottomNav.tsx`** — phone-only 5-item bar. Active cue is colour +
  weight + a `box-shadow` top indicator bar (the non-colour shape cue).

`App.tsx` keeps the active-tab state and the narrowly-typed
contextual-handoff variables, and mounts `<AppLayout>`.

### 3. Navigation data

`src/ui/components/workbench-nav-data.ts` is **extended, not
restructured**:

- `TAB_LABELS.workspace` is relabelled `"Home"`.
- `workspace` is removed from the "Daily Teaching" group.
- New export `HOME_DESTINATION` — the pinned item above the groups. In
  Wave 1 it still routes to the existing Teacher Workspace screen;
  Wave 3 repoints it at the role-adaptive HomeScreen.
- New export `BOTTOM_NAV` — four ids (`workspace`, `today-classes`,
  `learners`, `class-records`); a synthetic fifth "More" item opens the
  drawer.
- New helper `normalizeTab()` — maps a contextual sub-screen tab to its
  parent group destination so the parent stays highlighted.
- New helper `groupLabelForTab()` — the group label for a tab, for the
  breadcrumb.

### 4. Pre-auth stays outside the shell

Sign-in, first-run setup, and the initial status check render in a
`.app-boot` container carrying `<h1 class="app-boot-brand">LIKHA-SIS</h1>`,
never inside `<AppLayout>`. The shell is a signed-in-only concern.

### 5. Landmark naming (closes spec §10's open question)

The sidebar is `<nav aria-label="Primary">`; the bottom bar is
`<nav aria-label="Primary — quick access">`. Two `navigation`
landmarks need unique accessible names. On phone, exactly one is in the
accessibility tree at any moment: `AppLayout` marks the closed drawer
wrapper (`.app-layout-sidebar`) `inert` + `aria-hidden`, and when the
drawer is open it marks `.app-layout-main` (which contains the bottom
bar) `inert` + `aria-hidden` instead. At desktop width the bottom bar is
`display: none` and the sidebar is the sole nav landmark.

## Consequences

- **Files added**: `src/ui/shell/{AppLayout,Sidebar,TopBar,BottomNav}.tsx`
  and their `*.test.tsx`; `src/ui/components/icons.tsx` and its test;
  `src/ui/components/workbench-nav-data.test.ts`.
- **Files removed**: `src/ui/AppShell.tsx` and its test;
  `src/ui/components/WorkbenchNav.tsx`; `src/ui/components/NavItem.tsx`
  and its test.
- **`src/ui/theme/styles.css` net change**: the old
  `.app-shell` / `.workbench-nav` / `.nav-item` / `.mode-switcher` rules
  are removed; `.app-layout*`, `.app-sidebar*`, `.app-nav-*`,
  `.app-topbar*`, `.app-bottomnav*`, and `.app-boot*` rules are added.
- **Bundle**: production `npm run build` after Wave 1 (including the
  accessibility fixes in this task) — CSS `25.26 kB` / gzip `4.83 kB`
  (up from ~4.14 kB gzip), JS `375.72 kB` / gzip `101.83 kB`. The
  increase is the four shell components plus the hand-written inline SVG
  icon set; **no new dependency** was added.
- **Tests**: 735 → 763 Vitest tests (`npm run quality`, 82 files). The
  new coverage is the four shell components, the icon set, the nav-data
  helpers, and the phone-width `inert` gating + axe checks added in this
  task.
- **`npx knip`**: no new findings. The orphan `WorkbenchNav` that
  briefly existed mid-wave is gone with the old shell; the remaining
  knip findings are the pre-existing baseline (unlisted `playwright` /
  `gitleaks` / `osv-scanner` in scripts, and a handful of unused domain
  type exports).
- **`.harness/inventory.json`** gained `claude.yml` — PR #1 merged that
  GitHub workflow without recording it in the inventory, a pre-existing
  100→92 harness regression. It is now recorded and the harness is back
  to 100/100 certified.

## Verification actually run (Wave 1, this session)

- `npm run quality:full` — exit 0. `harness:verify` 100/100 certified;
  typecheck, lint, format:check, architecture-boundary check all clean;
  Vitest 763 tests pass; `cargo fmt --check` clean; `cargo test` 602 lib
  tests plus all integration binaries, 0 failed, unchanged (no Rust was
  touched this wave); `cargo clippy --all-targets -- -D warnings` clean.
- `npm run quality:security` — exit 0. gitleaks no leaks; `cargo deny
check` pre-existing advisory warnings only; OSV-Scanner clean. No new
  dependency.
- `npm run check:dev-preview-isolation` — exit 0.
- `npm run build` — succeeds; numbers above.
- `npm run quality:ui` — **could not run.** The Playwright browser
  binary (`chromium_headless_shell-1237`) is not installed in this
  environment — the pre-existing issue already recorded in
  `docs/VERIFICATION-DEBT.md`. The new shell has jsdom + axe
  (`expectNoAccessibilityViolations`) coverage on all four components,
  added this task, but a native NVDA/Narrator / compiled-binary pass is
  **not** done and is owed.

## Independent review

- **`accessibility-reviewer`** ran and returned full findings — verdict
  **CHANGES-REQUIRED**. Its two Important findings (the off-canvas drawer
  was still keyboard/AT-reachable at phone width when closed; the shell
  tests had no axe assertions) and one Minor (the BottomNav active state
  relied on colour + weight with no shape cue) are **fixed in this
  task**. Retained as debt for the final review / Wave 2:
  - the hamburger target is ~40px against the 44px phone recommendation
    — still ≥24px, so WCAG 2.5.8 AA passes;
  - `.app-sidebar { overflow: hidden }` may clip the 2px focus ring on
    edge items;
  - focus is not returned to the drawer toggle when a destination is
    selected (only on Escape / scrim close);
  - the focus-trap effect has no width guard, so it also runs at desktop
    width where there is no drawer.
- **`teacher-ux-reviewer`** and **`architecture-reviewer`** ran but
  their findings could not be retrieved — the known reviewer-harness
  retrieval failure that `.claude/rules/autonomous-development.md`
  anticipates. Per that rule, a rigorous controller self-review was
  performed and found no blocking issue: the shell components take data
  by props only (no `composition.ts` import — architecture-boundary
  check passes), all SQL stays in Rust (none added), the nav labels use
  plain teacher language, and the density-mode switcher keeps
  Efficient/Comfortable/Guided parity. Independent-review debt for both
  reviewers is **retained**, recorded in `docs/VERIFICATION-DEBT.md`.
- A **final whole-branch code review** is still to run before this
  branch integrates.

## Wave 2 addendum — layout primitives (2026-09-03)

Wave 2 of the same approved design session
(`docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md`, §5.1 /
§5.4 / §5.6 / §7 / §8) adds the four reusable layout primitives the
shell was built to host, and migrates two screens onto them as proof.
Same branch (`claude/ui-redesign-wave-1-shell`). No Rust. **No token was
added or changed this wave** — the primitives size entirely from the
Wave 1 token set (`--color-surface-2`, `--color-border-soft`,
`--color-primary-wash`, `--elevation-1`, `--radius-large`,
`--spacing-unit`, `--font-size-*`, `--control-height`, motion tokens),
so Efficient/Comfortable/Guided keep parity with no per-mode code.

### The four primitives (`src/ui/components/`)

- **`Page`** — `<section aria-label={title}>` wrapping a folded-in
  `PageHeader` (an `<h2>` that takes focus on mount via `tabIndex={-1}` +
  a mount `useEffect`, plus an optional Guided-mode `hint` node the
  screen supplies — `Page` never reads the mode itself) and an optional
  right-aligned `actions` slot. Collapses the per-screen
  `<section aria-label><h2 ref tabIndex>` + focus-effect boilerplate to
  one `<Page title=…>`.
- **`KpiStrip`** + **`Kpi`** — `KpiStrip` is an auto-fit grid
  (`repeat(auto-fit, minmax(180px, 1fr))`, 2-up under 520px). `Kpi` is
  one tile: `label` / `value` (string or number, rendered in a large
  `tabular-nums` figure) / optional `foot` / optional `hint` / optional
  `tone` (`KpiTone` = `neutral | productive | success | warning |
danger`) that only tints a 3px left border — the `label`/`foot` text
  always carries the meaning, tone is never the sole signal.
- **`BentoGrid`** + **`Card`** — `BentoGrid` is a 12-column grid.
  `Card` is a `--color-surface-2` panel (`--color-border-soft` hairline,
  `--elevation-1`, `--radius-large`) with `data-span` (4/6/8/12,
  default 12), an optional `keepHalf` that stays span-6 into the tablet
  range, an optional titled `.card-header` at heading level 2–4
  (default 3) with its own `actions` slot, and a `.card-body`. Spans
  collapse to 12 at ≤1080px unless `keepHalf` is set.
- **`DataTable`** — a table-in-card. It always renders real
  `<table><thead><th scope>` semantics; the phone one-block-per-row
  reflow is **CSS-only**, gated on a `data-reflow` attribute the
  component sets from the `reflowAt={640}` prop, with each `<td>`
  carrying a `data-label` from its column header. Props: `caption`
  (+ `captionVisible`), `columns` (`key` / `header` / optional
  `align: "start" | "end"` / optional `label`), `rows` (`key` /
  `cells` / optional `rowHeader` naming the `<th scope="row">` column),
  `reflowAt`. No sort, no selection this wave. An empty `rows` renders
  an empty `<tbody>` — the caller shows its own `EmptyState`.

### `DataTable` phone reflow is a prop, not a per-screen `@media` block

The decision: the table→block reflow at phone width lives once, as a
`@media (max-width: 640px)` rule keyed off `.data-table[data-reflow]`,
switched on per screen by the `reflowAt` prop — **not** copied into each
screen's stylesheet as a bespoke `@media` block the way
`.score-entry` / `.attendance-roster` / `.section-roster` each carry
today. Migrated screens shed their hand-written reflow block when they
move onto `DataTable`: Today's Classes stopped using
`.attendance-roster` (its `.attendance-roster` reflow rule stays in
`styles.css` only because `AttendanceScreen` still consumes it — the
rule is deleted once its last consumer migrates). The remaining
per-screen reflow blocks are removed the same way, screen by screen.

### The two proof migrations

- **`TodaysClassesScreen` → `Page` + `DataTable`.** The hand-rolled
  `<section>`/`<h2>`/`headingRef`/focus-`useEffect` became
  `<Page title="Today's Classes" hint={…}>`; the
  `<table className="attendance-roster">` became
  `<DataTable reflowAt={640} …>` (Time / Class / Status / Action, Time
  as the row header). `Alert`/`Loading`/`EmptyState`, the `load()`
  logic, the request-identity ref, and `onCheckAttendance` are
  unchanged. All 8 existing screen tests passed **unmodified**.
- **`SectionsScreen` → `Page`.** The wrapper/heading/focus boilerplate
  became `<Page title="Sections" hint={…}>`; the create-section form,
  the sections list, and the enroll panel moved inside verbatim. No
  `DataTable` — the sections list is a labelled list, not a data grid.
  The test file was **unchanged** (region/heading accessible names did
  not move).

### First real consumers still ahead

`KpiStrip`/`Kpi`, `BentoGrid`/`Card` have **no screen consumer in
Wave 2** — they get their first real use in **Wave 3's role-adaptive
Home** (`HomeScreen` → `TeacherHome` / `SchoolHeadHome`). They are
covered this wave by their own unit + axe tests, and `KpiTone` is
exercised by a `KpiStrip` test that iterates every tone value, so
`npx knip` reports no new finding. The remaining ~12 unmigrated screens
re-fit onto these primitives in **Wave 5+** batches, per spec §7 —
same content and flow, only the presentational wrapper changes.

## Wave 3 addendum — role-adaptive Home (2026-09-03)

### 1. `roles` on the authenticated session (a small auth-touching change)

`commands::auth::CurrentSession` gains `pub roles: Vec<String>`, populated
in `to_dto` from a new `repository::role::list_roles(conn, user_id,
school_id)` — a parameterised, `ORDER BY role` read of `user_school_roles`
for the session's **own** user and school. `to_dto` is only ever reached
after a session is validated (`current_session` still returns `Ok(None)`
before it for a missing/expired/revoked session), so the field never
creates a pre-auth information path. The frontend `CurrentSession`
(`src/domain/session.ts`) gains the matching `roles: string[]`.

**`roles` is display-only.** It selects which Home layout renders and
nothing else. Every protected command stays gated server-side by its
`authorize_*` / `Capability` check regardless of what the array says —
`SchoolHeadHome` only issues reads any authenticated school member could
make anyway, and a stricter server gate (e.g. `list_sf1_import_history`'s
`ManageLearners`) simply fails closed to the screen's error state on a
mid-session role change. This is stated in code comments at every
consumer.

### 2. `HomeScreen` — the role-adaptive Home tab

`src/ui/HomeScreen.tsx` renders for the `workspace` tab (label already
"Home" since Wave 1). `roles.includes("school_head")` picks the layout:

- **not a school head** → `TeacherWorkspaceScreen` directly (unchanged —
  this is the teacher's Home for now).
- **school head** → a local, non-persisted view switch
  (`role="group" aria-label="Home view"`, two `aria-pressed` buttons,
  default "School overview") between `SchoolHeadHome` and that same
  `TeacherWorkspaceScreen` (school heads commonly also teach).

### 3. `SchoolHeadHome` — school-wide overview, existing reads only

`src/ui/home/SchoolHeadHome.tsx`, built on the Wave 2 primitives
(`Page` / `KpiStrip` / `BentoGrid` / `Card`): section and learner totals,
the shared school year (or "—"), and the most recent SF1 imports — all
from existing school-scoped reads (`listSections`, `listLearners`,
`listImportHistory`). **No new backend read this wave.** The
attendance-today rollup, "sections without an adviser", and per-teacher
load are **Wave 4** (they need a new capability-gated aggregate read with
its own security review). This is `KpiStrip`/`Card`/`BentoGrid`'s first
real consumer.

### 4. Deliberately deferred

`TeacherWorkspaceScreen` is **not** deleted this wave — the teacher Home
renders it as-is. Its visual redesign onto the primitives, and the file's
removal, is a later slice, kept out of an auth-touching wave to hold the
blast radius small.

### 5. Verification (Wave 3, this session)

`npm run quality:full` exit 0 — `harness:verify` 100/100 certified;
typecheck / lint / format / architecture clean; Vitest **819** / 88
files; `cargo fmt --check` clean; `cargo test` **606 lib** (+4: three
`list_roles` tests + the `to_dto` role assertion; a fourth,
`list_roles_does_not_leak_a_different_users_roles_in_the_same_school`,
added after the security review) + every integration binary, 0 failed;
`cargo clippy --all-targets -- -D warnings` clean. `npm run
quality:security` exit 0 (no dependency). `npm run
check:dev-preview-isolation` exit 0.

### 6. Independent security review — PASS-WITH-MINORS

A `security-reviewer` pass (mandatory for an auth-touching wave, per
`.claude/rules/security-privacy.md`): **no Blocking, no Should-fix.**
Confirmed `list_roles` is parameterised and scoped to the requested
`(user_id, school_id)`; `to_dto` populates `roles` only for the
authenticated session's own identity and adds no pre-auth path; no
`authorize_*` gate, capability, or command behaviour changed; the
frontend `roles` field gates only layout, never a mutation or a
privileged read. The one Minor — the `list_roles` tests lacked a
same-school different-user negative case — was **fixed this wave**
(the leak test above). The Informational note (`list_sf1_import_history`
is `ManageLearners`-gated, stricter than the screen's other reads, and
fails closed) needs no action.

## Wave 4 addendum — School-Head Home enrichment (2026-09-03)

### 1. One new aggregate read — `school_day_totals`

`repository::attendance::school_day_totals(conn, school_id, date)` — a
single `SELECT status, COUNT(*) … WHERE school_id = ?1 AND
attendance_date = ?2 GROUP BY status` over the existing
`idx_attendance_school_date` index. Returns `SchoolDayTotals { present,
absent, tardy }` — **aggregate counts only, zero learner identity**.
(The status domain is `present`/`absent`/`tardy` per migration 2, not the
retired `late`/`excused` pair.) The `school_attendance_day_totals`
command wrapping it is gated on `Capability::ManageLearners`
(registrar / school head — the same gate `list_sf1_import_history` uses)
and derives `school_id` server-side from the session; `date` is the only
client argument, bound as a query parameter. Frontend: a narrow
`SchoolAttendanceRepository` port → `TauriSchoolAttendanceRepository`
adapter → `SchoolAttendanceApplicationService` (ISO-date validation,
repo not called on a bad date) → consumed only by `SchoolHeadHome`.

### 2. Three `SchoolHeadHome` surfaces, one new read + two client-side

- **"Attendance today"** KPI — `present / (present + absent + tardy)` as
  a percentage, with a foot that always states the raw counts (tone is
  `success` ≥ 85 %, `warning` 60–84 %, `danger` < 60 %, `neutral` when
  nothing is recorded — never the only signal).
- **"Sections without an adviser"** card — one
  `sectionAdvisoryService.currentAdviser(section.id, today)` per section
  (existing read), listing the sections that resolved `null`.
- **"Teaching load"** card — `schoolMemberService.listMembers()` filtered
  to the `teacher` role, then `teachingAssignmentService.getLoad(id)` per
  teacher (existing reads). The single highest-minutes teacher gets a
  `⚠ high` **text** marker only when their weekly minutes exceed 1.5× the
  median — a documented display hint to surface an uneven spread, not an
  enforced cap.

All four services load in one composite `Promise.all` under a single
`requestRef` guard and a single `.catch` (no partial render).

### 3. Deliberately still deferred

**Attendance by grade level** needs a temporal join through
`section_memberships` ("the section a learner was in on date D") — its
own slice, not bundled into this simple counts read.

### 4. Verification (Wave 4, this session)

`npm run quality:full` exit 0 — `harness:verify` 100/100 certified;
typecheck / lint / format / architecture clean; Vitest **841** / 90
files; `cargo fmt --check` clean; `cargo test` **611 lib** (+ Task 1's 4
`school_day_totals` unit tests) + every integration binary incl.
`attendance_management` 18 (+3 boundary tests), 0 failed; `cargo clippy
--all-targets -- -D warnings` clean. `npm run quality:security` exit 0
(no dependency). `npm run check:dev-preview-isolation` exit 0.

### 5. Independent security review — PASS

A `security-reviewer` pass (mandatory — this wave adds a
persistence-reading command): **verdict PASS, no blocking, no
should-fix.** Confirmed `school_day_totals` is parameterised and scoped
to `(school_id, date)` (all four unit tests prove both scopings); the
command derives `school_id` server-side and enforces `ManageLearners`
(a boundary test proves a teacher-only session is refused
`AppError::Unauthorized`, and a second school's records are excluded);
the `generate_handler!` edit is purely additive; the client-side
adviser-gap and teaching-load composition calls only reads the caller is
already authorised for (`getLoad` is itself `authorize_view_teacher_load`-
gated); no PII in the response or the new tests.
