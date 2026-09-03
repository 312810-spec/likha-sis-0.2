# LIKHA-SIS UI Redesign — Wave 6 (Finish: DataTable Migration + Pre-Auth Restyle) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Close out the redesign's structural work: migrate the four remaining hand-rolled data tables onto the `DataTable` primitive (shedding their per-screen phone-reflow CSS), and give the two pre-auth screens (`LoginScreen`, `FirstRunSetupScreen`) a light restyle so they match the shell's visual language even though they render outside it. Then the branch is ready for a whole-branch review and merge to `main`.

**Architecture:** Each table screen keeps its exact data flow, keyboard model, and behaviour; only the `<table className="…">` element is replaced by `<DataTable columns rows reflowAt={640} …>` and the now-orphaned `@media (max-width: 640px)` block for that screen's table class is deleted from `styles.css`. The pre-auth restyle is CSS-only plus, where trivial, swapping a raw `<h1>`/`<p>` for the shared `.app-boot` treatment already in `styles.css` — no form logic, no field changes.

**Tech Stack:** React + TS, Vitest + RTL, `src/test/a11y.ts`, CSS custom properties.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` §5.1 (`DataTable`), §7 (per-screen "keep X" notes). Waves 1–5 on this branch.

## Global Constraints

- **Data flow, behaviour, and keyboard interaction are unchanged.** `ClassRecordWorkspace`'s score-entry Enter/blur-saves model, `AttendanceScreen` / `SubjectAttendanceScreen`'s per-learner status toggles, `SectionRosterScreen`'s inline Transfer/End/Correct panels and its six heading-focus-return calls — all preserved exactly. Only the table _element_ and its reflow CSS change.
- **`DataTable` keeps real `<table>` semantics** (Wave 2). The per-learner status buttons / score inputs go into cells via `columns[].` cell content or a rendered node in `rows[].cells`; they stay operable exactly as before. Row-header column is the learner name.
- **Every existing test must still pass.** RTL `getByRole("table"|"row"|"cell"|"columnheader"|"rowheader")` and text queries continue to resolve against `DataTable`'s output. Adjust a test ONLY where the DOM genuinely moved (e.g. a query that hard-coded `.attendance-roster`); never weaken a behavioural assertion. If a screen's test depends on the exact old table structure in a way `DataTable` can't reproduce without a behaviour change, STOP and report — do not force it.
- **Delete only the reflow CSS whose table you migrated.** `MonthlySummaryScreen`'s `.monthly-summary` grid is NOT migrated (its sticky-column scroll is deliberately bespoke) — leave it and its `@media` block alone. `.score-entry`'s `@media` block also styles the assessment-item list on phones — check what else it covers before deleting; keep any rule not tied to the migrated table.
- No Rust. No new dependency. No auth/persistence/sync change → no security-review trigger.
- Commits: conventional, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch `claude/ui-redesign-wave-1-shell`. Per task `npm run quality` green; wave boundary (Task 5) `npm run quality:full` exit 0.

---

## File Structure

**Modified**

- `src/ui/AttendanceScreen.tsx` / `.test.tsx` — `.attendance-roster` table → `DataTable`.
- `src/ui/SubjectAttendanceScreen.tsx` / `.test.tsx` — its roster table → `DataTable`.
- `src/ui/SectionRosterScreen.tsx` / `.test.tsx` — `.section-roster` table → `DataTable` (the inline action-panel rows stay as sibling content below the table, not inside it).
- `src/ui/ClassRecordWorkspace.tsx` / `.test.tsx` — `.score-entry` table → `DataTable`, score `<input>`s in cells.
- `src/ui/theme/styles.css` — remove the `@media (max-width: 640px)` blocks for `.attendance-roster`, `.section-roster`, `.score-entry` (keep any part covering non-table elements); the base `.attendance-roster` / `.section-roster` / `.score-entry` rules can stay or go (if fully unused after migration, remove — `grep` first).
- `src/ui/LoginScreen.tsx`, `src/ui/FirstRunSetupScreen.tsx` — light restyle (see Task 4).
- `docs/adr/0064-ui-redesign-shell.md` (Wave 6 addendum), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`.

---

## Task 1: `AttendanceScreen` + `SubjectAttendanceScreen` → `DataTable`

**Files:** those two `.tsx` + `.test.tsx`; `styles.css`.

**Per screen:**

- [ ] **Step A: read the screen + test.** The table has columns roughly: Learner (row header) / Status buttons (Present/Absent/Tardy) — and possibly a count or date column. Note the exact per-row controls and the `role="group"` around the status buttons.
- [ ] **Step B: replace the `<table className="attendance-roster">…</table>`** (or the SubjectAttendance equivalent) with:
  ```tsx
  <DataTable
    caption="<the screen's existing caption or a short descriptive string>"
    reflowAt={640}
    columns={[
      { key: "learner", header: "Learner" },
      { key: "status", header: "Status" },
      // + any other existing columns, same order
    ]}
    rows={roster.map((entry) => ({
      key: entry.<id>,
      rowHeader: "learner",
      cells: {
        learner: <the learner name node, exactly as before>,
        status: <the existing <div role="group"> of status buttons, verbatim>,
        // + other cells
      },
    }))}
  />
  ```
  Import `DataTable` from `./components/DataTable`. Keep every `onClick`, `aria-pressed`, `aria-label`, and the `role="group"` on the status-button cluster exactly as they were. If the screen shows a per-status count row or a "mark all present" control, that stays where it is (outside the table).
- [ ] **Step C: run `npm run test -- src/ui/<Name>.test.tsx`.** Fix only DOM-move breakage. Report each change.
- [ ] **Step D:** delete the `@media (max-width: 640px)` block(s) in `styles.css` that target `.attendance-roster` (and the SubjectAttendance table class if different). `grep` the class first; if a base `.attendance-roster` rule is now unreferenced, remove it too.
- [ ] **Step E:** `npm run quality` green. Commit: `refactor(ui): migrate Attendance + Subject Attendance rosters onto DataTable`.

---

## Task 2: `SectionRosterScreen` → `DataTable`

**Files:** `src/ui/SectionRosterScreen.tsx` / `.test.tsx`; `styles.css`.

- [ ] **Step A: read the screen + test.** The `.section-roster` table lists enrolled learners (# / Learner / LRN / Sex / Status / row actions). Below/among rows are inline confirmation panels for Transfer/End/Correct (currently sibling `<tr>`s or a panel div). The screen also has a "Back to Sections" control, a context line, an "Enroll learner" panel, and "Generate SF1/SF9" actions.
- [ ] **Step B: migrate the learner table** to `<DataTable>` — columns `#` / Learner (row header) / LRN / Sex / Status / (actions), `reflowAt={640}`. The per-row action buttons (`Transfer` / `End` / `Correct`) go in an actions cell, verbatim. **The inline confirmation panel** (shown when an action is mid-flight) currently renders as an extra `<tr>` spanning the row — `DataTable` has no row-expansion slot, so render that panel as a **sibling block immediately below the `<DataTable>`** (conditionally, keyed to the selected membership), styled with the existing `.section-roster-action-panel` class. This is a small structural move; keep the panel's content, its focus behaviour, and its confirm/cancel handlers identical. If a test asserts the panel is _inside_ a table row, update that assertion to find it as the sibling block (report it).
- [ ] **Step C:** run the test; fix DOM-move breakage; keep the six `headingRef` focus-return calls and their tests passing.
- [ ] **Step D:** remove the `.section-roster` `@media (max-width: 640px)` block from `styles.css` (keep the `.section-roster-action-*` rules — the panel still uses them).
- [ ] **Step E:** `npm run quality` green. Commit: `refactor(ui): migrate Section Roster onto DataTable; render the action panel as a sibling block`.

---

## Task 3: `ClassRecordWorkspace` → `DataTable`

**Files:** `src/ui/ClassRecordWorkspace.tsx` / `.test.tsx`; `styles.css`.

- [ ] **Step A: read the screen + test carefully — this has the score-entry keyboard model.** The `.score-entry` table has a Learner row-header column and one `<input className="score-entry-input">` per assessment column; Enter and blur save the score; there's a `:focus-within` row highlight and a `.score-saved-note` / `.field-error` per cell.
- [ ] **Step B: migrate to `<DataTable>`** — `rowHeader: "learner"`, one column per assessment (its `header` is the assessment name/max), `reflowAt={640}`. Each score cell renders the **exact existing `<input>` + its `onKeyDown`/`onBlur` handlers + the saved-note/error nodes**, verbatim. The `:focus-within` row highlight: `DataTable` already has `.data-table tbody tr:focus-within { background: var(--color-surface) }` from Wave 2 — so the highlight is preserved for free; confirm and drop the screen-specific `.score-entry tbody tr:focus-within` rule.
- [ ] **Step C:** run the test — every score-entry test (type, Enter saves, blur saves, error shows, saved-note shows, focus highlight) must pass. If `DataTable` structure breaks the keyboard flow in any way, STOP and report — do not alter the save behaviour.
- [ ] **Step D:** remove the `.score-entry` `@media (max-width: 640px)` block **only for the parts that style the table** — that block also styles `.assessment-item-list li` on phones; keep those lines (move them to their own `@media` block if needed). Remove `.score-entry` base rules only if fully unreferenced.
- [ ] **Step E:** `npm run quality` green. Commit: `refactor(ui): migrate Class Record Workspace score entry onto DataTable`.

---

## Task 4: Pre-auth restyle — `LoginScreen` + `FirstRunSetupScreen`

**Files:** `src/ui/LoginScreen.tsx`, `src/ui/FirstRunSetupScreen.tsx` + `.test.tsx`; maybe `styles.css`.

These render inside `App.tsx`'s `<div className="app-boot">` (Wave 1) which already gives them the centered column + `.app-boot-brand` heading. This task is a **light** pass:

- [ ] **Step A:** read both screens + tests. Note the current heading structure, the form `aria-label`s ("Sign in" / "Set up your school"), and any inline layout classes.
- [ ] **Step B:** ensure each screen's own content sits well in `.app-boot`: the form gets a `max-width` consistent with `--content-width` (already capped by `.app-boot`), fields use the global input styles, the primary action uses `.button-primary`, error/notice uses the shared `Alert` component if it doesn't already. Do NOT change field names, validation, the `onLoggedIn` / `onSetupComplete` contracts, the form `aria-label`s, or the Guided-mode hints. If the screens already look fine, the change may be as small as swapping a bespoke error `<p>` for `<Alert tone="error">` and removing a redundant local `<h2>` (the `.app-boot-brand` `<h1>` is above them). Append a small `.app-boot form { … }` / `.app-boot .field { … }` rule to `styles.css` only if genuinely needed.
- [ ] **Step C:** run both tests. The `App.test.tsx` assertions `findByRole("form", { name: "Sign in" })` / `"Set up your school"` and `getByRole("heading", { name: "LIKHA-SIS" })` MUST still pass. Fix only presentational breakage.
- [ ] **Step D:** `npm run quality` green. Commit: `refactor(ui): tidy the pre-auth screens within the app-boot shell`.

---

## Task 5: ADR addendum + state docs + wave gate + whole-branch review

- [ ] **Step 1: ADR-0064 Wave 6 addendum** — the four table migrations (which `@media` blocks were removed), the Section Roster action-panel move to a sibling block, and the pre-auth tidy. Note what remains as accepted redesign debt: the teacher Home is still `TeacherWorkspaceScreen` rendered as-is (functional but not rebuilt on the primitives) — a future cosmetic slice — and `PageHeader` survives as its last consumer; the `SchoolHeadHome` "attendance by grade" card is still deferred (temporal membership join).
- [ ] **Step 2: state docs** — `PROJECT-MEMORY.md` one line; `CURRENT-HANDOFF.md` top entry ("**Wave 6 complete — redesign branch ready for merge**"; commit range; `quality:full` result; the accepted debt list above; next action = **whole-branch review then merge `claude/ui-redesign-wave-1-shell` → `main`**); `ACTIVE-PLAN.md` "Wave 6 — complete" section; `VERIFICATION-DEBT.md` — the native NVDA/Narrator + `quality:ui` pass now owes the whole redesigned surface; DataTable's phone reflow verified structurally (jsdom) only.
- [ ] **Step 3: gates** — `npm run quality:full` exit 0 (harness 100/100; typecheck/lint/format/architecture; vitest — count may dip slightly if a `.attendance-roster`-structural test line was removed, that's expected and reported; `cargo` untouched). `npm run quality:security` clean. `npm run build` — record gzip (CSS should _drop_ — three `@media` blocks removed). `npm run check:dev-preview-isolation` exit 0. `npx knip` — no new findings.
- [ ] **Step 4: commit** `docs: record Wave 6 (DataTable migration + pre-auth tidy) — ADR addendum + state docs`.
- [ ] **Step 5: whole-branch review** — this is the redesign's final review before merge. Generate the package `git diff $(git merge-base main HEAD)..HEAD` and dispatch a thorough reviewer (most capable model) covering: screen-behaviour preservation across all 6 waves' diffs, architecture boundaries, the two Rust reads (`role::list_roles`, `attendance::school_day_totals`) and their gates, the `roles` display-only contract, accessibility of the shell + primitives + re-fitted screens, and the accepted-debt list. Fix any Critical/Important (one round) + re-review; record residual Minors. On reviewer-harness failure, record + rigorous controller self-review + retain debt.
- [ ] **Step 6:** when the review is clean (or residuals are parked with rulings), the branch is ready. **Do not merge in this task** — the controller does the merge via `superpowers:finishing-a-development-branch` after this plan completes, per the user's standing instruction to merge once all waves are done.

---

## Self-Review

**Spec coverage:** §5.1 `DataTable` as the table-in-card primitive → now the actual table on Attendance / Subject Attendance / Section Roster / Class Record Workspace (Tasks 1–3); Monthly Summary stays bespoke per §7's explicit note. §7 "same content and flow, only the presentational wrapper changes" → the "behaviour/keyboard unchanged" constraint on every task, with STOP-and-report escape hatches. Pre-auth screens (§7 "restyle to the new surfaces; not inside the shell; keep three-mode + Guided hints") → Task 4. The teacher-Home rebuild + attendance-by-grade are explicitly recorded as accepted remaining debt (Task 5 Step 1) rather than silently dropped.

**Placeholder scan:** none — each table migration is the same concrete `<table>` → `<DataTable columns/rows>` transform on a named screen, with the per-screen gotcha (status-button group, inline panel, score-entry keyboard) spelled out.

**Type consistency:** `DataTable`'s `DataColumn` / `DataRow` / `DataTableProps` (Wave 2) are the only interface consumed; `rows[].cells` values are `ReactNode`, so existing button clusters / inputs drop in unchanged; `rowHeader` is always `"learner"`.
