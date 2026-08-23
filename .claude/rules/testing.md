# Testing & Quality Gates

TDD for domain, security, persistence, and sync logic — write the failing
test before the implementation for these areas. Simpler UI-only changes
may follow implementation with a same-commit test, but never ship
untested business logic.

Commands (see `docs/adr` and `docs/CURRENT-HANDOFF.md` for what each
currently covers; keep this list in sync with `package.json`/CI if either
changes):

- `npm run quality` — fast normal gate: typecheck, lint, format:check,
  test. Run for every non-trivial change.
- `npm run quality:security` — gitleaks scan + `cargo deny check` +
  OSV-Scanner. Run before considering a milestone touching dependencies
  or secrets complete.
- `npm run quality:ui` — Playwright CLI renderer/accessibility checks
  where applicable. Does not substitute for a human visual/screen-reader
  pass — this environment has no browser/screenshot tool by default for
  the _native Tauri binary_; state that limitation plainly rather than
  implying it was covered.
- `npm run quality:full` — milestone/release gate: everything above plus
  `cargo test` and `cargo clippy --all-targets -- -D warnings`.

Do not invent a slower "run everything" command as the default for small
edits — match the tier to the change.

Accessibility: use `expectNoAccessibilityViolations(container)` from
`src/test/a11y.ts` (a direct `axe-core` wrapper — `vitest-axe` was tried
and dropped as unmaintained) for structural checks on new screens.
Automated axe results are necessary, not sufficient — they do not
replace a human/teacher accessibility review.

Never claim a check passed unless it actually ran in this session. If a
tool is unavailable (no browser, no device, no hardware), say so plainly
in `docs/VERIFICATION-DEBT.md` rather than asserting coverage that wasn't
possible.
