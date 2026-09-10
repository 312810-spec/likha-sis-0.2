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

### Owner directives (2026-09-10, after Wave A)

- **Autonomous continuation** through the wave sequence is authorised;
  stop only at a real approval gate, an unresolvable blocker, or a
  context boundary.
- **File deletions: none during the program.** Superseded UI files
  (`TeacherWorkspaceScreen`, `PageHeader`, per-screen `@media` reflow
  blocks, etc.) are left in the tree, unreferenced once their
  replacement ships. A single consolidated deletion list is produced at
  the end (Wave M) for one approval.
- **Expectation prototype** (`https://likha-premium-preview.alotski15.chatgpt.site`)
  is fetched and used as a visual/interaction reference — a promise, not
  a spec; no code copied. Observations recorded in §9 below.
- **Teacher Home IA (Wave D)**: the new information architecture is
  **proposed in this document first and approved by the owner before any
  Wave D implementation.** Waves B and C proceed autonomously.

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

---

## 9. Expectation prototype — access attempt (2026-09-10)

`https://likha-premium-preview.alotski15.chatgpt.site` is served entirely
behind a **"Continue with ChatGPT" OpenAI sign-in wall** — every path
(`/`, `/index.html`) returns the same "Sign in required" screen. The
prototype content is not reachable without authenticating, which is a
prohibited action for this agent (signing in / entering credentials on
the owner's behalf).

**Consequence:** Waves B–D proceed from the written `design_philosophy`
and `visual_direction` in the master brief and from the repository's own
`DESIGN.md` / ADR-0031 / ADR-0064 decisions — not from the prototype.
This is recorded as an evidence gap, not fabricated around. If the owner
wants the prototype used as a reference, options are: (a) paste
screenshots or an export into the repo under `docs/design/prototype/`,
(b) make the site publicly reachable, or (c) describe the specific
treatments they want carried over.

---

## 10. Wave D — Teacher Home IA proposal (OWNER APPROVAL REQUIRED)

Per the owner directive, Wave D does not start until this section is
approved. Nothing below is implemented yet.

### 10.1 What the teacher Home is today

`HomeScreen` renders `TeacherWorkspaceScreen` (still on the legacy
`PageHeader`, not the `Page` primitive; no mount-focus — a focus-model
outlier). Its structure:

1. `PageHeader` — "Welcome, {displayName}" + a Guided-only hint paragraph.
2. `workspace-summary` — one sentence: "N learners across M sections."
3. **"Today's attendance"** — a priority rail (`ul.workspace-priority-rail`)
   of the teacher's sections, sorted `not-started → partial → complete →
no-learners`, then alphabetical. Each row: section name + grade, a
   `StatusChip` (not-started/partial/complete/no-learners), the open
   grading period (or "no grading period currently open"), and one
   primary action (Mark / Continue / Review attendance, or Manage
   sections when no learners).
4. **"Recent sign-in activity"** — last 5 audit-log entries + "View all".

Data sources (all already fetched elsewhere, no new backend read):
`learnerService.listLearners`, `sectionService.listSections`,
`gradingService.listPeriodsBySchoolYear`, `attendanceService.rosterForDate`,
`authService.listAuditLog`. Split loading: the attendance overview and
the activity list fail/retry independently.

### 10.2 Problems to fix (not "make it prettier")

- **Marketing-style greeting** ("Welcome, {name}") as the page's largest
  element — PI anti-pattern (oversized headings in work screens).
- **`<h3>` section headings under a `PageHeader` `<h1/h2>`** with nothing
  at the intervening level, and **no mount focus** — inconsistent with
  every `Page`-based screen.
- **Recent sign-in activity is given equal visual weight** to today's
  attendance, though it is rarely the teacher's next action. It is also
  school-wide auth noise, not this teacher's work.
- **Grading-period status is buried** as muted text per row; a teacher
  who needs to enter grades has no path from Home.
- **No "today's classes" (subject attendance) presence** — the golden
  flow names Class/Workspace, and `TodaysClassesScreen` /
  `SubjectAttendanceScreen` exist, but Home only surfaces homeroom
  (daily) attendance.
- **No persistence/offline signal** — Home never tells the teacher
  whether their device is syncing (the Wave C vocabulary now exists to
  express this).

### 10.3 Proposed IA — "one operational brief, one dominant surface"

One `Page` (`title="Home"`, mount-focus, Guided `hint`). Below it, a
single dominant work surface plus two quiet secondary regions. **No KPI
strip. No bento grid of equal cards.**

**Zone 1 — Primary: "What needs you today" (the dominant surface).**
A single ordered list that merges _both_ attendance duties the teacher
actually has, ranked by urgency:

- Homeroom (daily) attendance per advisory section — the current
  `not-started → partial → complete` ranking, unchanged.
- Subject attendance per class scheduled today (from
  `subjectAttendanceService` / today's classes) — same
  not-started/partial/complete idea.

Each row: what it is (section/subject + grade), a `StatusChip` state
label (non-color, unchanged tone mapping), and **one** primary action
(Mark / Continue / Review). Rows the teacher has finished collapse to a
quiet "done" style but stay visible (Guided/Comfortable parity — nothing
is removed). If the teacher has no advisory and no classes today, this
zone shows a calm `EmptyState`, not an error.

**Zone 2 — Secondary: "Grading" (contextual, only when relevant).**
A compact line per section with an _open_ grading period: "{period} is
open — {n} class records" + a "Open class records" action. Sections with
no open period are not listed here. If no period is open anywhere, the
whole zone is omitted (progressive disclosure). Data:
`gradingService.listPeriodsBySchoolYear` (already fetched) +
`sectionService`. No new read.

**Zone 3 — Secondary: "Your device" (one line).**
A single `StatusChip` + sentence using the Wave C vocabulary:
`synced` / `pending-sync` / `failed` / `offline`, from
`syncStatusService.getStatus` (the read `SyncStatusScreen` already
uses). One line, not a card. Links to Sync Status for detail. This is
the local-first honesty signal the brief asks Home to carry.

**Removed from Home:** "Recent sign-in activity". It moves entirely to
`Sign-in Activity` (`AuditLogScreen`), which already exists and is
linked from the nav. Rationale: it is school-wide security telemetry,
not this teacher's work, and it competed with the primary zone. (If the
owner wants a security presence on Home, the smallest honest version is
a single line — "Last sign-in: {when}" for _this_ user — but the
proposal is to remove it.)

**School-head branch:** unchanged this wave — `HomeScreen` still offers
the "School overview" / "My teaching" toggle; only the "My teaching"
side is the rebuilt surface above. `SchoolHeadHome` is a later wave (K).

### 10.4 Modes & responsive

- **Efficient**: Zone 1 only, denser rows, grading + device zones
  collapse to a single link line each. **Comfortable** (default): all
  three zones, comfortable spacing. **Guided**: adds the `hint` and a
  one-line explanation atop each zone. All three keep every action —
  parity preserved.
- **Phone**: the three zones stack; Zone 1 rows become full-width
  stacked blocks (existing `.workspace-priority-item` pattern extended,
  not a new one); primary action is a full-width button. No horizontal
  scroll at 360px.

### 10.5 Data / architecture

- **No new backend read.** Reuses `learnerService`, `sectionService`,
  `gradingService`, `attendanceService`, `subjectAttendanceService`,
  `syncStatusService` — all already wired into `App.tsx` and passed to
  screens. `HomeScreen` gains `syncStatusService` +
  `subjectAttendanceService` props (both already constructed in
  `composition.ts`).
- Split, independent loading per zone (extends the existing two-path
  pattern to three) — one zone failing never blanks another.
- `TeacherWorkspaceScreen.tsx` and `PageHeader.tsx` are **not deleted**
  this wave (owner directive); the rebuilt surface lives in a new
  component (`src/ui/home/TeacherHome.tsx`) that `HomeScreen` renders
  instead of `TeacherWorkspaceScreen`. The old files become unreferenced
  and go on the Wave M deletion list.

### 10.6 Out of scope for Wave D

Attendance screen internals (Wave G), class-records internals (Wave H),
`SchoolHeadHome` (Wave K), any new domain/application/repository method,
any grading or attendance semantic change.

### 10.7 Owner decision needed

1. Approve the three-zone IA (Primary duties / Grading / Your device)?
2. Approve **removing** "Recent sign-in activity" from Home (vs. keeping
   a one-line "last sign-in" for the current user)?
3. Approve merging homeroom + subject attendance into one ranked Zone 1
   list (vs. keeping Home to homeroom only, as today)?

---

## 11. Wave F & G execution notes (2026-09-10)

### Wave F — daily teaching workspace (shipped, commit 772c292)

Inspected all six screens (`MyDayScreen`, `TodaysClassesScreen`,
`ScheduleMeetingsScreen`, `SubjectMonitorScreen`, `AdviserViewScreen`,
`TeacherLoadScreen`). Five are already action-centred, on the `Page`
primitive, single-purpose, with restrained (decision-relevant) metrics
and clear "this is a monitoring tool, not the official record" framing —
**no valuable low-risk change**, so none was made (scope discipline, not
capacity-filling). Only `MyDayScreen` had a real consistency gap: its
"Needs your attention today" rows used a bare
`<span class="field-hint">` for status. Now `StatusChip` — `warning`
"Not checked" for pending attendance, the Wave C `conflict` vocabulary
for pending sync conflicts. Layout / behaviour unchanged.

### Wave G — attendance & roster ops (partially shipped)

**Shipped**: one defensive CSS rule — `overflow-wrap: anywhere` on the
learner-name cells of `.attendance-roster` and `.section-roster`, so a
long compound Filipino given name or hyphenated double surname wraps in
the name column instead of forcing the whole roster to scroll sideways
(verification-matrix "no horizontal clipping" / "long names").

**Deliberately deferred, with reasons:**

1. **`DataTable` / `reflowAt` migration** of `AttendanceScreen`,
   `SubjectAttendanceScreen`, `SectionRosterScreen`,
   `ClassRecordWorkspace`. This was already deferred by ADR-0064 Wave 6's
   own independent review as "risk disproportionate to the benefit" —
   each carries a bespoke keyboard-interaction model (P/A/T + ↑/↓ on
   attendance; Enter/blur-save + `:focus-within` on score entry) whose
   migration needs an independent keyboard-behaviour review to land
   safely. That review harness is non-functional this session (see
   `docs/VERIFICATION-DEBT.md`). The existing per-screen
   `@media (max-width: 640px)` reflow blocks work and are tested. Revisit
   when the reviewer harness is healthy.
2. **`MonthlySummaryScreen` sticky-column long-name handling**
   (`.monthly-summary th[scope="row"] { white-space: nowrap }`). A very
   long name widens the sticky first column and squeezes the day grid.
   Fixing it well (truncate + `title`, or a measured `max-width`) is a
   layout change to the deliberate sticky-column design (ADR-0033 §5)
   that must be **visually verified** — and this environment has no
   browser/screenshot for the compiled binary. Deferred to a session
   with visual tooling, or to Wave M's native pass.

---

## 12. Wave H execution notes (2026-09-10)

**Wave H — class records, grading, assessment.** Inspected
`ClassRecordsScreen`, `ClassRecordWorkspace`, `GradingPeriodsScreen`,
`AssessmentAuthoringScreen`. The brief's Wave-H asks are **already
satisfied** in this codebase:

- **Calculated vs. entered**: `ClassRecordWorkspace` / `AssessmentAuthoringScreen`
  use `StatusChip` "Not recorded" for empty scores and a "Saved {time}"
  note for persisted ones; entered scores sit in labelled inputs.
- **Policy / version context**: `GradingPeriodsScreen` shows the selected
  policy's `sourceCitation`; `ClassRecordsScreen` shows the DepEd
  weighting name on every record and warns "a wrong pick would compute
  the wrong grade".
- **Silent data loss prevented**: item deletion is a two-step confirm
  ("Delete this item? This can't be undone." → "Confirm delete"), and is
  refused outright once scores exist ("Can't delete — already has
  recorded scores").
- **Destructive actions behind confirmation**: as above.

**Shipped** (commit — see git log): the one gap — `GradingPeriodsScreen`'s
saved-period status cell rendered the bare word "Saved". Now
`<StatusChip tone="success">Saved</StatusChip>`, matching the status
vocabulary and adding the non-color cue. No grading math, policy, or
data contract touched.

`ClassRecordWorkspace`'s score-entry keyboard/commit model
(Enter/blur-save + `:focus-within`) is deliberately left untouched — same
reason as the Wave G `DataTable` deferral (needs an independent
keyboard-behaviour review; harness down this session).

---

## 13. Wave I execution notes (2026-09-10)

**Wave I — learner / section / enrollment / transfer.** Wave scope
defined via `prompt-master` first (owner instruction: every wave starts
with a prompt-master pass). Inspected `LearnerListScreen`,
`SectionsScreen`, `SectionRosterScreen`, `TeachingAssignmentsScreen`,
`SectionAdviserScreen`, `Sf1ImportScreen`.

**Outcome: no code change.** All six are already on the PI bar:

- **`LearnerListScreen`** — `Page`, client-side name+LRN search (the
  full roster is already loaded; a filter, not a query), enrollment
  history collapsed behind a per-row toggle, per-row SF10 export with
  scoped error/reveal. LRN is shown inline in the roster list — kept: it
  is load-bearing for disambiguating learners with similar Filipino
  names, not decoration, and the brief's "minimise PII" rule is about
  not _adding_ sensitive fields, not hiding a working identifier. No
  ad-hoc status text.
- **`SectionsScreen`** — section list + create + enroll panel + SF6
  export. A section has no record-state to chip. `Page`, clear headings.
- **`SectionRosterScreen`** — explicitly out of scope (transfer /
  end-enrollment / correct-placement flows are domain-adjacent and
  complex; need an independent review, harness down). Already got the
  Wave G long-name CSS rule.
- **`TeachingAssignmentsScreen`** — assign / unassign teacher per
  subject; no status state to represent.
- **`SectionAdviserScreen`** — "Current adviser" `<h3>` + `<p>` vs.
  `EmptyState "No adviser is currently assigned"`. The binary state is
  already communicated with non-color structural cues; a `StatusChip`
  here would be decoration.
- **`Sf1ImportScreen`** — already carries a complete, correct
  `StatusChip` set (New / Already in LIKHA / Need your review / Has an
  error). Its import/duplicate logic is out of scope.

No gratuitous PII, no analytics-for-completeness, search/history/
sensitive-data handling already match the PI patterns. `npm run quality`
unaffected (no code touched) — last green run: **115 files / 1132
tests** at Wave H.

---

## 14. Wave K execution notes (2026-09-10)

**Wave K — administration / governance / devices / sync.** Scoped via
`prompt-master` first. Inspected `AuditLogScreen`,
`AdminPasswordResetScreen`, `SchoolMembershipScreen`,
`DeviceManagementScreen`, `SchoolBrandingScreen`; re-verified
`SyncStatusScreen` and `ConflictReviewScreen` (Wave C).

**Outcome: no code change.** These are the most security-sensitive
screens in the app and were already built to the bar the brief asks
for:

- **`AuditLogScreen`** — `Page`; each event row is a `StatusChip` with a
  per-event tone (`EVENT_TONES`); the label text carries the meaning.
- **`AdminPasswordResetScreen`** — `Page`; a Guided hint states the
  action and its purpose ("a colleague who has forgotten theirs or is
  locked out"); confirmation on success; permission-aware failure copy.
- **`SchoolMembershipScreen`** — `Page`; **two-step** plain-language
  confirmations for member removal _and_ role revocation, each stating
  the consequence in the panel; fail-closed messaging for "would leave
  the school without a School Head"; `role="group"` on the confirm
  panels. Untouched — this is exactly the reintroduction risk
  `.claude/rules/security-privacy.md` warns about.
- **`DeviceManagementScreen`** — `Page`; two-step confirm with the
  consequence ("stops syncing right away, and this cannot be undone")
  _and_ the reversibility ("if it is still in use, it can enroll
  again") both stated in the panel; focus moves into the confirm panel;
  generic fail-closed error. Untouched.
- **`SchoolBrandingScreen`** — `Page`; permission-aware error copy;
  the DepEd-seal prohibition is documented in the file. Logo removal is
  low-consequence and trivially reversible (re-upload), so a single
  action is right — no two-step needed.
- **`SyncStatusScreen` / `ConflictReviewScreen`** — already carry the
  Wave C persistence/sync vocabulary chips.

Consequence, reversibility, active scope, and actor are already explicit
where they matter; security is enforced server-side with fail-closed
copy, never by hiding a control. No progressive-disclosure gap worth a
change. `npm run quality` unaffected — last green **115 files / 1132
tests** (Wave H).

**Owed** (harness down all session): independent security + a11y review
of the whole A–K surface. Recorded in `docs/VERIFICATION-DEBT.md`.

---

## 15. Wave J execution notes (2026-09-10)

**Wave J — official-forms & output workspace.** Scoped via `prompt-master`
first; split into an autonomous Part A (audit the existing export UI)
and a gated Part B (net-new aggregator screen + template fidelity).

### Part A — export entry points: assessed, no code change

Inspected `Sf1ImportScreen`, `MonthlySummaryScreen`,
`SectionRosterScreen`, `LearnerListScreen`, `SectionsScreen`. The
existing DepEd-form export UI **already exceeds the Wave J bar** and was
clearly built with this exact concern in mind:

- **Honest disclosure everywhere.** MonthlySummary: "not a verified,
  submission-ready reproduction of the official form"; per-export:
  "DepEd-SF2-inspired, not a submission-ready reproduction". SectionRoster:
  "SF1 and SF9 use a synthetic, DepEd-style template — neither has been
  verified against an official DepEd source. Confirm your school's actual
  SF1/SF9 requirements…".
- **Structured omission disclosure.** Each export result carries a
  `disclosure.omittedFields` list that the screen renders to the teacher
  — the UI shows exactly what the file leaves out.
- **Consistent confirmation pattern.** "Saved to `{filePath}`" + an
  "Open folder" reveal action + reveal errors as `role="alert"`, across
  SF2 / SF4 / SF5 / SF1 / SF10 / SF6.
- **Permission-aware failure copy.** e.g. SF5: "you may not have
  permission to export this section (only the assigned class adviser or
  School Head can export it), or learning records are incomplete."
- `Sf1ImportScreen` carries the full `StatusChip` set (New / Already in
  LIKHA / Need your review / Has an error).

No safe, valuable change exists without touching generated output or its
disclosures — which is forbidden. `npm run quality` unaffected; last
green **115 files / 1132 tests** (Wave H).

### Part B — gated, needs owner sign-off before Wave J is "complete"

1. **New "Official Forms" aggregator workspace** — a single
   screen/nav destination listing every DepEd form with per-form
   readiness/validation status, disclosure, preview, export, and export
   history/remediation. This is **net-new product IA**, not a visual
   pass. Owner decision: build it, or keep the current per-context model
   (each form exported from the screen that owns its data)?
2. **Template fidelity** — making any form genuinely
   template-faithful / submission-ready requires a `deped-researcher`
   primary-source pass + explicit authorization. Out of autonomous
   scope; not attempted.

Until Part B is decided, Wave J is **Part A complete / Part B blocked**.

---

## 16. Wave L execution notes (2026-09-10)

**Wave L — Android-specific adaptation.** Scoped via `prompt-master`
first. This environment has no Android device, emulator, or
real-viewport browser, so the brief's core Wave-L verification
("intentionally recomposed, not compressed") could not run — it is
recorded as debt (`docs/VERIFICATION-DEBT.md`). Only inspection-
verifiable, standard mobile hardening was done.

### Shipped (CSS + one `index.html` meta attribute)

1. **`index.html`** — `viewport-fit=cover` added to the viewport meta.
   Without it, `env(safe-area-inset-*)` returns `0` in the Android
   WebView, so the safe-area padding **already present** in
   `styles.css` (`.app-bottomnav`) was inert. This one attribute
   activates it. No visual change on desktop / static preview
   (`env()` → 0 there).
2. **`.app-topbar` (≤860px)** — `padding-top` now includes
   `env(safe-area-inset-top)` for notch clearance on the sticky bar.
3. **`.app-canvas` (≤860px)** — phone `padding-bottom` now adds
   `env(safe-area-inset-bottom)` so the last row clears both the fixed
   bottom nav and the device home indicator.
4. **Touch-target floor (≤640px)** — `button, input, select, textarea,
a.button-primary, [role="button"]` get `min-height: 44px`
   **regardless of teacher-mode density**. Rationale: the brief
   requires ≥44px mobile targets and forbids inferring behaviour from
   the device, but Efficient mode shrinks `--control-height` to 34px.
   Checkboxes/radios are exempted (they keep their own ≥24px sizing);
   `.link-button` keeps `min-height: 0` (higher specificity) so an
   inline text link is not stretched.

`npm run quality` exit 0 — Vitest **115 files / 1132 tests** (unchanged).
`npm run build` ok, CSS gzip 6.51 kB, no new dependency.

### Deferred to a real device / emulator pass (VERIFICATION-DEBT)

- Whether each priority workflow is genuinely recomposed vs. merely
  compressed at 360–412px.
- On-screen-keyboard overlap of inputs and any sticky action; rotation
  / landscape layout; gesture-nav-bar overlap in practice; scroll
  performance on modest hardware; touch-vs-hover state correctness.
- Bottom sheets / additional sticky action bars were **not** added —
  they need device UX validation first.
