# LIKHA-SIS development

Build a teacher's dependable Windows workstation and focused Android companion.
This guide and the current user task supersede historical harness rules. Read
`TASK.md` for continuation; read `HARNESS.md` only for substantial workflow work.
Archived instructions under `docs/harness/archive/` are reference material,
not executable policy. Do not reload large historical plans by default.

## Work autonomously

Implement authorized reversible development, tests, prototypes, dependency
experiments and local migrations without ceremonial approval or legal-policy
preconditions. No frozen harness, certification score, mandatory planning tool,
fixed retry limit, or universal multi-agent review. Use synthetic fixtures.
When a source/template is missing, continue with a clearly labeled prototype
or configurable rule; do not invent an official claim. Production release
checks belong in `docs/RELEASE-CHECKLIST.md`, not in the development critical path.
This repository does not waive external laws or runtime/platform controls.

## Build from the existing app

React/TypeScript UI -> application services -> domain ports -> Rust/platform
adapters -> encrypted device SQLite. Local save precedes separate synchronization.
Keep grading/attendance rules shared and tested. Derive school/account authority
at the trusted boundary. Keep adviser and subject attendance distinct.
Current key storage is Windows-only; implement and prove Android Keystore before
claiming mobile support. Retain the chosen school hub unless a new decision
explicitly changes it. Mobile starts with assigned rosters, attendance and scores.

## Keep context small

Search with `rg`, inspect the diff and relevant symbols, then expand as needed.
Use one builder normally. Delegate independent questions when useful; five-expert
debates are for major choices or explicit requests. Keep results to evidence,
recommendation and unresolved risks. Persist only the next useful step in TASK.
Retry with a changed hypothesis and new evidence; stop repeating unchanged failures.

## Verify the affected behavior

- JS/TS: `npm run quality`; focused tests first.
- UI: `npm run quality:ui` when interaction/layout changes.
- Rust: from `src-tauri`, `cargo fmt --check`, `cargo test`,
  `cargo clippy --all-targets -- -D warnings`.
- Windows package: `npm run tauri build` on Windows; exercise the installed app.
- Android: prove encrypted startup, process-death recovery, signed upgrades,
  export/restore and native-library compatibility on actual Android builds.
- Harness: `npm run harness:verify` checks usable files, not certification.

Report what changed, what actually ran and the next unresolved step. A browser
mock, compiled package or green scan alone does not establish native readiness.
