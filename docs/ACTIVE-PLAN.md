# ACTIVE PLAN

## Current Milestone — M0 Workspace Foundation

Goal: create a clean, reproducible, production-oriented development baseline before feature work.

### M0 Tasks

- [x] Initialize React + TypeScript + Vite.
- [x] Initialize Tauri 2.
- [x] Use npm unless later evidence justifies changing it.
- [x] Enable strict TypeScript.
- [x] Configure linting and formatting.
- [x] Configure unit tests.
- [x] Add production/build scripts.
- [x] Add `.gitignore`.
- [x] Establish `npm run quality` as the canonical local quality command.
- [x] Verify dependency installation.
- [x] Verify lint.
- [x] Verify typecheck.
- [x] Verify unit tests.
- [x] Verify production web build.
- [x] Run Tauri checks supported by the current environment.
- [x] Remove unnecessary starter code/dependencies.
- [x] Record stable M0 checkpoint.

### M0 Status: Complete

Verified on this machine (2026-08-23):

- `npm install` — clean, 0 vulnerabilities.
- `npm run typecheck` — passes (`tsc -b --noEmit`, strict mode).
- `npm run lint` — passes (ESLint flat config, 0 issues).
- `npm run format:check` — passes (Prettier, all files).
- `npm run test` — passes (1/1, Vitest + Testing Library, jsdom).
- `npm run build` — passes (Vite production build).
- `cargo check` / `cargo build` in `src-tauri/` — both pass. Rust
  `stable-x86_64-pc-windows-msvc` toolchain and Visual Studio Build Tools
  2022 (C++ workload) were installed via winget during this session and
  produced a linked `app.exe`.

Not run: `tauri build` (installer bundling via WiX/NSIS) and `tauri dev`
(interactive window) — out of scope for a workspace-foundation checkpoint
and not needed to verify the toolchain.

## Next Milestone — M1 Windows LocalDatabase Foundation

Do not begin until M0 is verified.

Objectives:

- Define a provider-independent `LocalDatabase` boundary.
- Prove ordinary SQLite first.
- Use migrations and transactions.
- Use synthetic data.
- Verify persistence across restart.
- Verify rollback behavior.
- Verify school-scope isolation.
- Keep UI/domain independent of concrete SQLite/Tauri implementation.
- Perform encryption-at-rest as a separate later spike.

## Out of Scope for M0

- cloud sync
- authentication
- encryption implementation
- learner feature development
- attendance
- grading
- school forms
- Android-specific workflows
