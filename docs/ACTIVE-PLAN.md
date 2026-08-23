# ACTIVE PLAN

## Current Milestone — M0 Workspace Foundation

Goal: create a clean, reproducible, production-oriented development baseline before feature work.

### M0 Tasks

- [ ] Initialize React + TypeScript + Vite.
- [ ] Initialize Tauri 2.
- [ ] Use npm unless later evidence justifies changing it.
- [ ] Enable strict TypeScript.
- [ ] Configure linting and formatting.
- [ ] Configure unit tests.
- [ ] Add production/build scripts.
- [ ] Add `.gitignore`.
- [ ] Establish `npm run quality` as the canonical local quality command.
- [ ] Verify dependency installation.
- [ ] Verify lint.
- [ ] Verify typecheck.
- [ ] Verify unit tests.
- [ ] Verify production web build.
- [ ] Run Tauri checks supported by the current environment.
- [ ] Remove unnecessary starter code/dependencies.
- [ ] Record stable M0 checkpoint.

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
