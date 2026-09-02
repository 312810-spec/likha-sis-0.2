# LIKHA-SIS UI Redesign — Wave 1 (Tokens + Shell) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat top-of-page navigation and `AppShell` with a persistent sidebar shell (`AppLayout` + `Sidebar` + `TopBar` + `BottomNav`) that adapts to a drawer + bottom tab bar on small viewports, while every existing screen renders unchanged inside it.

**Architecture:** New `src/ui/shell/` package holds the four shell components. `App.tsx` composes `AppLayout` around the existing screen-routing block instead of `AppShell` + `WorkbenchNav`. Navigation data stays in `src/ui/components/workbench-nav-data.ts`, extended (not replaced) with a pinned Home destination, a five-item bottom-nav list, and two small lookup helpers. Only additive design tokens are introduced, each contrast-verified before it lands. No screen's internal layout, no `*ApplicationService`, and no Rust code is touched.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + React Testing Library + `@testing-library/user-event`, `src/test/a11y.ts` (`expectNoAccessibilityViolations`, an `axe-core` wrapper), CSS custom properties in a single `src/ui/theme/styles.css`.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` (read §5 and §8 before starting; this plan implements Wave 1 only — Waves 2–5 get their own plans at their wave boundaries).

## Global Constraints

- **Palette / typeface / density unchanged.** Do not edit any existing token value in `styles.css`. Only _add_ the five tokens named in Task 1. Public Sans and the `:root[data-teacher-mode="…"]` blocks are untouched.
- **Contrast computed, not eyeballed.** Every new colour token is verified against the actual final hex in both light and dark palettes with the `node` snippet in Task 1, and the computed ratio is written into an inline `/* Verified N:1 */` comment at the rule, exactly as `docs/adr/0031-design-system-and-app-shell.md` requires. WCAG 2.2 AA floors: 4.5:1 for text, 3:1 for non-text/UI boundaries.
- **The real "a control exists here" border stays `--color-border`.** `--color-border-soft` is for hairline dividers and card outlines only and must never be the sole indicator of an interactive boundary. Every `<input>`/`<button>`/`<select>` keeps `--color-border`.
- **No colour-only state.** Active nav destinations carry `aria-current="page"` plus a non-colour cue (a left rule + heavier weight), matching the existing `::before "✓ "` convention in `styles.css`.
- **Security must not rely on UI.** This wave adds no authorization logic; it must not remove or weaken any. `IdleTimeoutWarning` keeps its exact placement (rendered as the first child inside the signed-in area) and props.
- **Touch targets:** ≥ 44px for any interactive target in the phone layout; ≥ 48px for bottom-nav items. No hover-only affordance — hover styling is additive only.
- **`prefers-reduced-motion`:** every transition/animation added this wave must collapse to an instant state change under the existing single `@media (prefers-reduced-motion: reduce)` token-collapse rule, plus a per-cue fallback where the cue is not purely token-driven.
- **Files:** new components are function components receiving data via props; they never import `src/composition.ts`. Keep each shell file single-responsibility. Match existing test idiom (see `src/ui/components/NavItem.test.tsx`, `PageHeader.test.tsx`).
- **Commits:** one per task minimum, conventional-commit style, ending with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Work on the branch `claude/ui-redesign-design-spec` (already checked out) or a fresh branch off it — never on `main`.
- **Verification per task:** `npm run test` for the touched files; the full `npm run quality` at the end of every task; `npm run quality:full` at the wave boundary (Task 11).

---

## File Structure

**Created**

| File                              | Responsibility                                                                                                                                                                                                                                                  |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/components/icons.tsx`     | One inline-SVG icon set for navigation. Each icon is a component returning `<svg aria-hidden="true" focusable="false" …>`. No icon font, no runtime fetch, no dependency.                                                                                       |
| `src/ui/shell/Sidebar.tsx`        | Brand block, pinned Home, the four collapsible nav groups (collapse state persisted to `localStorage`), the active-destination rule, and a phone-only density-mode switcher block. Rendered once by `AppLayout`; CSS switches it between docked and off-canvas. |
| `src/ui/shell/Sidebar.test.tsx`   | Sidebar behaviour tests.                                                                                                                                                                                                                                        |
| `src/ui/shell/TopBar.tsx`         | Hamburger (phone), breadcrumb (group label + screen title), the desktop density-mode switcher, identity line, sign-out.                                                                                                                                         |
| `src/ui/shell/TopBar.test.tsx`    | TopBar behaviour tests.                                                                                                                                                                                                                                         |
| `src/ui/shell/BottomNav.tsx`      | Five fixed destinations for phone widths; the fifth ("More") opens the drawer.                                                                                                                                                                                  |
| `src/ui/shell/BottomNav.test.tsx` | BottomNav behaviour tests.                                                                                                                                                                                                                                      |
| `src/ui/shell/AppLayout.tsx`      | The grid; `<main>` landmark; drawer open/close state; focus move-in / trap / Esc-to-close / focus-return; renders `Sidebar`, `TopBar`, `BottomNav`, scrim.                                                                                                      |
| `src/ui/shell/AppLayout.test.tsx` | AppLayout structure + drawer behaviour tests.                                                                                                                                                                                                                   |

**Modified**

| File                                      | Change                                                                                                                                                                                                                                                                                                                                   |
| ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/theme/styles.css`                 | Add five tokens (light + dark) with verified-contrast comments; add `.app-layout*`, `.app-sidebar*`, `.app-topbar*`, `.app-bottomnav*`, `.app-boot*` rules; add the phone breakpoint for the shell. Remove `.app-shell*`, `.workbench-nav`, `.nav-group*`, `.nav-item*`, `.mode-switcher*` rules once nothing references them (Task 10). |
| `src/ui/components/workbench-nav-data.ts` | Relabel `workspace` → `"Home"`; drop `tab("workspace")` from the "Daily Teaching" group; add `HOME_DESTINATION`, `BOTTOM_NAV`, `normalizeTab()`, `groupLabelForTab()`.                                                                                                                                                                   |
| `src/App.tsx`                             | Replace `<AppShell>` + `<WorkbenchNav>` with `<AppLayout>`; render Login/Setup/Loading outside the shell in an `.app-boot` container that carries the `LIKHA-SIS` brand heading.                                                                                                                                                         |
| `src/App.test.tsx`                        | Update the three assertions that depend on the old shell (nav accessible name, the `"Workspace"` destination label, the `document.title` string).                                                                                                                                                                                        |
| `src/dev-preview/DevPreviewApp.tsx`       | Swap `AppShell` + `WorkbenchNav` for `AppLayout`; keep the synthetic-session banner as the first child.                                                                                                                                                                                                                                  |

**Deleted (Task 10, once unreferenced)**

`src/ui/AppShell.tsx`, `src/ui/AppShell.test.tsx`, `src/ui/components/WorkbenchNav.tsx`, `src/ui/components/WorkbenchNav.test.tsx`, `src/ui/components/NavItem.tsx`, `src/ui/components/NavItem.test.tsx`.

---

## Task 1: Additive design tokens

**Files:**

- Modify: `src/ui/theme/styles.css` (the `:root { … }` block ~lines 13–82 and the `@media (prefers-color-scheme: dark) { :root { … } }` block ~lines 109–130)

**Interfaces:**

- Produces: CSS custom properties `--color-surface-2`, `--color-border-soft`, `--color-primary-wash`, `--elevation-2`, `--sidebar-width` — available to every later task.

- [ ] **Step 1: Compute and record the light-palette contrast ratios**

Run this exact snippet (it is the ADR-0031 method — sRGB relative luminance, WCAG 2.2):

```bash
node -e '
const L=h=>{const c=h.replace("#","").match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const R=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const bg="#fbf8f2", surface2="#ffffff", text="#1b2430", muted="#5c6570", border="#8a7f6e", borderSoft="#e4ddce", primary="#1e3a5f", wash="#eef2f7";
console.log("LIGHT");
console.log("text / surface-2      ", R(text, surface2), "(need >=4.5)");
console.log("muted / surface-2     ", R(muted, surface2), "(need >=4.5)");
console.log("text / primary-wash   ", R(text, wash), "(need >=4.5)");
console.log("border / surface-2    ", R(border, surface2), "(need >=3, real control border)");
console.log("border-soft / bg      ", R(borderSoft, bg), "(hairline only, no min)");
'
```

Expected: `text / surface-2` ≥ 12, `muted / surface-2` ≥ 4.5, `text / primary-wash` ≥ 4.5, `border / surface-2` ≥ 3. If `muted / surface-2` or `text / primary-wash` comes in under 4.5, darken `#5c6570` / lighten `#eef2f7` and re-run before proceeding — do not write a failing pair.

- [ ] **Step 2: Compute and record the dark-palette contrast ratios**

```bash
node -e '
const L=h=>{const c=h.replace("#","").match(/../g).map(x=>parseInt(x,16)/255).map(v=>v<=.03928?v/12.92:((v+.055)/1.055)**2.4);return .2126*c[0]+.7152*c[1]+.0722*c[2]};
const R=(a,b)=>{const x=L(a),y=L(b);return ((Math.max(x,y)+.05)/(Math.min(x,y)+.05)).toFixed(2)};
const bg="#14181d", surface2="#222932", text="#ece9e1", muted="#a6adb6", border="#6f7b87", borderSoft="#333c47", wash="#1e2a38";
console.log("DARK");
console.log("text / surface-2      ", R(text, surface2), "(need >=4.5)");
console.log("muted / surface-2     ", R(muted, surface2), "(need >=4.5)");
console.log("text / primary-wash   ", R(text, wash), "(need >=4.5)");
console.log("border / surface-2    ", R(border, surface2), "(need >=3)");
console.log("border-soft / surface-2", R(borderSoft, surface2), "(hairline only)");
'
```

Expected: `text / surface-2` ≥ 10, `muted / surface-2` ≥ 4.5, `text / primary-wash` ≥ 4.5, `border / surface-2` ≥ 3. Adjust and re-run if any required pair fails.

- [ ] **Step 3: Add the light tokens**

In `src/ui/theme/styles.css`, inside the bare `:root { … }` block, immediately after the `--color-surface: #f3eee3;` line, add:

```css
/* Redesign shell tokens (ADR-0057). Contrast computed, not eyeballed --
     see the ADR for the node snippet and the numbers below. */
--color-surface-2: #ffffff; /* card / raised surface fill */
/* Hairline dividers and card outlines ONLY -- never the sole cue that a
     control exists. Real input/button borders stay --color-border. */
--color-border-soft: #e4ddce;
--color-primary-wash: #eef2f7; /* nav hover/active + table row hover; never carries text meaning */
```

Then, immediately after `--elevation-1: …;`, add:

```css
/* Second elevation level -- drawer / overlay only, never decoration. */
--elevation-2: 0 8px 24px -12px rgba(27, 36, 48, 0.22);
```

Then, immediately after `--content-width-wide: 1080px;`, add:

```css
--sidebar-width: 264px;
```

Add a trailing verified-contrast comment block just before the closing `}` of `:root`:

```css
/* Verified (light): text/surface-2 <paste>:1, muted/surface-2 <paste>:1,
     text/primary-wash <paste>:1, border/surface-2 <paste>:1. */
```

Replace each `<paste>` with the Step 1 number.

- [ ] **Step 4: Add the dark tokens**

Inside `@media (prefers-color-scheme: dark) { :root { … } }`, after `--color-surface: #1c2129;`, add:

```css
--color-surface-2: #222932;
--color-border-soft: #333c47;
--color-primary-wash: #1e2a38;
```

After the dark `--color-focus: …;` line add:

```css
--elevation-2: 0 8px 24px -12px rgba(0, 0, 0, 0.6);
/* Verified (dark): text/surface-2 <paste>:1, muted/surface-2 <paste>:1,
       text/primary-wash <paste>:1, border/surface-2 <paste>:1. */
```

(`--sidebar-width` is layout-only; it is not redefined for dark.)

- [ ] **Step 5: Verify the build still compiles the CSS**

Run: `npm run build`
Expected: succeeds; CSS asset size increases by a small amount (a few hundred bytes) — record the before/after gzip number from the Vite output for the ADR.

- [ ] **Step 6: Commit**

```bash
git add src/ui/theme/styles.css
git commit -m "feat(ui): add contrast-verified shell tokens (surface-2, border-soft, primary-wash, elevation-2, sidebar-width)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: Navigation icon set

**Files:**

- Create: `src/ui/components/icons.tsx`
- Create: `src/ui/components/icons.test.tsx`

**Interfaces:**

- Produces: `export type IconName = "home" | "today" | "check" | "calendar" | "learners" | "sections" | "import" | "clock" | "grid" | "shield" | "menu" | "chevron"`. `export function Icon({ name }: { name: IconName }): JSX.Element` — renders `<svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">` with the path(s) for `name`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Icon, type IconName } from "./icons";

const NAMES: IconName[] = [
  "home",
  "today",
  "check",
  "calendar",
  "learners",
  "sections",
  "import",
  "clock",
  "grid",
  "shield",
  "menu",
  "chevron",
];

describe("Icon", () => {
  it("renders a decorative svg for every name", () => {
    for (const name of NAMES) {
      const { container } = render(<Icon name={name} />);
      const svg = container.querySelector("svg");
      expect(svg, name).not.toBeNull();
      expect(svg).toHaveAttribute("aria-hidden", "true");
      expect(svg).toHaveAttribute("focusable", "false");
    }
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/components/icons.test.tsx`
Expected: FAIL — `./icons` cannot be resolved.

- [ ] **Step 3: Implement `icons.tsx`**

```tsx
import type { JSX } from "react";

export type IconName =
  | "home"
  | "today"
  | "check"
  | "calendar"
  | "learners"
  | "sections"
  | "import"
  | "clock"
  | "grid"
  | "shield"
  | "menu"
  | "chevron";

// Stroke-only 24x24 glyphs, drawn with currentColor so they inherit the
// nav item's text colour (including the active/inverted state). Decorative:
// every nav destination also renders its text label.
const PATHS: Record<IconName, JSX.Element> = {
  home: <path d="M3 11 12 3l9 8M5 10v10h14V10" />,
  today: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3" />
    </>
  ),
  check: <path d="m5 13 4 4L19 7" />,
  calendar: (
    <>
      <rect x="3" y="4" width="18" height="17" rx="2" />
      <path d="M3 9h18M8 3v3M16 3v3M8 14h.01M12 14h.01M16 14h.01" />
    </>
  ),
  learners: (
    <>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20c0-3.9 3.1-7 7-7s7 3.1 7 7" />
    </>
  ),
  sections: (
    <>
      <rect x="3" y="3" width="8" height="8" rx="1.5" />
      <rect x="13" y="3" width="8" height="8" rx="1.5" />
      <rect x="3" y="13" width="8" height="8" rx="1.5" />
      <rect x="13" y="13" width="8" height="8" rx="1.5" />
    </>
  ),
  import: <path d="M12 3v12m0 0 4-4m-4 4-4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 3" />
    </>
  ),
  grid: (
    <>
      <path d="M4 5h16M4 12h16M4 19h16" />
    </>
  ),
  shield: <path d="M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6l-7-3Z" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
  chevron: <path d="m6 9 6 6 6-6" />,
};

export function Icon({ name }: { name: IconName }): JSX.Element {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden="true"
      focusable="false"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/components/icons.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/icons.tsx src/ui/components/icons.test.tsx
git commit -m "feat(ui): inline SVG navigation icon set

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 3: Extend the navigation data model

**Files:**

- Modify: `src/ui/components/workbench-nav-data.ts`
- Modify: `src/ui/components/workbench-nav-data.test.ts` (create if absent — check first with `ls src/ui/components/workbench-nav-data.test.ts`)

**Interfaces:**

- Consumes: existing `SignedInTab`, `TAB_LABELS`, `NAV_GROUPS` from this file.
- Produces:
  - `TAB_LABELS.workspace` value is now `"Home"` (all other entries unchanged).
  - `NAV_GROUPS[0]` ("Daily Teaching") no longer contains the `workspace` entry.
  - `export const HOME_DESTINATION: { id: SignedInTab; label: string }` — `{ id: "workspace", label: "Home" }`.
  - `export const BOTTOM_NAV: readonly { id: SignedInTab; label: string }[]` — exactly `[{id:"workspace",label:"Home"}, {id:"today-classes",label:"Classes"}, {id:"learners",label:"Learners"}, {id:"class-records",label:"Grades"}]` (the "More" control is synthetic, added by `BottomNav.tsx`, not in this array).
  - `export function normalizeTab(tab: SignedInTab): SignedInTab` — maps `"section-roster" | "teaching-assignments" | "section-adviser" | "schedule-meetings"` → `"sections"`; every other value returns itself.
  - `export function groupLabelForTab(tab: SignedInTab): string | null` — returns the `NAV_GROUPS` group label containing `normalizeTab(tab)`, or `null` if none (only `HOME_DESTINATION`'s tab returns `null`).

- [ ] **Step 1: Write the failing test**

Create/replace `src/ui/components/workbench-nav-data.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  BOTTOM_NAV,
  HOME_DESTINATION,
  NAV_GROUPS,
  TAB_LABELS,
  groupLabelForTab,
  normalizeTab,
} from "./workbench-nav-data";

describe("workbench-nav-data", () => {
  it("labels the workspace destination as Home", () => {
    expect(TAB_LABELS.workspace).toBe("Home");
  });

  it("pins Home outside the groups", () => {
    expect(HOME_DESTINATION).toEqual({ id: "workspace", label: "Home" });
    const inAnyGroup = NAV_GROUPS.some((g) => g.tabs.some((t) => t.id === "workspace"));
    expect(inAnyGroup).toBe(false);
  });

  it("keeps every non-Home destination in exactly one group", () => {
    const grouped = NAV_GROUPS.flatMap((g) => g.tabs.map((t) => t.id));
    expect(grouped).toContain("today-classes");
    expect(grouped).toContain("audit-log");
    expect(new Set(grouped).size).toBe(grouped.length);
  });

  it("exposes a five-slot bottom nav (four real + synthetic More)", () => {
    expect(BOTTOM_NAV.map((d) => d.id)).toEqual([
      "workspace",
      "today-classes",
      "learners",
      "class-records",
    ]);
  });

  it("normalizes contextual tabs to their parent list tab", () => {
    expect(normalizeTab("section-roster")).toBe("sections");
    expect(normalizeTab("schedule-meetings")).toBe("sections");
    expect(normalizeTab("attendance")).toBe("attendance");
  });

  it("resolves the group label for a tab, contextual tabs included", () => {
    expect(groupLabelForTab("attendance")).toBe("Daily Teaching");
    expect(groupLabelForTab("section-roster")).toBe("Learner Records");
    expect(groupLabelForTab("workspace")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/components/workbench-nav-data.test.ts`
Expected: FAIL — `HOME_DESTINATION` / `BOTTOM_NAV` / `normalizeTab` / `groupLabelForTab` are not exported; `TAB_LABELS.workspace` is still `"Workspace"`.

- [ ] **Step 3: Apply the data changes**

In `src/ui/components/workbench-nav-data.ts`:

1. Change the `TAB_LABELS` entry `workspace: "Workspace",` to `workspace: "Home",`.
2. In `NAV_GROUPS`, delete the `tab("workspace"),` line from the "Daily Teaching" group's `tabs` array (it is the first entry).
3. Append, after the `NAV_GROUPS` declaration:

```ts
/** The pinned Home destination, rendered above the groups in the sidebar
 * and first in the bottom nav. Wave 1: this is still the existing
 * `workspace` tab (TeacherWorkspaceScreen). Wave 3 repoints it at the new
 * role-adaptive HomeScreen. */
export const HOME_DESTINATION: { id: SignedInTab; label: string } = {
  id: "workspace",
  label: "Home",
};

/** The four real destinations of the phone bottom-tab bar. `BottomNav.tsx`
 * appends a synthetic fifth "More" control that opens the drawer -- it is
 * not a `SignedInTab`, so it is not listed here. */
export const BOTTOM_NAV: readonly { id: SignedInTab; label: string }[] = [
  { id: "workspace", label: "Home" },
  { id: "today-classes", label: "Classes" },
  { id: "learners", label: "Learners" },
  { id: "class-records", label: "Grades" },
];

const CONTEXTUAL_PARENT: Partial<Record<SignedInTab, SignedInTab>> = {
  "section-roster": "sections",
  "teaching-assignments": "sections",
  "section-adviser": "sections",
  "schedule-meetings": "sections",
};

/** Collapses a contextual sub-screen tab to the group destination it was
 * reached from, so the sidebar highlights the right item and the
 * breadcrumb names the right group. Every other tab returns itself. */
export function normalizeTab(tab: SignedInTab): SignedInTab {
  return CONTEXTUAL_PARENT[tab] ?? tab;
}

/** The nav-group label that owns a tab (contextual tabs resolved via
 * `normalizeTab`). `null` for the pinned Home destination, which sits
 * outside every group. */
export function groupLabelForTab(tab: SignedInTab): string | null {
  const id = normalizeTab(tab);
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((t) => t.id === id)) return group.label;
  }
  return null;
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/components/workbench-nav-data.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/components/workbench-nav-data.ts src/ui/components/workbench-nav-data.test.ts
git commit -m "feat(ui): extend nav data with pinned Home, bottom nav, tab helpers

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 4: Sidebar

**Files:**

- Create: `src/ui/shell/Sidebar.tsx`
- Create: `src/ui/shell/Sidebar.test.tsx`
- Modify: `src/ui/theme/styles.css` (append the `.app-sidebar*` rules from Step 5)

**Interfaces:**

- Consumes: `HOME_DESTINATION`, `NAV_GROUPS`, `normalizeTab`, `type SignedInTab` from `../components/workbench-nav-data`; `Icon`, `type IconName` from `../components/icons`; `useTeacherMode` from `../theme/useTeacherMode`; `TEACHER_MODES`, `TEACHER_MODE_LABELS` from `../theme/modes`.
- Produces: `export function Sidebar(props: SidebarProps)` where

  ```ts
  interface SidebarProps {
    activeTab: SignedInTab;
    onNavigate: (tab: SignedInTab) => void;
  }
  ```

  Renders `<nav aria-label="Primary" class="app-sidebar">` containing: a brand block (`<span class="app-sidebar-brand">LIKHA-SIS</span>`), a Home `<button class="app-nav-item">`, four `<section class="app-nav-group">` each with a `<button class="app-nav-group-toggle" aria-expanded={!collapsed}>` header and a list of `<button class="app-nav-item">`, and a phone-only `<div class="app-sidebar-modes">` with the three mode buttons. The active destination's button has `aria-current="page"`. Collapse state persists to `localStorage` key `"likha-sis:nav-collapsed"` (JSON array of collapsed group labels), read through a `try/catch` that defaults to "all expanded".

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import { ModeProvider } from "../theme/ModeContext";

function renderSidebar(activeTab = "attendance" as const, onNavigate = vi.fn()) {
  return render(
    <ModeProvider>
      <Sidebar activeTab={activeTab} onNavigate={onNavigate} />
    </ModeProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("Sidebar", () => {
  it("renders the brand, a pinned Home, and the four groups", () => {
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    for (const g of ["Daily Teaching", "Learner Records", "Grading", "Security"]) {
      expect(screen.getByRole("button", { name: g })).toHaveAttribute("aria-expanded", "true");
    }
  });

  it("marks the active destination with aria-current", () => {
    renderSidebar("attendance");
    expect(screen.getByRole("button", { name: /Attendance/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("normalizes a contextual tab so its parent stays highlighted", () => {
    renderSidebar("section-roster");
    expect(screen.getByRole("button", { name: /Sections/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("calls onNavigate with the tab id when a destination is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSidebar("attendance", onNavigate);
    await user.click(screen.getByRole("button", { name: "Learners" }));
    expect(onNavigate).toHaveBeenCalledWith("learners");
  });

  it("collapses a group, hides its items, and persists the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();
    await user.click(screen.getByRole("button", { name: "Grading" }));
    expect(screen.getByRole("button", { name: "Grading" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "Class Records" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("likha-sis:nav-collapsed")).toContain("Grading");
    unmount();
    renderSidebar();
    expect(screen.getByRole("button", { name: "Grading" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("survives unreadable localStorage by defaulting to all expanded", () => {
    const spy = vi.spyOn(window.localStorage.__proto__, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderSidebar();
    expect(screen.getByRole("button", { name: "Daily Teaching" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    spy.mockRestore();
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/shell/Sidebar.test.tsx`
Expected: FAIL — `./Sidebar` cannot be resolved.

- [ ] **Step 3: Implement `Sidebar.tsx`**

```tsx
import { useEffect, useState } from "react";
import { Icon, type IconName } from "../components/icons";
import {
  HOME_DESTINATION,
  NAV_GROUPS,
  normalizeTab,
  type SignedInTab,
} from "../components/workbench-nav-data";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";

interface SidebarProps {
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
}

const STORAGE_KEY = "likha-sis:nav-collapsed";

const GROUP_ICON: Record<string, IconName> = {
  "Daily Teaching": "today",
  "Learner Records": "learners",
  Grading: "grid",
  Security: "shield",
};

const TAB_ICON: Partial<Record<SignedInTab, IconName>> = {
  "today-classes": "today",
  attendance: "check",
  "subject-attendance": "check",
  "subject-monitor": "clock",
  "adviser-view": "learners",
  "teacher-load": "clock",
  "monthly-summary": "calendar",
  learners: "learners",
  sections: "sections",
  "sf1-import": "import",
  "grading-periods": "clock",
  "class-records": "grid",
  "audit-log": "shield",
};

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        return new Set(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // Unreadable / disabled storage -- default to every group expanded.
  }
  return new Set();
}

export function Sidebar({ activeTab, onNavigate }: SidebarProps) {
  const { mode, setMode } = useTeacherMode();
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const current = normalizeTab(activeTab);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Non-fatal: the collapse state still applies for this session.
    }
  }, [collapsed]);

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  }

  return (
    <nav aria-label="Primary" className="app-sidebar">
      <span className="app-sidebar-brand">LIKHA-SIS</span>

      <div className="app-sidebar-scroll">
        <button
          type="button"
          className="app-nav-item"
          aria-current={current === HOME_DESTINATION.id ? "page" : undefined}
          onClick={() => onNavigate(HOME_DESTINATION.id)}
        >
          <Icon name="home" />
          <span>{HOME_DESTINATION.label}</span>
        </button>

        {NAV_GROUPS.map((group) => {
          const isCollapsed = collapsed.has(group.label);
          return (
            <section className="app-nav-group" key={group.label}>
              <button
                type="button"
                className="app-nav-group-toggle"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.label)}
              >
                <Icon name={GROUP_ICON[group.label] ?? "grid"} />
                <span>{group.label}</span>
                <span className="app-nav-group-chevron" aria-hidden="true">
                  <Icon name="chevron" />
                </span>
              </button>
              {!isCollapsed && (
                <ul className="app-nav-group-items">
                  {group.tabs.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="app-nav-item"
                        aria-current={current === t.id ? "page" : undefined}
                        onClick={() => onNavigate(t.id)}
                      >
                        <Icon name={TAB_ICON[t.id] ?? "grid"} />
                        <span>{t.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="app-sidebar-modes" role="group" aria-label="Teacher interface mode">
        {TEACHER_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {TEACHER_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </nav>
  );
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/shell/Sidebar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the Sidebar CSS**

Append to `src/ui/theme/styles.css`:

```css
/* ============================================================
   Redesign shell -- sidebar (ADR-0057). Replaces .workbench-nav /
   .nav-group / .nav-item, which are removed once nothing references
   them (see the ADR's Wave 1 task list).
   ============================================================ */
.app-sidebar {
  display: flex;
  flex-direction: column;
  width: var(--sidebar-width);
  height: 100vh;
  position: sticky;
  top: 0;
  background: var(--color-surface);
  border-right: 1px solid var(--color-border-soft);
  overflow: hidden;
}

.app-sidebar-brand {
  padding: calc(var(--spacing-unit) * 1.25);
  font-size: var(--font-size-large);
  font-weight: 700;
  color: var(--color-primary);
  border-bottom: 1px solid var(--color-border-soft);
}

.app-sidebar-scroll {
  flex: 1;
  overflow-y: auto;
  padding: calc(var(--spacing-unit) * 0.75);
}

.app-nav-item {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing-unit) * 0.75);
  width: 100%;
  min-height: var(--control-height);
  padding: calc(var(--spacing-unit) * 0.6) calc(var(--spacing-unit) * 0.75);
  border: 0;
  border-radius: var(--radius);
  background: none;
  color: var(--color-text);
  font-weight: 600;
  text-align: left;
  transition: background-color var(--motion-duration-immediate) var(--motion-easing-standard);
}

.app-nav-item:hover {
  background: var(--color-primary-wash);
}

.app-nav-item[aria-current="page"] {
  background: var(--color-primary);
  color: var(--color-primary-text);
  font-weight: 700;
}

/* Non-colour cue for the active destination -- a left rule, matching the
   "ledger continuity" treatment from ADR-0031. Drawn with transform so it
   stays cheap and collapses to instant under prefers-reduced-motion via
   the shared token. */
.app-nav-item {
  position: relative;
}
.app-nav-item[aria-current="page"]::before {
  content: "";
  position: absolute;
  left: 2px;
  top: 8px;
  bottom: 8px;
  width: 3px;
  border-radius: 2px;
  background: var(--color-primary-text);
  transform: scaleY(0);
  transform-origin: center;
  animation: app-nav-rule var(--motion-duration-routine) var(--motion-easing-standard) forwards;
}
@keyframes app-nav-rule {
  to {
    transform: scaleY(1);
  }
}

.app-nav-group {
  margin-top: var(--spacing-unit);
}

.app-nav-group-toggle {
  display: flex;
  align-items: center;
  gap: calc(var(--spacing-unit) * 0.75);
  width: 100%;
  min-height: var(--control-height);
  padding: calc(var(--spacing-unit) * 0.5) calc(var(--spacing-unit) * 0.75);
  border: 0;
  background: none;
  color: var(--color-text-muted);
  font-size: var(--font-size-small);
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

.app-nav-group-chevron {
  margin-left: auto;
  display: inline-flex;
  transition: transform var(--motion-duration-routine) var(--motion-easing-standard);
}
.app-nav-group-toggle[aria-expanded="false"] .app-nav-group-chevron {
  transform: rotate(-90deg);
}

.app-nav-group-items {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.app-sidebar-modes {
  display: none; /* desktop shows the mode switcher in the top bar */
  gap: calc(var(--spacing-unit) * 0.5);
  padding: var(--spacing-unit);
  border-top: 1px solid var(--color-border-soft);
}
.app-sidebar-modes button[aria-pressed="true"] {
  background: var(--color-primary);
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  font-weight: 700;
}
.app-sidebar-modes button[aria-pressed="true"]::before {
  content: "✓ ";
}
```

- [ ] **Step 6: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS (typecheck, lint, format, architecture, tests). If `format:check` fails, run `npm run format` and re-stage.

- [ ] **Step 7: Commit**

```bash
git add src/ui/shell/Sidebar.tsx src/ui/shell/Sidebar.test.tsx src/ui/theme/styles.css
git commit -m "feat(ui): sidebar shell component with collapsible groups

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 5: TopBar

**Files:**

- Create: `src/ui/shell/TopBar.tsx`
- Create: `src/ui/shell/TopBar.test.tsx`
- Modify: `src/ui/theme/styles.css` (append the `.app-topbar*` rules from Step 5)

**Interfaces:**

- Consumes: `type CurrentSession` from `../../domain/session`; `TAB_LABELS`, `groupLabelForTab`, `type SignedInTab` from `../components/workbench-nav-data`; `Icon` from `../components/icons`; `useTeacherMode` from `../theme/useTeacherMode`; `TEACHER_MODES`, `TEACHER_MODE_LABELS` from `../theme/modes`.
- Produces: `export function TopBar(props: TopBarProps)` where

  ```ts
  interface TopBarProps {
    session: CurrentSession;
    activeTab: SignedInTab;
    onLogout: () => void;
    onOpenDrawer: () => void;
  }
  ```

  Renders `<header class="app-topbar">` with: a hamburger `<button class="app-topbar-menu" data-drawer-toggle aria-label="Open navigation">` (CSS-hidden on desktop), a breadcrumb `<div class="app-topbar-crumbs">` showing `groupLabelForTab(activeTab)` (omitted when `null`) then `<strong>{TAB_LABELS[activeTab]}</strong>`, a desktop-only mode switcher `<div class="app-topbar-modes" role="group" aria-label="Teacher interface mode">`, the identity `<span class="app-topbar-identity">{displayName} · {schoolName}</span>`, and a `<button>` "Log out" calling `onLogout`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { ModeProvider } from "../theme/ModeContext";
import type { CurrentSession } from "../../domain/session";

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
};

function renderTopBar(over: Partial<React.ComponentProps<typeof TopBar>> = {}) {
  return render(
    <ModeProvider>
      <TopBar
        session={session}
        activeTab="attendance"
        onLogout={vi.fn()}
        onOpenDrawer={vi.fn()}
        {...over}
      />
    </ModeProvider>,
  );
}

describe("TopBar", () => {
  it("shows the group + screen breadcrumb for the active tab", () => {
    renderTopBar({ activeTab: "attendance" });
    expect(screen.getByText("Daily Teaching")).toBeInTheDocument();
    expect(screen.getByText("Attendance", { selector: "strong" })).toBeInTheDocument();
  });

  it("shows only the screen title for a tab with no group (Home)", () => {
    renderTopBar({ activeTab: "workspace" });
    expect(screen.getByText("Home", { selector: "strong" })).toBeInTheDocument();
  });

  it("renders the identity line", () => {
    renderTopBar();
    expect(screen.getByText("Ana Cruz · Rizal Elementary")).toBeInTheDocument();
  });

  it("calls onLogout from the Log out button", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderTopBar({ onLogout });
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDrawer from the hamburger", async () => {
    const user = userEvent.setup();
    const onOpenDrawer = vi.fn();
    renderTopBar({ onOpenDrawer });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("keeps a working density-mode switcher", async () => {
    const user = userEvent.setup();
    renderTopBar();
    const efficient = screen.getByRole("button", { name: "Efficient" });
    await user.click(efficient);
    expect(efficient).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.teacherMode).toBe("efficient");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/shell/TopBar.test.tsx`
Expected: FAIL — `./TopBar` cannot be resolved.

- [ ] **Step 3: Implement `TopBar.tsx`**

```tsx
import type { CurrentSession } from "../../domain/session";
import { Icon } from "../components/icons";
import { TAB_LABELS, groupLabelForTab, type SignedInTab } from "../components/workbench-nav-data";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";

interface TopBarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onLogout: () => void;
  onOpenDrawer: () => void;
}

export function TopBar({ session, activeTab, onLogout, onOpenDrawer }: TopBarProps) {
  const { mode, setMode } = useTeacherMode();
  const group = groupLabelForTab(activeTab);

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="app-topbar-menu"
        data-drawer-toggle
        aria-label="Open navigation"
        onClick={onOpenDrawer}
      >
        <Icon name="menu" />
      </button>

      <div className="app-topbar-crumbs">
        {group && <span>{group}</span>}
        <strong>{TAB_LABELS[activeTab]}</strong>
      </div>

      <div className="app-topbar-spacer" />

      <div className="app-topbar-modes" role="group" aria-label="Teacher interface mode">
        {TEACHER_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {TEACHER_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <span className="app-topbar-identity">
        {session.displayName} · {session.schoolName}
      </span>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </header>
  );
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/shell/TopBar.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the TopBar CSS**

Append to `src/ui/theme/styles.css`:

```css
/* Redesign shell -- top bar (ADR-0057). */
.app-topbar {
  display: flex;
  align-items: center;
  gap: var(--spacing-unit);
  padding: calc(var(--spacing-unit) * 0.75) calc(var(--spacing-unit) * 1.5);
  border-bottom: 1px solid var(--color-border-soft);
  background: var(--color-bg);
  position: sticky;
  top: 0;
  z-index: 20;
}

.app-topbar-menu {
  display: none; /* shown only at the phone breakpoint */
  align-items: center;
  justify-content: center;
  width: 40px;
  min-height: 40px;
  padding: 0;
}

.app-topbar-crumbs {
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.app-topbar-crumbs span {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}
.app-topbar-crumbs strong {
  font-size: var(--font-size-base);
  font-weight: 700;
}

.app-topbar-spacer {
  flex: 1;
}

.app-topbar-modes {
  display: flex;
  gap: calc(var(--spacing-unit) * 0.5);
}
.app-topbar-modes button[aria-pressed="true"] {
  background: var(--color-primary);
  color: var(--color-primary-text);
  border-color: var(--color-primary);
  font-weight: 700;
}
.app-topbar-modes button[aria-pressed="true"]::before {
  content: "✓ ";
}

.app-topbar-identity {
  color: var(--color-text-muted);
}
```

- [ ] **Step 6: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/shell/TopBar.tsx src/ui/shell/TopBar.test.tsx src/ui/theme/styles.css
git commit -m "feat(ui): top bar with breadcrumb, mode switcher, identity

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 6: BottomNav

**Files:**

- Create: `src/ui/shell/BottomNav.tsx`
- Create: `src/ui/shell/BottomNav.test.tsx`
- Modify: `src/ui/theme/styles.css` (append the `.app-bottomnav*` rules from Step 5)

**Interfaces:**

- Consumes: `BOTTOM_NAV`, `normalizeTab`, `type SignedInTab` from `../components/workbench-nav-data`; `Icon`, `type IconName` from `../components/icons`.
- Produces: `export function BottomNav(props: BottomNavProps)` where

  ```ts
  interface BottomNavProps {
    activeTab: SignedInTab;
    onNavigate: (tab: SignedInTab) => void;
    onOpenMore: () => void;
  }
  ```

  Renders `<nav aria-label="Primary" class="app-bottomnav">` with the four `BOTTOM_NAV` buttons (each `<button>` shows an `Icon` + label, `aria-current="page"` when `normalizeTab(activeTab)` matches its id) plus a fifth `<button>` "More" that calls `onOpenMore`.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";

function renderBottomNav(over: Partial<React.ComponentProps<typeof BottomNav>> = {}) {
  return render(
    <BottomNav activeTab="workspace" onNavigate={vi.fn()} onOpenMore={vi.fn()} {...over} />,
  );
}

describe("BottomNav", () => {
  it("renders four destinations plus More", () => {
    renderBottomNav();
    for (const name of ["Home", "Classes", "Learners", "Grades", "More"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the active destination", () => {
    renderBottomNav({ activeTab: "learners" });
    expect(screen.getByRole("button", { name: "Learners" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("normalizes contextual tabs (section-roster -> nothing in the bar is current)", () => {
    renderBottomNav({ activeTab: "section-roster" });
    // section-roster normalizes to "sections", which is not one of the four
    // bottom-nav ids, so none is current -- and that is fine.
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
  });

  it("calls onNavigate / onOpenMore", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onOpenMore = vi.fn();
    renderBottomNav({ onNavigate, onOpenMore });
    await user.click(screen.getByRole("button", { name: "Classes" }));
    expect(onNavigate).toHaveBeenCalledWith("today-classes");
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenMore).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/shell/BottomNav.test.tsx`
Expected: FAIL — `./BottomNav` cannot be resolved.

- [ ] **Step 3: Implement `BottomNav.tsx`**

```tsx
import { Icon, type IconName } from "../components/icons";
import { BOTTOM_NAV, normalizeTab, type SignedInTab } from "../components/workbench-nav-data";

interface BottomNavProps {
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  onOpenMore: () => void;
}

const ICON: Record<string, IconName> = {
  workspace: "home",
  "today-classes": "today",
  learners: "learners",
  "class-records": "grid",
};

export function BottomNav({ activeTab, onNavigate, onOpenMore }: BottomNavProps) {
  const current = normalizeTab(activeTab);
  return (
    <nav aria-label="Primary" className="app-bottomnav">
      {BOTTOM_NAV.map((d) => (
        <button
          key={d.id}
          type="button"
          aria-current={current === d.id ? "page" : undefined}
          onClick={() => onNavigate(d.id)}
        >
          <Icon name={ICON[d.id] ?? "grid"} />
          <span>{d.label}</span>
        </button>
      ))}
      <button type="button" onClick={onOpenMore}>
        <Icon name="menu" />
        <span>More</span>
      </button>
    </nav>
  );
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/shell/BottomNav.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the BottomNav CSS**

Append to `src/ui/theme/styles.css`:

```css
/* Redesign shell -- phone bottom tab bar (ADR-0057). Hidden until the
   phone breakpoint (see the shell responsive block in Task 7 Step 5). */
.app-bottomnav {
  display: none;
}
.app-bottomnav button {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-height: 48px;
  padding: calc(var(--spacing-unit) * 0.4) 0;
  border: 0;
  background: none;
  font-size: var(--font-size-small);
  font-weight: 600;
  color: var(--color-text-muted);
}
.app-bottomnav button[aria-current="page"] {
  color: var(--color-primary);
}
```

- [ ] **Step 6: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/shell/BottomNav.tsx src/ui/shell/BottomNav.test.tsx src/ui/theme/styles.css
git commit -m "feat(ui): phone bottom navigation bar

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 7: AppLayout

**Files:**

- Create: `src/ui/shell/AppLayout.tsx`
- Create: `src/ui/shell/AppLayout.test.tsx`
- Modify: `src/ui/theme/styles.css` (append the `.app-layout*` rules + the shell responsive block from Step 5)

**Interfaces:**

- Consumes: `Sidebar`, `TopBar`, `BottomNav` from the sibling files; `type CurrentSession` from `../../domain/session`; `type SignedInTab` from `../components/workbench-nav-data`.
- Produces: `export function AppLayout(props: AppLayoutProps)` where

  ```ts
  interface AppLayoutProps {
    session: CurrentSession;
    activeTab: SignedInTab;
    onNavigate: (tab: SignedInTab) => void;
    onLogout: () => void;
    children: React.ReactNode;
  }
  ```

  Renders `<div class="app-layout" data-drawer={"open"|"closed"}>` containing: a `<div class="app-layout-scrim" onClick={close}>`, the single `<Sidebar>` (wrapped in `<div class="app-layout-sidebar">`), a `<div class="app-layout-main">` with `<TopBar>` then `<main class="app-canvas">{children}</main>`, and `<BottomNav>`. Owns `drawerOpen` state (default `false`). Opening the drawer moves focus to the first focusable element inside the sidebar and traps Tab within it; `Escape` closes it; closing returns focus to the element carrying `data-drawer-toggle`. `onNavigate` is wrapped so any navigation also closes the drawer.

- [ ] **Step 1: Write the failing test**

```tsx
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import { ModeProvider } from "../theme/ModeContext";
import type { CurrentSession } from "../../domain/session";

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
};

function renderLayout(over: Partial<React.ComponentProps<typeof AppLayout>> = {}) {
  return render(
    <ModeProvider>
      <AppLayout
        session={session}
        activeTab="attendance"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        {...over}
      >
        <div data-testid="screen">screen content</div>
      </AppLayout>
    </ModeProvider>,
  );
}

describe("AppLayout", () => {
  it("renders one main landmark wrapping the screen content", () => {
    renderLayout();
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("screen")).toBeInTheDocument();
  });

  it("starts with the drawer closed", () => {
    const { container } = renderLayout();
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  it("opens the drawer from the hamburger and closes it on Escape, restoring focus", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(hamburger);
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "open");
    await user.keyboard("{Escape}");
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
    expect(hamburger).toHaveFocus();
  });

  it("closes the drawer when a navigation happens", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderLayout({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(screen.getByRole("button", { name: "Learners" }));
    expect(onNavigate).toHaveBeenCalledWith("learners");
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  it("closes the drawer when the scrim is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(container.querySelector(".app-layout-scrim")!);
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });
});
```

- [ ] **Step 2: Run it — expect failure**

Run: `npm run test -- src/ui/shell/AppLayout.test.tsx`
Expected: FAIL — `./AppLayout` cannot be resolved.

- [ ] **Step 3: Implement `AppLayout.tsx`**

```tsx
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { CurrentSession } from "../../domain/session";
import type { SignedInTab } from "../components/workbench-nav-data";
import { BottomNav } from "./BottomNav";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

interface AppLayoutProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  onLogout: () => void;
  children: ReactNode;
}

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function AppLayout({ session, activeTab, onNavigate, onLogout, children }: AppLayoutProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const sidebarWrapRef = useRef<HTMLDivElement>(null);

  const closeDrawer = useCallback(() => {
    setDrawerOpen(false);
    // Return focus to whatever opened the drawer.
    const toggle = document.querySelector<HTMLElement>("[data-drawer-toggle]");
    toggle?.focus();
  }, []);

  const navigate = useCallback(
    (tab: SignedInTab) => {
      setDrawerOpen(false);
      onNavigate(tab);
    },
    [onNavigate],
  );

  useEffect(() => {
    if (!drawerOpen) return;
    const wrap = sidebarWrapRef.current;
    const first = wrap?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        closeDrawer();
        return;
      }
      if (e.key !== "Tab" || !wrap) return;
      const items = [...wrap.querySelectorAll<HTMLElement>(FOCUSABLE)];
      if (items.length === 0) return;
      const firstEl = items[0];
      const lastEl = items[items.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [drawerOpen, closeDrawer]);

  return (
    <div className="app-layout" data-drawer={drawerOpen ? "open" : "closed"}>
      <div className="app-layout-scrim" onClick={closeDrawer} aria-hidden="true" />
      <div className="app-layout-sidebar" ref={sidebarWrapRef}>
        <Sidebar activeTab={activeTab} onNavigate={navigate} />
      </div>
      <div className="app-layout-main">
        <TopBar
          session={session}
          activeTab={activeTab}
          onLogout={onLogout}
          onOpenDrawer={() => setDrawerOpen(true)}
        />
        <main className="app-canvas">{children}</main>
      </div>
      <BottomNav
        activeTab={activeTab}
        onNavigate={navigate}
        onOpenMore={() => setDrawerOpen(true)}
      />
    </div>
  );
}
```

- [ ] **Step 4: Run it — expect pass**

Run: `npm run test -- src/ui/shell/AppLayout.test.tsx`
Expected: PASS.

- [ ] **Step 5: Add the AppLayout CSS + the shell responsive block**

Append to `src/ui/theme/styles.css`:

```css
/* Redesign shell -- layout grid (ADR-0057). */
.app-layout {
  display: grid;
  grid-template-columns: var(--sidebar-width) 1fr;
  min-height: 100vh;
}

.app-layout-sidebar {
  min-width: 0;
}

.app-layout-main {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.app-canvas {
  flex: 1;
  width: 100%;
  max-width: var(--content-width-wide);
  margin: 0 auto;
  padding: calc(var(--spacing-unit) * 1.5);
}

.app-layout-scrim {
  display: none;
}

/* Pre-auth chrome: Login / First-run setup / the initial status check
   render here, deliberately outside the shell. */
.app-boot {
  max-width: var(--content-width);
  margin: 0 auto;
  padding: calc(var(--spacing-unit) * 2) calc(var(--spacing-unit) * 1.5);
}
.app-boot-brand {
  margin: 0 0 var(--spacing-unit);
  font-size: var(--font-size-large);
  font-weight: 700;
  color: var(--color-primary);
}

/* Phone: sidebar becomes an off-canvas drawer; a bottom tab bar appears;
   the top bar gains a hamburger and drops the mode switcher (it moves
   into the drawer). 860px matches the spec's phone regime. */
@media (max-width: 860px) {
  .app-layout {
    grid-template-columns: 1fr;
  }

  .app-layout-sidebar {
    position: fixed;
    inset: 0 auto 0 0;
    z-index: 60;
    transform: translateX(-100%);
    transition: transform var(--motion-duration-meaningful) var(--motion-easing-standard);
    box-shadow: var(--elevation-2);
  }
  .app-layout[data-drawer="open"] .app-layout-sidebar {
    transform: none;
  }

  .app-layout-scrim {
    display: block;
    position: fixed;
    inset: 0;
    z-index: 50;
    background: rgba(10, 14, 20, 0.4);
    opacity: 0;
    pointer-events: none;
    transition: opacity var(--motion-duration-routine) var(--motion-easing-standard);
  }
  .app-layout[data-drawer="open"] .app-layout-scrim {
    opacity: 1;
    pointer-events: auto;
  }

  .app-topbar-menu {
    display: inline-flex;
  }
  .app-topbar-modes {
    display: none;
  }
  .app-topbar-identity {
    display: none;
  }
  .app-sidebar-modes {
    display: flex;
  }

  .app-bottomnav {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 40;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border-soft);
    padding-bottom: env(safe-area-inset-bottom);
  }

  .app-canvas {
    padding-bottom: calc(var(--spacing-unit) * 6);
  }
}

@media (min-width: 861px) and (max-width: 1080px) {
  :root {
    --sidebar-width: 224px;
  }
}
```

- [ ] **Step 6: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/ui/shell/AppLayout.tsx src/ui/shell/AppLayout.test.tsx src/ui/theme/styles.css
git commit -m "feat(ui): AppLayout shell grid with adaptive drawer + bottom nav

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 8: Wire `App.tsx` onto the new shell

**Files:**

- Modify: `src/App.tsx` (imports ~lines 25 & 47–49; the `return (…)` block lines 165–424)
- Modify: `src/App.test.tsx` (three assertions — see Step 3)

**Interfaces:**

- Consumes: `AppLayout` from `./ui/shell/AppLayout`; existing `SignedInTab`, `TAB_LABELS` from `./ui/components/workbench-nav-data`.
- Produces: no new export. `App` now renders `<AppLayout>` around the signed-in screen block, and renders Loading / `FirstRunSetupScreen` / `LoginScreen` inside a `<div className="app-boot">` with an `<h1 className="app-boot-brand">LIKHA-SIS</h1>`.

- [ ] **Step 1: Replace the imports**

In `src/App.tsx`:

- Delete `import { AppShell } from "./ui/AppShell";` (line 25).
- Delete `import { WorkbenchNav } from "./ui/components/WorkbenchNav";` (line 47).
- Add `import { AppLayout } from "./ui/shell/AppLayout";` in the same import group.
- Keep `import { TAB_LABELS, type SignedInTab } from "./ui/components/workbench-nav-data";` (line 48) unchanged.

- [ ] **Step 2: Replace the `return` block**

Replace the entire `return ( <ModeProvider> … </ModeProvider> );` (lines 165–424) with:

```tsx
const bootBrand = <h1 className="app-boot-brand">LIKHA-SIS</h1>;

return (
  <ModeProvider>
    {checkingStatus ? (
      <div className="app-boot">
        {bootBrand}
        <p role="status">Loading…</p>
      </div>
    ) : needsSetup ? (
      <div className="app-boot">
        {bootBrand}
        <FirstRunSetupScreen setupService={setupService} onSetupComplete={handleSetupComplete} />
      </div>
    ) : session ? (
      <AppLayout
        session={session}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onLogout={handleLogout}
      >
        <IdleTimeoutWarning authService={authService} onExpired={handleSessionExpired} />
        {activeTab === "workspace" ? (
          <TeacherWorkspaceScreen
            displayName={session.displayName}
            attendanceService={attendanceService}
            authService={authService}
            gradingService={gradingService}
            learnerService={learnerService}
            sectionService={sectionService}
            onOpenAttendance={(sectionId) => {
              setAttendanceSectionId(sectionId);
              setActiveTab("attendance");
            }}
            onManageSections={() => setActiveTab("sections")}
            onViewAuditLog={() => setActiveTab("audit-log")}
          />
        ) : activeTab === "learners" ? (
          <LearnerListScreen
            learnerService={learnerService}
            exportService={exportService}
            enrollmentHistoryService={enrollmentHistoryService}
          />
        ) : activeTab === "sections" ? (
          <SectionsScreen
            sectionService={sectionService}
            learnerService={learnerService}
            onOpenRoster={(sectionId) => {
              setRosterSectionId(sectionId);
              setActiveTab("section-roster");
            }}
            onManageAssignments={(sectionId, sectionName) => {
              setTeachingAssignmentsSection({ sectionId, sectionName });
              setActiveTab("teaching-assignments");
            }}
            onManageAdviser={(sectionId, sectionName) => {
              setSectionAdviserSection({ sectionId, sectionName });
              setActiveTab("section-adviser");
            }}
          />
        ) : activeTab === "section-roster" ? (
          rosterSectionId ? (
            <SectionRosterScreen
              sectionService={sectionService}
              formGenerationService={formGenerationService}
              sectionId={rosterSectionId}
              onBack={() => setActiveTab("sections")}
            />
          ) : (
            <SectionsScreen
              sectionService={sectionService}
              learnerService={learnerService}
              onOpenRoster={(sectionId) => {
                setRosterSectionId(sectionId);
                setActiveTab("section-roster");
              }}
              onManageAssignments={(sectionId, sectionName) => {
                setTeachingAssignmentsSection({ sectionId, sectionName });
                setActiveTab("teaching-assignments");
              }}
              onManageAdviser={(sectionId, sectionName) => {
                setSectionAdviserSection({ sectionId, sectionName });
                setActiveTab("section-adviser");
              }}
            />
          )
        ) : activeTab === "teaching-assignments" ? (
          teachingAssignmentsSection ? (
            <TeachingAssignmentsScreen
              teachingAssignmentService={teachingAssignmentService}
              subjectService={subjectService}
              schoolMemberService={schoolMemberService}
              sectionId={teachingAssignmentsSection.sectionId}
              sectionName={teachingAssignmentsSection.sectionName}
              onBack={() => setActiveTab("sections")}
              onManageSchedule={(teachingAssignmentId, subjectName) => {
                setScheduleMeetingsAssignment({ teachingAssignmentId, subjectName });
                setActiveTab("schedule-meetings");
              }}
            />
          ) : (
            <SectionsScreen
              sectionService={sectionService}
              learnerService={learnerService}
              onOpenRoster={(sectionId) => {
                setRosterSectionId(sectionId);
                setActiveTab("section-roster");
              }}
              onManageAssignments={(sectionId, sectionName) => {
                setTeachingAssignmentsSection({ sectionId, sectionName });
                setActiveTab("teaching-assignments");
              }}
              onManageAdviser={(sectionId, sectionName) => {
                setSectionAdviserSection({ sectionId, sectionName });
                setActiveTab("section-adviser");
              }}
            />
          )
        ) : activeTab === "section-adviser" ? (
          sectionAdviserSection ? (
            <SectionAdviserScreen
              sectionAdvisoryService={sectionAdvisoryService}
              schoolMemberService={schoolMemberService}
              sectionId={sectionAdviserSection.sectionId}
              sectionName={sectionAdviserSection.sectionName}
              onBack={() => setActiveTab("sections")}
            />
          ) : (
            <SectionsScreen
              sectionService={sectionService}
              learnerService={learnerService}
              onOpenRoster={(sectionId) => {
                setRosterSectionId(sectionId);
                setActiveTab("section-roster");
              }}
              onManageAssignments={(sectionId, sectionName) => {
                setTeachingAssignmentsSection({ sectionId, sectionName });
                setActiveTab("teaching-assignments");
              }}
              onManageAdviser={(sectionId, sectionName) => {
                setSectionAdviserSection({ sectionId, sectionName });
                setActiveTab("section-adviser");
              }}
            />
          )
        ) : activeTab === "schedule-meetings" ? (
          scheduleMeetingsAssignment && teachingAssignmentsSection ? (
            <ScheduleMeetingsScreen
              teachingAssignmentService={teachingAssignmentService}
              teachingAssignmentId={scheduleMeetingsAssignment.teachingAssignmentId}
              subjectName={scheduleMeetingsAssignment.subjectName}
              sectionName={teachingAssignmentsSection.sectionName}
              onBack={() => setActiveTab("teaching-assignments")}
            />
          ) : (
            <SectionsScreen
              sectionService={sectionService}
              learnerService={learnerService}
              onOpenRoster={(sectionId) => {
                setRosterSectionId(sectionId);
                setActiveTab("section-roster");
              }}
              onManageAssignments={(sectionId, sectionName) => {
                setTeachingAssignmentsSection({ sectionId, sectionName });
                setActiveTab("teaching-assignments");
              }}
              onManageAdviser={(sectionId, sectionName) => {
                setSectionAdviserSection({ sectionId, sectionName });
                setActiveTab("section-adviser");
              }}
            />
          )
        ) : activeTab === "sf1-import" ? (
          <Sf1ImportScreen sf1ImportService={sf1ImportService} sectionService={sectionService} />
        ) : activeTab === "attendance" ? (
          <AttendanceScreen
            attendanceService={attendanceService}
            sectionService={sectionService}
            initialSectionId={attendanceSectionId ?? undefined}
            onViewMonthlySummary={(sectionId, year, month) => {
              setMonthlySummaryContext({ sectionId, year, month });
              setActiveTab("monthly-summary");
            }}
          />
        ) : activeTab === "today-classes" ? (
          <TodaysClassesScreen
            subjectAttendanceService={subjectAttendanceService}
            teacherUserId={session.userId}
            onCheckAttendance={(teachingAssignmentId) => {
              setSubjectAttendanceAssignmentId(teachingAssignmentId);
              setActiveTab("subject-attendance");
            }}
          />
        ) : activeTab === "subject-attendance" ? (
          <SubjectAttendanceScreen
            subjectAttendanceService={subjectAttendanceService}
            teacherUserId={session.userId}
            initialAssignmentId={subjectAttendanceAssignmentId ?? undefined}
          />
        ) : activeTab === "subject-monitor" ? (
          <SubjectMonitorScreen
            subjectAttendanceService={subjectAttendanceService}
            teacherUserId={session.userId}
          />
        ) : activeTab === "adviser-view" ? (
          <AdviserViewScreen subjectAttendanceService={subjectAttendanceService} />
        ) : activeTab === "teacher-load" ? (
          <TeacherLoadScreen
            teachingAssignmentService={teachingAssignmentService}
            subjectAttendanceService={subjectAttendanceService}
            schoolMemberService={schoolMemberService}
            teacherUserId={session.userId}
          />
        ) : activeTab === "monthly-summary" ? (
          <MonthlySummaryScreen
            attendanceService={attendanceService}
            sectionService={sectionService}
            exportService={exportService}
            schoolName={session.schoolName}
            initialSectionId={monthlySummaryContext?.sectionId}
            initialYearMonth={
              monthlySummaryContext
                ? { year: monthlySummaryContext.year, month: monthlySummaryContext.month }
                : undefined
            }
          />
        ) : activeTab === "grading-periods" ? (
          <GradingPeriodsScreen gradingService={gradingService} />
        ) : activeTab === "class-records" ? (
          <ClassRecordsScreen
            classRecordService={classRecordService}
            sectionService={sectionService}
            subjectService={subjectService}
            gradingService={gradingService}
            assessmentService={assessmentService}
            learnerScoreService={learnerScoreService}
            exportService={exportService}
          />
        ) : activeTab === "audit-log" ? (
          <AuditLogScreen authService={authService} />
        ) : null}
      </AppLayout>
    ) : (
      <div className="app-boot">
        {bootBrand}
        <LoginScreen
          authService={authService}
          schoolService={schoolService}
          onLoggedIn={handleLoggedIn}
          notice={sessionExpiredNotice}
        />
      </div>
    )}
  </ModeProvider>
);
```

Note: the `activeTab === "section-roster" ? "sections" : activeTab` normalization that `WorkbenchNav` used is now done inside `Sidebar`/`TopBar` via `normalizeTab`, so `App.tsx` passes `activeTab` straight through.

- [ ] **Step 3: Update the three `App.test.tsx` assertions**

1. In `"shows the sign-in screen when setup is already done and there is no current session"`: the brand heading now lives in the `.app-boot` wrapper, so the assertion still holds — **leave it unchanged** (`expect(screen.getByRole("heading", { name: "LIKHA-SIS" })).toBeInTheDocument();`). Confirm it passes; if the accessible name resolves with surrounding whitespace, change to `{ name: /LIKHA-SIS/ }`.

2. In `"groups the navigation into named workbench clusters, preserving every destination"`: replace

   ```tsx
   const nav = screen.getByRole("navigation", { name: "Teacher workbench" });
   ```

   with

   ```tsx
   const nav = screen.getByRole("navigation", { name: "Primary" });
   ```

   and in the destinations array replace `"Workspace"` with `"Home"`. Groups are now `role="button"` toggles _and_ their items collapse; add nothing else — the four `screen.getByRole("group", { name })` lines are removed (groups are no longer `role="group"`; they are `<section>` with a labelled toggle button). Replace that loop with:

   ```tsx
   for (const groupName of ["Daily Teaching", "Learner Records", "Grading", "Security"]) {
     expect(screen.getByRole("button", { name: groupName })).toHaveAttribute(
       "aria-expanded",
       "true",
     );
   }
   ```

3. In `"sets the browser tab title to the active destination"`: replace
   ```tsx
   await waitFor(() => expect(document.title).toBe("Workspace · LIKHA-SIS"));
   ```
   with
   ```tsx
   await waitFor(() => expect(document.title).toBe("Home · LIKHA-SIS"));
   ```
   (the `"Learners · LIKHA-SIS"` assertion after the click is unchanged.)

- [ ] **Step 4: Run the App tests**

Run: `npm run test -- src/App.test.tsx`
Expected: PASS (all 8). If `"shows the workspace overview by default"` fails on `findByRole("region", { name: "Workspace" })`, that is `TeacherWorkspaceScreen`'s own region name — unchanged this wave — so investigate a real regression, do not weaken the assertion.

- [ ] **Step 5: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/App.tsx src/App.test.tsx
git commit -m "feat(ui): mount the app on the new AppLayout shell

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 9: Update the dev-preview fixture

**Files:**

- Modify: `src/dev-preview/DevPreviewApp.tsx` (imports lines 15 & 24; the `return` block lines 100–192)

**Interfaces:**

- Consumes: `AppLayout` from `../ui/shell/AppLayout`.
- Produces: no export change. `DevPreviewApp` renders `<AppLayout>` instead of `<AppShell>` + `<WorkbenchNav>`, keeping the synthetic-data banner as the first child of the layout's content.

- [ ] **Step 1: Swap the imports**

- Delete `import { AppShell } from "../ui/AppShell";` (line 15).
- Delete `import { WorkbenchNav } from "../ui/components/WorkbenchNav";` (line 24).
- Add `import { AppLayout } from "../ui/shell/AppLayout";`.

- [ ] **Step 2: Replace the layout wrapper**

Replace:

```tsx
    <ModeProvider>
      <AppShell session={FIXTURE_SESSION} onLogout={() => {}}>
        <div className="alert alert-info" role="status">
          …
        </div>
        <WorkbenchNav activeTab={activeTab} onTabChange={setActiveTab} />
        {activeTab === "workspace" ? (
```

with:

```tsx
    <ModeProvider>
      <AppLayout
        session={FIXTURE_SESSION}
        activeTab={activeTab}
        onNavigate={setActiveTab}
        onLogout={() => {}}
      >
        <div className="alert alert-info" role="status">
          <p>
            <strong>Development preview — synthetic data, not the production app.</strong> No real
            session, no Tauri, no SQLite. See <code>docs/adr/0032-teacher-workspace-polish.md</code>.
          </p>
        </div>
        {activeTab === "workspace" ? (
```

and change the two closing lines `      </AppShell>\n    </ModeProvider>` to `      </AppLayout>\n    </ModeProvider>`.

- [ ] **Step 3: Run the isolation + dev-preview checks**

Run: `npm run test -- src/dev-preview/isolation.test.ts`
Expected: PASS.
Run: `npm run check:dev-preview-isolation`
Expected: exit 0.

- [ ] **Step 4: Run the full frontend gate**

Run: `npm run quality`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/dev-preview/DevPreviewApp.tsx
git commit -m "chore(dev-preview): render the fixture on AppLayout

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 10: Remove the superseded shell files

**Files:**

- Delete: `src/ui/AppShell.tsx`, `src/ui/AppShell.test.tsx`
- Delete: `src/ui/components/WorkbenchNav.tsx`, `src/ui/components/WorkbenchNav.test.tsx`
- Delete: `src/ui/components/NavItem.tsx`, `src/ui/components/NavItem.test.tsx`
- Modify: `src/ui/theme/styles.css` (remove the now-dead `.app-shell*`, `.workbench-nav`, `.nav-group*`, `.nav-item*`, `.mode-switcher*` rules)

**Interfaces:**

- Consumes: nothing.
- Produces: nothing. Pure removal — every consumer was repointed in Tasks 8–9.

- [ ] **Step 1: Confirm nothing imports them**

Run:

```bash
grep -rn "AppShell\|WorkbenchNav\|NavItem" src --include=*.tsx --include=*.ts | grep -v "src/ui/AppShell" | grep -v "src/ui/components/WorkbenchNav" | grep -v "src/ui/components/NavItem"
```

Expected: no output. If anything prints, fix that consumer first.

- [ ] **Step 2: Delete the files**

```bash
git rm src/ui/AppShell.tsx src/ui/AppShell.test.tsx \
  src/ui/components/WorkbenchNav.tsx src/ui/components/WorkbenchNav.test.tsx \
  src/ui/components/NavItem.tsx src/ui/components/NavItem.test.tsx
```

- [ ] **Step 3: Remove the dead CSS**

In `src/ui/theme/styles.css` delete these rule blocks (they are contiguous groups; search for each selector): `.app-shell`, `.app-shell-header`, `.app-shell-title`, `.app-shell-session`, `.app-shell-session-identity`, `.app-shell-main`, `.mode-switcher`, `.mode-switcher button[aria-pressed="true"]`, `.mode-switcher button[aria-pressed="true"]::before`, `.workbench-nav`, `.nav-group`, `.nav-group:last-child`, `.nav-group-label`, `.nav-item`, `.nav-item[aria-pressed="true"]`, `.nav-item[aria-pressed="true"]::before`, `.nav-item::after`, `.nav-item[aria-pressed="true"]::after`, and the `@media (max-width: 640px)` block that targets `.workbench-nav` / `.nav-group` / `.nav-item`. Do **not** touch the `.mode-switcher`-unrelated `@media (max-width: 640px)` blocks for tables.

- [ ] **Step 4: Verify no dangling references**

Run: `npm run quality`
Expected: PASS. Then run `npx knip` and confirm no **new** findings versus the pre-existing baseline recorded in the latest wave's notes in `docs/CURRENT-HANDOFF.md` (the redesign should _reduce_ dead exports, not add them).

- [ ] **Step 5: Build + dev-preview isolation**

Run: `npm run build`
Expected: succeeds. Record the final CSS gzip size for the ADR.
Run: `npm run check:dev-preview-isolation`
Expected: exit 0.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(ui): remove AppShell, WorkbenchNav, NavItem and their dead CSS

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 11: ADR + project-state docs + wave verification

**Files:**

- Create: `docs/adr/0057-ui-redesign-shell.md`
- Modify: `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`
- Modify: `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` (tick §10's "ADR to write (Wave 1)" item)

**Interfaces:**

- Consumes: the contrast numbers from Task 1, the CSS size deltas from Tasks 1 & 10, the test counts from the final `npm run quality`.
- Produces: durable record; no code.

- [ ] **Step 1: Write ADR-0057**

Create `docs/adr/0057-ui-redesign-shell.md` following the house ADR shape (see `0056-section-advisory-foundation.md` for structure). It must record, concretely:

- Context: implements Wave 1 of `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md`; supersedes the app-shell/navigation parts of ADR-0031 §4 and the flat-nav parts of ADR-0030's programme (those ADRs stay Accepted for their token/design-system decisions).
- Decision 1 — the five additive tokens, with the **actual computed contrast ratios** for light and dark (paste the Task 1 output), and the rule that `--color-border-soft` is decorative-only.
- Decision 2 — the shell component split (`AppLayout` / `Sidebar` / `TopBar` / `BottomNav`), one-`Sidebar`-instance, drawer focus-trap + Esc + focus-return, `aria-current="page"` + left-rule as the non-colour active cue.
- Decision 3 — nav data: pinned Home (still `workspace` in Wave 1, repointed in Wave 3), `BOTTOM_NAV`, `normalizeTab`/`groupLabelForTab`; `TAB_LABELS.workspace` relabelled "Home".
- Decision 4 — pre-auth screens render outside the shell in `.app-boot`.
- Decision 5 — the `aria-label="Primary"` resolution: on phone the docked sidebar and the bottom bar can both be in the tree; **record the chosen mechanism actually implemented** (e.g. both are `<nav aria-label="Primary">` and that duplication is accepted because only one is visible/interactive at a time — or, if implemented differently, whatever was done). This closes spec §10's open question.
- Consequences: files added/removed, the CSS gzip before/after, the test count before/after, `knip` delta.
- Verification actually run (fill from Steps 3–4 below — never assert a check that did not run).
- Independent review: dispatch `accessibility-reviewer`, `teacher-ux-reviewer`, and `architecture-reviewer` against the wave's final commit; if a reviewer harness fails after the permitted one retry, record the failed attempt, do a rigorous self-review, and retain the debt in `VERIFICATION-DEBT.md` (per `.claude/rules/autonomous-development.md`).

- [ ] **Step 2: Update the state docs**

- `docs/PROJECT-MEMORY.md`: one durable-fact entry — "UI shell redesigned (ADR-0057): persistent sidebar + adaptive drawer/bottom-nav replace the flat workbench nav; Calm Civic Classroom palette unchanged, five additive contrast-verified tokens; role-adaptive Home is Wave 3, not yet built."
- `docs/CURRENT-HANDOFF.md`: new top entry — Wave 1 complete, the exact commits, the CI run ids once green, and the **exact next slice = Wave 2 (layout primitives: `Page`, `KpiStrip`/`Kpi`, `BentoGrid`/`Card`, `DataTable` + migrate `SectionsScreen` and `TodaysClassesScreen` as proof)**.
- `docs/ACTIVE-PLAN.md`: add a "Wave 1 — UI redesign shell — complete" section with the verification record.
- `docs/VERIFICATION-DEBT.md`: extend the existing native-NVDA/Narrator entry to explicitly include the new shell (sidebar, drawer focus-trap, bottom nav) as owed on a real screen reader; add any reviewer-harness debt from Step 1.

- [ ] **Step 3: Run the milestone gate**

Run: `npm run quality:full`
Expected: exit 0 — `harness:verify` still exactly 100/100 (unchanged; no harness file touched), then typecheck / lint / format / architecture / the full vitest suite, then `cargo fmt --check` / `cargo test` / `cargo clippy` (all unchanged — no Rust touched this wave). Record the vitest count.

- [ ] **Step 4: Run the security + UI gates**

Run: `npm run quality:security`
Expected: clean — no dependency added this wave (the icon set is hand-written; confirm `package.json` is untouched).
Run: `npm run quality:ui`
Expected: run it; if the pre-existing Playwright browser-version mismatch documented in `docs/VERIFICATION-DEBT.md` blocks it, apply the documented workaround and record the outcome honestly. This wave's new shell is reachable in the dev preview, so the axe pass should cover `AppLayout` + `Sidebar` + `TopBar`.

- [ ] **Step 5: Commit the docs**

```bash
git add docs/adr/0057-ui-redesign-shell.md docs/PROJECT-MEMORY.md docs/CURRENT-HANDOFF.md docs/ACTIVE-PLAN.md docs/VERIFICATION-DEBT.md docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md
git commit -m "docs: record Wave 1 (UI redesign shell) — ADR-0057 + state docs

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

- [ ] **Step 6: Dispatch the independent reviews**

Dispatch, each against the wave's final commit, read-only:

- `accessibility-reviewer` — sidebar/drawer keyboard model, `aria-current`, focus-trap, target sizes, the new tokens' contrast in both themes.
- `teacher-ux-reviewer` — does the sidebar + breadcrumb read clearly to a non-technical teacher; mode parity intact across Efficient/Comfortable/Guided.
- `architecture-reviewer` — no `src/ui/**` import of `infrastructure/**` or `@tauri-apps/*`; `src/ui/shell/**` depends only on `components/**`, `theme/**`, `domain/**`.

Fold any non-blocking findings + fixes into a follow-up commit on the same branch; record blocking findings and stop if any is found (per the autonomous-development rules).

---

## Self-Review

**1. Spec coverage (§ by §):**

- §5.1 shell package → Tasks 4–7; `Page`/primitives are explicitly Wave 2, not here. ✔
- §5.1 Home / `HomeScreen` → Wave 3, out of scope; noted in Task 3 & Task 11. ✔
- §5.2 token additions + contrast rule → Task 1 (+ ADR record in Task 11). ✔
- §5.3 nav data model → Task 3. The spec sketched `NavDestination`/`items`; this plan keeps the **existing** `NavGroup.tabs` shape to minimise churn (spec §5.3 said "extended, not replaced") and adds `HOME_DESTINATION`/`BOTTOM_NAV`/helpers. ✔ (documented deviation)
- §5.3 icons `src/ui/components/icons.tsx`, no dependency → Task 2. ✔
- §5.4 three responsive regimes, drawer, bottom nav, safe-area, 44/48px → Task 6 & Task 7 Step 5. ✔
- §5.5 motion inventory: the ledger-rule active-nav mark is here (Task 4 CSS); stagger/count-up/bar-draw belong to primitives/Home → Wave 2/3. ✔ (partial by design)
- §5.6 accessibility: landmarks, `aria-current`, drawer focus mgmt, collapsible `aria-expanded`, axe per component → Tasks 4–7 tests + Task 11 Step 4/6. The `aria-label="Primary"` duplication question is explicitly resolved-and-recorded in Task 11 Step 1 Decision 5. ✔
- §6 Home data → Wave 3/4, out of scope. ✔
- §7 screen migration inventory → Wave 2+ ("every existing screen renders unchanged inside the new shell" is this wave's bar, met by Task 8 keeping every branch). ✔
- §8 Wave 1 row (tokens + shell, no screen redesign, ADR, three reviews) → this whole plan. ✔
- §9 testing strategy: TDD for drawer/focus/collapse/persistence → Tasks 4 & 7 write the failing test first; existing focus-on-mount tests untouched (no screen changed). ✔
- §10 follow-ups: ADR written (Task 11); spec-location note left as-is; `localStorage` try/catch (Task 4 Step 3 + its test). ✔

**2. Placeholder scan:** No "TBD"/"handle edge cases"/"similar to Task N". Every code step has real code. Task 11 Step 1 deliberately says "record the mechanism actually implemented" for Decision 5 — that is a record-what-you-did instruction, not an unresolved design placeholder (the implementation choice is forced by Task 4/6 both using `aria-label="Primary"`).

**3. Type consistency:** `SignedInTab` used unchanged everywhere. `SidebarProps`/`TopBarProps`/`BottomNavProps`/`AppLayoutProps` each defined once and consumed with the same field names (`activeTab`, `onNavigate`, `onLogout`, `onOpenDrawer`, `onOpenMore`, `session`). `HOME_DESTINATION` / `BOTTOM_NAV` / `normalizeTab` / `groupLabelForTab` defined in Task 3, consumed in Tasks 4–6 with matching signatures. `Icon` / `IconName` defined in Task 2, consumed in Tasks 4–6. `data-drawer-toggle` attribute set in Task 5 (`TopBar`) and queried in Task 7 (`AppLayout`) — matches. `data-drawer` values `"open"`/`"closed"` set in Task 7 and asserted in its tests — matches.
