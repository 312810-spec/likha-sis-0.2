# Source Registry

Durable third-party sources actually adopted into LIKHA-SIS's development
process or codebase — not a browsing log. Add an entry only when a
decision was actually made. Status values:

- **ADOPT** — in active use.
- **PILOT** — trying it narrowly/experimentally before full adoption.
- **REFERENCE** — studied for principles only, not imported/installed.
- **REJECT** — considered and explicitly declined, with why (prevents
  re-litigating the same question in a future session).

## Claude Code harness (added 2026-08-24)

| Source | Purpose | Status | Notes |
|---|---|---|---|
| `@playwright/cli` (npm) | Browser-rendered UI smoke/interaction/accessibility testing during coding | ADOPT | Cannot attach to the compiled Tauri webview — browser-only coverage. Pin an exact version, not `latest`. Install Chromium only. |
| `@wdio/tauri-service` (WebdriverIO) | Real native-binary E2E on Windows via WebView2 | PILOT | Tauri's own docs recommend it. `embedded` provider needs no external driver, no paid CrabNebula dependency required on Windows. One smoke test piloted; not a full suite yet. |
| `axe-core` (direct wrapper, `src/test/a11y.ts`) | Automated structural accessibility checks | ADOPT | `vitest-axe` was tried and dropped (unmaintained, Vitest-version mismatch). Necessary, not sufficient — human accessibility review still required. |
| Gitleaks | Secret scanning | ADOPT | See install/config notes added during Phase 6; pin a specific release tag. |
| cargo-deny | Rust dependency/license/advisory policy | ADOPT | `deny.toml` tuned deliberately, not blanket-deny on duplicates. |
| OSV-Scanner | Cross-ecosystem (npm + Cargo) vulnerability scanning | PILOT | Prefer offline/local-DB mode after initial setup; confirm exactly what leaves the machine before treating as routine. |
| Context7 | Current framework/library API documentation lookup | PILOT | Used narrowly, on-demand, never for business logic/architecture/code review/project-memory. See caveats before enabling any paid path. |
| `OthmanAdi/planning-with-files` (three-file working-memory pattern) | Task working memory for substantial multi-phase tasks | REJECT (plugin) / ADOPT (reproduced) | Plugin's own docs admit the skill-only install is a degraded subset (no hooks/slash commands) — no clean skill-only mechanism exists. Reproduced the three-file idea as a small custom project skill instead of pulling in a third-party marketplace plugin. |
| `anthropics/cwc-long-running-agents` | Long-run harness principles (default-FAIL completion, fresh evaluator, durable handoff) | REFERENCE | Unmaintained Anthropic workshop artifact. Principles reimplemented as project-local agents/hooks, not imported wholesale. |
| Anthropic `security-guidance` plugin | Pattern-based risky-command/code flagging | ADOPT | Official plugin, independent env-var toggles confirmed. LIKHA config: `ENABLE_PATTERN_RULES` on (default), `ENABLE_STOP_REVIEW=0`, `ENABLE_COMMIT_REVIEW=0` (commits currently prohibited). No separate dual/high-recall toggle exists in this plugin (that's a different plugin, not installed). |
