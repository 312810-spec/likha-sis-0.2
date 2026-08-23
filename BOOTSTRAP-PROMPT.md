# Claude Code Bootstrap Prompt

This is a GREENFIELD LIKHA-SIS 0.2 repository. Do not assume, search for, or depend on an older implementation.

Before changing code, read:

- `CLAUDE.md`
- `docs/PROJECT-MEMORY.md`
- `docs/CURRENT-HANDOFF.md`
- `docs/ACTIVE-PLAN.md`
- relevant ADRs only

Then inspect the repository and execute the next unfinished M0 task.

Goal: complete M0 Workspace Foundation only.

Use:

- React
- TypeScript
- Vite
- Tauri 2
- Rust
- npm unless repository evidence clearly justifies otherwise

Keep dependencies minimal.

Establish:

- strict TypeScript
- linting
- formatting
- unit tests
- production/build scripts
- `.gitignore`
- canonical `npm run quality`

Actually run all checks you report as successful.

Do not implement cloud, auth, encryption, learner features, attendance, grading, forms, sync, or Android workflows during M0.

Do not ask about routine setup choices you can safely resolve yourself.

At the end report only:

- Completed
- Verified
- Blockers/Risks
- Memory/ADR changes
- Exact next task
