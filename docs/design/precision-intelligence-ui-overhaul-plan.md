# Precision Intelligence — Whole-Product UI/UX Overhaul Plan

Status: **Active** — canonical implementation plan for the Precision
Intelligence program. Supersedes nothing in domain/auth/sync; it is the
plan of record for the presentation layer only.

Branch: `feat/precision-intelligence-shell` (cut from `main` at
`f4b75a1`, 2026-09-10).

Owner decision on record: the owner selected **Option A** — bootstrap
Precision Intelligence in this repository from `main`, treating it as the
evolution of the existing "Calm Civic Classroom" / ADR-0064 redesign
rather than a throw-away restart. ADR-0070 records the design-language
supersession scope.

---

## 1. Verified repository & branch state (Phase 0)

| Item                                                            | Finding                                                                                                                                                                                                                                                                                                   |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Prior checkpoints `ab03d36`, `3b6b5cb`                          | **Do not exist** anywhere reachable (local, `origin/*`, reflog, stash, `git log --all`). Nothing to preserve or rebase onto.                                                                                                                                                                              |
| `origin/feat/precision-intelligence-shell`                      | Existed on the remote but was byte-identical to `main` (`git rev-list --left-right --count` → `0 0`). No prior Precision Intelligence commits.                                                                                                                                                            |
| ADR-0070                                                        | Did not exist before this program. Latest ADR on `main` was `0069`. Authored now as part of this plan.                                                                                                                                                                                                    |
| `AppearanceProvider`, device-local Light/System/Dark preference | **Absent.** Dark mode today is a single `@media (prefers-color-scheme: dark)` block in `src/ui/theme/styles.css` with no user override and no toggle.                                                                                                                                                     |
| `docs/design/`, `docs/plans/`                                   | Did not exist. `docs/design/` created by this file.                                                                                                                                                                                                                                                       |
| Existing redesign track                                         | **ADR-0064 "UI Redesign Shell" (Accepted, Waves 1–6)** — the real, merged redesign. "Calm Civic Classroom" palette (`DESIGN.md`), Public Sans, `src/ui/shell/{AppLayout,Sidebar,TopBar,BottomNav}`, layout primitives `Page`/`KpiStrip`/`Kpi`/`BentoGrid`/`Card`/`DataTable`, role-adaptive `HomeScreen`. |
| Baseline quality gate                                           | `npm run quality` on the branch point — _result recorded in the checkpoint report and ADR-0070 §Verification._                                                                                                                                                                                            |

**No domain, application, infrastructure, Rust, migration, sync, auth,
grading, or official-form code is in scope for this program** except
read-only inspection and, if a non-UI contract change is unavoidable, a
written proposal + approval gate before any edit.

---

## 2. Current UI inventory

### 2.1 Shell (`src/ui/shell/`)

`AppLayout` (CSS-grid, drawer a11y contract: focus-in/trap/Escape/return,
phone-width `inert` gating), `Sidebar` (one instance, reused as phone
drawer via CSS; pinned Home + 8 collapsible groups persisted to
`localStorage`), `TopBar` (breadcrumb, desktop density-mode switcher,
identity line, sign-out, hamburger), `BottomNav` (phone-only 5-item bar).
Pre-auth (`LoginScreen`, `FirstRunSetupScreen`, status check) renders in
an `.app-boot` container **outside** the shell.

### 2.2 Navigation model

Not a router — `App.tsx` holds `activeTab: SignedInTab` (26 values) plus
seven narrowly-typed contextual-handoff `useState` variables
(`attendanceSectionId`, `rosterSectionId`, `monthlySummaryContext`,
`subjectAttendanceAssignmentId`, `teachingAssignmentsSection`,
`sectionAdviserSection`, `scheduleMeetingsAssignment`). Contextual
sub-screens (`section-roster`, `teaching-assignments`, `section-adviser`,
`schedule-meetings`) have a label but no `NAV_GROUPS` entry and fall back
to `SectionsScreen` when reached without context.

`NAV_GROUPS` (`src/ui/components/workbench-nav-data.ts`): Daily Teaching ·
Class Overview · Learner Records · Grading · Creation Studio · Sync ·
Security (8 groups incl. an implicit Home).

### 2.3 Screens (`src/ui/`, 31 files)

| Persona surface      | Screens                                                                                                                                                        |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pre-auth / trust     | `LoginScreen`, `FirstRunSetupScreen`, `IdleTimeoutWarning` (overlay)                                                                                           |
| Home                 | `HomeScreen` → `TeacherWorkspaceScreen` (teacher branch, still on `PageHeader`, not primitives) / `home/SchoolHeadHome` (on primitives)                        |
| Daily teaching       | `MyDayScreen`, `TodaysClassesScreen`, `AttendanceScreen`, `SubjectAttendanceScreen`, `MonthlySummaryScreen`                                                    |
| Class overview       | `SubjectMonitorScreen`, `AdviserViewScreen`, `TeacherLoadScreen`                                                                                               |
| Learner records      | `LearnerListScreen`, `SectionsScreen`, `SectionRosterScreen`, `Sf1ImportScreen`, `TeachingAssignmentsScreen`, `SectionAdviserScreen`, `ScheduleMeetingsScreen` |
| Grading & assessment | `GradingPeriodsScreen`, `ClassRecordsScreen`, `ClassRecordWorkspace`, `AssessmentAuthoringScreen`                                                              |
| Creation studio      | `LessonPlanScreen`                                                                                                                                             |
| Sync                 | `SyncStatusScreen`, `ConflictReviewScreen`                                                                                                                     |
| Admin / governance   | `AuditLogScreen`, `AdminPasswordResetScreen`, `SchoolMembershipScreen`, `DeviceManagementScreen`, `SchoolBrandingScreen`                                       |

### 2.4 Shared components (`src/ui/components/`)

`Alert`, `Loading`, `EmptyState`, `StatusChip`, `PageHeader` (legacy —
one remaining consumer), `Page`, `KpiStrip`/`Kpi`, `BentoGrid`/`Card`,
`DataTable`, `RequiresInternetGate`, `Sf1DuplicateReview`, `icons` (hand-
written inline SVG set). Theme: `src/ui/theme/` — `styles.css` (2012
lines, one file), `ModeContext`/`modes`/`useTeacherMode` (density modes).

### 2.5 Token architecture (`styles.css` `:root`)

Semantic color roles (`--color-bg`, `-surface`, `-surface-2`,
`-border`/`-border-soft`, `-text`/`-text-muted`, `-primary`/`-primary-wash`,
`-productive`, `-success`, `-warning`, `-danger`, each `+ -surface`
tint, `-focus`), spacing unit, type scale, `--control-height`, radii,
two elevation levels, focus-ring tokens, motion tokens. Density via
`:root[data-teacher-mode="efficient|guided"]` overrides. Dark via one
`@media (prefers-color-scheme: dark)` block. All contrast pairs computed
and recorded in ADR-0031 / ADR-0064 — **not re-derived here.**

---

## 3. Highest experience risks (ranked by task risk × frequency)

1. **No appearance control.** Dark mode is OS-only; a teacher on a shared
   Windows machine set to light cannot choose dark (or vice-versa) for
   their session. Fails the program's "Light, System, and Dark equally"
   objective. → **Wave A (this session).**
2. **Teacher Home is not on the design system.** `TeacherWorkspaceScreen`
   still renders on `PageHeader`, gets no mount-focus, and is a
   focus-model outlier vs. every `Page`-based screen (ADR-0064 Wave 6
   backlog). Highest-frequency screen. → Wave D.
3. **Persistence/sync honesty is uneven.** `StatusChip` exists but
   local-saved / pending-sync / conflict / failed states are not a
   consistent, audited vocabulary across attendance, grading, roster,
   and forms. → Waves D, G, H, J.
4. **Card-density drift.** `KpiStrip` + `BentoGrid` were adopted from a
   dashboard reference (ADR-0064); PI's principle is "one dominant work
   surface over grids of equally weighted cards." Some surfaces need
   re-weighting, not more cards. → Waves D, F, K.
5. **Pre-auth screens are unstyled-pass only** (ADR-0064 Wave 6 backlog:
   "Login / First-run restyle"). First impression + trust language. →
   Wave E.
6. **Table screens carry bespoke `@media` reflow blocks** instead of
   `DataTable`'s `reflowAt` (Attendance, Subject Attendance, Section
   Roster, Class Record Workspace). Divergent mobile behavior. → Waves G, H.
7. **No skip-to-content link; `.app-topbar-menu` is 40×40** (WCAG 2.5.8
   passes, 2.5.5 does not) — ADR-0064 Wave 6 minors. → Wave B.
8. **Android is compressed desktop, not recomposed.** No intentional
   small-screen workflow design yet. → Wave L.

---

## 4. Token & component architecture (proposed, evidence-based)

**Do not restart the token system.** The `styles.css` `:root` roles are
already semantic and contrast-verified. PI changes are additive/structural:

- **Appearance**: restructure the dark palette so identical values apply
  via (a) `@media (prefers-color-scheme: dark) :root:not([data-appearance="light"])`
  and (b) `:root[data-appearance="dark"]`. "System" = **no attribute**
  (dark mode stays zero-JS). New `src/ui/theme/appearance.ts` +
  `appearance-context-value.ts` + `AppearanceProvider.tsx` +
  `useAppearance.ts`, mirroring the four-file `ModeContext` split exactly
  (required by `eslint-plugin-react-refresh`). First-paint applied from
  `main.tsx` module top (CSP is `null` today but a module read avoids a
  future inline-script CSP break). Control mirrored in `TopBar`
  (desktop) and `Sidebar` (phone drawer), matching the existing
  density-switcher dual placement.
- **Elevation / surface**: keep the two-level elevation token discipline.
  No new shadow system.
- **Motion**: keep the three-duration token set + the single
  `prefers-reduced-motion` collapse. No new motion tokens without a
  concrete relationship-explaining use.
- **Primitives**: `Page`, `Alert`, `Loading`, `EmptyState`, `StatusChip`,
  `Card`, `DataTable` are **retained** and are the PI primitive set.
  `KpiStrip`/`Kpi` retained but **re-scoped** in guidance: a KPI tile is
  for a number that changes a decision, not a dashboard filler.
  `PageHeader` is **replaced** (folded into `Page`) once its last
  consumer (`TeacherWorkspaceScreen`) is migrated.
- **New primitives only on ≥2 proven production usages** (per brief
  Phase 3): candidates are a status/persistence banner vocabulary, a
  confirm-dialog primitive, and a command/search affordance — none built
  until two real callers exist.

Any third-party library (React Aria, Radix, TanStack Table, Storybook,
visual-regression tooling) is an **approval gate** (§ADR-0070, brief
`<approval_gates>` #2). None proposed for Waves A–B.

---

## 5. Route-to-wave migration matrix

Waves are lettered to avoid colliding with the numbered `M*` / `UX-0*` /
ADR-0064 `Wave N` history. Dependency order is top-to-bottom.

| Wave  | Scope                                                                                                                                                                                                                      | Depends on | Screens / files                                                                                                                                                      | Brief phase |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------- |
| **A** | Appearance foundation — provider, CSS restructure, first-paint, `TopBar`+`Sidebar` control                                                                                                                                 | —          | `src/ui/theme/appearance*.{ts,tsx}`, `styles.css`, `src/main.tsx`, `src/App.tsx`, `TopBar`, `Sidebar`                                                                | 2           |
| **B** | Shell finish — skip-to-content link, `.app-topbar-menu`/hamburger ≥44px, focus-return-on-select, focus-trap width guard, appearance+density grouped as one "Display" cluster                                               | A          | `AppLayout`, `Sidebar`, `TopBar`, `styles.css`                                                                                                                       | 2           |
| **C** | Shared primitives audit + persistence/status vocabulary — formalize saved-local / pending-sync / synced / offline / conflict / failed as a `StatusChip` + `Alert` contract with tests                                      | B          | `StatusChip`, `Alert`, new `docs/design/status-vocabulary.md`                                                                                                        | 3           |
| **D** | Golden teacher flow — Home → Class → Attendance → Review/Finish → save/sync feedback → return; rebuild `TeacherWorkspaceScreen` onto `Page`/primitives inside `HomeScreen`; delete `TeacherWorkspaceScreen` + `PageHeader` | C          | `HomeScreen`, `TeacherWorkspaceScreen`(del), `AttendanceScreen`, `TodaysClassesScreen`, `PageHeader`(del)                                                            | 4           |
| **E** | Auth / session / onboarding / trust                                                                                                                                                                                        | B          | `LoginScreen`, `FirstRunSetupScreen`, `IdleTimeoutWarning`, `.app-boot`                                                                                              | 5           |
| **F** | Daily teaching workspace                                                                                                                                                                                                   | D          | `MyDayScreen`, `TodaysClassesScreen`, `ScheduleMeetingsScreen`, `SubjectMonitorScreen`, `AdviserViewScreen`, `TeacherLoadScreen`                                     | 6           |
| **G** | Attendance & roster ops — `DataTable` `reflowAt` migration, long-name/large-roster stress                                                                                                                                  | D          | `AttendanceScreen`, `SubjectAttendanceScreen`, `MonthlySummaryScreen`, `SectionRosterScreen`                                                                         | 7           |
| **H** | Class records, grading, assessment                                                                                                                                                                                         | C          | `ClassRecordsScreen`, `ClassRecordWorkspace`, `GradingPeriodsScreen`, `AssessmentAuthoringScreen`                                                                    | 8           |
| **I** | Learner / section / enrollment / transfer                                                                                                                                                                                  | C          | `LearnerListScreen`, `SectionsScreen`, `SectionRosterScreen`, `TeachingAssignmentsScreen`, `SectionAdviserScreen`, `Sf1ImportScreen`                                 | 9           |
| **J** | Official-forms & output workspace                                                                                                                                                                                          | C, H       | `SectionRosterScreen` export paths, `MonthlySummaryScreen` export, a new forms-readiness surface                                                                     | 10          |
| **K** | Administration / governance / devices / sync                                                                                                                                                                               | C          | `AuditLogScreen`, `AdminPasswordResetScreen`, `SchoolMembershipScreen`, `DeviceManagementScreen`, `SchoolBrandingScreen`, `SyncStatusScreen`, `ConflictReviewScreen` | 11          |
| **L** | Android-specific recomposition                                                                                                                                                                                             | D–K        | shell + priority workflows                                                                                                                                           | 12          |
| **M** | Product-wide hardening + migration ledger                                                                                                                                                                                  | all        | route sweep, a11y/keyboard/responsive/theme matrix, verification-debt update                                                                                         | 13          |

---

## 6. Retain / Evolve / Replace / Defer classification

| Item                                                                        | Class       | Note                                                                                                   |
| --------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------------------------------ |
| `styles.css` semantic color roles                                           | **Retain**  | Contrast-verified; add appearance selectors only.                                                      |
| Public Sans, tabular-nums                                                   | Retain      | ADR-0031 decision stands.                                                                              |
| `AppLayout` drawer a11y contract, `inert` gating                            | Retain      | Fix the 3 recorded minors in Wave B.                                                                   |
| `Sidebar` groups + `localStorage` collapse                                  | Retain      | Re-icon / re-weight in Wave B if needed.                                                               |
| `Page`, `Alert`, `Loading`, `EmptyState`, `StatusChip`, `Card`, `DataTable` | Retain      | PI primitive set.                                                                                      |
| Density modes (`ModeContext`)                                               | Retain      | Appearance provider mirrors its shape.                                                                 |
| `KpiStrip` / `Kpi`                                                          | **Evolve**  | Keep component; tighten usage guidance (decision-relevant numbers only).                               |
| `BentoGrid` usage on Home                                                   | Evolve      | Re-weight toward one dominant surface (Wave D).                                                        |
| `TeacherWorkspaceScreen`                                                    | **Replace** | Rebuild on `Page`/primitives inside `HomeScreen`; delete file (Wave D, approval gate — file deletion). |
| `PageHeader`                                                                | **Replace** | Delete with its last consumer (Wave D).                                                                |
| Pre-auth `.app-boot` visual pass                                            | Evolve      | Wave E.                                                                                                |
| Per-screen `@media` reflow blocks                                           | Replace     | → `DataTable` `reflowAt` (Waves G/H).                                                                  |
| Contextual-handoff `useState` model in `App.tsx`                            | **Defer**   | Works; a router migration is out of scope unless a wave proves need + approval.                        |
| Third-party UI kit adoption                                                 | Defer       | Approval gate; none proposed.                                                                          |

---

## 7. Measurable experience targets (golden flow, Wave D gate)

- Home → mark a full section's attendance → finish → return: **keyboard-
  complete**, no pointer required.
- Every roster row shows an explicit non-color state (`StatusChip` label)
  including "Not marked".
- Persistence state visible at all times: "Saving…" transient, then the
  pressed-state confirmation (established convention); an inline
  scoped-retry on failure.
- Fits **without horizontal scroll** at 360px, 768px, 1280px, and at
  200% zoom / 1280px reflow.
- Action count from Home to "attendance finished" ≤ established baseline
  (measure the current build in Wave D before changing it — no invented
  numbers).
- Light / Dark / System each verified; Efficient / Comfortable / Guided
  each retain full control parity.

---

## 8. First implementation slice — Wave A

**Goal:** device-local Light / System / Dark appearance preference, applied
before first paint, switchable from both the desktop top bar and the
phone drawer, with dark mode still working with zero JavaScript when the
preference is "system".

**Expected changed files:**

- `src/ui/theme/appearance.ts` (new) — `Appearance` type, `APPEARANCES`,
  `DEFAULT_APPEARANCE = "system"`, `APPEARANCE_LABELS`, `isAppearance`,
  `readStoredAppearance()`, `applyAppearance(el, value)`.
- `src/ui/theme/appearance-context-value.ts` (new) — `createContext`.
- `src/ui/theme/AppearanceProvider.tsx` (new) — component only.
- `src/ui/theme/useAppearance.ts` (new) — hook, throws outside provider.
- `src/ui/theme/AppearanceProvider.test.tsx` (new) — TDD: default is
  `system` (no attribute), switch updates context + attribute + storage,
  restore from storage, ignore invalid stored value, hook throws outside
  provider.
- `src/ui/theme/styles.css` — dark palette applied via
  `@media (prefers-color-scheme: dark) :root:not([data-appearance="light"])`
  **and** `:root[data-appearance="dark"]` (identical body, sync-warning
  comment); no color value changed.
- `src/main.tsx` — `applyAppearance(document.documentElement, readStoredAppearance())`
  before `createRoot(...).render(...)`.
- `src/App.tsx` — wrap the tree in `<AppearanceProvider>` (inside or
  around `<ModeProvider>`).
- `src/ui/shell/TopBar.tsx` + `TopBar.test.tsx` — appearance `role="group"`
  segmented control beside the density switcher.
- `src/ui/shell/Sidebar.tsx` + `Sidebar.test.tsx` — same control in the
  `.app-sidebar-modes` region for the phone drawer.
- `docs/adr/0070-precision-intelligence-appearance-foundation.md` (new).
- Project-state docs (`PROJECT-MEMORY.md`, `CURRENT-HANDOFF.md`,
  `ACTIVE-PLAN.md`) updated at the checkpoint.

**Verification plan:** `npm run quality` (typecheck, lint, format:check,
architecture, knip, Vitest) — full gate, exit 0, record test delta vs.
the baseline. `npm run quality:ui` attempted (Playwright browser binary
known-absent → record as debt, not a pass). No Rust touched → Rust gates
unchanged. Manual: describe the reproducible dark/light/system check;
native visual pass owed to `docs/VERIFICATION-DEBT.md`.

**Approval gates triggered:** none for Wave A (no dependency, no file
deletion, no non-UI contract change). Wave D will trip the
file-deletion gate (`TeacherWorkspaceScreen`, `PageHeader`).
