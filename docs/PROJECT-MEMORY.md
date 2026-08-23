# PROJECT MEMORY

## Purpose

Durable project facts only. Do not use this as a transcript.

## Product

LIKHA-SIS 0.2 is a native-first, local-first, offline-capable SIS for Philippine DepEd schools.

Primary targets:

- Windows desktop
- Android mobile

Shared stack:

- React
- TypeScript
- Tauri 2

## Locked Principles

- Privacy/security is highest priority.
- Synthetic data only in development, testing, screenshots, fixtures, demos, and AI-assisted work.
- SQLite is the device working database.
- Offline writes persist locally immediately.
- Synchronization is a separate subsystem.
- Provider-specific infrastructure stays behind interfaces/adapters.
- UI/domain must not depend directly on cloud providers.
- Zero-billing-oriented; no paid services without explicit approval.
- Comfortable is the default teacher interface mode.
- Efficient / Comfortable / Guided retain functional parity.

## Architecture

UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud

## Current Foundation

Greenfield repository. No old implementation is authoritative.

- M0 Workspace Foundation (React + TypeScript + Vite + Tauri 2, strict
  TypeScript, ESLint, Prettier, Vitest, `npm run quality`) is complete.
- M1 LocalDatabase Foundation is complete: all SQL lives in the Rust core
  (`src-tauri/src/{db,repository,commands,error}.rs`) behind narrow Tauri
  commands — the frontend never sends SQL, not even parameterized SQL.
  Decision and rationale: `docs/adr/0002-local-database-foundation.md`.
  UI/application code depends only on `src/domain/ports/*`, implemented by
  `src/infrastructure/tauri/*`.
- M2 Encryption-at-Rest is complete: the working SQLite database is
  SQLCipher-encrypted with a raw 256-bit key protected by Windows DPAPI,
  fail-closed on a corrupted/undecryptable key file (never silently mints
  a replacement key). Decision and threat-model notes:
  `docs/adr/0003-encryption-at-rest.md`. Building `src-tauri` now requires
  Perl (Strawberry Perl) on the machine, for vendored OpenSSL.
- M3 Application Services Foundation is complete:
  `src/application/{school,learner}-service.ts` validate input (trim,
  non-empty, max length) before calling a repository — new TS entities
  should follow this pattern rather than calling a repository port
  directly from UI code.
- M4 Authentication & Local Session Foundation is complete. Deployment
  model (authoritative, from the user): shared school computers, multiple
  teachers, no 1:1 Windows-account assumption — each teacher has an
  independent LIKHA username+password identity. Argon2id hashing, local
  offline auth, session tied to identity + school scope. `school_id` is
  never a client-supplied argument for tenant-data commands — it's always
  derived from the authenticated session
  (`SessionManager::require_active_school_scope`), which never survives a
  process restart. Any new command that creates accounts/memberships or
  touches tenant data must follow the authorization pattern in
  `docs/adr/0004-authentication-and-local-session.md` — an earlier draft
  of this milestone shipped an unauthenticated bootstrap path that let
  anyone self-grant access to an existing school; caught by review and
  closed. No roles/permissions system yet, deliberately.
- M5 App Shell & First Learner UI Vertical Slice is complete: the first
  real screens (`src/ui/{AppShell,LoginScreen,LearnerListScreen}.tsx`),
  wired through a composition root (`src/composition.ts` — the only file
  allowed to import concrete `infrastructure/tauri/*` classes) and the
  Efficient/Comfortable/Guided teacher modes (`src/ui/theme/`), now
  actually working (Guided shows real contextual help other modes don't,
  not just bigger text). Decision and review findings:
  `docs/adr/0005-app-shell-and-first-ui-slice.md`. This session's
  environment has no browser/screenshot/rendering tool — nothing about
  actual visual appearance was or could be verified; only structural/
  accessibility/behavioral testing (React Testing Library + `axe-core`)
  and computed WCAG contrast ratios. A human visual/screen-reader pass on
  the running app is still owed.
- As of this note, work since the M0 commit is uncommitted in the working
  tree (an explicit instruction for this session was not to commit). Check
  `git status` before assuming any particular commit reflects current
  state.

## Claude Code Development Harness

A one-time harness upgrade (2026-08-24) built the project-local Claude
Code operating system: `.claude/rules/` (architecture, security-privacy,
testing, project-state), `.claude/skills/` (16, task-triggered),
`.claude/agents/` (8, read-only reviewers/researchers — `evaluator`,
`security-reviewer`, `architecture-reviewer`, `reliability-reviewer`,
`teacher-ux-reviewer`, `accessibility-reviewer`, `deped-researcher`,
`dependency-researcher`), and `.claude/settings.json` +
`.claude/hooks/*.cjs` (deterministic SessionStart/PreToolUse/PostToolUse/
PreCompact/SubagentStop/Stop hooks — no auto-commit, no auto-loop).
Decision record: `docs/adr/0007-claude-code-harness-architecture.md`.
`CLAUDE.md` stays small by design (~90 lines); durable third-party
tooling decisions live in `docs/SOURCE-REGISTRY.md`, known-pending
verification in `docs/VERIFICATION-DEBT.md`. Security/dependency tooling
(Gitleaks, cargo-deny, OSV-Scanner) is installed and wired into
`npm run quality:security` (`scripts/check-security.mjs`, which
distinguishes "tool missing" from "tool ran, found nothing" — a plain
`&&` chain of the three tools can't, since all three exit 1 for both
cases). A new deterministic `scripts/check-architecture.mjs` enforces the
UI/domain/application → infrastructure import-direction boundary as part
of `npm run quality`. For a substantial multi-phase task, working memory
lives in `.planning/<task>/{task_plan,findings,progress}.md`
(gitignored, disposable — see the `planning-with-files` skill); this
harness upgrade itself used that pattern under
`.planning/harness-upgrade/`.

Third-party dev-tooling gets a supply-chain trust check before
installation, not just a feature-fit check — `Graphify-Labs/graphify`
(a code-graph accelerator) was rejected on independently-verified
anomalous GitHub star/fork counts and an unaddressed PyPI typosquat
vector before any code from it was ever run on this machine. See
`docs/SOURCE-REGISTRY.md` and `.planning/graphify-eval/findings.md`.

## Current Milestone

See `ACTIVE-PLAN.md`.
