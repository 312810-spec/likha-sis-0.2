# Testing & Quality Gates

TDD for domain, security, persistence, and sync logic — write the failing
test before the implementation for these areas. Simpler UI-only changes
may follow implementation with a same-commit test, but never ship
untested business logic.

Commands (see `docs/adr` and `docs/CURRENT-HANDOFF.md` for what each
currently covers; keep this list in sync with `package.json`/CI if either
changes):

- `npm run quality` — fast normal gate: typecheck, lint, format:check,
  architecture-boundary check, `knip` dead-code check, test. Run for
  every non-trivial change. New exports that are only consumed
  structurally (referenced by another exported type's field, never
  imported by name elsewhere) are false positives for `knip` — mark
  them `@public` in a doc comment rather than deleting real, load-bearing
  types; a genuinely-unreferenced export gets removed instead.
- `npm run quality:security` — gitleaks scan + `cargo deny check` +
  OSV-Scanner. Run before considering a milestone touching dependencies
  or secrets complete.
- `npm run quality:ui` — Playwright CLI renderer/accessibility checks
  where applicable. Does not substitute for a human visual/screen-reader
  pass — this environment has no browser/screenshot tool by default for
  the _native Tauri binary_; state that limitation plainly rather than
  implying it was covered.
- `npm run quality:full` — milestone/release gate: everything above plus
  `cargo fmt --check`, `cargo test`, and `cargo clippy --all-targets -- -D
warnings`. `cargo fmt --check` runs first (fast, fails cheap) — a
  formatting drift now fails this gate; run plain `cargo fmt` to fix it,
  never hand-restyle.

Do not invent a slower "run everything" command as the default for small
edits — match the tier to the change.

**Rust test runner — fast inner loop vs. stable checkpoint.**
`cargo-nextest` (adopted 2026-08-25, see `docs/SOURCE-REGISTRY.md`) runs
tests in parallel, isolated processes; measured ~26% faster wall-clock
than `cargo test` on this crate's post-build suite (17.5s → 13.0s,
283 tests). Use it for the fast inner loop while iterating on Rust
changes:

```bash
cargo nextest run                          # whole crate
cargo nextest run -p app --lib auth::      # filter to one module
```

`cargo nextest` does **not** run doctests (there are currently none in
this crate — verified via `cargo test --doc`, 0 tests — so this is not
yet a real gap, but don't assume it stays that way). For a stable
checkpoint (milestone completion, `npm run quality:full`), still run
plain `cargo test` at least once — it is the one command guaranteed to
cover everything nextest does, plus doctests if any are ever added.
Nextest speeds up iteration; it does not replace the checkpoint-gate
command.

Accessibility: use `expectNoAccessibilityViolations(container)` from
`src/test/a11y.ts` (a direct `axe-core` wrapper — `vitest-axe` was tried
and dropped as unmaintained) for structural checks on new screens.
Automated axe results are necessary, not sufficient — they do not
replace a human/teacher accessibility review.

Never claim a check passed unless it actually ran in this session. If a
tool is unavailable (no browser, no device, no hardware), say so plainly
in `docs/VERIFICATION-DEBT.md` rather than asserting coverage that wasn't
possible.
