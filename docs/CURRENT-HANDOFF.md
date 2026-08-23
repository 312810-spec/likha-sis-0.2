# CURRENT HANDOFF

## Status

M0–M6 are all complete and verified. Working tree is **uncommitted past
the original M0 commits** — this was an autonomous run explicitly told
not to commit further; the user reviews before the next commit. Run
`git status` / `git log` to see exactly what's committed vs. new.

A Claude Code development harness upgrade is also complete (2026-08-24):
see `docs/adr/0007-claude-code-harness-architecture.md` and
`docs/PROJECT-MEMORY.md`'s "Claude Code Development Harness" section for
what exists (`.claude/rules/`, `.claude/skills/` — 16, `.claude/agents/`
— 8 read-only, `.claude/settings.json` + hooks, security tooling). This
was infrastructure work, not an application milestone — no M0–M6
application behavior was changed, one line was added to
`src-tauri/Cargo.toml` (`publish = false`, a real `cargo deny` finding).
Independently reviewed (security/architecture/reliability agents, then a
fresh `evaluator` pass) — the evaluator's first pass correctly FAILed on
a claim that had been recorded as adopted (the `security-guidance`
plugin) before any config for it actually existed; that's now fixed
(declared in `.claude/settings.json`) and disclosed with the same
not-yet-runtime-verified caveat as the hooks below.

**Known, disclosed gap**: `.claude/settings.json` (hooks and the
`security-guidance` plugin declaration) did not exist when this session
started, so neither was observed actually active in this same session —
the settings-file watcher only watches directories that existed at
session start. Run `/hooks` once, or start a fresh session, to activate
them, then spot-check: e.g. try a destructive-looking Bash command and
confirm it prompts instead of running silently.

**Graphify code-graph tool — evaluated and REJECTED (2026-08-24), no
installation occurred.** Independently verified via `gh api` (not just
the research summary): 109,806 stars / 10,675 forks on a repo created
4.5 months prior — a ~245x gap over the next most-starred same-named
project, consistent with fake-star reputation laundering — plus the
maintainers explicitly declining to fix a live, acknowledged PyPI
typosquat vector on their own install path. No code from that project
was downloaded, cloned, or executed. Full writeup:
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`. No
harness change resulted from this beyond documenting the rejection —
`.claude/`'s skill/agent/hook set is unchanged from the prior session.

## Current Goal

**No next application milestone is defined.** `docs/ACTIVE-PLAN.md`'s
"Out of Scope" list (cloud sync, roles/permissions, password reset/
lockout/idle-timeout, attendance/grading/official forms, Android) is a
deliberately-deferred list, not a queue — none of those is "the next
task" by default, and picking one is a product decision, not an
engineering one. This is a genuine blocker for autonomous continuation:
the harness's own rule (`CLAUDE.md`, `.claude/rules/project-state.md`)
is to continue automatically only when the next safe step is already
recorded here, and none is.

Before starting new application work, the user should say what M7 covers
(a candidate list, not a decision made on their behalf): attendance,
grading, an official DepEd form via the `deped-researcher` +
`official-forms` skills, roles/permissions beyond school-scoped sessions,
or something else entirely.

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
  format:check, an architecture-boundary check, test). For Rust:
  `cargo test`, then `cargo clippy --all-targets -- -D warnings`. New
  tiers from the harness upgrade: `npm run quality:security` (Gitleaks +
  cargo-deny + OSV-Scanner, via `scripts/check-security.mjs` — explicitly
  distinguishes "tool missing" from "tool ran clean"), `npm run
quality:ui` (currently an honest placeholder — no Playwright UI-smoke
  suite exists yet), `npm run quality:full` (adds the Rust checks). All
  four security tools (Gitleaks, cargo-deny, OSV-Scanner,
  `@playwright/cli`) require a fresh shell/session to be on `PATH` after
  this session's winget/cargo/npm installs.
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
- **UI** — see `docs/adr/0005-app-shell-and-first-ui-slice.md` and
  `docs/adr/0006-first-run-bootstrap.md`. New screens go in `src/ui/`,
  receive their `*ApplicationService`s as props (never import
  `composition.ts` directly, so they stay testable with fakes), and
  should check `useTeacherMode()` before assuming `Guided`-only content
  isn't needed. `src/composition.ts` is the only file allowed to import
  concrete `infrastructure/tauri/*` classes — enforced by
  `npm run check:architecture` now, not just convention.
- **Visual verification gap, standing**: this environment has no
  browser/screenshot/rendering tool for the compiled native app. Every
  future UI milestone will hit the same limitation M5/M6 did — plan to
  flag it the same way (verify everything objectively checkable, state
  plainly what wasn't), not to work around it by guessing. `@playwright/cli`
  (adopted this session) can partially help for the browser-rendered
  `vite dev` surface only — it cannot attach to the compiled Tauri
  webview. See `docs/VERIFICATION-DEBT.md`.
- `vitest-axe` was tried and dropped (unmaintained, v0.1.0, types don't
  match Vitest 4.x) in favor of a direct `axe-core` wrapper at
  `src/test/a11y.ts` — use `expectNoAccessibilityViolations(container)`
  for new screens' structural accessibility tests.

## Next Action

Ask the user which application milestone (M7) to pursue — see "Current
Goal" above. Do not pick one unilaterally. Once directed, follow
`docs/CURRENT-HANDOFF.md`'s own workflow (`.claude/rules/project-state.md`):
inspect → research if needed (skills: `deped-compliance`,
`official-forms`, or the `dependency-researcher`/`deped-researcher`
agents as appropriate) → specify → implement with TDD for
domain/security/persistence logic → independent review via the relevant
`.claude/agents/*-reviewer.md` → record in `PROJECT-MEMORY.md`/
`ACTIVE-PLAN.md`/`CURRENT-HANDOFF.md`.

If instead asked to continue harness work: the harness itself is
complete per `docs/adr/0007-claude-code-harness-architecture.md`. An
`evaluator` pass FAILed once on a real gap (the `security-guidance`
plugin was documented as adopted before it was actually configured, plus
two stray junk files) — both fixed; see
`.planning/harness-upgrade/progress.md` for the full log and confirm a
re-run evaluator PASS is recorded there before treating this as settled.
Remaining optional/deferred items, not blockers:
piloting the `@wdio/tauri-service` native-binary smoke test (currently
just researched and adopted-as-PILOT, not yet executed — see
`docs/SOURCE-REGISTRY.md`), and confirming the hooks/`security-guidance`
plugin are actually live after a `/hooks` reload or restart.

## Completion Gate

An application milestone is complete only when: it's reachable from the
actual app (not just callable in isolation), `npm run quality`/
`cargo test` stay clean, an independent reviewer agent has checked it,
and — as with M5/M6 — the visual-verification limitation is reported
honestly rather than glossed over.
