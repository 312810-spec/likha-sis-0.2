# LIKHA-SIS UI Redesign — Wave 2 (Layout Primitives) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Add four reusable layout primitives — `Page`, `KpiStrip`/`Kpi`, `BentoGrid`/`Card`, `DataTable` — and migrate `TodaysClassesScreen` and `SectionsScreen` onto them as proof, with no change to either screen's data flow or behaviour.

**Architecture:** New components in `src/ui/components/`. Each is presentational, receives data via props, imports only `theme/*` and sibling components. CSS appended to the single `src/ui/theme/styles.css`. `Page` folds in the existing `PageHeader` (heading + mount-focus + optional Guided hint) so screens stop repeating that boilerplate. `DataTable` absorbs the per-screen phone table→block reflow as a `reflowAt` prop, replacing hand-written `@media (max-width: 640px)` blocks for migrated screens.

**Tech Stack:** React 18 + TypeScript, Vite, Vitest + React Testing Library + `@testing-library/user-event`, `src/test/a11y.ts` (`expectNoAccessibilityViolations`), CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` — §5.1 (primitives), §5.4 (responsive), §5.6 (a11y), §7 (migration inventory), §8 (Wave 2 row). Wave 1 (the shell + tokens) is already merged into this branch.

## Global Constraints

- **No new dependency.** No Rust. No change to any `*ApplicationService`, domain type, or command.
- **Migrated screens: same data flow, same behaviour, same accessible structure.** Only the presentational wrapper markup changes. Every existing test for a migrated screen must still pass, adjusted **only** where the DOM structure genuinely moved (a wrapper class, a table→`DataTable` role change). Never weaken an assertion to make it pass.
- **Tokens are fixed.** Use the Wave 1 token set (`--color-surface-2`, `--color-border-soft`, `--color-primary-wash`, `--elevation-1`, `--radius`, `--radius-large`, `--spacing-unit`, `--font-size-*`, `--control-height`, motion tokens). Do not add or change a token this wave.
- **Density parity.** Primitives size from the existing `--spacing-unit` / `--font-size-base` / `--control-height` custom properties so Efficient/Comfortable/Guided all work with no per-mode code.
- **`prefers-reduced-motion`.** Any transition uses a `--motion-duration-*` token so the existing single collapse rule covers it. No new keyframe animation this wave unless a task says so.
- **A11y.** Every new primitive test file includes at least one `await expectNoAccessibilityViolations(container)`. `Page` preserves the exact focus-to-heading-on-mount behaviour (guard with the existing screen focus tests). `DataTable` keeps real `<table><thead><th scope>` semantics; the reflow is CSS-only (`display:block` at the breakpoint), never a role change.
- **Test-file imports:** `import type { ComponentProps, ReactNode } from "react"` (named, type-only — no `React.` namespace).
- **Commits:** one per task minimum, conventional-commit, ending `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch: `claude/ui-redesign-wave-1-shell` (the redesign accumulates on one branch through all waves).
- **Per task:** `npm run quality` green; wave boundary (Task 7): `npm run quality:full` exit 0.

---

## File Structure

**Created**

| File                                   | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/components/Page.tsx`           | `<section aria-label={title}>` wrapping a heading block (folds in `PageHeader`: `<h2>` with mount-focus + `tabIndex={-1}`, optional Guided `hint`), an optional right-aligned `actions` slot, and `{children}`. The per-screen `<section aria-label><h2 ref tabIndex>` boilerplate collapses to `<Page title=…>`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `src/ui/components/Page.test.tsx`      | heading renders, focus-on-mount, hint shows only when given, actions slot, `section` has the accessible name, axe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `src/ui/components/KpiStrip.tsx`       | `KpiStrip` = `<div class="kpi-strip">` auto-fit grid (`repeat(auto-fit, minmax(180px, 1fr))`, 2-up under 520px). `Kpi` = one tile: `label`, `value` (string \| number), optional `tone` (`neutral`\|`productive`\|`success`\|`warning`\|`danger` — drives a small icon-chip tint only), optional `foot`, optional `hint`. Value renders in a large tabular-nums figure. Tone is **never** the only carrier of meaning — the `label`/`foot` text always says what the number is.                                                                                                                                                                                                                                                                                                          |
| `src/ui/components/KpiStrip.test.tsx`  | strip lays out children; tile renders label/value/foot; tone class applied; numeric + string values; axe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `src/ui/components/Card.tsx`           | `Card` = `<section class="card">` with optional `title` (→ an `<h3>`), optional `headingLevel` (2–4, default 3), optional `actions` slot in the header, `span` (`4`\|`6`\|`8`\|`12`, default `12`) mapped to a `data-span` attribute, and `{children}` in `.card-body`. Surface `--color-surface-2`, hairline `--color-border-soft`, `--elevation-1`, `--radius-large`. `BentoGrid` = `<div class="bento">` 12-col grid; children (`Card`s) place by their `data-span`; at ≤1080px every span collapses to 12 unless the card sets `keepHalf` (→ 6 down to 720px, then 12).                                                                                                                                                                                                              |
| `src/ui/components/Card.test.tsx`      | Card renders title at the right level, actions, body, span attribute, keepHalf attribute; BentoGrid renders children; axe.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `src/ui/components/DataTable.tsx`      | Table-in-card. Props: `caption` (string, visually-hidden by default, `captionVisible?: boolean`), `columns: { key: string; header: ReactNode; align?: "start" \| "end"; }[]`, `rows: { key: string; cells: Record<string, ReactNode>; rowHeader?: string; }[]` (`rowHeader` names the column whose cell is the row's `<th scope="row">`), `reflowAt?: 640` (when set, at that max-width the table switches to one labelled block per row via CSS — each `<td>` shows `data-label` from its column header). Renders `<div class="data-table-scroll">` (`overflow-x:auto`) wrapping `<table class="data-table">` with `<thead>`, `scope` on headers, row hover via `--color-primary-wash`, `align:"end"` columns get `text-align:right` + `tabular-nums`. No selection, no sort this wave. |
| `src/ui/components/DataTable.test.tsx` | headers + rows render; `rowHeader` cell is a `th[scope=row]`; `align:end` class; empty `rows` renders an empty `<tbody>` (caller shows its own EmptyState); `reflowAt` adds the `data-reflow` attribute + each `td` gets `data-label`; axe (default and reflow).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |

**Modified**

| File                                                                       | Change                                                                                                                                                                                                                                                                                                                    |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/ui/theme/styles.css`                                                  | append `.page`, `.page-actions`, `.kpi-strip`, `.kpi`, `.kpi-*` tone chips, `.bento`, `.card`, `.card-header`, `.card-body`, `.data-table*`, and the `@media (max-width: 640px)` reflow rules keyed off `.data-table[data-reflow]`. `PageHeader`'s existing `.page-header` rules stay (still used by unmigrated screens). |
| `src/ui/TodaysClassesScreen.tsx`                                           | replace the `<section aria-label><h2><guided hint>` wrapper with `<Page title="Today's Classes" hint={…}>`; replace `<table className="attendance-roster">` with `<DataTable reflowAt={640} …>`; keep `Alert`/`Loading`/`EmptyState`, the `load()` logic, `requestRef`, and `onCheckAttendance` exactly.                  |
| `src/ui/TodaysClassesScreen.test.tsx`                                      | adjust selectors for the `DataTable` DOM (still a `table`/`row`/`columnheader`/`cell` tree — RTL `getByRole("table")`, `getByRole("row")` still work); the screen region is now `Page`'s `<section aria-label="Today's Classes">` — unchanged name.                                                                       |
| `src/ui/SectionsScreen.tsx`                                                | replace the `<section aria-label><h2 ref tabIndex>` + Guided hint wrapper with `<Page title="Sections" hint={…}>`; the create-section form, the sections list, and the enroll panel move inside `<Page>` unchanged. (No `DataTable` here — the sections list is a labelled `<ul>`, not a data grid; leave it.)            |
| `src/ui/SectionsScreen.test.tsx`                                           | adjust only if a selector depended on the old wrapper; the `region`/`heading` names are unchanged.                                                                                                                                                                                                                        |
| `docs/adr/0064-ui-redesign-shell.md`                                       | append a "## Wave 2 addendum" recording the four primitives, the `DataTable` reflow-as-prop decision, and the two proof migrations.                                                                                                                                                                                       |
| `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md` | Wave 2 entries.                                                                                                                                                                                                                                                                                                           |

---

## Task 1: `Page`

**Files:** Create `src/ui/components/Page.tsx`, `src/ui/components/Page.test.tsx`. Modify `src/ui/theme/styles.css`.

**Interfaces:**

- Produces: `export function Page(props: PageProps)` —

  ```ts
  interface PageProps {
    title: string;
    hint?: ReactNode; // rendered below the heading only when provided (screens pass their Guided-mode hint here; Page does not read the mode itself)
    actions?: ReactNode; // right-aligned in the heading row
    children: ReactNode;
  }
  ```

  Renders `<section aria-label={title} className="page">` → a `.page-header` row containing `<h2 ref tabIndex={-1}>{title}</h2>` (focus moves to it on mount, same as the existing `PageHeader`) + (`actions` && `<div className="page-actions">{actions}</div>`), then (`hint` && the hint node), then `{children}`.

- [ ] **Step 1: failing test** — `src/ui/components/Page.test.tsx`:

```tsx
import { render, screen, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it } from "vitest";
import { Page } from "./Page";
import { expectNoAccessibilityViolations } from "../../test/a11y";

function renderPage(over: { hint?: ReactNode; actions?: ReactNode } = {}) {
  return render(
    <Page title="Sections" {...over}>
      <p>body content</p>
    </Page>,
  );
}

describe("Page", () => {
  it("renders the title as a level-2 heading and names the region", () => {
    renderPage();
    expect(screen.getByRole("region", { name: "Sections" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Sections" })).toBeInTheDocument();
  });

  it("moves focus to the heading on mount", async () => {
    renderPage();
    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 2, name: "Sections" })).toHaveFocus(),
    );
  });

  it("renders a hint only when given", () => {
    const { rerender } = renderPage();
    expect(screen.queryByText("guidance here")).toBeNull();
    rerender(
      <Page title="Sections" hint={<p className="field-hint">guidance here</p>}>
        <p>body content</p>
      </Page>,
    );
    expect(screen.getByText("guidance here")).toBeInTheDocument();
  });

  it("renders an actions slot in the header", () => {
    renderPage({ actions: <button type="button">New</button> });
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
  });

  it("has no axe violations", async () => {
    const { container } = renderPage({
      hint: <p>hi</p>,
      actions: <button type="button">New</button>,
    });
    await expectNoAccessibilityViolations(container);
  });
});
```

- [ ] **Step 2: run — expect FAIL** (`npm run test -- src/ui/components/Page.test.tsx`; module not found).

- [ ] **Step 3: implement `Page.tsx`:**

```tsx
import { useEffect, useRef, type ReactNode } from "react";

interface PageProps {
  title: string;
  hint?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}

export function Page({ title, hint, actions, children }: PageProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  return (
    <section aria-label={title} className="page">
      <div className="page-header">
        <h2 ref={headingRef} tabIndex={-1}>
          {title}
        </h2>
        {actions ? <div className="page-actions">{actions}</div> : null}
      </div>
      {hint}
      {children}
    </section>
  );
}
```

- [ ] **Step 4: run — expect PASS.**

- [ ] **Step 5: CSS** — append to `src/ui/theme/styles.css`:

```css
/* Redesign primitives -- Page scaffold (ADR-0064 Wave 2). Reuses the
   existing .page-header heading styles; adds only the actions row. */
.page-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-unit);
  flex-wrap: wrap;
}
.page-actions {
  display: flex;
  gap: calc(var(--spacing-unit) * 0.5);
  flex-wrap: wrap;
}
```

(The existing `.page-header { margin-bottom }` and `.page-header h2 { margin }` rules stay; this only adds the flex layout. If a specificity clash appears, keep both rules and merge by hand — do not delete the originals.)

- [ ] **Step 6: `npm run quality` green. Commit.**

```bash
git add src/ui/components/Page.tsx src/ui/components/Page.test.tsx src/ui/theme/styles.css
git commit -m "feat(ui): Page layout primitive (folds in PageHeader)

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>"
```

---

## Task 2: `KpiStrip` + `Kpi`

**Files:** Create `src/ui/components/KpiStrip.tsx`, `src/ui/components/KpiStrip.test.tsx`. Modify `styles.css`.

**Interfaces:**

- Produces:

  ```ts
  type KpiTone = "neutral" | "productive" | "success" | "warning" | "danger";
  interface KpiProps {
    label: string;
    value: string | number;
    tone?: KpiTone;
    foot?: ReactNode;
    hint?: ReactNode;
  }
  export function Kpi(props: KpiProps): JSX.Element; // <div class="kpi" data-tone="…"> label / value / foot
  export function KpiStrip(props: { children: ReactNode }): JSX.Element; // <div class="kpi-strip">
  ```

  `Kpi` renders `<div class="kpi" data-tone={tone ?? "neutral"}>` → `<span class="kpi-label">{label}</span>`, `<span class="kpi-value">{value}</span>` (tabular-nums), and `foot ? <span class="kpi-foot">{foot}</span> : null`. `hint` (if given) renders as a `<span class="kpi-hint">` after the label. No `aria-live`, no animation this wave (Wave 3's Home adds count-up).

- [ ] **Step 1: failing test** — assert: `KpiStrip` renders its `Kpi` children; a `Kpi` shows its label, value (both string and number), and foot; `data-tone` reflects the prop and defaults to `"neutral"`; the label text is always present (tone is not the only signal); `await expectNoAccessibilityViolations(container)` on a strip of 3 tiles. Write the full test.

- [ ] **Step 2: run — FAIL.**

- [ ] **Step 3: implement** per the interface above.

- [ ] **Step 4: run — PASS.**

- [ ] **Step 5: CSS** — append:

```css
/* Redesign primitives -- KPI strip (ADR-0064 Wave 2). */
.kpi-strip {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: var(--spacing-unit);
}
@media (max-width: 520px) {
  .kpi-strip {
    grid-template-columns: repeat(2, 1fr);
  }
}
.kpi {
  display: flex;
  flex-direction: column;
  gap: calc(var(--spacing-unit) * 0.35);
  padding: calc(var(--spacing-unit) * 1.1) calc(var(--spacing-unit) * 1.2);
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-large);
  box-shadow: var(--elevation-1);
}
.kpi-label {
  font-size: var(--font-size-small);
  font-weight: 600;
  color: var(--color-text-muted);
}
.kpi-value {
  font-size: 1.7rem;
  font-weight: 700;
  letter-spacing: -0.02em;
  line-height: 1;
  font-variant-numeric: tabular-nums;
}
.kpi-foot,
.kpi-hint {
  font-size: var(--font-size-small);
  color: var(--color-text-muted);
}
.kpi[data-tone="productive"] {
  border-left: 3px solid var(--color-productive);
}
.kpi[data-tone="success"] {
  border-left: 3px solid var(--color-success);
}
.kpi[data-tone="warning"] {
  border-left: 3px solid var(--color-warning);
}
.kpi[data-tone="danger"] {
  border-left: 3px solid var(--color-danger);
}
```

- [ ] **Step 6: `npm run quality` green. Commit** (`feat(ui): KpiStrip/Kpi stat primitives`).

---

## Task 3: `Card` + `BentoGrid`

**Files:** Create `src/ui/components/Card.tsx`, `src/ui/components/Card.test.tsx`. Modify `styles.css`.

**Interfaces:**

- Produces:

  ```ts
  interface CardProps {
    title?: string;
    headingLevel?: 2 | 3 | 4; // default 3
    actions?: ReactNode;
    span?: 4 | 6 | 8 | 12; // default 12
    keepHalf?: boolean; // stay span-6 into the tablet range
    children: ReactNode;
  }
  export function Card(props: CardProps): JSX.Element;
  export function BentoGrid(props: { children: ReactNode }): JSX.Element;
  ```

  `Card` → `<section class="card" data-span={span ?? 12} data-keep-half={keepHalf ? "" : undefined}>`; if `title`, a `.card-header` with `<hN>{title}</hN>` (N = `headingLevel ?? 3`) + optional `.card-actions`; then `.card-body` with `{children}`. `BentoGrid` → `<div class="bento">{children}</div>`.

- [ ] **Step 1: failing test** — assert: `Card` renders `title` at the requested heading level (test level 2, 3, 4); `actions` node appears; `children` in the body; `data-span` reflects the prop and defaults to `12`; `data-keep-half` present only when `keepHalf`; a `Card` with no `title` renders no heading and no `.card-header`; `BentoGrid` renders its children; axe on a `BentoGrid` of two `Card`s (one titled, one not). Write it in full.

- [ ] **Step 2–4: FAIL → implement → PASS.**

- [ ] **Step 5: CSS** — append:

```css
/* Redesign primitives -- Card + BentoGrid (ADR-0064 Wave 2). */
.bento {
  display: grid;
  grid-template-columns: repeat(12, 1fr);
  gap: var(--spacing-unit);
}
.card {
  min-width: 0;
  background: var(--color-surface-2);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-large);
  box-shadow: var(--elevation-1);
  padding: calc(var(--spacing-unit) * 1.2);
}
.card[data-span="4"] {
  grid-column: span 4;
}
.card[data-span="6"] {
  grid-column: span 6;
}
.card[data-span="8"] {
  grid-column: span 8;
}
.card[data-span="12"] {
  grid-column: span 12;
}
.card-header {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: var(--spacing-unit);
  margin-bottom: calc(var(--spacing-unit) * 0.9);
}
.card-header > :first-child {
  margin: 0;
  font-size: 1rem;
}
.card-actions {
  display: flex;
  gap: calc(var(--spacing-unit) * 0.5);
  flex-wrap: wrap;
}
@media (max-width: 1080px) {
  .card[data-span] {
    grid-column: span 12;
  }
  .card[data-keep-half] {
    grid-column: span 6;
  }
}
@media (max-width: 720px) {
  .card[data-keep-half] {
    grid-column: span 12;
  }
}
```

- [ ] **Step 6: `npm run quality` green. Commit** (`feat(ui): Card/BentoGrid layout primitives`).

---

## Task 4: `DataTable`

**Files:** Create `src/ui/components/DataTable.tsx`, `src/ui/components/DataTable.test.tsx`. Modify `styles.css`.

**Interfaces:**

- Produces:

  ```ts
  interface DataColumn {
    key: string;
    header: ReactNode;
    align?: "start" | "end";
  }
  interface DataRow {
    key: string;
    cells: Record<string, ReactNode>;
    rowHeader?: string;
  }
  interface DataTableProps {
    caption: string;
    captionVisible?: boolean; // default false -> visually-hidden caption
    columns: DataColumn[];
    rows: DataRow[];
    reflowAt?: 640; // when set, CSS switches to one labelled block per row at max-width:640px
  }
  export function DataTable(props: DataTableProps): JSX.Element;
  ```

  Renders `<div class="data-table-scroll">` → `<table class="data-table" data-reflow={reflowAt ? "" : undefined}>` → `<caption class={captionVisible ? undefined : "visually-hidden"}>{caption}</caption>`, `<thead><tr>` of `<th scope="col" class={align === "end" ? "num" : undefined}>{header}</th>`, `<tbody>` of `<tr>` where the cell whose column `key === row.rowHeader` renders as `<th scope="row">`, others as `<td class={align === "end" ? "num" : undefined} data-label={<column header as string>}>`. If `rows` is empty, render `<tbody />` (the caller shows its own `EmptyState` above/below).

- [ ] **Step 1: failing test** — assert: column headers render as `columnheader`s; rows render as `row`s with `cell`s; the `rowHeader` column's cell is `role="rowheader"` / `th[scope="row"]`; `align:"end"` columns carry the `num` class on both header and cells; empty `rows` → a table with only the header row (no data rows); with `reflowAt={640}` the `<table>` has `data-reflow` and every `<td>` has a non-empty `data-label`; `await expectNoAccessibilityViolations(container)` for a normal render AND a `reflowAt` render. Full test code.

- [ ] **Step 2–4: FAIL → implement → PASS.** For `data-label`, derive the string from the column `header` when it is a string; when it is a `ReactNode`, accept an optional `column.label?: string` fallback (add that field to `DataColumn`) and use `""` only if neither is present — but the test should pass string headers so `data-label` is always populated there.

- [ ] **Step 5: CSS** — append:

```css
/* Redesign primitives -- DataTable (ADR-0064 Wave 2). Table-in-card:
   real table semantics always; the reflow is CSS-only. */
.data-table-scroll {
  overflow-x: auto;
}
.data-table {
  width: 100%;
  border-collapse: collapse;
}
.data-table caption {
  text-align: left;
  font-weight: 600;
  margin-bottom: calc(var(--spacing-unit) * 0.5);
}
.data-table th,
.data-table td {
  padding: calc(var(--spacing-unit) * 0.6) var(--spacing-unit);
  text-align: left;
  border-top: 1px solid var(--color-border-soft);
}
.data-table thead th {
  border-top: 0;
  border-bottom: 2px solid var(--color-border);
  font-size: var(--font-size-small);
}
.data-table th.num,
.data-table td.num {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.data-table tbody tr:hover {
  background: var(--color-primary-wash);
}
.data-table tbody tr:focus-within {
  background: var(--color-surface);
}

@media (max-width: 640px) {
  .data-table[data-reflow] thead {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }
  .data-table[data-reflow],
  .data-table[data-reflow] tbody,
  .data-table[data-reflow] tr,
  .data-table[data-reflow] th,
  .data-table[data-reflow] td {
    display: block;
    width: 100%;
  }
  .data-table[data-reflow] tr {
    padding: var(--spacing-unit) 0;
    border-top: 1px solid var(--color-border);
  }
  .data-table[data-reflow] tr:first-child {
    border-top: 0;
  }
  .data-table[data-reflow] th[scope="row"] {
    font-size: var(--font-size-large);
    padding: 0 0 calc(var(--spacing-unit) * 0.5) 0;
    border-top: 0;
  }
  .data-table[data-reflow] td {
    padding: calc(var(--spacing-unit) * 0.25) 0;
    border-top: 0;
  }
  .data-table[data-reflow] td::before {
    content: attr(data-label) ": ";
    font-weight: 600;
  }
}
```

- [ ] **Step 6: `npm run quality` green. Commit** (`feat(ui): DataTable primitive with prop-driven phone reflow`).

---

## Task 5: Migrate `TodaysClassesScreen`

**Files:** Modify `src/ui/TodaysClassesScreen.tsx`, `src/ui/TodaysClassesScreen.test.tsx`.

**Interfaces:** Consumes `Page` (Task 1), `DataTable` (Task 4). No prop or behaviour change to the screen itself.

- [ ] **Step 1: read the current screen + its test.** Note: it renders `<section aria-label="Today's Classes"><h2 ref tabIndex>…` + a Guided hint + `Alert`/`Loading`/`EmptyState` + `<table className="attendance-roster">` with columns Time / Class / Status / Action.

- [ ] **Step 2: update the test first (RED for the new structure).** Replace any assertion that targets the old `<h2>`/`<section>` wrapper only if it breaks; keep every behavioural assertion (loads classes, shows status labels, "Check attendance" calls `onCheckAttendance` with the assignment id, empty state, error + Retry). The table is now a `DataTable` — `getByRole("table")`, `getByRole("row")`, `getByRole("columnheader", { name: "Time" })`, `getByRole("rowheader")` for the time cell, and the action `button` still resolve. Add nothing new except what the structure forces.

- [ ] **Step 3: implement the migration:**
  - Wrap the return in `<Page title="Today's Classes" hint={mode === "guided" ? <p className="field-hint">…the existing hint text…</p> : undefined}>`. Remove the hand-rolled `<section>`/`<h2>`/`headingRef`/the focus `useEffect` (Page does all of it).
  - Keep `Alert` (error + Retry), `Loading`, `EmptyState` exactly.
  - Replace the `<table className="attendance-roster">` with:
    ```tsx
    <DataTable
      caption="Today's classes"
      reflowAt={640}
      columns={[
        { key: "time", header: "Time" },
        { key: "class", header: "Class" },
        { key: "status", header: "Status" },
        { key: "action", header: "Action" },
      ]}
      rows={occurrences.map((occurrence, index) => ({
        key: `${occurrence.assignment.id}-${occurrence.startsAt}-${index}`,
        rowHeader: "time",
        cells: {
          time: `${occurrence.startsAt}–${occurrence.endsAt}${occurrence.room ? ` · ${occurrence.room}` : ""}`,
          class: `${occurrence.assignment.subjectName} — ${occurrence.assignment.sectionName}`,
          status: STATUS_LABELS[occurrence.status],
          action: (
            <button type="button" onClick={() => onCheckAttendance(occurrence.assignment.id)}>
              Check attendance
            </button>
          ),
        },
      }))}
    />
    ```
  - Drop the now-unused `headingRef` import bits and the `.attendance-roster` class usage (leave the CSS rule — other screens still use it until their own migration).

- [ ] **Step 4: `npm run test -- src/ui/TodaysClassesScreen.test.tsx` green; then `npm run quality` green.**

- [ ] **Step 5: commit** (`refactor(ui): migrate Today's Classes onto Page + DataTable`).

---

## Task 6: Migrate `SectionsScreen`

**Files:** Modify `src/ui/SectionsScreen.tsx`, `src/ui/SectionsScreen.test.tsx`.

**Interfaces:** Consumes `Page` (Task 1). No `DataTable` (the sections list is a labelled list, not a data grid). No behaviour change.

- [ ] **Step 1: read the screen + test.** It has: a create-section form, a sections `<ul>`/list with per-row "Open roster" / "Manage assignments" / "Manage adviser" actions, an enroll panel, `Alert` confirmation/error, `EmptyState`, `Loading`. The wrapper is `<section aria-label="Sections"?>` (confirm the exact accessible name) + `<h2 ref tabIndex>` + a Guided hint.

- [ ] **Step 2: update the test first** only where the wrapper markup moved. Keep every behavioural assertion (create section, list renders, each action button calls the right callback with the right args, enroll flow, confirmation/error text).

- [ ] **Step 3: implement:** wrap the return body in `<Page title="Sections" hint={mode === "guided" ? <the existing hint> : undefined}>`; delete the local `<section>`/`<h2>`/`headingRef`/focus `useEffect`. Everything else (forms, list, panels) moves inside `<Page>` verbatim. If the screen used `PageHeader` already, replace that with `Page` wrapping the whole body instead of just the header.

- [ ] **Step 4: `npm run test -- src/ui/SectionsScreen.test.tsx` green; `npm run quality` green.**

- [ ] **Step 5: commit** (`refactor(ui): migrate Sections onto the Page primitive`).

---

## Task 7: ADR addendum + state docs + wave gate

**Files:** `docs/adr/0064-ui-redesign-shell.md` (append "## Wave 2 addendum"), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`.

- [ ] **Step 1: ADR Wave 2 addendum** — the four primitives and their responsibilities; the decision that `DataTable`'s phone reflow is a **prop + CSS**, not per-screen `@media` (migrated screens shed their bespoke reflow blocks over time); the two proof migrations (Today's Classes → `Page` + `DataTable`; Sections → `Page`); note the remaining ~12 screens re-fit in Wave 5+ batches, and that `KpiStrip`/`Card`/`BentoGrid` get their first real use in Wave 3's Home.

- [ ] **Step 2: state docs** — `PROJECT-MEMORY.md` one durable line ("Wave 2: layout primitives Page/KpiStrip/BentoGrid+Card/DataTable added; DataTable reflow is a prop; Today's Classes + Sections migrated as proof"). `CURRENT-HANDOFF.md` new top entry with the commit range, `quality:full` result, and **exact next slice = Wave 3 (role-adaptive Home): expose `role` on the frontend `CurrentSession` projection, then build `HomeScreen` → `TeacherHome` (absorbs `TeacherWorkspaceScreen`) / `SchoolHeadHome` (without the attendance-rollup card), wired to existing data; its own plan.** `ACTIVE-PLAN.md` a "Wave 2 — complete" section (Scope / shipped / verification / not-done / next).

- [ ] **Step 3: `npm run quality:full`** — exit 0 required (harness 100/100 unchanged — no harness file touched; typecheck/lint/format/architecture; vitest count up by the new primitive + migration tests; `cargo` unchanged, no Rust). `npm run quality:security` clean (no dependency). `npm run build` — record CSS gzip. `npx knip` — no new findings (the primitives must all be consumed: `Page` by 2 screens; `KpiStrip`/`Card`/`BentoGrid`/`DataTable` — `DataTable` by Today's Classes; `KpiStrip`/`Card`/`BentoGrid` have **no consumer yet** and will trip `knip` as unused exports → add them to `knip`'s `ignore`/`ignoreExportsUsedInFile` with a comment, OR — preferred — hold Tasks 2 & 3 until Wave 3 consumes them. **Decision for the executor:** if `knip` flags `KpiStrip`/`Card`/`BentoGrid` as unused, add a one-line `knip.json` ignore entry referencing "consumed in Wave 3 (HomeScreen)"; do not delete the components.)

- [ ] **Step 4: commit** (`docs: record Wave 2 (layout primitives) — ADR-0064 addendum + state docs`).

---

## Self-Review

**Spec coverage:** §5.1 four primitives → Tasks 1–4. §5.4 responsive (auto-fit KPI, 12-col bento collapse, DataTable 640px reflow) → the CSS in Tasks 2/3/4. §5.6 a11y (axe per primitive, Page preserves mount-focus, DataTable keeps table semantics) → every task's tests + the Global Constraints. §7 "re-fit onto the primitives, same content/flow" → Tasks 5–6 (the two screens §8 names as proof). §8 Wave 2 row (primitives + migrate Sections + Today's Classes) → the whole plan. `Page` folding in `PageHeader` matches §5.1's "folds in today's `PageHeader`".

**Placeholder scan:** none — every component has a full interface block and every test step names concrete assertions; the two migration tasks carry the exact `DataTable` props to use.

**Type consistency:** `PageProps` / `KpiProps` / `CardProps` / `DataColumn` / `DataRow` / `DataTableProps` each defined once; `KpiTone` values match the `.kpi[data-tone]` CSS; `DataColumn.align` values (`"start"|"end"`) match the `.num` rule; `reflowAt` literal `640` matches the `@media (max-width: 640px)` selector and the `data-reflow` attribute.
