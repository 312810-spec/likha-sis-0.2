# LIKHA-SIS UI Redesign — Design Spec

Date: 2026-09-03
Status: Approved for planning (owner-approved in the design session that produced this file)
Lineage: extends ADR-0030 (UI-First World-Class Product Program) and ADR-0031
(Design Tokens, Shared Components, and App Shell). A durable ADR is to be
written in Wave 1 (see §10).

---

## 1. Summary

Replace LIKHA-SIS's flat top-of-page navigation and per-screen ad-hoc layout
with a single, reorganised design approach:

- a **persistent sidebar app shell** that adapts to a drawer + bottom tab bar
  on small viewports;
- a **role-adaptive Home screen** (Teacher / School Head) that becomes the
  default signed-in destination and absorbs the current Teacher Workspace;
- a small set of **shared layout primitives** (`Page`, `KpiStrip`/`Kpi`,
  `BentoGrid`/`Card`, `DataTable`) that every screen is re-fitted onto;
- the **existing "Calm Civic Classroom" palette, Public Sans typeface, and
  three-mode density system kept intact** — only additive tokens are
  introduced, each re-verified for contrast before it lands;
- an **expressive-but-restrained motion layer** that fully collapses under
  `prefers-reduced-motion`.

The seed inspiration was a Behance "School Management Dashboard" admin panel.
Its _information architecture_ ideas were adopted (sidebar, KPI strip, bento
card grid, table-in-card). Its visual styling (purple/orange gradients, tinted
stat cards, marketing chrome, admin-not-teacher framing, density) was **not**
adopted.

## 2. Goals

1. One coherent shell and layout language across all screens, on desktop and
   (structurally) on Android.
2. A teacher's first screen answers "what do I need to do now?" without
   navigation.
3. A School Head's first screen answers "what needs my attention across the
   school?".
4. Preserve every existing capability, authorization gate, Rust command, and
   the Efficient/Comfortable/Guided functional parity rule.
5. Keep WCAG 2.2 AA (the project's existing bar) on every changed surface,
   with contrast computed, not eyeballed.
6. Structure the shell and primitives so an Android layer is a later
   adaptation, not a rewrite (per CLAUDE.md "Windows first; Android later").

## 3. Non-goals

- No change to the colour _palette_, typeface, or the density-mode mechanism.
- No new business logic, no new PII fields, no schema change **except** the
  thin read-only aggregates named in §6 (each its own reviewed slice).
- No change to any screen's DepEd-compliance behaviour or official-form
  output.
- No redesign of a screen's internal information architecture unless that
  screen is individually called out in §7; the default is "re-fit onto the
  new primitives, same content and flow".
- No offline/sync behaviour change.
- Not a harness/tooling change (the LIKHA Production Harness v2.0 stays
  locked).

## 4. Locked decisions (from the design session)

| Decision         | Choice                                                                                                                                                                 |
| ---------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Redesign reach   | Full: shell + IA + visual + new Home + re-fit pass across all screens                                                                                                  |
| Palette          | Keep "Calm Civic Classroom"; adopt only the structural ideas from the inspiration                                                                                      |
| Android          | Desktop-primary now; shell + primitives structured so Android is an adaptation, not a rewrite                                                                          |
| Home             | Role-adaptive; one `HomeScreen` renders a Teacher or School Head variant; absorbs `TeacherWorkspaceScreen` as the landing screen                                       |
| Navigation model | Keep today's four semantic groups (Daily Teaching / Learner Records / Grading / Security) verbatim, as collapsible sidebar sections, with a pinned **Home** above them |
| Motion level     | Expressive: staggered card rise, count-up on stat numbers, bar-fill draw-in, ledger-rule active-nav mark, smooth scroll-to-top — all `prefers-reduced-motion`-safe     |

## 5. Architecture

### 5.1 Component & file layout

**New shell package — `src/ui/shell/`**

| File            | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                  |
| --------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `AppLayout.tsx` | The CSS grid (sidebar column + main column), the `<nav>`/`<main>` landmark structure, drawer open/close state, the responsive breakpoint switch, and rendering `BottomNav` on small viewports. Receives the active tab id, the signed-in session, the mode value/handler, and the sign-out handler as props. Contains no screen logic.                                                                          |
| `Sidebar.tsx`   | Brand block, the nav-group list (driven by the data model in §5.3), per-group collapse state persisted to `localStorage` under a single namespaced key, the active-item treatment (ledger-rule mark). Reused verbatim inside the drawer container on small viewports — one implementation, not two — and in that drawer role it also renders the density-mode switcher at its top (one extra conditional slot). |
| `TopBar.tsx`    | Breadcrumb / current-screen title, the density **mode switcher moved here from `AppShell`** (hidden on phone — relocated into the drawer, see §5.4), the signed-in identity block, sign-out, and the hamburger button (small viewports only).                                                                                                                                                                   |
| `BottomNav.tsx` | Exactly five destinations (Home, Classes, Learners, Grades, More) for phone widths; "More" opens the drawer. Each item ≥48px, label always visible, never hover-dependent.                                                                                                                                                                                                                                      |

`src/App.tsx`'s `NAV_GROUPS` / flat nav JSX and `src/ui/AppShell.tsx` are
replaced by the above. `App.tsx` keeps ownership of "which tab is active" and
the contextual-handoff variables it already threads (e.g.
`subjectAttendanceAssignmentId`, `section-roster`, `section-adviser`,
`teaching-assignments`).

**New layout primitives — `src/ui/components/`**

| File                         | Responsibility                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| ---------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Page.tsx`                   | The centred page canvas (max-width ~1160px), and it **folds in the current `PageHeader`** — same title + optional Guided-mode hint + **mount-focus behaviour preserved exactly** (the existing focus-on-mount tests must pass unmodified). Optional `actions` slot on the right of the header.                                                                                                                                                            |
| `KpiStrip.tsx` + `Kpi.tsx`   | `KpiStrip` is an auto-fit grid (`minmax(180px, 1fr)`), 2-up on phones. `Kpi` takes `label`, `value`, optional `tone` (neutral/productive/success/warning/danger), optional `foot`, optional `icon`, optional `prefix`/`suffix`. Count-up animation on `value` **only** when it is numeric and reduced-motion is not set; otherwise render the final value immediately. Tone drives the icon chip tint only — the number is never colour-only for meaning. |
| `BentoGrid.tsx` + `Card.tsx` | `BentoGrid` is a 12-column grid. `Card` takes a `span` (4/6/8/12), an optional `head` (title + optional link/actions), and body children. At ≤1080px all spans collapse to 12 unless the card opts into `keepHalf` (→ span 6 down to 860px, then 12). `Card` surface is `--color-surface-2`, hairline border `--color-border-soft`, one elevation level.                                                                                                  |
| `DataTable.tsx`              | The table-in-card primitive: an `overflow-x:auto` wrapper, an optional sticky header, row hover using `--color-primary-wash`, and — as a **prop, not per-screen CSS** — the phone "each row becomes a labelled block" reflow that several screens currently re-implement by hand. Column defs carry a `data-label` for that reflow and an `align` for numeric columns (`tabular-nums`).                                                                   |

**Unchanged, restyled through tokens only:** `Alert`, `Loading`,
`EmptyState`, `StatusChip`. `NavItem.tsx` is superseded by `Sidebar` /
`BottomNav` and removed once no screen imports it.
`Sf1DuplicateReview` and `IdleTimeoutWarning` keep their behaviour; only their
surface styling picks up the new tokens.

**Home — `src/ui/HomeScreen.tsx` + `src/ui/home/`**

`HomeScreen` reads `session.role` and renders `<TeacherHome>` or
`<SchoolHeadHome>` from `src/ui/home/`. It is registered as the default
signed-in tab. `TeacherWorkspaceScreen`'s content — including its existing
"Today's priority" rail — moves into `TeacherHome`; the old screen file is
deleted once nothing routes to it. Both Home variants receive their
`*ApplicationService`s as props (never import `composition.ts`), matching the
existing screen convention so they stay testable with fakes.

### 5.2 Token additions

All additive. Every new colour token is run through the existing
`node` relative-luminance contrast script against the **actual final hex
values, in both light and dark palettes**, before it is written to
`src/ui/theme/styles.css`, and the computed ratio is recorded in an inline
`/* Verified N:1 */` comment exactly as ADR-0031 requires.

| Token                  | Purpose                                                                                                    | Contrast rule it must satisfy                                                                                                                                                                         |
| ---------------------- | ---------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `--color-surface-2`    | Card / raised surface fill (white in light, a lifted grey in dark)                                         | `--color-text` on it ≥ 4.5:1; `--color-text-muted` on it ≥ 4.5:1; both palettes                                                                                                                       |
| `--color-border-soft`  | **Hairline dividers and card outlines only.** Never the sole indicator that an interactive control exists. | No AA requirement as a decorative hairline, **but** the real "a control exists here" border stays `--color-border` at its already-verified ≥ 3:1, and every input/button keeps using `--color-border` |
| `--color-primary-wash` | Nav hover/active row tint, table row hover                                                                 | Never carries text; the text over it is the row's normal `--color-text` which must still clear 4.5:1 on the wash                                                                                      |
| `--elevation-2`        | Drawer / overlay shadow only                                                                               | n/a (shadow)                                                                                                                                                                                          |
| `--sidebar-width`      | 264px; 224px at the mid breakpoint                                                                         | n/a (layout)                                                                                                                                                                                          |

Density tokens (`--spacing-unit`, `--font-size-base`, `--control-height` per
`data-teacher-mode`), motion tokens, and focus tokens are **not touched**.

### 5.3 Navigation data model

`src/ui/components/workbench-nav-data.ts` is extended (not replaced) to the
shape the sidebar and bottom nav both consume:

```
type NavDestination = { id: TabId; label: string; icon: IconName };
type NavGroup = { id: string; label: string; items: NavDestination[] };

HOME: NavDestination                    // pinned, rendered above the groups
NAV_GROUPS: NavGroup[]                   // the existing four, order unchanged
BOTTOM_NAV: NavDestination[]             // exactly five, for phone widths
```

Contextual, nav-invisible destinations (`section-roster`,
`teaching-assignments`, `section-adviser`, and any future handoff target) are
**not** in this data — they remain reached only via in-screen actions and
`App.tsx`'s handoff variables, exactly as today. The breadcrumb in `TopBar`
shows their parent group + a screen-supplied title.

Icons: a single small inline-SVG icon set lives in
`src/ui/components/icons.tsx` (no icon-font, no runtime fetch, no new
dependency). Each nav item's label is always rendered as text; the icon is
decorative (`aria-hidden`).

### 5.4 Responsive / adaptive strategy

Three layout regimes, driven by container/viewport width:

| Regime  | Width      | Shell                                                                                                                                                                                                                            | Grid                                 |
| ------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Desktop | > 1080px   | Sidebar fixed at 264px, main column fluid, centred at ≤1160px                                                                                                                                                                    | Bento spans 4/6/8/12 as authored     |
| Tablet  | 860–1080px | Sidebar fixed at 224px                                                                                                                                                                                                           | All spans → 12 except `keepHalf` → 6 |
| Phone   | < 860px    | Sidebar becomes a left drawer (hamburger in `TopBar`, scrim, focus-trapped while open); a five-item bottom tab bar appears; density-mode switcher hidden from `TopBar` (still reachable inside the drawer, above the nav groups) | All spans → 12                       |

Additional phone rules (all already partly present in the codebase, now
centralised in the primitives):

- Every interactive target ≥ 44px (WCAG 2.5.8); bottom-nav targets ≥ 48px.
- No hover-only affordance anywhere — hover styling is additive polish only.
- `DataTable`'s block-reflow prop replaces the four hand-written
  `@media (max-width: 640px)` table reflows (`attendance-roster`,
  `section-roster`, `score-entry`, `monthly-summary` keeps its own
  sticky-column scroll treatment — that one is deliberately different and
  stays).
- `env(safe-area-inset-*)` respected on the bottom nav and any fixed element.

Tauri-mobile notes for the Android wave (not built now, but the shell must
not foreclose them): the drawer/bottom-nav split is the Android navigation
model; `position: sticky` headers and `backdrop-filter` are used sparingly
and always have a solid-colour fallback declared first; no desktop-only
input assumptions (right-click, hover tooltips) carry meaning.

### 5.5 Motion inventory

| Cue              | Where                               | Token / spec                                                                                                                                    | Reduced-motion                            |
| ---------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| Staggered rise   | Cards/KPIs on view change           | `translateY(10px)` + fade, `--motion-duration-meaningful`, 60ms stagger step                                                                    | No transform, no fade — rendered in place |
| Count-up         | `Kpi` numeric value                 | ~650ms cubic ease-out, integer steps                                                                                                            | Final value rendered immediately          |
| Bar draw-in      | `bars` fills on Home / Class Record | width transition, `--motion-duration-meaningful`                                                                                                | Final width set with no transition        |
| Ledger-rule mark | Active sidebar item                 | `scaleY(0→1)` on a 3px left rule, `--motion-duration-routine` (this is ADR-0031's existing "ledger continuity" treatment, moved to the sidebar) | Rule shown at final state instantly       |
| Nav/row hover    | Sidebar items, table rows           | background-color, `--motion-duration-immediate`                                                                                                 | Colour still changes, just not tweened    |
| Drawer slide     | Phone drawer                        | `translateX`, `--motion-duration-meaningful`                                                                                                    | Appears/disappears instantly              |
| Scroll-to-top    | On view change                      | `behavior: smooth`                                                                                                                              | `behavior: auto`                          |

No parallax, no scroll-jacking, no autoplaying looping animation, no
celebratory motion that blocks interaction. The reduced-motion media query
stays a single token-collapse rule plus the per-cue fallbacks above.

### 5.6 Accessibility requirements (every wave)

- `AppLayout` renders one `<nav aria-label="Primary">` (sidebar) and, when
  present, one `<nav aria-label="Primary">` is **not** duplicated — the
  bottom bar uses `aria-label="Primary"` only when the sidebar is not in the
  accessibility tree (drawer closed on phone), otherwise `aria-hidden` while
  the drawer holds the live nav. Exact mechanism decided in Wave 1 and
  written into the ADR.
- Active destination marked with `aria-current="page"`, not colour alone
  (the ledger rule + text weight are the non-colour cues — the same pattern
  ADR-0031 already established for the pressed nav/mode state).
- Drawer: focus moves into it on open, is trapped while open, returns to the
  hamburger on close; `Esc` closes it.
- Collapsible nav groups: the group header is a `<button>` with
  `aria-expanded`; collapsed state hides items from the tree.
- `Page` preserves the existing mount-focus-to-heading behaviour on every
  screen (regression-guarded by the existing tests).
- Every new primitive gets an `expectNoAccessibilityViolations` structural
  check (`src/test/a11y.ts`) in its own test file.
- Automated axe is necessary, not sufficient — the native NVDA/Narrator pass
  already tracked in `docs/VERIFICATION-DEBT.md` is extended to cover the new
  shell and is explicitly still owed.

## 6. Home screen data sources

The Home screens are composed **client-side** from data the app already
exposes wherever possible. Anything that needs a new Rust read is a named,
separately-reviewed slice and Home ships without it first.

### 6.1 Teacher Home

| Block                                        | Source                                                                                                                                       | Status                                   |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| Today's classes + per-class attendance state | `list_schedule_meetings_by_assignment`, `list_subject_attendance_sessions` (same as `TodaysClassesScreen`)                                   | Wired today                              |
| This week's instructional load               | `get_teacher_load`                                                                                                                           | Wired today                              |
| "My sections" / "my learners" counts         | Derived from the adviser/assignment + roster reads the app already makes; **may** be folded into one small aggregate read for efficiency     | Wired today (aggregate optional, Wave 3) |
| "Needs your attention" list                  | Composed client-side from the three rows above (unmarked class, partial class, pending SF2 sign-off if the adviser view already surfaces it) | Wired today                              |
| ~~"Unsaved scores" KPI~~                     | No real backend signal exists                                                                                                                | **Cut** — not invented                   |

### 6.2 School Head Home

| Block                                                                    | Source                                                                              | Status                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Sections / learners / advisers-assigned counts; sections with no adviser | Existing section + `section_advisories` reads; likely one aggregate read            | Wave 3 (aggregate), can start from existing per-entity reads                                                |
| Recent SF1 imports                                                       | Existing import-history read                                                        | Wired today                                                                                                 |
| Per-teacher teaching load                                                | `get_teacher_load` per member + `list_school_members`                               | Wired today                                                                                                 |
| **School-wide attendance today (% and by grade)**                        | **New read** — a school-scoped, capability-gated attendance rollup for a given date | **Wave 4** — own slice, own independent security review; School Head Home ships in Wave 3 without this card |

Every new read: `school_id` derived server-side from the session (never a
client parameter), gated through the existing `authorize_*` pattern, unit- and
command-boundary-tested, no new capability unless genuinely required (decided
in the slice).

## 7. Screen migration inventory

Default action = "re-fit onto `Page` + the new primitives; same content, same
flow, same tests adjusted only for new DOM structure". Screens needing more
than that are flagged.

**Daily Teaching**

| Screen                    | Action                                                                                                                            |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `TodaysClassesScreen`     | Re-fit; used as a primitives proof in Wave 2                                                                                      |
| `SubjectAttendanceScreen` | Re-fit; roster table → `DataTable` with the block-reflow prop (removes hand-written media query)                                  |
| `AttendanceScreen`        | Re-fit; same `DataTable` treatment                                                                                                |
| `MonthlySummaryScreen`    | Re-fit shell/header only; **keep** its bespoke sticky-column horizontal-scroll grid (ADR-0033) — do not force it into `DataTable` |
| `SubjectMonitorScreen`    | Re-fit                                                                                                                            |
| `AdviserViewScreen`       | Re-fit                                                                                                                            |

**Learner Records**

| Screen                | Action                                                                                                                                |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `SectionsScreen`      | Re-fit; primitives proof in Wave 2                                                                                                    |
| `SectionRosterScreen` | Re-fit; list/table → `DataTable`; keep the inline transfer/end/correct panel pattern                                                  |
| `LearnerListScreen`   | Re-fit; keep the inline duplicate-warning panel and inline-edit pattern                                                               |
| `Sf1ImportScreen`     | Re-fit shell/header; the summary strip and comparison table become `Card` + `DataTable` instances; `Sf1DuplicateReview` restyled only |

**Grading**

| Screen                 | Action                                                                                                                     |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `GradingPeriodsScreen` | Re-fit                                                                                                                     |
| `ClassRecordsScreen`   | Re-fit                                                                                                                     |
| `ClassRecordWorkspace` | Re-fit; score-entry table → `DataTable` block-reflow prop; **keep** keyboard entry model and `:focus-within` row highlight |

**Security**

| Screen           | Action                            |
| ---------------- | --------------------------------- |
| `AuditLogScreen` | Re-fit; event table → `DataTable` |

**Cross-cutting**

| Screen                                                         | Action                                                                                           |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `LoginScreen`                                                  | Restyle to the new surfaces; **not** inside the shell (pre-auth). Keep three-mode + Guided hints |
| `FirstRunSetupScreen`                                          | Same as Login                                                                                    |
| `TeacherWorkspaceScreen`                                       | **Deleted** — content moves into `TeacherHome`                                                   |
| `IdleTimeoutWarning`                                           | Behaviour unchanged; restyle only                                                                |
| Contextual screens (`teaching-assignments`, `section-adviser`) | Re-fit; still reached only via handoff, breadcrumb shows parent group                            |

Schedule builder (`ScheduleMeetingsScreen`) and `TeacherLoadScreen`: re-fit,
no flagged extras.

## 8. Rollout — waves

Each wave is an independent, CI-green checkpoint under the project's
autonomous-wave rules: `npm run quality` (+`quality:full` at the wave
boundary), architecture check, build, `check:dev-preview-isolation`,
`harness:verify` unchanged, and the independent reviews named below (with the
established "reviewer harness failure → rigorous self-review + retained debt"
fallback).

| Wave                                  | Scope                                                                                                                                                                                                                                                                                | Independent review                                                           |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| **1 — Tokens + shell**                | Additive tokens (contrast-verified) + `AppLayout` / `Sidebar` / `TopBar` / `BottomNav` / `icons.tsx` + extended nav data + `App.tsx` rewired. **Every existing screen renders unchanged inside the new shell.** No screen redesign, no `Page`/primitive yet. Write the redesign ADR. | accessibility-reviewer, teacher-ux-reviewer, architecture-reviewer           |
| **2 — Layout primitives**             | `Page` (folds in `PageHeader`), `KpiStrip`/`Kpi`, `BentoGrid`/`Card`, `DataTable` + full test files. Migrate `SectionsScreen` and `TodaysClassesScreen` as proof.                                                                                                                    | accessibility-reviewer, teacher-ux-reviewer                                  |
| **3 — Role-adaptive Home**            | `HomeScreen` + `TeacherHome` (absorbs `TeacherWorkspaceScreen`, delete the old file) + `SchoolHeadHome` **without** the attendance rollup card. Wire to existing data only. Make Home the default signed-in tab.                                                                     | accessibility-reviewer, teacher-ux-reviewer                                  |
| **4 — School-wide attendance rollup** | New school-scoped, capability-gated attendance-today read (Rust) + wire the card into `SchoolHeadHome`.                                                                                                                                                                              | security-reviewer (mandatory — new tenant-scoped read), reliability-reviewer |
| **5+ — Screen re-fit batches**        | Remaining screens onto the primitives, grouped by nav cluster, ~3–5 screens per wave, per §7. Any screen needing real IA change is split into its own slice with its own review.                                                                                                     | accessibility-reviewer + teacher-ux-reviewer per batch                       |

Motion, the phone drawer/bottom-nav, and accessibility are built **into**
each wave, not deferred to a cleanup pass.

## 9. Testing strategy

- **TDD** for `AppLayout` drawer/focus behaviour, `Sidebar` collapse
  persistence, `DataTable` reflow prop, and the `HomeScreen` role switch —
  these are behavioural, write the failing test first.
- UI-only re-fits may follow implementation with a same-commit test, but no
  screen ships without its adjusted structural + axe tests passing.
- Every new primitive: a `.test.tsx` with rendering, prop behaviour, and
  `expectNoAccessibilityViolations`.
- Existing focus-on-mount tests must pass **unmodified** after `Page` folds in
  `PageHeader` — that is the regression guard for the mount-focus behaviour.
- Contrast: the `node` script output for each new token pasted into the ADR
  and the `styles.css` inline comment.
- `npm run quality:ui` (Playwright/axe) on the dev-preview where the screen is
  reachable; the native NVDA/Narrator gap stays recorded in
  `VERIFICATION-DEBT.md` and is explicitly extended to the new shell.
- Bundle size watched per wave (ADR-0031 precedent) — the inline icon set and
  new CSS are expected to add a small, disclosed amount.

## 10. Risks, follow-ups, open questions

- **ADR to write (Wave 1):** this spec becomes a durable ADR (the redesign
  supersedes the app-shell parts of ADR-0031 §4 and the nav parts of
  ADR-0030's programme). ADR records the final token values + contrast
  numbers, the landmark/`aria-current` mechanism, and the wave list.
- **Spec location:** placed at `docs/superpowers/specs/` per the brainstorming
  process. If the owner prefers it under `docs/adr/` or `docs/product/`, move
  it before Wave 1 — content is unaffected.
- **`aria-label="Primary"` duplication** between sidebar and bottom nav on
  phone: resolved in Wave 1 implementation, written into the ADR (candidate:
  bottom nav is `aria-hidden` while it mirrors the sidebar, exposed only when
  it is the sole nav). Not left ambiguous past Wave 1.
- **`localStorage` for nav-group collapse:** per-device convenience only,
  wrapped in try/catch, correct default (all groups expanded) when it throws
  or is empty. No security or sync implication.
- **Teacher Home "needs attention" scope creep risk:** it is a _view_ composed
  from already-loaded data, not a notification system. If a real
  notification/reminder backend is ever wanted, that is a separate spec.
- **Android is still "later":** this spec makes it cheaper, it does not start
  it. No Tauri-mobile build target, signing, or Play Console work is in
  scope here.
- **Reviewer-harness reliability:** `teacher-ux-reviewer` /
  `accessibility-reviewer` have failed to return findings before (ADR-0027).
  The established fallback applies per wave; independent-review debt is
  retained in the handoff, not dropped.

## 11. Reference

- Interactive mockup produced during this design session (shell, both Home
  variants, Attendance, Class Record, primitives under all three density
  modes): published Artifact `be0fe9f9-7566-4f50-9149-845a76a95e42`.
- Source file kept at
  `<session scratchpad>/likha-redesign.html` for the duration of the session;
  not committed to the repo.
