# LIKHA-SIS UI Redesign — Wave 3 (Role-Adaptive Home) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Make the signed-in landing screen a role-adaptive **Home**: a teacher sees their existing "today's priorities" workspace; a user who also holds the `school_head` role additionally gets a school-wide overview and a real view-switch between the two. This needs the current session to expose the user's role set, which is a small Rust change to the authenticated `CurrentSession` DTO.

**Architecture:** Rust: a new `role::list_roles` repository read + a `roles: Vec<String>` field on the `CurrentSession` DTO, populated in `commands::auth::to_dto`. Frontend: `CurrentSession` gains `roles: string[]` (a thin serde passthrough — no mapper to change); a new `src/ui/HomeScreen.tsx` switches on the role set and renders the existing `TeacherWorkspaceScreen` (for the teacher view) or a new `src/ui/home/SchoolHeadHome.tsx` (built on the Wave 2 primitives, existing data only). `App.tsx` renders `<HomeScreen>` for the `workspace` tab. `TeacherWorkspaceScreen` is **not** deleted this wave — its visual redesign and removal is a later slice.

**Tech Stack:** Rust (rusqlite, `cargo test` / `cargo nextest`), React + TS, Vitest + RTL, `src/test/a11y.ts`.

**Spec:** `docs/superpowers/specs/2026-09-03-likha-ui-redesign-design.md` §5.1, §6.2, §8 (Wave 3 row). Waves 1–2 are already on this branch.

## Global Constraints

- **The frontend role set is display-only.** It selects which Home layout renders. It is **never** an authorization boundary — every command still goes through its server-side `authorize_*` gate unchanged. No `if (role === …)` anywhere gates a mutation or a data read that the backend wouldn't already refuse. State this in code comments where `roles` is consumed.
- **Auth-touching → mandatory independent security review.** Per `.claude/rules/security-privacy.md`, this wave gets a `security-reviewer` pass before the wave is marked complete (Task 6). The review covers: the new `list_roles` query is school-scoped and parameterised; `to_dto` cannot leak another user's roles; the DTO change doesn't widen what an unauthenticated caller learns; no `authorize_*` gate is bypassed by the new frontend field.
- **TDD for the Rust** (`role::list_roles`, the `to_dto` shape) — failing test first (`.claude/rules/testing.md`).
- **No new dependency. No schema/migration** — `user_school_roles` already has the `(user_id, school_id, role)` rows. No change to any `authorize_*` function, capability, or existing command's behaviour beyond the additive DTO field.
- **`SchoolHeadHome` uses existing reads only** — `sectionService.listSections()`, `learnerService.listLearners()`, and the SF1 import history read the SF1 screen already uses. No new Rust read this wave (the school-wide attendance rollup + advisers-without + teacher-load aggregate are **Wave 4**).
- **Density parity, `prefers-reduced-motion`, axe per new screen.** `SchoolHeadHome` is built on `Page`/`KpiStrip`/`BentoGrid`/`Card`.
- Test-file imports: `import type { ... } from "react"` named/type-only. Commits: conventional, `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`. Branch: `claude/ui-redesign-wave-1-shell`.
- Per task: `npm run quality` green (Rust tasks also `cargo test`); wave boundary (Task 6): `npm run quality:full` exit 0.

---

## File Structure

**Created**

- `src/ui/HomeScreen.tsx` / `.test.tsx` — role-adaptive shell.
- `src/ui/home/SchoolHeadHome.tsx` / `.test.tsx` — school-wide overview.

**Modified**

- `src-tauri/src/repository/role.rs` — add `pub fn list_roles(conn, user_id, school_id) -> AppResult<Vec<String>>` + unit tests.
- `src-tauri/src/commands/auth.rs` — `CurrentSession` gains `pub roles: Vec<String>`; `to_dto` populates it via `role::list_roles`.
- `src-tauri/tests/*` — whichever command-boundary test asserts the `login`/`current_session` DTO shape gains a `roles` assertion (grep `current_session` / `CurrentSession` under `src-tauri/tests/`).
- `src/domain/session.ts` — `CurrentSession` gains `roles: string[]` (documented display-only).
- `src/infrastructure/tauri/auth-repository.test.ts`, `src/App.test.tsx`, and any other TS test with a `CurrentSession` fixture — add `roles: [...]` (grep `idleExpiresAtUnixMs` to find them all).
- `src/App.tsx` — the `activeTab === "workspace"` branch renders `<HomeScreen …>` instead of `<TeacherWorkspaceScreen …>`, passing `roles={session.roles}` + the same services + the same `onOpen*` handlers.
- `docs/adr/0057-ui-redesign-shell.md` (Wave 3 addendum), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`.

---

## Task 1: `role::list_roles` (Rust, TDD)

**Files:** `src-tauri/src/repository/role.rs`.

**Interfaces:** Produces `pub fn list_roles(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<Vec<String>>` — every role string in `user_school_roles` for that `(user_id, school_id)`, ordered deterministically (`ORDER BY role`). Empty vec if the user has no roles in that school (not an error).

- [ ] **Step 1: failing tests** in `role.rs`'s `#[cfg(test)] mod tests` (mirror the existing `grant` / `has_any_role` test style — they set up an in-memory DB, a school, a membership, then grant):
  - `list_roles_returns_empty_for_a_user_with_no_roles`
  - `list_roles_returns_every_granted_role_sorted` (grant TEACHER + SCHOOL_HEAD → `vec!["school_head", "teacher"]`)
  - `list_roles_is_school_scoped` (grant a role in school A; `list_roles(_, user, school_B)` → empty)

- [ ] **Step 2: run — FAIL** (`cd src-tauri && cargo test role::tests::list_roles` — undefined).

- [ ] **Step 3: implement:**

```rust
/// Every role `user_id` holds within `school_id`, sorted for a stable
/// result. Empty (not an error) when the user has no roles there. A
/// fresh lookup, never cached -- same reasoning as `has_any_role`.
pub fn list_roles(conn: &Connection, user_id: &str, school_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT role FROM user_school_roles WHERE user_id = ?1 AND school_id = ?2 ORDER BY role",
    )?;
    let rows = stmt.query_map((user_id, school_id), |row| row.get::<_, String>(0))?;
    let mut roles = Vec::new();
    for role in rows {
        roles.push(role?);
    }
    Ok(roles)
}
```

- [ ] **Step 4: run — PASS.** `cargo fmt`. `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 5: commit** (`feat(rust): role::list_roles school-scoped read`).

---

## Task 2: `roles` on the `CurrentSession` DTO (Rust)

**Files:** `src-tauri/src/commands/auth.rs`; the command-boundary test(s) asserting the DTO.

**Interfaces:** Consumes `role::list_roles` (Task 1). Produces: `CurrentSession` struct gains `pub roles: Vec<String>` (serialised as `roles`, camelCase already matches); `to_dto` sets `roles: role::list_roles(conn, &user.id, &session.school_id)?`.

- [ ] **Step 1: locate the boundary test** — `grep -rn "current_session\|CurrentSession\|\"login\"" src-tauri/tests/`. Add to the test that logs in and inspects the returned session: assert the fresh session's `roles` contains the roles the test granted (the bootstrap/first-run path grants all three — `["registrar", "school_head", "teacher"]` sorted). Write that assertion first (RED — field doesn't exist yet → compile error).

- [ ] **Step 2: run — FAIL** (compile error: no field `roles`).

- [ ] **Step 3: implement:**
  - Add `pub roles: Vec<String>,` to `struct CurrentSession` (after `idle_expires_at_unix_ms`, with a `///` doc: "Every role the user holds in this school. **Display-only** — the frontend uses it to pick a layout; it is never an authorization signal. Server-side `authorize_*` gates are the only enforcement.").
  - In `to_dto`, after resolving `user` and `school`: `let roles = role::list_roles(conn, &user.id, &session.school_id)?;` and add `roles,` to the returned struct literal. Import `role` from `crate::repository` if not already in scope.

- [ ] **Step 4: run — PASS.** `cargo fmt`; `cargo test` (whole `src-tauri` suite — 602 lib + integration, expect +N for Task 1's tests, 0 failed); `cargo clippy --all-targets -- -D warnings` clean.

- [ ] **Step 5: commit** (`feat(rust): expose the user's role set on CurrentSession (display-only)`).

---

## Task 3: `roles` on the frontend `CurrentSession` + fixtures

**Files:** `src/domain/session.ts`; every TS test/fixture with a `CurrentSession` literal.

**Interfaces:** Produces: `CurrentSession.roles: string[]`.

- [ ] **Step 1:** add to `src/domain/session.ts`'s `CurrentSession` interface, after `idleExpiresAtUnixMs`:

```ts
  /**
   * Every role the signed-in user holds in this school (e.g.
   * `["school_head", "teacher"]`). Display-only: the UI uses it to
   * choose which Home layout to show. It is NOT an authorization
   * signal — every protected command is gated server-side regardless
   * of what this array says.
   */
  roles: string[];
```

- [ ] **Step 2:** `grep -rn "idleExpiresAtUnixMs" src --include=*.ts --include=*.tsx` → every file with a `CurrentSession` fixture. Add `roles: ["teacher"]` (or `["school_head", "teacher"]` where a test needs the School-Head path) to each literal. Run `npm run typecheck` — it will name any you missed.

- [ ] **Step 3:** `npm run quality` green (typecheck now enforces the field everywhere).

- [ ] **Step 4: commit** (`feat(ui): roles on the frontend CurrentSession projection`).

---

## Task 4: `SchoolHeadHome`

**Files:** Create `src/ui/home/SchoolHeadHome.tsx`, `src/ui/home/SchoolHeadHome.test.tsx`. May add CSS to `styles.css`.

**Interfaces:**

```ts
interface SchoolHeadHomeProps {
  schoolName: string;
  sectionService: SectionApplicationService;
  learnerService: LearnerApplicationService;
  sf1ImportService: Sf1ImportApplicationService; // for recent import history
  onManageSections: () => void;
  onOpenSf1Import: () => void;
}
export function SchoolHeadHome(props: SchoolHeadHomeProps): JSX.Element;
```

Renders `<Page title="School overview" hint={…}>` → a `<KpiStrip>` of `Kpi`s (Sections = `sections.length`, Learners = `learners.length`, both loaded from the existing services; a third tile "This school year" showing the school year if uniform, else "—") → a `<BentoGrid>` with:

- a `Card` `title="Recent SF1 imports"` `span={6}` `keepHalf` listing the last few import-history rows (reuse whatever list shape `Sf1ImportScreen` already renders; if the history read isn't trivially reusable, show an EmptyState + a "Go to SF1 import" button and note it), with an `actions` "History" link calling `onOpenSf1Import`;
- a `Card` `title="Manage"` `span={6}` `keepHalf` with quick-nav buttons ("Manage sections" → `onManageSections`, "SF1 import" → `onOpenSf1Import`).
  Loading / error / empty states via `Alert`/`Loading`/`EmptyState` exactly like the other screens. `requestRef` guard on the async load.

- [ ] **Step 1: read `Sf1ImportScreen.tsx`** to learn the exact import-history read (`sf1ImportService.<method>()`) and row shape. If there is no clean list method, scope this card down to the EmptyState + button form and record it as a Wave 4 enrichment.

- [ ] **Step 2: failing test** — mock the three services; assert: the two count KPIs render with the mocked counts; the two cards render with their titles; quick-nav buttons call the right callbacks; loading → `Loading`; a service reject → `Alert` + a Retry that re-loads; `await expectNoAccessibilityViolations(container)`.

- [ ] **Step 3: implement** per the interface. Use `Page`/`KpiStrip`/`Kpi`/`BentoGrid`/`Card` from `./components/*` (relative to `src/ui/home/` that's `../components/*`).

- [ ] **Step 4: `npm run test -- src/ui/home/SchoolHeadHome.test.tsx` green; `npm run quality` green.**

- [ ] **Step 5: commit** (`feat(ui): SchoolHeadHome school-wide overview (existing data)`).

---

## Task 5: `HomeScreen` + wire `App.tsx`

**Files:** Create `src/ui/HomeScreen.tsx`, `src/ui/HomeScreen.test.tsx`. Modify `src/App.tsx`, `src/App.test.tsx`.

**Interfaces:**

```ts
interface HomeScreenProps {
  roles: string[];
  // teacher-view (TeacherWorkspaceScreen) pass-throughs:
  displayName: string;
  attendanceService: AttendanceApplicationService;
  authService: AuthApplicationService;
  gradingService: GradingApplicationService;
  learnerService: LearnerApplicationService;
  sectionService: SectionApplicationService;
  sf1ImportService: Sf1ImportApplicationService;
  schoolName: string;
  onOpenAttendance: (sectionId: string) => void;
  onManageSections: () => void;
  onViewAuditLog: () => void;
  onOpenSf1Import: () => void;
}
export function HomeScreen(props: HomeScreenProps): JSX.Element;
```

Behaviour:

- `const isSchoolHead = roles.includes("school_head");`
- If **not** school head: render `<TeacherWorkspaceScreen …>` with the existing props (this IS the teacher Home for now).
- If school head: render a small view-switch — two `aria-pressed` buttons "School overview" / "My teaching" in a `role="group" aria-label="Home view"` — defaulting to "School overview". "School overview" → `<SchoolHeadHome …>`; "My teaching" → `<TeacherWorkspaceScreen …>`. The switch is local `useState`, no persistence this wave.
- A `// roles is display-only — see domain/session.ts` comment at the `isSchoolHead` line.

- [ ] **Step 1: failing test** — `roles={["teacher"]}` → renders the Workspace region (`getByRole("region", { name: "Workspace" })`), no view-switch. `roles={["school_head", "teacher"]}` → a "Home view" group with two buttons, "School overview" pressed, `SchoolHeadHome`'s "School overview" heading visible; clicking "My teaching" shows the Workspace region and flips `aria-pressed`. axe on both. (Mock the services minimally — the Workspace + SchoolHeadHome each have their own detailed tests; here just assert the switch.)

- [ ] **Step 2–4: FAIL → implement → PASS.**

- [ ] **Step 5: wire `App.tsx`:** in the `activeTab === "workspace"` branch, replace `<TeacherWorkspaceScreen … />` with:

```tsx
<HomeScreen
  roles={session.roles}
  displayName={session.displayName}
  schoolName={session.schoolName}
  attendanceService={attendanceService}
  authService={authService}
  gradingService={gradingService}
  learnerService={learnerService}
  sectionService={sectionService}
  sf1ImportService={sf1ImportService}
  onOpenAttendance={(sectionId) => {
    setAttendanceSectionId(sectionId);
    setActiveTab("attendance");
  }}
  onManageSections={() => setActiveTab("sections")}
  onViewAuditLog={() => setActiveTab("audit-log")}
  onOpenSf1Import={() => setActiveTab("sf1-import")}
/>
```

Import `HomeScreen` from `./ui/HomeScreen`. `TeacherWorkspaceScreen` stays imported (HomeScreen uses it). `TAB_LABELS.workspace` is already "Home"; no nav-data change.

- [ ] **Step 6: `App.test.tsx`** — the "shows the workspace overview by default" test now goes through `HomeScreen`. With the default fixture `roles: ["teacher"]` it still renders the Workspace region → the existing assertion `findByRole("region", { name: "Workspace" })` passes unchanged. Add one test: a session fixture with `roles: ["school_head", "teacher"]` → the Home view group + "School overview" render. Keep every other assertion.

- [ ] **Step 7: `npm run quality` green. Commit** (`feat(ui): role-adaptive HomeScreen; wire it as the Home tab`).

---

## Task 6: ADR addendum + docs + gate + security review

**Files:** `docs/adr/0057-ui-redesign-shell.md` (Wave 3 addendum), `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/VERIFICATION-DEBT.md`.

- [ ] **Step 1: ADR Wave 3 addendum** — the `roles` DTO field (display-only, not an authz signal); `role::list_roles` (school-scoped, sorted); `HomeScreen` role switch (teacher → Workspace; school-head → overview + view-switch); `SchoolHeadHome` scope (existing counts + SF1 history only; attendance rollup / advisers-without / teacher-load aggregate deferred to Wave 4); `TeacherWorkspaceScreen` deliberately retained (visual redesign + deletion is a later slice).

- [ ] **Step 2: state docs** — `PROJECT-MEMORY.md` one line. `CURRENT-HANDOFF.md` top entry with the commit range, `quality:full` result, the security-review outcome, and **exact next slice = Wave 4: the school-wide attendance-today rollup read (Rust, capability-gated, school-scoped, its own security review) + enrich `SchoolHeadHome` with attendance-by-grade, sections-without-an-adviser, and per-teacher load; its own plan.** `ACTIVE-PLAN.md` a "Wave 3 — complete" section. `VERIFICATION-DEBT.md` — note the native pass now also owes the Home screens.

- [ ] **Step 3: gates** — `npm run quality:full` exit 0 (harness 100/100 unchanged; typecheck/lint/format/architecture; vitest up by the new tests; `cargo fmt --check` clean; `cargo test` up by Task 1's + Task 2's tests, 0 failed; `cargo clippy` clean). `npm run quality:security` exit 0 (no dependency). `npm run build` — record CSS/JS gzip. `npm run check:dev-preview-isolation` exit 0. `npx knip` — no new findings (`HomeScreen` consumed by `App.tsx`; `SchoolHeadHome` by `HomeScreen`; if `HomeScreenProps`/`SchoolHeadHomeProps` types trip "unused exported types", don't export them — keep them file-local).

- [ ] **Step 4: commit** (`docs: record Wave 3 (role-adaptive Home) — ADR addendum + state docs`).

- [ ] **Step 5: MANDATORY independent security review** — dispatch `security-reviewer` (read-only) against the wave's commit range. Focus: `role::list_roles` is parameterised + school-scoped + can't return another user's or another school's roles; `to_dto` populates `roles` only for the authenticated session's own `user_id`/`school_id`; the DTO change doesn't widen what `current_session` returns to an unauthenticated/expired caller (it still returns `Ok(None)` / `Unauthorized` before `to_dto`); no `authorize_*` gate, capability check, or command behaviour changed; the frontend `roles` field is not used to gate any mutation or privileged read (grep `roles.includes` / `roles.` in `src/`). If it returns a Critical/Important finding, fix it (one fix round) and re-review; if the reviewer harness fails to return findings, record it, do a rigorous controller self-review against that same checklist, retain the debt, and continue (per `.claude/rules/autonomous-development.md`).

---

## Self-Review

**Spec coverage:** §6.2 "add `role` to the frontend `CurrentSession`" → Tasks 1–3 (as `roles: string[]`, since a user can hold several — `repository/role.rs` documents this). §8 Wave 3 "`HomeScreen` + Teacher view + `SchoolHeadHome` without the attendance rollup, existing data only" → Tasks 4–5; `SchoolHeadHome`'s deferred cards (attendance-by-grade, advisers-without, teacher-load) are explicitly Wave 4 per §6.2 ("School Head Home ships in Wave 3 without this"). §5.1 "`HomeScreen` reads `session.role`" → Task 5 (`roles.includes("school_head")`). "Absorbs `TeacherWorkspaceScreen`, delete the old file" → **partially deferred**: the teacher Home renders the existing Workspace this wave; its redesign onto the primitives + file deletion is recorded as a later slice to keep an auth-touching wave's blast radius small. Security review (§ security-privacy rule) → Task 6 Step 5.

**Placeholder scan:** none — every task has concrete code or a concrete assertion list; the one genuine unknown (the exact SF1 import-history read) is a named Step 1 investigation with a defined fallback.

**Type consistency:** `roles: Vec<String>` (Rust) ↔ `roles: string[]` (TS) via serde `rename_all = "camelCase"` (already on the struct; `roles` needs no rename). `list_roles(conn, user_id, school_id)` signature matches its one call site in `to_dto`. `HomeScreenProps` / `SchoolHeadHomeProps` field names match their `App.tsx` / `HomeScreen` call sites. `roles.includes("school_head")` uses the literal that `role::SCHOOL_HEAD` (`"school_head"`) serialises to.
