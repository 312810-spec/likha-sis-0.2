# Accessibility review — LIKHA redesigned teacher UI (shell + primitives + Home)

**Stand-in for the `accessibility-reviewer` agent** (its findings could not be retrieved — known harness issue).
Read-only source review against WCAG 2.1 AA. No compiled-binary / NVDA / Narrator / Playwright pass was
possible in this environment; items that require one are called out as **retained debt**, not blockers.

Scope reviewed (current `main`):
`src/ui/shell/{AppLayout,Sidebar,TopBar,BottomNav}.tsx`,
`src/ui/components/{Page,KpiStrip,Card,DataTable,icons}.tsx` (`BentoGrid` is exported from `Card.tsx`),
`src/ui/components/workbench-nav-data.ts`,
`src/ui/theme/styles.css`,
`src/ui/HomeScreen.tsx`, `src/ui/home/SchoolHeadHome.tsx`,
`src/test/a11y.ts`, `docs/adr/0064-ui-redesign-shell.md`, `docs/VERIFICATION-DEBT.md`.

---

## VERDICT: PASS-WITH-MINORS

Nothing in source is a hard WCAG-A failure. The redesign is careful: contrast was pre-computed, motion is
centrally guarded, the drawer focus contract is real, and every toggle-state has (almost — see F1) a
non-colour cue. Five source-level minors should be fixed now; five items genuinely cannot be closed without a
real browser + screen-reader pass.

**Findings: 10 total** — 5 fix-now (F1–F5), 5 retained debt (R1–R5). No Critical, no Serious in source.

---

## FIX NOW (source)

### F1 — Home view toggle has no visible pressed state — Moderate — WCAG 1.4.1 / 4.1.2

`src/ui/HomeScreen.tsx:85-100`. The school-head `role="group" aria-label="Home view"` toggle
("School overview" / "My teaching") uses `aria-pressed`, but `.home-view-toggle` has **no CSS rule at all**
(confirmed: `grep` finds it only in `HomeScreen.tsx`) and there is no `[aria-pressed="true"]` treatment.
Every other toggle group in the app pairs `aria-pressed` with a background swap **and** a non-colour `✓`
prefix — `.app-topbar-modes` / `.app-sidebar-modes` (`styles.css:1327-1335,1381-1389`),
`.attendance-roster` (`styles.css:464-474`), `.assessment-item-list` (`styles.css:827-836`).
AT users are fine (state is in the tree); a sighted mouse/keyboard user cannot tell which Home view is
active.
**Fix:** add a `.home-view-toggle` layout rule plus
`.home-view-toggle button[aria-pressed="true"] { background/color/border: primary; font-weight: 700 }`
and `::before { content: "✓ " }`, mirroring `.app-topbar-modes`.

### F2 — No skip-to-content link in the signed-in shell — Moderate — WCAG 2.4.1

`src/ui/shell/AppLayout.tsx`. AT users can bypass the sidebar via the `<nav>`/`<main>` landmarks, but a
sighted keyboard-only user tabs through Home + 4 group toggles + up to ~18 nav items on every screen.
Partly mitigated because `Page` moves focus to its `<h2>` on mount — **but** the teacher Home
(`TeacherWorkspaceScreen`, still not on `Page`, per ADR-0064 accepted backlog) has no mount-focus, so on
that one screen a keyboard user starts at document top with no bypass at all.
**Fix:** add a visually-hidden-until-focus `<a href="#main-content">Skip to content</a>` as the first
focusable node in `AppLayout`, and `id="main-content" tabIndex={-1}` on `<main className="app-canvas">`.
Pre-existing (also absent before this branch), but the persistent sidebar makes it materially worse than
the old flat nav.

### F3 — Drawer focus-return races the destination screen's heading focus — Minor — WCAG 2.4.3

`src/ui/shell/AppLayout.tsx:43-66`. `closeDrawer()` and `navigate()` both only call `setDrawerOpen(false)`,
and the restore `useEffect` (lines 52-58) fires on **any** `true→false` transition. Selecting a destination
from the drawer therefore triggers both the drawer-toggle `.focus()` and the incoming screen's `Page`
mount-`.focus()` in the same commit. Effect ordering (child `Page` before parent `AppLayout`) lands focus
on the hamburger, not the new `<h2>` — contradicting the intended "each screen focuses its own heading"
model noted in the task.
**Fix:** distinguish the close reason (a `returnFocusRef` flag set by `navigate`, or
`closeDrawer(returnFocus)`), and only restore focus to `[data-drawer-toggle]` on Escape / scrim / explicit
close — not on destination select.

### F4 — "Breadcrumb" is not marked up as one — Minor — WCAG 1.3.1

`src/ui/shell/TopBar.tsx:30-33`. `.app-topbar-crumbs` is a bare `<div>` / `<span>` / `<strong>`; ADR-0064
§2 calls it a breadcrumb but it is neither a `nav[aria-label="Breadcrumb"]` nor an ordered list, and the
group segment is not a link. It has no navigational function today, so this is low impact.
**Fix:** either promote it to a real breadcrumb (`<nav aria-label="Breadcrumb"><ol>…`) if up-navigation is
intended, or accept it as a plain context label and stop calling it a breadcrumb in the contract. The
current markup is acceptable as a label.

### F5 — `Card` default heading level — Minor / advisory — WCAG 1.3.1

`src/ui/components/Card.tsx:6,20` default `headingLevel = 3`. Correct on every `Page`-based screen
(h1 brand → h2 `Page` title → h3 `Card`), and `SchoolHeadHome`'s card order is right. No change needed —
recorded so the default is not lowered carelessly and so a future `Card` used above an `<h2>` (e.g. a Card
placed before `Page` renders) is caught in review.

---

## RETAINED DEBT — needs a compiled-binary + NVDA/Narrator pass (not verifiable here)

### R1 — Phone landmark uniqueness rests entirely on `inert` + `aria-hidden` — Serious if it regresses — WCAG 1.3.1 / 4.1.2

`src/ui/shell/AppLayout.tsx:104-125` sets `inert={sidebarInert}` / `inert={mainInert}` (+ matching
`aria-hidden`). Both nav landmarks (`<nav aria-label="Primary">` sidebar, `<nav aria-label="Primary —
quick access">` bottom bar) exist in the DOM at phone width; only the `inert` gating keeps exactly one in
the accessibility tree. **jsdom does not enforce `inert`, so the axe tests in `*.test.tsx` cannot catch a
regression here.** Must be confirmed on the WebView2 build: (a) drawer closed → only the bottom-nav
landmark is reachable; (b) drawer open → only the sidebar landmark is reachable and the bottom nav /
`<main>` are fully non-focusable; (c) the closed off-canvas sidebar is entirely non-focusable. Also verify
React serialises the boolean `inert` prop to a real attribute in the production bundle.

### R2 — `DataTable` phone reflow header association — Moderate — WCAG 1.3.1

`src/ui/theme/styles.css:1678-1715` applies `display:block` to `table/thead/tr/th/td` at ≤640px. The
Wave-6 fix re-applies explicit ARIA roles (`role="table|rowgroup|row|columnheader|rowheader|cell"` in
`DataTable.tsx`), but `display:block` still defeats the native `<th scope="col">`↔`<td>` association
algorithm, and the visible column label then comes only from
`td::before { content: attr(data-label) ": " }` — CSS generated content whose exposure to the a11y tree is
browser-dependent. Confirm with NVDA + WebView2 that each reflowed cell is announced with its column name
and its row header. **Not blocking for the in-scope Home screens** — `SchoolHeadHome` uses
`KpiStrip`/`Card`, not `DataTable` — but it is the core of the primitive's reflow contract and the four
backlog table screens will inherit it.

### R3 — `.app-sidebar { overflow: hidden }` may clip the 2px focus ring — Minor — WCAG 2.4.7

`src/ui/theme/styles.css:1214`. Focus indicator is a 2px outline at 2px offset (4px total bleed). The
scroll child `.app-sidebar-scroll` has 9px padding so the ring _should_ clear, and `.app-sidebar-modes`
has 12px padding — but the first/last items and the `aria-current` left-rule (`::before`, `left: 2px`) sit
close to the padding box. Verify on a real render at all three densities that no ring is clipped. Confirmed
still standing from the Wave-1 retained list; low severity.

### R4 — Heading outline starts at `<h2>` on phone — Minor — WCAG 1.3.1

The only `<h1>` (sidebar brand, `Sidebar.tsx:83`) is inside the `inert`/`aria-hidden` subtree whenever the
drawer is closed, so the visible phone document's outline begins at `Page`'s `<h2>`. With the drawer open,
`<main>` is inert, so the `<h2>` is gone and only the `<h1>` shows — the page never exposes h1+h2 together
on phone. Acceptable to most AT users; confirm it reads sensibly with a screen reader on the device.

### R5 — 320px reflow / 400% zoom / 200% text-spacing not visually verified — Minor — WCAG 1.4.10 / 1.4.12

No browser in this environment. Source review found nothing likely to clip or force horizontal scroll:
buttons use `min-height` not `height`; `.kpi-strip` drops to 2-up ≤520px; `.bento` cards collapse to
span-12 ≤1080px; `DataTable` reflows ≤640px; no fixed-height text containers. Needs a real zoom + reflow +
text-spacing-bookmarklet pass. The pre-existing `.form-row .field` `<select>` intrinsic-width overflow
(documented at `styles.css:1049-1062`) is outside redesign scope and unchanged.

---

## CONFIRMED NOT ISSUES / previously-retained items now resolved

- **Reduced motion — PASS.** Every `transition` and the one `@keyframes app-nav-rule` (active-nav left
  rule) are driven by `--motion-duration-*`, which `@media (prefers-reduced-motion: reduce)` collapses to
  `0.01ms` centrally (`styles.css:102-108`). No unguarded animation anywhere in the redesigned CSS.
- **Keyboard trap / focus-trap width guard — RESOLVED (2.1.2 PASS in source).** The Wave-1 retained item
  "focus-trap effect has no width guard" no longer applies — `AppLayout.tsx:69` guards
  `if (!drawerOpen || !isPhone) return;`, and the `matchMedia('change')` handler force-closes the drawer
  when leaving phone width (`AppLayout.tsx:32-38`). Escape closes; trap wraps both directions; early-returns
  if the drawer has no focusables.
- **Drawer focus-restore-into-inert bug — RESOLVED (Wave 6).** Restore moved to a `true→false`
  `useEffect` that runs after `inert` clears (`AppLayout.tsx:52-58`).
- **`<h1>` in the signed-in app — RESOLVED (Wave 6).** `Sidebar.tsx:83` brand is `<h1 class="app-sidebar-brand">`.
- **Hamburger target size — CONFIRMED ~40×40** (`styles.css:1350-1357`, `width:40px; min-height:40px`).
  ≥24×24 so **WCAG 2.5.8 AA passes**; 2.5.5 AAA does not. Stands as an accepted item.
- **Target size 2.5.8 AA — PASS** for: nav items and group toggles (`min-height: var(--control-height)` →
  34px in Efficient, 40 Comfortable, 48 Guided); bottom-nav buttons (48px tall, ≥64px wide at 320px);
  density buttons (34–48px); hamburger (40px).
- **Contrast of every redesign-added pair — PASS, both themes.** Re-checked ADR-0064's table against the
  hex in `styles.css:20-33` / `122-148`: text/surface-2 15.65:1 L, 12.09:1 D; muted-text/surface-2 5.91 /
  6.48; text/primary-wash 13.92 / 11.99; border/surface-2 3.93 / 3.39 — all ≥4.5:1 text, ≥3:1 non-text.
  `--color-border-soft` is dividers/outlines only (never a sole control cue). KPI tone left-borders and
  `.bars li.warn` border (`--color-productive/success/warning/danger`) are ≥3:1 on `--color-surface-2` in
  both themes **and** decorative — the `label`/`foot`/`⚠ high` text always carries the meaning (1.4.1 PASS).
  Active nav item = `--color-primary` bg + `--color-primary-text` + left rule + weight 700 (1.4.1 PASS).
- **`KpiStrip` meaning not by colour — PASS.** `Kpi` `tone` only tints a 3px left border
  (`styles.css:1572-1583`); "Attendance today" always renders raw present/marked counts in `foot`
  (`SchoolHeadHome.tsx:210-213`), tone `neutral` when nothing is recorded.
- **Density switcher is a labelled group — PASS.** `role="group" aria-label="Teacher interface mode"`
  (`TopBar.tsx:37`, `Sidebar.tsx:134`). Only one copy is in the a11y tree at a time (the other is
  `display:none` per the 860px media query), so no duplicate-group / duplicate-name problem. Same holds for
  the `home-view-toggle` group (single instance, school-head only).
- **Heading order on desktop — PASS.** h1 (brand) → h2 (`Page` title) → h3 (`Card` default).
- **`Page` heading focus-on-mount — PASS** for the 16 `Page` screens and `SchoolHeadHome`
  (`Page.tsx:19-21`). The teacher branch (`TeacherWorkspaceScreen`) has none — a focus-model inconsistency
  already recorded in the ADR-0064 "accepted backlog", not a new finding.
- **Bottom-nav active cue — PASS (1.4.1).** Colour + `font-weight: 700` + `box-shadow: inset 0 2px 0`
  shape cue (`styles.css:1414-1418`).

---

## Can the accessibility review debt for the redesign + UX-02/03/04 be marked CLOSED?

**No — downgrade it, don't close it.**

- The **structural / source-level** accessibility review of the redesigned shell, the five primitives, and
  the role-adaptive Home is now **DONE** (this document). It can be recorded as complete, contingent on
  F1–F5 being addressed (F1 and F2 especially).
- The debt **cannot be fully CLOSED** because the guarantees that matter most here are exactly the ones
  that need a real browser + AT: the phone landmark-uniqueness contract depends on `inert` actually taking
  effect in WebView2 (R1, and jsdom/axe cannot see it), and the `DataTable` reflow header association is
  browser-dependent (R2). A native **NVDA/Narrator + compiled-binary pass** and a **`npm run quality:ui`
  Playwright/axe run** remain owed — both are already tracked in `docs/VERIFICATION-DEBT.md` (Wave 1 UI
  redesign shell entry) and neither could run in this environment.
- **UX-02 / UX-03 / UX-04** were **not** in this review's scope (shell + primitives + `HomeScreen` +
  `SchoolHeadHome` only). `TeacherWorkspaceScreen` (UX-02) is still on the old `PageHeader`, not the
  primitives, and was not audited here. Those items' accessibility debt stays open on their own merits.

**Recommended handoff state:** mark the redesign's _structural_ a11y review CLOSED after F1/F2 land; keep
"native NVDA/Narrator + Playwright axe pass across the redesigned surface" and "UX-02/03/04 a11y review"
as **open** retained debt.
