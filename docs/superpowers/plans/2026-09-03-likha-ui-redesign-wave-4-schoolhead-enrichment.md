# LIKHA-SIS UI Redesign — Wave 4 (School-Head Home Enrichment) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Fill out `SchoolHeadHome` with the three cards deferred from Wave 3: **school-wide attendance today** (needs one new, dead-simple, capability-gated Rust read), **sections without a current adviser**, and **per-teacher teaching load** (both from existing reads, client-side).

**Architecture:** Rust: `repository::attendance::school_day_totals(conn, school_id, date)` — a single `GROUP BY status` count over the already-indexed `attendance_records(school_id, attendance_date)` — plus a `school_attendance_day_totals` command gated by an existing capability. Frontend: a narrow `SchoolAttendanceRepository` port → Tauri adapter → a method on a small application service, consumed only by `SchoolHeadHome`. The adviser-gap and teacher-load cards call existing services per entity, client-side.

**Tech Stack:** Rust (rusqlite, `cargo test`), React + TS, Vitest + RTL, `src/test/a11y.ts`.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` §6.2 (School-Head Home data table), §8. Waves 1–3 on this branch.

## Global Constraints

- **The new Rust read is aggregate counts only — no PII.** `school_day_totals` returns four integers. It is **capability-gated** (`Capability::ManageLearners` → `REGISTRAR` / `SCHOOL_HEAD`, matching the `list_sf1_import_history` precedent the Wave 3 security review noted) and **school-scoped** (`school_id` derived server-side from the session via `require_active_school_scope`, never a client parameter). `date` is the only client argument.
- **Auth/persistence-touching → mandatory `security-reviewer`** pass before the wave is marked complete (Task 6). It covers: the query is parameterised + school-scoped; the command derives `school_id` server-side and enforces the capability; no existing gate/command changed; no PII in the response.
- **TDD for the Rust** (the repo fn + the command boundary).
- **No new schema/migration** — `attendance_records` and `idx_attendance_school_date` already exist. No new dependency.
- **The adviser-gap and teacher-load cards use existing reads only** — `sectionAdvisoryService.currentAdviser(sectionId, asOfDate)` per section, `schoolMemberService.listSchoolMembers()` filtered to the `teacher` role + `teachingAssignmentService.getLoad(userId)` per teacher. Client-side composition, no new backend.
- **Architecture**: `src/ui/**` never imports `infrastructure/**` / `@tauri-apps/*`; SQL stays in Rust; the new port lives in `src/domain/ports/`, the adapter in `src/infrastructure/tauri/`, wired in `src/composition.ts`; `SchoolHeadHome` receives its service as a prop.
- **A11y / density parity / reduced-motion** as prior waves. Every new/changed screen keeps its axe check. New cards use `Card` + a plain bar-list (no chart lib).
- Commits: conventional, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch `claude/ui-redesign-wave-1-shell`. Per task `npm run quality` green (Rust tasks `cargo test`); wave boundary (Task 6) `npm run quality:full` exit 0.

---

## File Structure

**Created**

- `src/domain/ports/school-attendance-repository.ts` — the port.
- `src/infrastructure/tauri/school-attendance-repository.ts` / `.test.ts` — Tauri adapter.
- `src/application/school-attendance-service.ts` / `.test.ts` — validated passthrough.

**Modified**

- `src-tauri/src/repository/attendance.rs` — `pub fn school_day_totals` + unit tests.
- `src-tauri/src/commands/attendance.rs` (or wherever attendance commands live — grep) — `school_attendance_day_totals` command + a command-boundary test.
- `src-tauri/src/lib.rs` / the command registration list — register the new command.
- `src/domain/attendance.ts` (or a suitable domain file) — a `SchoolDayAttendanceTotals` type (`{ present: number; absent: number; late: number; excused: number }`).
- `src/composition.ts` — construct + wire `SchoolAttendanceApplicationService`.
- `src/ui/home/SchoolHeadHome.tsx` / `.test.tsx` — add the three cards; take the new service + `sectionAdvisoryService` + `schoolMemberService` + `teachingAssignmentService` as props.
- `src/App.tsx` — pass the new prop(s) through `HomeScreen` → `SchoolHeadHome`.
- `src/ui/HomeScreen.tsx` / `.test.tsx` — thread the new prop(s).
- `docs/adr/0064-ui-redesign-shell.md` (Wave 4 addendum), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`.

---

## Task 1: `attendance::school_day_totals` (Rust, TDD)

**Files:** `src-tauri/src/repository/attendance.rs`.

**Interfaces:** `pub fn school_day_totals(conn: &Connection, school_id: &str, date: &str) -> AppResult<SchoolDayTotals>` where `pub struct SchoolDayTotals { pub present: u32, pub absent: u32, pub late: u32, pub excused: u32 }` (derive `Debug, Clone, Serialize`, `#[serde(rename_all = "camelCase")]`). One query: `SELECT status, COUNT(*) FROM attendance_records WHERE school_id = ?1 AND attendance_date = ?2 GROUP BY status`, then fold rows into the struct (unknown status → ignore; missing status → 0).

- [ ] **Step 1: failing tests** in `attendance.rs`'s test module (mirror its existing test setup — grep for `mod tests` and the helpers it uses to insert `attendance_records`):
  - `school_day_totals_is_zero_when_nothing_recorded`
  - `school_day_totals_counts_each_status_for_the_date` (insert present×3, absent×1, late×1, excused×1 for date D → `{present:3, absent:1, late:1, excused:1}`)
  - `school_day_totals_is_school_scoped` (records for school A on D → `school_day_totals(_, school_B, D)` all zero)
  - `school_day_totals_is_date_scoped` (records on D → `school_day_totals(_, school, D+1)` all zero)

- [ ] **Step 2: run — FAIL** (`cd src-tauri && cargo test attendance::.*school_day_totals` — undefined).

- [ ] **Step 3: implement** the struct + fn as specified.

- [ ] **Step 4: run — PASS.** `cargo fmt`; `cargo fmt --check` clean; `cargo clippy --all-targets -- -D warnings` clean; whole `cargo test` 0 failed.

- [ ] **Step 5: commit** (`feat(rust): attendance::school_day_totals aggregate read`).

---

## Task 2: `school_attendance_day_totals` command (Rust, TDD)

**Files:** the attendance commands module; the command registration list; a command-boundary test file.

**Interfaces:** `#[tauri::command] pub fn school_attendance_day_totals(db, sessions, date: String) -> AppResult<SchoolDayTotals>`. Body: `let conn = lock_db(&db)?;` → `let school_id = sessions.require_active_school_scope(&conn)?;` → authorize the capability (follow the exact `authorize_capability(&conn, sessions, Capability::ManageLearners)?` pattern used by a neighbouring gated read — grep `Capability::ManageLearners` in `src-tauri/src/commands/`) → `attendance::school_day_totals(&conn, &school_id, &date)`.

- [ ] **Step 1: failing boundary test** — in the attendance boundary test file (grep `src-tauri/tests/` for the one that already exercises attendance commands), add: a `REGISTRAR`/`SCHOOL_HEAD` session gets the totals for a date with seeded records; a `teacher`-only session is refused (`Err(AppError::Unauthorized)` or the project's forbidden shape — match how sibling `ManageLearners` boundary tests assert it); the totals are for the caller's own school only (seed a second school's records, confirm they're excluded). Write the assertions first (compile fails — command doesn't exist).

- [ ] **Step 2: run — FAIL.**

- [ ] **Step 3: implement** the command; register it in the `tauri::generate_handler!` / command list (grep for where `list_sf1_import_history` or a sibling attendance command is registered and add alongside).

- [ ] **Step 4: run — PASS.** `cargo fmt --check` / `cargo test` (0 failed) / `cargo clippy` clean.

- [ ] **Step 5: commit** (`feat(rust): school_attendance_day_totals command (ManageLearners, school-scoped)`).

---

## Task 3: frontend port + adapter + service

**Files:** create `src/domain/ports/school-attendance-repository.ts`, `src/infrastructure/tauri/school-attendance-repository.ts` (+ `.test.ts`), `src/application/school-attendance-service.ts` (+ `.test.ts`); modify `src/domain/attendance.ts` (add the type) and `src/composition.ts`.

**Interfaces:**

```ts
// domain/attendance.ts
export interface SchoolDayAttendanceTotals {
  present: number;
  absent: number;
  late: number;
  excused: number;
}
// domain/ports/school-attendance-repository.ts
export interface SchoolAttendanceRepository {
  dayTotals(date: string): Promise<SchoolDayAttendanceTotals>;
}
// application/school-attendance-service.ts
export class SchoolAttendanceApplicationService {
  constructor(private repo: SchoolAttendanceRepository) {}
  async dayTotals(date: string): Promise<SchoolDayAttendanceTotals> {
    // validate: date is a non-empty YYYY-MM-DD string (reuse the isIsoDate
    // helper other services use, or a local /^\d{4}-\d{2}-\d{2}$/ check);
    // throw ValidationError otherwise.
    return this.repo.dayTotals(date);
  }
}
```

Adapter: `class TauriSchoolAttendanceRepository implements SchoolAttendanceRepository { dayTotals(date) { return invoke<SchoolDayAttendanceTotals>("school_attendance_day_totals", { date }); } }`.

- [ ] **Step 1: failing tests** — adapter test: `dayTotals("2026-09-03")` calls `invoke("school_attendance_day_totals", { date: "2026-09-03" })` and returns its result (mock `invoke`, mirror `src/infrastructure/tauri/auth-repository.test.ts`). Service test: valid date passes through; empty / malformed date throws `ValidationError` without calling the repo.

- [ ] **Step 2–4: FAIL → implement → PASS.** Wire in `composition.ts` next to the other `*ApplicationService` constructions.

- [ ] **Step 5: `npm run quality` green (architecture check must still pass). Commit** (`feat(ui): SchoolAttendance port/adapter/service`).

---

## Task 4: `SchoolHeadHome` — the three cards

**Files:** `src/ui/home/SchoolHeadHome.tsx`, `src/ui/home/SchoolHeadHome.test.tsx`.

**Interfaces:** `SchoolHeadHomeProps` gains `schoolAttendanceService: SchoolAttendanceApplicationService`, `sectionAdvisoryService: SectionAdvisoryApplicationService`, `schoolMemberService: SchoolMemberApplicationService`, `teachingAssignmentService: TeachingAssignmentApplicationService`. Keep it file-local (not exported).

Add to the `Promise.all` load (extend the existing `requestRef` guard):

- `schoolAttendanceService.dayTotals(todayIso)` → an **"Attendance today"** `Kpi` in the strip: `value = totalMarked ? Math.round(present / totalMarked * 100) + "%" : "—"`, `foot = "{totalMarked} learners marked · {todayIso}"`, `tone` = `success` if ≥85, `warning` if 60–84, `danger` if <60 (and always `foot` states the raw numbers, so tone is never the only signal).
- For each `Section` from the already-loaded `listSections()`, `sectionAdvisoryService.currentAdviser(section.id, todayIso)` (Promise.all over sections) → a **"Sections without an adviser"** `Card` (`span={6} keepHalf`): a list of the sections where it resolved `null`; `EmptyState` "Every section has an adviser." when none; an `actions` "Assign" button → `onManageSections`.
- `schoolMemberService.listSchoolMembers()` filtered to role `"teacher"`, then `teachingAssignmentService.getLoad(member.userId)` per teacher (Promise.all) → a **"Teaching load"** `Card` (`span={6} keepHalf`): a bar-list of teacher name + weekly instructional time; flag the highest with a `warning`-toned bar if it exceeds ~1.5× the median (a simple, documented heuristic — not enforcement). `EmptyState` when no teachers.

Loading/error/empty via the existing `Alert`/`Loading`/`EmptyState`; a single reject in the `Promise.all` shows the error `Alert` + `Retry` (same as today) — do **not** partially render.

- [ ] **Step 1: read the current `SchoolHeadHome.tsx`** (Wave 3) and confirm the exact `schoolMemberService.listSchoolMembers()` method name + member shape (`grep` the service), the `currentAdviser` signature, and `getLoad`'s return (`TeacherLoad` — weekly minutes field name).

- [ ] **Step 2: failing test** — extend `SchoolHeadHome.test.tsx`: mock the four new/changed services. Assert: the "Attendance today" KPI shows the computed % and the raw-count foot; tone thresholds (feed 90 → success, 70 → warning, 40 → danger); "Sections without an adviser" lists exactly the null-adviser sections and shows the empty message when all have one; "Teaching load" lists teachers with their load and flags the outlier; a reject in any of the four → the error `Alert` + working `Retry`; `await expectNoAccessibilityViolations(container)` after load. Keep the Wave 3 assertions passing (counts, school year, SF1 imports, Manage buttons).

- [ ] **Step 3: implement.**

- [ ] **Step 4: `npm run test -- src/ui/home/SchoolHeadHome.test.tsx` green; `npm run quality` green.**

- [ ] **Step 5: commit** (`feat(ui): SchoolHeadHome attendance-today, adviser-gap, teaching-load cards`).

---

## Task 5: thread the props (`HomeScreen`, `App.tsx`)

**Files:** `src/ui/HomeScreen.tsx` / `.test.tsx`, `src/App.tsx` / `App.test.tsx`.

- [ ] **Step 1:** `HomeScreenProps` gains the four services; pass them straight to `<SchoolHeadHome>`. No teacher-path change. Update `HomeScreen.test.tsx`'s school-head render to supply the mocks.

- [ ] **Step 2:** `App.tsx` — `<HomeScreen>` gains `schoolAttendanceService={schoolAttendanceService}`, `sectionAdvisoryService={sectionAdvisoryService}`, `schoolMemberService={schoolMemberService}`, `teachingAssignmentService={teachingAssignmentService}` (all already constructed in `composition.ts` / imported in `App.tsx` for other tabs — confirm and reuse; `schoolAttendanceService` is the new one from Task 3). `App.test.tsx` — the school-head test's mocked `invoke` gains a `school_attendance_day_totals` case returning zeros; `list_school_members` / advisory / load mocks return `[]` so the cards render their empty states. Keep every other assertion.

- [ ] **Step 3: `npm run quality` green. Commit** (`feat(ui): thread the School-Head data services through HomeScreen`).

---

## Task 6: ADR addendum + docs + gate + security review

- [ ] **Step 1: ADR-0064 Wave 4 addendum** — `school_day_totals` (aggregate counts only, `ManageLearners`-gated, school-scoped, `date` the only client arg); the three `SchoolHeadHome` cards and that adviser-gap + teacher-load are client-side over existing reads; "attendance by grade level" still deferred (needs a `section_memberships` temporal join — its own slice).

- [ ] **Step 2: state docs** — `PROJECT-MEMORY.md` one line; `CURRENT-HANDOFF.md` top entry (commit range, `quality:full` result, security-review outcome, **exact next slice = Wave 5: screen re-fit batches — migrate the remaining unmigrated screens onto `Page`/`DataTable`/`Card` in nav-cluster batches of ~4, plus redesign `TeacherHome` onto the primitives and delete `TeacherWorkspaceScreen`; its own plan**); `ACTIVE-PLAN.md` "Wave 4 — complete" section; `VERIFICATION-DEBT.md` note.

- [ ] **Step 3: gates** — `npm run quality:full` exit 0 (harness 100/100 unchanged; vitest + cargo counts up by the new tests; clippy/fmt clean). `npm run quality:security` exit 0 (no dependency). `npm run build` — record gzip. `npm run check:dev-preview-isolation` exit 0. `npx knip` — no new findings (the new port/service/adapter are all consumed via `composition.ts` → `App.tsx` → `HomeScreen` → `SchoolHeadHome`).

- [ ] **Step 4: commit** (`docs: record Wave 4 (School-Head Home enrichment) — ADR addendum + state docs`).

- [ ] **Step 5: MANDATORY `security-reviewer`** against the wave's commit range — focus: `school_day_totals` parameterised + school-scoped + counts-only; the command derives `school_id` server-side and enforces `ManageLearners`; a teacher-only session is refused (boundary test proves it); no other gate/command touched; the client-side adviser-gap / teacher-load composition calls only reads the caller is already authorised for. Fix any Critical/Important (one round) + re-review; on reviewer-harness failure, record + controller self-review against this checklist + retain debt + continue.

---

## Self-Review

**Spec coverage:** §6.2 "School-wide attendance today (% and by grade)" → the % ships this wave (Tasks 1–4); "by grade" is explicitly deferred with a stated reason (temporal membership join). §6.2 "sections with no adviser" + "per-teacher teaching load" → Task 4, client-side over existing reads, exactly as §6.2 says ("from existing per-entity reads"). §8 Wave 4 row (new attendance rollup read + wire it in, own security review) → Tasks 1–2 + Task 6 Step 5.

**Placeholder scan:** none — the one genuine unknown (exact `listSchoolMembers` / `getLoad` field names) is a named Step 1 investigation in Task 4.

**Type consistency:** `SchoolDayTotals` (Rust, camelCase serde) ↔ `SchoolDayAttendanceTotals` (TS) — same four `number` fields. `school_attendance_day_totals` command name matches the adapter's `invoke(...)` string. `dayTotals(date)` signature matches port → adapter → service → the `SchoolHeadHome` call site. `Capability::ManageLearners` is the same gate `list_sf1_import_history` uses (verified in the Wave 3 security review's Informational note).
