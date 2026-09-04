# Independent Architecture-Boundary Review — LIKHA UI Redesign (Waves 1-6, ADR-0064)

Scope reviewed as merged to `main`. Read-only review.

## Verdict: PASS

Nothing blocking. Two Minor and two Informational notes, all already
tracked in ADR-0064's accepted backlog. The architecture-boundary review
debt for the redesign can be marked **CLOSED**.

## Checks run this session

- `npm run check:architecture` -> "Architecture check passed: no restricted imports found." (exit 0)
- `npm run check:dev-preview-isolation` -> passed, 21 files scanned (exit 0)
- `npx knip --include files,exports` -> only 2 pre-existing unrelated unused exports
- grep: no `src/ui/**` import of `composition`, `infrastructure/`, or `@tauri-apps/*`
- grep: no `AppShell` / `WorkbenchNav` identifier anywhere under `src/`

## Rule-by-rule

### 1. UI never imports infrastructure / Tauri SDK; only composition.ts wires adapters

PASS. `scripts/check-architecture.mjs` covers all of `src/ui/**` and passes.
Shell (`AppLayout`, `Sidebar`, `TopBar`, `BottomNav`) and primitives
(`Page`, `Card`+`BentoGrid`, `KpiStrip`/`Kpi`, `DataTable`) import only:
React, sibling UI modules, `../../domain/session` (type only), and the
`theme/` mode context. `src/composition.ts` is imported only by
`src/App.tsx`, which passes every `*ApplicationService` down as props
(`HomeScreen` -> `SchoolHeadHome` chain included).

### 2. No SQL in the frontend

PASS. The one Wave 4 read is a narrow Tauri command
`school_attendance_day_totals` (`src-tauri/src/commands/attendance.rs:104`).
SQL is in `src-tauri/src/repository/attendance.rs:404 school_day_totals`,
parameterized `WHERE school_id = ?1 AND attendance_date = ?2`, aggregate
counts only, zero learner identity. Frontend port
`src/domain/ports/school-attendance-repository.ts`, adapter
`src/infrastructure/tauri/school-attendance-repository.ts` (single
`invoke(...)`), service `src/application/school-attendance-service.ts`
(validates `YYYY-MM-DD`, no `school_id` param). Clean layering.

### 3. src/ui, src/domain, src/application never import src/infrastructure

PASS. Verified by the check script + manual grep.

### 4. Things check-architecture.mjs does NOT catch — inspected manually

- Shell component importing `composition.ts` — none.
- Screen bypassing its injected service to call a repository port — none;
  every data call in the redesigned screens and `SchoolHeadHome` goes
  through an injected `*ApplicationService`.
- A primitive containing business logic / provider refs — none. `Page`,
  `Card`, `BentoGrid`, `KpiStrip`/`Kpi`, `DataTable` are presentational,
  props-only, React-only.
- `workbench-nav-data.ts` — data-only `.ts`, no React import.

### 5. Layout primitives presentational only

PASS.

## Also-assessed

### SchoolHeadHome client-side composition

Stays within the boundary: all 7 services are injected props; it never
reaches past them. It does, however, perform multi-source orchestration
and derivation directly in a UI component: `Promise.all` over 5 services
plus nested per-section `currentAdviser` and per-teacher `getLoad`
lookups, then `median()` / `teachingLoadOutlierIndex()` /
attendance-rate tone thresholds. "Business logic stays outside UI" makes
this borderline. ADR-0064 sec. 2 + the Wave 4 independent security
review explicitly accepted it as read-only display hints with no
backend. -> Minor (design consistency), see Finding 1.

### Primitive coupling / prop-drilling

None. `DataTable` column/row types are generic, no screen knowledge.
`Card` `span`/`keepHalf` are layout-only. Teacher-mode already uses
context; nav callbacks travel 1-2 levels which is appropriate — no
context needed. `BentoGrid` is a named export of `Card.tsx` (no
`BentoGrid.tsx` file); both are components so Fast Refresh is fine.
-> Informational, Finding 3.

### workbench-nav-data.ts

Correct: `.ts`, zero React imports, self-documented Fast-Refresh
rationale. `SignedInTab` union, `TAB_LABELS`, `NAV_GROUPS`,
`normalizeTab`, `groupLabelForTab` are all pure data/functions.

### Dead code from the migration

No `AppShell` / `WorkbenchNav` remain. `PageHeader` is NOT orphaned —
still consumed by `TeacherWorkspaceScreen.tsx:13` and
`AdminPasswordResetScreen.tsx:8` (the two deliberately un-migrated
screens). knip reports only `userService` and `LEARNER_SCORE_STATUSES`
as unused exports — both pre-existing and unrelated to the redesign.
-> Minor, Finding 2 (two parallel header primitives coexist).

## Findings

### Finding 1 — Minor

`src/ui/home/SchoolHeadHome.tsx:136-191` (the `load()` orchestrator) and
`:75-97` (`median`, `teachingLoadOutlierIndex`).
Concern: a UI component orchestrates 7 services and computes cross-source
derivations (outlier heuristic, adviser-gap set, attendance tone). The
established pattern is that an Application Service orchestrates and the
screen calls one method. Also an N+1 read pattern (one `currentAdviser`
per section, one `getLoad` per teacher).
Fix: when this screen next changes, introduce a
`SchoolOverviewApplicationService` (or a composite method on an existing
service) that returns a single `SchoolOverview` view-model; move
`median`/outlier/tone-threshold derivation behind it. Already recorded in
ADR-0064 Wave 6 "accepted backlog" — no action required now.

### Finding 2 — Minor

Two header primitives now coexist: `src/ui/components/Page.tsx` (~16
screens) and `src/ui/components/PageHeader.tsx`
(`TeacherWorkspaceScreen.tsx`, `AdminPasswordResetScreen.tsx`).
Concern: parallel primitives for the same job drift over time (focus
behaviour, hint slot, actions slot differ subtly).
Fix: finish the migration per ADR-0064 Wave 6 backlog — refit
`AdminPasswordResetScreen` onto `Page`, and delete `TeacherWorkspaceScreen`

- `PageHeader` + `PageHeader.test.tsx` when the Home teacher branch is
  collapsed. Tracked; not blocking.

### Finding 3 — Informational

`src/ui/components/Card.tsx:35-37` exports `BentoGrid` alongside `Card`.
The task scope names a `BentoGrid.tsx` that does not exist.
Concern: discoverability only; Fast Refresh is unaffected (both exports
are components).
Fix: optional — split `BentoGrid` into its own file if the component set
grows; otherwise leave as-is (they are grid-layout siblings).

### Finding 4 — Informational

`src/ui/HomeScreen.tsx:15-33` threads 11 props (8 services + 4 callbacks
minus overlap) purely to forward them to children.
Concern: prop volume, not a boundary violation — injection is correct.
Fix: none required; if it grows, group the school-head services into a
single object prop.

## Debt closure

The architecture-boundary review owed since Wave 1 is satisfied by this
pass. Verdict PASS, no blocking or should-fix findings; the four residual
items are Minor/Informational and already live in ADR-0064's accepted
backlog. Mark the redesign architecture-boundary review debt CLOSED in
`docs/VERIFICATION-DEBT.md` / `docs/CURRENT-HANDOFF.md`.
