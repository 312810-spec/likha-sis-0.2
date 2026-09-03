# LIKHA-SIS UI Redesign — Wave 5 (Page Scaffold Re-fit) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Put every remaining in-shell screen on the shared `Page` scaffold — one consistent heading / region / mount-focus / Guided-hint treatment — replacing each screen's hand-rolled `<section aria-label><h2 ref tabIndex>` + focus `useEffect` + inline Guided hint. **Presentational wrapper only. No data flow, no behaviour, no table markup changes.**

**Architecture:** Each screen's `return` body is wrapped in `<Page title={…} hint={mode === "guided" ? <the existing hint node> : undefined}>` (from `src/ui/components/Page.tsx`, shipped in Wave 2). The local `headingRef`, the mount-focus `useEffect`, and the `<section>`/`<h2>` wrapper are deleted (`Page` does all three). Everything between the old hint and the closing `</section>` moves inside `<Page>` verbatim. Screens that used `PageHeader` swap it for `Page` wrapping the whole body.

**Tech Stack:** React + TS, Vitest + RTL, `src/test/a11y.ts`.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` §7 (migration inventory — "re-fit onto the new primitives, same content and flow"). Waves 1–4 on this branch.

## Global Constraints

- **Wrapper only.** No change to any `useEffect` other than deleting the one whose _entire_ body is `headingRef.current?.focus()`. No change to state, handlers, service calls, tables, lists, forms, `Alert`/`Loading`/`EmptyState` usage, or CSS classes on inner elements. If a screen's focus `useEffect` also does other work, keep the effect and remove only the `headingRef` lines + the focus call.
- **Accessible names unchanged.** `<Page title="X">` renders `<section aria-label="X">` + `<h2>X</h2>`. Pass the screen's _current_ `<h2>` text as `title` so every `getByRole("region"/"heading", { name })` still resolves. If the current `<h2>` text differs from the `<section aria-label>` (some screens differ), use the `<h2>` text and, only where a test explicitly targets the old region name, update that one assertion to the `<h2>` text (report each).
- **`DataTable` migration is NOT in this wave.** Screens keep their `.attendance-roster` / `.section-roster` / `.score-entry` / `.monthly-summary` tables and their per-screen `@media` blocks exactly as they are. That is a later slice.
- **Every existing test must still pass**, adjusted only where the wrapper markup genuinely moved (a removed `.page-header` div class, a region-name tweak per above). Never weaken a behavioural assertion.
- **`MonthlySummaryScreen`** keeps its bespoke sticky-column scroll grid untouched — only its heading/wrapper becomes `Page`.
- Test-file imports stay as they are (no `react` namespace churn needed for wrapper-only edits).
- Commits: conventional, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch `claude/ui-redesign-wave-1-shell`. Per task `npm run quality` green.
- No Rust. No new dependency. No security-review trigger (no auth/persistence/sync touched).

## Screen inventory (all get the `Page` wrapper; grouped into batches)

| Batch / Task | Screens                                                                                                             |
| ------------ | ------------------------------------------------------------------------------------------------------------------- |
| **Task 1**   | `GradingPeriodsScreen`, `SubjectMonitorScreen`, `AdviserViewScreen`, `TeacherLoadScreen`                            |
| **Task 2**   | `AuditLogScreen`, `SectionAdviserScreen`, `TeachingAssignmentsScreen`, `ScheduleMeetingsScreen`                     |
| **Task 3**   | `SectionRosterScreen`, `LearnerListScreen`, `Sf1ImportScreen`                                                       |
| **Task 4**   | `SubjectAttendanceScreen`, `AttendanceScreen`, `ClassRecordsScreen`, `ClassRecordWorkspace`, `MonthlySummaryScreen` |
| **Task 5**   | ADR-0064 Wave 5 addendum + state docs + wave gate                                                                   |

Not in this wave: `LoginScreen` / `FirstRunSetupScreen` (pre-auth, outside the shell — a small restyle is a later slice), `TeacherWorkspaceScreen` (its redesign + deletion is a later slice), `IdleTimeoutWarning` (overlay, no heading), `HomeScreen` (a router, not a Page).

---

## Task 1: Page re-fit — batch 1 (4 screens, no tables of concern)

**Files:** `src/ui/GradingPeriodsScreen.tsx`, `src/ui/SubjectMonitorScreen.tsx`, `src/ui/AdviserViewScreen.tsx`, `src/ui/TeacherLoadScreen.tsx` and their `.test.tsx`.

**Per screen:**

- [ ] **Step A: read the screen + its test.** Note the current `<h2>` text, whether the Guided hint is `mode === "guided" && <p className="field-hint">…</p>` (most are), and whether the focus `useEffect` is standalone (`useEffect(() => { headingRef.current?.focus(); }, [])`).
- [ ] **Step B: edit** — `import { Page } from "./components/Page";`. Replace `<section aria-label="…"><h2 ref={headingRef} tabIndex={-1}>TEXT</h2>{guided hint block}` … `</section>` with `<Page title="TEXT" hint={mode === "guided" ? <p className="field-hint">…the exact hint text…</p> : undefined}>` … `</Page>`. Delete `headingRef`, the standalone focus `useEffect`, and drop `useRef` from the React import if now unused. If the screen imported `PageHeader`, remove that import and wrap the whole body in `Page` instead.
- [ ] **Step C: run that screen's test** (`npm run test -- src/ui/<Name>.test.tsx`). Fix only wrapper-caused breakage (region-name, a `.page-header` structural assertion). Report each change.

- [ ] **Step D:** after all four, `npm run quality` green. Commit: `refactor(ui): re-fit Grading Periods / Subject Monitor / Adviser View / Teacher Load onto Page`.

---

## Task 2: Page re-fit — batch 2 (contextual + audit screens)

**Files:** `src/ui/AuditLogScreen.tsx`, `src/ui/SectionAdviserScreen.tsx`, `src/ui/TeachingAssignmentsScreen.tsx`, `src/ui/ScheduleMeetingsScreen.tsx` + tests.

Same per-screen procedure as Task 1 (Steps A–C). Note: the three contextual screens (`SectionAdviser`, `TeachingAssignments`, `ScheduleMeetings`) also render a "Back" button above/near their heading — leave it exactly where it is (inside `<Page>` as the first child, or above the heading if that's where it lives — do not move it into `Page`'s `actions` slot this wave; just preserve it).

- [ ] After all four, `npm run quality` green. Commit: `refactor(ui): re-fit Sign-in Activity / Section Adviser / Teaching Assignments / Class Schedule onto Page`.

---

## Task 3: Page re-fit — batch 3 (learner-records screens with inline panels)

**Files:** `src/ui/SectionRosterScreen.tsx`, `src/ui/LearnerListScreen.tsx`, `src/ui/Sf1ImportScreen.tsx` + tests.

Same procedure. These have inline confirmation/edit panels and (Roster, Learner List) their own tables — **leave the tables and panels exactly as they are**; only the outer `<section>`/`<h2>`/focus wrapper becomes `<Page>`. `SectionRosterScreen` also has a "Back to Sections" control and section-context line — preserve them as the first children inside `<Page>`.

- [ ] After all three, `npm run quality` green. Commit: `refactor(ui): re-fit Section Roster / Learner List / SF1 Import onto Page`.

---

## Task 4: Page re-fit — batch 4 (attendance + grading + monthly)

**Files:** `src/ui/SubjectAttendanceScreen.tsx`, `src/ui/AttendanceScreen.tsx`, `src/ui/ClassRecordsScreen.tsx`, `src/ui/ClassRecordWorkspace.tsx`, `src/ui/MonthlySummaryScreen.tsx` + tests.

Same procedure. **Do not touch** any `.attendance-roster` / `.score-entry` / `.monthly-summary` table markup, its headers, its `@media` blocks, the score-entry keyboard model, or the monthly grid's sticky columns. `ClassRecordWorkspace` and `ClassRecordsScreen` may have deep component trees — only the top-level `<section>`/`<h2>`/focus wrapper changes. `MonthlySummaryScreen`: wrapper only, its bespoke scroll grid is out of scope.

- [ ] After all five, `npm run quality` green. Commit: `refactor(ui): re-fit Subject Attendance / Attendance / Class Records / Class Record Workspace / Monthly Summary onto Page`.

---

## Task 5: ADR addendum + state docs + wave gate

**Files:** `docs/adr/0064-ui-redesign-shell.md` (Wave 5 addendum), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`.

- [ ] **Step 1: ADR Wave 5 addendum** — every remaining in-shell screen is now on the `Page` scaffold (list them by batch); wrapper-only, no behaviour/table change; `DataTable` migration of the table screens, the `TeacherWorkspaceScreen` → teacher-Home redesign + deletion, the Login/First-run restyle, and the attendance-by-grade card are the recorded remaining slices.
- [ ] **Step 2: state docs** — `PROJECT-MEMORY.md` one durable line; `CURRENT-HANDOFF.md` top entry (commit range, `quality:full` result, **exact next slice = Wave 6: DataTable migration for the highest-value table screens (Attendance, Subject Attendance, Section Roster, Class Record Workspace) shedding their per-screen `@media` reflow; the teacher-Home redesign onto the primitives + `TeacherWorkspaceScreen` deletion; then a full-branch review and merge to `main`**); `ACTIVE-PLAN.md` "Wave 5 — complete" section; `VERIFICATION-DEBT.md` note that the native pass now owes every re-fitted screen.
- [ ] **Step 3: gates** — `npm run quality:full` exit 0 (harness 100/100 unchanged; typecheck/lint/format/architecture; vitest count roughly unchanged — wrapper-only, no new tests, minus any removed `.page-header`-structural assertions; `cargo` untouched). `npm run build` — record gzip. `npm run check:dev-preview-isolation` exit 0. `npx knip` — no new findings (`PageHeader` may become unused if every consumer migrated — if `knip` flags it, that's expected: either delete `PageHeader.tsx` + `.test.tsx` in this task, or keep it if any screen still uses it; report which).
- [ ] **Step 4: commit** `docs: record Wave 5 (Page scaffold re-fit) — ADR addendum + state docs`.

---

## Self-Review

**Spec coverage:** §7 "re-fit onto the new primitives, same content and flow" for every screen not already migrated in Wave 2 → Tasks 1–4 (18 screens). §7's per-screen "keep X" notes (MonthlySummary's grid, Class Record Workspace's keyboard model, the inline panels) → the explicit "do not touch" constraints in each task. The screens §7 flags for more than a re-fit (DataTable, TeacherHome) are explicitly deferred to Wave 6 and recorded in Task 5.

**Placeholder scan:** none — every task is the same concrete mechanical edit applied to a named list of files, with the "keep the tables / panels / Back buttons" constraints spelled out.

**Type consistency:** no new types. `Page`'s `title: string` / `hint?: ReactNode` props (Wave 2) are the only interface consumed; every call passes a string title and a `mode === "guided" ? <p> : undefined` hint, matching how Wave 2's two migrations (`TodaysClassesScreen`, `SectionsScreen`) already call it.
