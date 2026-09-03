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

- `--color-surface-2` — `#ffffff` light / `#222932` dark. The raised
  surface for cards, the sidebar, and the drawer, one step off the page
  ground.
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
