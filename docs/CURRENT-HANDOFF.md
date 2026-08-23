# CURRENT HANDOFF

## Status

M0–M5 are all complete and verified (2026-08-23). Working tree is
**uncommitted past the original M0 commits** — this was an autonomous run
explicitly told not to commit further; the user reviews before the next
commit. Run `git status` / `git log` to see exactly what's committed vs.
new.

## Current Goal

M6 (first-run/bootstrap UI) is identified but **not started** — see
`ACTIVE-PLAN.md` M6. This session stopped here deliberately after two
full, independently-reviewed milestones (M4, M5) rather than continuing
to expand scope in one sitting; nothing about M6 is blocked.

## Constraints

- Do not import or depend on old application code.
- Use synthetic data only.
- Keep dependencies minimal.
- Do not add paid services or billing-enabled infrastructure.
- Preserve architecture boundaries from `PROJECT-MEMORY.md`.
- Do not commit or push (holds for this autonomous run; re-check before
  assuming it still applies in a later session).

## Environment Notes

- Rust `stable-x86_64-pc-windows-msvc`, Visual Studio Build Tools 2022
  (C++ workload), and Strawberry Perl (needed to compile vendored OpenSSL
  for SQLCipher) are all installed on this machine via winget.
- `tauri.conf.json` uses a placeholder identifier `org.likhasis.app` —
  fine for local development; revisit before any real distribution or
  code signing.
- `npm run quality` is the canonical local TS check (typecheck, lint,
  format:check, test). For Rust: `cargo test`, then
  `cargo clippy --all-targets -- -D warnings`.
- The working SQLite database is encrypted (SQLCipher) and keyed via
  Windows DPAPI — see `docs/adr/0003-encryption-at-rest.md`.
- All SQL lives in Rust (`src-tauri/src/repository/`); the frontend never
  constructs SQL — see `docs/adr/0002-local-database-foundation.md`.
- **Authentication/authorization** — see
  `docs/adr/0004-authentication-and-local-session.md` before touching
  `src-tauri/src/auth/`, `commands/{auth,user,learner}.rs`, or any TS
  `AuthApplicationService`/`LearnerApplicationService` usage. Any Tauri
  command reading/writing tenant data must derive scope from
  `sessions.require_active_school_scope(&conn)`, never accept it as a
  parameter; any command creating accounts/memberships must go through an
  `authorize_*` gate in `auth/mod.rs`. This exact gap (unauthenticated
  bootstrap commands with no limit) was found and fixed once already —
  don't reintroduce it.
- **UI** — see `docs/adr/0005-app-shell-and-first-ui-slice.md`. New
  screens go in `src/ui/`, receive their `*ApplicationService`s as props
  (never import `composition.ts` directly, so they stay testable with
  fakes), and should check `useTeacherMode()` before assuming
  `Guided`-only content isn't needed. `src/composition.ts` is the only
  file allowed to import concrete `infrastructure/tauri/*` classes.
- **Visual verification gap, standing**: this environment has no
  browser/screenshot/rendering tool. Every future UI milestone will hit
  the same limitation M5 did — plan to flag it the same way (verify
  everything objectively checkable, state plainly what wasn't), not to
  work around it by guessing.
- `vitest-axe` was tried and dropped (unmaintained, v0.1.0, types don't
  match Vitest 4.x) in favor of a direct `axe-core` wrapper at
  `src/test/a11y.ts` — use `expectNoAccessibilityViolations(container)`
  for new screens' structural accessibility tests.

## Next Action

Build the M6 first-run/bootstrap UI: a path (likely reachable from
`LoginScreen` when `schoolService.listAll()` returns empty) that calls
`SchoolApplicationService.registerSchool`, `UserApplicationService.registerUser`,
and `.addUserToSchool` to create the first school and teacher account on
a fresh install. Full rationale in `ACTIVE-PLAN.md` M6.

## Completion Gate

M6 is complete only when: the bootstrap path is reachable from the actual
app (not just callable in isolation), `npm run quality`/`cargo test`
stay clean, and — as with M5 — the visual-verification limitation is
reported honestly rather than glossed over.
