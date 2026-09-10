# ADR-0070: Precision Intelligence — appearance foundation & design-language supersession

Status: Accepted

## Context

The owner authorised a whole-product UI/UX overhaul under the name
**"Precision Intelligence" (PI)** and selected, from three reconciliation
options, **Option A**: bootstrap PI in this repository from `main`,
treating it as the evolution of the existing "Calm Civic Classroom" /
ADR-0064 redesign rather than a throw-away restart. The program's
canonical plan is `docs/design/precision-intelligence-ui-overhaul-plan.md`.

A handoff brief referenced prior PI checkpoints (`ab03d36`, `3b6b5cb`), a
prior ADR-0070, an `AppearanceProvider`, and a device-local
Light/System/Dark preference. **None of that exists in this repository or
on any reachable ref** (verified: `git cat-file`, reflog, stash,
`git log --all`, `origin/*`). `origin/feat/precision-intelligence-shell`
existed but was byte-identical to `main`. This ADR and the plan document
are therefore authored fresh; there is no prior PI work to preserve.

Two concrete gaps motivate this first decision:

1. **No appearance control.** Dark mode today is a single
   `@media (prefers-color-scheme: dark)` block in
   `src/ui/theme/styles.css`. A teacher cannot choose light or dark
   independently of the operating system — which a shared Windows
   machine in a school often has set to something the teacher did not
   pick. The program objective is "Support Light, System, and Dark
   appearance equally."
2. **Design-language ambiguity.** ADR-0064 ("UI Redesign Shell",
   Accepted, Waves 1–6) adopted a persistent sidebar, a KPI strip, a
   bento content grid, and table-in-card layouts, seeded by a Behance
   "School Management Dashboard" reference. PI's stated principle is
   "one dominant work surface with contextual secondary regions over
   grids of equally weighted cards" and it lists "dashboard-card spam"
   and "vanity charts" as anti-patterns. Left unstated, this is a silent
   drift from an accepted ADR, which `.claude/rules/architecture.md`
   forbids.

## Decision

### 1. Design-language supersession scope (PI vs. ADR-0064)

PI **supersedes the design-language and information-hierarchy guidance**
of ADR-0064 and `DESIGN.md`'s "Calm Civic Classroom" framing:

- The default screen composition is **one dominant work surface** with
  contextual secondary regions — not a grid of equally weighted cards.
- `KpiStrip`/`Kpi` remain available but are **re-scoped**: a KPI tile is
  for a number that changes a teacher's next decision, never dashboard
  filler. `BentoGrid` usage on the role-adaptive Home is re-weighted
  toward the dominant-surface model in Wave D.
- The visual vocabulary name of record becomes **Precision
  Intelligence**; `DESIGN.md` is updated in Wave B to reflect this.

PI **retains, unchanged**, everything ADR-0064 / ADR-0031 established
that is not design-language:

- All `styles.css` semantic color-role tokens and their **computed
  contrast ratios** (ADR-0031 / ADR-0064). No color value changes in
  this ADR.
- Public Sans (self-hosted, OFL-1.1), `tabular-nums`.
- The `AppLayout` shell mechanics: CSS-grid layout, the drawer a11y
  contract (focus-in / trap / Escape / return), phone-width `inert`
  gating, the skip-to-content link, the two uniquely-named `navigation`
  landmarks.
- The four layout primitives `Page`, `Card`, `BentoGrid`, `DataTable`
  and the shared components `Alert`, `Loading`, `EmptyState`,
  `StatusChip`.
- The non-color state-cue discipline (WCAG 1.4.1), the ≥24px
  checkbox/radio target floor, the `prefers-reduced-motion` single-rule
  collapse, the motion-token set.
- The three density modes (Efficient / Comfortable / Guided) with full
  capability parity, queried directly, never inferred.

`PageHeader` and `TeacherWorkspaceScreen` are slated for **replacement**
(folded into `Page` / rebuilt on primitives) in Wave D; their deletion
is an explicit approval gate at that point.

### 2. Appearance is a device-local, presentation-only preference

A new preference with values **`light` | `system` | `dark`**, default
**`system`**. It is stored in `localStorage` under
`likha-sis:appearance` and is **never** written to the encrypted working
database (ADR-0003) or attached to the session / authorization model
(ADR-0004) — exactly like the existing density-mode preference. It
changes presentation only: no screen's function, DepEd-compliance
behavior, or authorization boundary depends on it.

### 3. "System" is the _absence_ of an attribute — dark mode stays zero-JS

`applyAppearance` writes `data-appearance="light"` or
`data-appearance="dark"` on `<html>` for an explicit choice, and
**removes the attribute** for `system`. The dark palette in `styles.css`
is applied by two selectors carrying identical declarations:

```
@media (prefers-color-scheme: dark) {
  :root:not([data-appearance="light"]) { /* dark tokens */ }
}
:root[data-appearance="dark"] { /* same dark tokens */ }
```

Consequences of this shape:

- With `system` (no attribute) on a dark-mode OS, dark styling applies
  **with no JavaScript at all** — the existing behavior is preserved,
  not replaced by a JS-dependent one.
- An explicit `light` choice wins on a dark-mode OS via the
  `:not([data-appearance="light"])` guard.
- An explicit `dark` choice wins on a light-mode OS via the second
  selector.
- Both dark selectors are specificity `(0,2,0)` and beat bare `:root`
  `(0,1,0)`; the explicit block is placed **after** the media block so
  source order is the tiebreak if the two copies ever drift. A
  sync-warning comment sits above both.

### 4. Applied before first paint

`src/main.tsx` calls
`applyAppearance(document.documentElement, readStoredAppearance())`
**before** `createRoot(...).render(...)`, so a teacher who chose Dark
never sees a light flash on launch. `readStoredAppearance` is the single
reader, imported by both `main.tsx` and `AppearanceProvider`. A module
read (not an inline `<script>` in `index.html`) is used deliberately:
the Tauri CSP is `null` today but a module read survives a future CSP
that omits `unsafe-inline`.

### 5. Provider shape mirrors `ModeContext` exactly

Four files under `src/ui/theme/`: `appearance.ts` (type, constants,
labels, guard, storage + apply helpers), `appearance-context-value.ts`
(the `createContext`), `AppearanceProvider.tsx` (component only),
`useAppearance.ts` (hook, throws outside the provider). The split is
required by `eslint-plugin-react-refresh` (a component file may not also
export a context object), matching the reason `mode-context-value.ts` is
already separate.

### 6. Control placement mirrors the density switcher

An `<div role="group" aria-label="Appearance">` of three `aria-pressed`
buttons (`Light` / `System` / `Dark`), with the same non-color
pressed-state cue (`✓` `::before` + weight + fill) the density switcher
uses. It is rendered in **`TopBar`** (visible at desktop width) **and**
in **`Sidebar`** (`.app-sidebar-appearance`, visible in the phone
drawer) — the same dual placement the density switcher already uses, so
there is no desktop-only gap ahead of Phase 12 (Android).

## Consequences

- **Files added**: `src/ui/theme/appearance.ts`,
  `appearance-context-value.ts`, `AppearanceProvider.tsx`,
  `useAppearance.ts`, `AppearanceProvider.test.tsx`;
  `docs/design/precision-intelligence-ui-overhaul-plan.md`; this ADR.
- **Files changed**: `src/ui/theme/styles.css` (dark selector split, no
  value change; two `.app-*-appearance` style hooks added),
  `src/main.tsx` (pre-paint apply), `src/App.tsx` (wrap in
  `<AppearanceProvider>`), `src/ui/shell/TopBar.tsx` + `.test.tsx`,
  `src/ui/shell/Sidebar.tsx` + `.test.tsx`, `src/ui/shell/AppLayout.test.tsx`
  (provider wrapper), `src/dev-preview/DevPreviewApp.tsx` (provider
  wrapper).
- **No Rust, no migration, no dependency, no domain/application/repository
  change.** No approval gate triggered by this wave.
- **Contrast**: no color token value changed; ADR-0031 / ADR-0064
  computed ratios carry over verbatim. Not re-derived here.

## Verification actually run (Wave A, this session)

- Baseline before edits: `npm run quality` failed only at `format:check`
  on a **pre-existing untracked** file
  (`docs/research/2026-09-07-external-enhancement-research.md`);
  `npx vitest run` → **111 files / 1099 tests** passing. The untracked
  doc was formatted with Prettier to unblock the shared gate.
- After edits: `npm run quality` — _result recorded in
  `docs/ACTIVE-PLAN.md` and the wave checkpoint._
- `npm run quality:ui` — Playwright browser binary known-absent in this
  environment (`docs/VERIFICATION-DEBT.md`); **not** run. A native
  Windows visual pass of Light / System / Dark across the shell is
  **owed** and recorded as verification debt.
- No Rust touched → Rust gates unchanged, not re-run this wave.

## Independent review

Wave A touches no auth, persistence, or sync code, so the mandatory
independent security/reliability review of
`.claude/rules/security-privacy.md` does not apply. An
`accessibility-reviewer` pass over the new appearance control and the
Light/Dark first-class treatment is scheduled with Wave B (shell finish),
which is where the control's final grouping and focus order settle.
