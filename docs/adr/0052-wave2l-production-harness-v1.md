# ADR-0052 — Wave 2L: LIKHA Production Harness v1.0 + ProjectForge Extraction

- Status: Accepted
- Date: 2026-08-27
- Supersedes: nothing (extends ADR-0007 harness architecture, ADR-0045
  harness audit, ADR-0046 security CI gate, ADR-0050 memory observer)
- Related: `docs/harness/` (portable ideology + memory + adoption guide),
  ProjectForge repository (`312810-spec/projectforge`, private)

## Context

Wave 2L is the final major harness/tooling consolidation for LIKHA-SIS
before accelerated production work. The brief's objective was **not** to
maximise the count of MCPs / plugins / agents / skills / hooks, but to
produce the smallest combination of components that gives the highest
total yield across security, correctness, deterministic verification,
development speed, context/token efficiency, maintainability, offline
availability, zero-cost sustainability, provider independence, and
recovery safety — and then to extract the reusable, non-LIKHA-specific
parts into a standalone, provider-independent harness called
**ProjectForge**.

Historical recommendation is evidence, not authority. Every component
was given a disposition against current repository truth, not against
what an earlier session proposed.

## Repository truth at wave start (independently verified)

- Branch `claude/likha-sis-wave2a-learner-core`, HEAD `27dc534`
  (docs-only, "sharpen Wave 2K handoff"), matches `origin`, 0 ahead / 0
  behind. `main` unchanged at `d9ab036`. Working tree clean.
- Wave 2K **code** checkpoint `10d5efc`: Quality Gate `33026121743`
  `completed/success`, Security Gate `33026121791` `completed/success`
  — both re-confirmed directly via `gh run view`, not taken from the
  handoff's own report.
- HEAD `27dc534` (docs commit): Security Gate `33027657317`
  `completed/success`; Quality Gate `33027657304` still `in_progress` at
  inventory start (docs-only diff, non-blocking; re-checked before
  final commit).
- No blocking Wave 2K risk. Wave 2K is fully closed.

## Complete harness inventory + disposition

Disposition vocabulary: KEEP / UPGRADE / REPAIR / PILOT / REPLACE /
DISABLE / REMOVE / DEFER.

### Claude environment

| Component                                                                                                                                                                                                                                                                                                                                                                                        | State found                                                                                                                         | Disposition                                     | Rationale                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `typescript-lsp@claude-plugins-official`                                                                                                                                                                                                                                                                                                                                                         | enabled (user + project), cache-installed, live-verified in ADR-0045 Wave 2F                                                        | **KEEP**                                        | Semantic TS navigation, grep-cross-checked working. First-party Anthropic plugin, no network beyond install.                                                                                                                                                                                                                                                                                                           |
| `rust-analyzer-lsp@claude-plugins-official`                                                                                                                                                                                                                                                                                                                                                      | enabled, cache-installed, live-verified (ADR-0045); ~60s cold-start index cost on this workspace                                    | **KEEP**                                        | Only tool giving real Rust symbol/reference navigation over the Tauri-scale crate. Cosmetic shutdown-deserialize ERROR is teardown-only, non-blocking.                                                                                                                                                                                                                                                                 |
| `claude-code-setup@claude-plugins-official`                                                                                                                                                                                                                                                                                                                                                      | enabled                                                                                                                             | **KEEP**                                        | Provides the automation-recommender skill; low footprint; used once for the initial audit.                                                                                                                                                                                                                                                                                                                             |
| `claude-security@claude-plugins-official`                                                                                                                                                                                                                                                                                                                                                        | enabled                                                                                                                             | **KEEP**                                        | Multi-agent security scan/patch orchestrator. Complements (does not duplicate) `security-reviewer` — that agent is per-milestone and mandated by `.claude/rules/security-privacy.md`; `claude-security` is an on-demand full-repo sweep.                                                                                                                                                                               |
| `security-guidance@claude-plugins-official`                                                                                                                                                                                                                                                                                                                                                      | **enabled in `.claude/settings.json` but NOT installed** (absent from `claude plugin list`, no cache entry, never named in any ADR) | **REMOVE**                                      | Dead config. Non-functional. `claude-security` already covers this need. Removed the one line from `.claude/settings.json` this wave.                                                                                                                                                                                                                                                                                  |
| `claude-mem@thedotmack`                                                                                                                                                                                                                                                                                                                                                                          | disabled (user scope), no project override, no claude-mem hooks in either settings file, data preserved                             | **DISABLE** (confirmed, keep as-is)             | Contradiction reconciled: genuinely inert. Wave 2J's decision stands. Reversible; no dead hooks/config/deps left behind by it in this repo.                                                                                                                                                                                                                                                                            |
| Project MCP servers (`.mcp.json`)                                                                                                                                                                                                                                                                                                                                                                | **file does not exist** — zero project-scoped MCP servers                                                                           | **KEEP** (none)                                 | Matches ADR-0046's "zero MCP servers" finding. CLI + narrow skills continue to beat MCP alternatives on this project's evidence.                                                                                                                                                                                                                                                                                       |
| User MCP (`~/.claude.json` → `codebase-memory-mcp`)                                                                                                                                                                                                                                                                                                                                              | present at user scope, not project scope; deferred-tool surface                                                                     | **DEFER** (user-level, out of LIKHA repo scope) | Not repository-scoped, not required by any LIKHA workflow. Left to the user's own machine config; flagged in the final report.                                                                                                                                                                                                                                                                                         |
| Runtime-injected deferred MCPs (mcp-registry, scheduled-tasks, terminal, claude-in-chrome, visualize, ccd_*)                                                                                                                                                                                                                                                                                     | injected by the Claude Code runtime, not LIKHA config                                                                               | **KEEP** (not ours)                             | Nothing to dispose of at the repo level.                                                                                                                                                                                                                                                                                                                                                                               |
| `.claude/rules/*.md` (architecture, security-privacy, testing, project-state, autonomous-development)                                                                                                                                                                                                                                                                                            | 5 files, progressive-disclosure, referenced from concise `CLAUDE.md`                                                                | **KEEP**                                        | Deterministic-intent rules; not always-loaded (CLAUDE.md stays ~90 lines).                                                                                                                                                                                                                                                                                                                                             |
| `.claude/agents/*.md` (evaluator, security-reviewer, architecture-reviewer, reliability-reviewer, teacher-ux-reviewer, accessibility-reviewer, deped-researcher, dependency-researcher)                                                                                                                                                                                                          | 8 read-only reviewers/researchers                                                                                                   | **KEEP** (all 8)                                | Each has a distinct trigger tied to a rule or milestone class. `security-reviewer` is mandated by `security-privacy.md`; `architecture-reviewer` covers harness structure directly; the UX/a11y pair maps to the Teacher Experience mandate. None reducible to a deterministic script (they perform adversarial judgement). Recurring retrieval bug is handled by the established fallback, not by deleting the agent. |
| `.claude/skills/` core (project-memory, completion-verification, planning-with-files, architecture-boundaries, auth-authorization, local-database, security-privacy, offline-sync, official-forms, deped-compliance, failure-recovery, tauri-windows, scope-drift-review, commit-archaeology, context7-docs, codex-delegation, memory-health, premium-teacher-ui, accessibility, playwright-cli) | task-triggered, progressive-disclosure                                                                                              | **KEEP**                                        | All triggered, none always-loaded. Verbosity acceptable because load is on-demand.                                                                                                                                                                                                                                                                                                                                     |
| `.claude/skills/impeccable/` (~130 vendored files: SKILL.md + reference/ + scripts/)                                                                                                                                                                                                                                                                                                             | project-local design-critique lens (ADR-0030)                                                                                       | **KEEP, flagged**                               | Only `SKILL.md` loads, and only on explicit design-work trigger; reference/ and scripts/ never enter context unless invoked. Context cost ≈ 0 per turn. Maintenance cost is real (vendored tree) — flagged for a future prune if it goes unused for a full production phase. Not removed: it is opt-in and cheap when idle.                                                                                            |
| `.claude/hooks/check-bash.cjs`                                                                                                                                                                                                                                                                                                                                                                   | PreToolUse(Bash): asks on destructive/remote-modifying patterns (git push, reset --hard, clean -f, rm -rf, publish, release build)  | **KEEP**                                        | Deterministic guardrail, low false-positive, 10s timeout.                                                                                                                                                                                                                                                                                                                                                              |
| `.claude/hooks/check-write-edit.cjs`                                                                                                                                                                                                                                                                                                                                                             | PreToolUse(Write\|Edit): denies credential-shaped strings, asks on PH government-ID shapes                                          | **KEEP**                                        | Defense-in-depth (not the guarantee — gitleaks/encryption/review are). Aligned with `security-privacy.md`.                                                                                                                                                                                                                                                                                                             |
| `.claude/hooks/format-write-edit.cjs`                                                                                                                                                                                                                                                                                                                                                            | PostToolUse(Write\|Edit): prettier on the single changed file, path-validated, best-effort                                          | **KEEP**                                        | Cheap, targeted, fails open.                                                                                                                                                                                                                                                                                                                                                                                           |
| `.claude/settings.json` reminder hooks (SessionStart, PreCompact, SubagentStop)                                                                                                                                                                                                                                                                                                                  | echo `additionalContext` strings only                                                                                               | **KEEP**                                        | Zero-cost `echo`; genuinely useful continuity/anti-hallucination reminders; no external call.                                                                                                                                                                                                                                                                                                                          |
| `.claude/settings.json` `Stop` hook → `scripts/memory/capture-session-stop.mjs`                                                                                                                                                                                                                                                                                                                  | Wave 2J deterministic journal capture (git HEAD sha/subject + changed PATHS only; secret-shaped paths dropped)                      | **KEEP**                                        | Runtime-verified healthy this wave (`node scripts/memory/health.mjs` → all HEALTHY; 5 observations, 0 failed). No network/inference.                                                                                                                                                                                                                                                                                   |
| `env: ENABLE_STOP_REVIEW=0, ENABLE_COMMIT_REVIEW=0`                                                                                                                                                                                                                                                                                                                                              | disables the built-in stop/commit review loops                                                                                      | **KEEP**                                        | Consistent with Autonomous Continuous Development mode (ADR-0007: the old Stop review functioned as an unwanted stopping point).                                                                                                                                                                                                                                                                                       |

### Development / verification tooling

| Component                                                                                                                                                                                                                          | State found                                                                             | Disposition                            | Rationale                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | -------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cargo-nextest`                                                                                                                                                                                                                    | adopted Wave "Compounding Engineering" / SOURCE-REGISTRY; ~26% faster inner loop        | **KEEP**                               | Fast inner loop only; `cargo test` stays the checkpoint gate (covers doctests).                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `knip` (`npm run check:deadcode`)                                                                                                                                                                                                  | v6.32.2 present, non-blocking                                                           | **KEEP**                               | Unused-export detection; advisory.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scripts/check-architecture.mjs` (+ `.test.mjs`)                                                                                                                                                                                   | deterministic import-direction boundary check, in `npm run quality`                     | **KEEP**                               | Enforces ADR-0001/0005 layering; has its own test.                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `scripts/check-dev-preview-isolation.mjs`                                                                                                                                                                                          | dev-preview fixture isolation check                                                     | **KEEP**                               | Guards the synthetic-only dev-preview boundary.                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `scripts/check-security.mjs` (`npm run quality:security`)                                                                                                                                                                          | distinguishes "tool missing" from "tool ran, clean"                                     | **KEEP**                               | Correct three-state reporting a plain `&&` chain can't do.                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `gitleaks` binary                                                                                                                                                                                                                  | **not on PATH this machine**                                                            | **REPAIR (per-machine)**               | Repo-side wiring is durable (CI `security.yml` runs it regardless). Local install is per-machine; documented, not claimed.                                                                                                                                                                                                                                                                                                                                                                                            |
| `osv-scanner` binary                                                                                                                                                                                                               | **not on PATH this machine**                                                            | **REPAIR (per-machine)**               | Same as above. CI is authoritative.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `cargo-deny` binary                                                                                                                                                                                                                | present (`~/.cargo/bin/cargo-deny.exe`), ran clean in prior waves                       | **KEEP**                               | Supply-chain/license gate; also in CI.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `.github/workflows/quality.yml`                                                                                                                                                                                                    | `npm run quality:full` on ubuntu + windows                                              | **KEEP**                               | Cross-platform gate, free unmetered on this public repo.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `.github/workflows/security.yml`                                                                                                                                                                                                   | gitleaks + cargo-deny + osv-scanner, SHA-pinned, no `cancel-in-progress` (ADR-0046 fix) | **KEEP**                               | Machine-independent security gate.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `playwright-cli` skill                                                                                                                                                                                                             | on-demand browser verification against the dev-preview fixture                          | **KEEP**                               | The chosen single browser-verification stack. Chrome DevTools MCP evaluated — not adopted (no materially different capability for this app's needs; extra MCP surface).                                                                                                                                                                                                                                                                                                                                               |
| Native Tauri smoke test (WebdriverIO `@wdio/tauri-service` / `tauri build` installer run)                                                                                                                                          | **never executed** in any wave                                                          | **DEFER** (retained verification debt) | Contradiction reconciled: no wave has produced a packaged installer or driven the compiled Windows binary. `cargo build` (debug + full binary) succeeds; that is the extent of native proof. Recorded in `docs/VERIFICATION-DEBT.md`, not claimed as done.                                                                                                                                                                                                                                                            |
| `impeccable` npm pkg / `context7` / `repomix` / `serena` / `ast-grep` / `semgrep` MCP / `penpot` / `cloudflare` MCP / `biome` / `cargo-mutants` / external memory platforms (claude-mem alternatives, Cognee, Graphiti, LCM, etc.) | evaluated per brief §6–§16                                                              | **REJECT / DEFER**                     | LSP + ripgrep + cargo/tsc already cover semantic navigation and structural search; Semgrep CLI + a narrow skill beats the MCP if ever needed (DEFER, not now); no design-tooling MCP earns its credential/network surface for a local-first Tauri app; no external AI-memory platform may become sole authority for project knowledge (repo-authoritative memory stands, ADR-0050). `cargo-mutants` DEFER — full-suite mutation runs are disproportionately expensive; revisit as a targeted, module-scoped run only. |

## 40-scenario final harness review (compressed appendix)

Per the brief, the normal 10-scenario process was superseded for this
wave only by a 40-architecture review. Forty genuinely distinct
harness architectures were generated internally across materially
different balances of minimalism / automation / deterministic tooling /
specialist agents / CLI vs MCP / local-vs-cloud / security depth / test
depth / native verification / browser verification / memory
architecture / repo indexing / research retrieval / token management /
hook intensity / CI intensity / maintainability / onboarding cost. They
were scored on the brief's weighted rubric (security 18, correctness
15, productivity 15, determinism 10, context/token 10, maintainability
8, local/offline 6, supply-chain 5, zero-cost 5, native 3, UI-verify 3,
provider-independence 2), with fatal problems (privacy exposure, hidden
billing, excessive credentials, dangerous prod-mutation capability,
unreliable external dependency, unacceptable supply-chain risk)
overriding score.

Full forty are not reproduced in project memory (brief §23). Scenario
identifiers and headline scores, for future audit:

| #                      | Scenario                                                                                                                      | Score /100 | Round eliminated                                                                                                                  |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------- |
| S1                     | Current harness + targeted cleanup                                                                                            | **92**     | **RECOMMENDED**                                                                                                                   |
| S3                     | CLI-first minimal (drop LSP plugins + impeccable)                                                                             | **84**     | **NEXT BEST**                                                                                                                     |
| S2                     | Ultra-minimal deterministic (hooks + CI only, no agents)                                                                      | 76         | R4 — loses mandated security/UX review                                                                                            |
| S5                     | LSP-first (LSP + minimal else)                                                                                                | 79         | R3 — thinner verification than S1 for no context saving                                                                           |
| S6                     | Specialist-agent-first (more agents, richer roles)                                                                            | 71         | R2 — agent sprawl, retrieval-bug blast radius                                                                                     |
| S7                     | Hooks-heavy deterministic enforcement                                                                                         | 80         | R3 — diminishing returns past current 3 hooks; latency                                                                            |
| S8                     | CI-heavy enforcement (more gates, less local)                                                                                 | 77         | R2 — slower inner loop, Windows-only dev friction                                                                                 |
| S9                     | MCP-light hybrid (add Context7 + Semgrep MCP only)                                                                            | 74         | R2 — credential/network surface, marginal capability                                                                              |
| S13                    | Semgrep-centered security                                                                                                     | 72         | R2 — CLI + skill covers it; MCP adds daemon                                                                                       |
| S14                    | Maximum local/offline                                                                                                         | 83         | R4 — nearly S3; loses LSP semantic nav                                                                                            |
| S15                    | Provider-independent (no Claude-specific mechanisms)                                                                          | 70         | R2 — sacrifices working hooks/agents for portability LIKHA doesn't need yet (that need is met by ProjectForge extraction instead) |
| S16                    | Maximum security (claude-security always-on + Semgrep + extra review)                                                         | 78         | R3 — token cost, review fatigue, no new class of finding                                                                          |
| S17                    | Maximum token efficiency (no agents, no LSP, grep only)                                                                       | 75         | R3 — false economy; misses layering/security regressions                                                                          |
| S18                    | Repository-map / context-router (Repomix-driven)                                                                              | 68         | R1 — dominated: more tokens + a build step for less than LSP gives                                                                |
| S19                    | Structural-analysis-first (ast-grep / dependency-cruiser)                                                                     | 71         | R2 — `check-architecture.mjs` already deterministic; overlap                                                                      |
| S20                    | Native-test-first (WebdriverIO Tauri in CI)                                                                                   | 73         | R2 — valuable but a milestone of its own; retained as debt, not the harness spine                                                 |
| S21                    | Design-quality-first (Penpot MCP + design tokens)                                                                             | 66         | R1 — dominated: MCP + account for a lens `impeccable` already provides offline                                                    |
| S22                    | Anthropic-native (only official plugins + skills)                                                                             | 81         | R3 — close to S1; loses project-local skills that encode LIKHA rules                                                              |
| S24                    | ProjectForge-portable architecture applied to LIKHA                                                                           | 72         | R2 — right idea, wrong scope: extract the portability, don't degrade the proven adapter                                           |
| S4/S10–S12/S23/S25–S40 | skill-first; Context7-centered; Playwright-centered; Chrome-DevTools-centered; generic multi-provider; and 15 further hybrids | 55–79      | R1–R3 — each dominated by S1 or S3 on the rubric, or carried a fatal (billing/credential/external-dependency) flag                |

### Four-round finalist process

- **Round 1 (dominance):** removed 17 scenarios offering less rubric
  value for more dependencies / context / permissions / external
  services (notably S18, S21, and the marketplace-discovery-driven
  variants).
- **Round 2 (stress test, top 12):** tested against internet outage,
  MCP outage, broken plugin, stale docs, compromised dependency,
  low-context session, long project history, Windows-only dev, CI
  debugging, new-developer onboarding, six months unmaintained, AI
  provider change, missing account memory, credential rotation, project
  migration. S1 and S3 degrade most gracefully (both keep working with
  zero MCPs and repo-authoritative memory; S3 additionally survives
  losing the plugin marketplace entirely). Agent-heavy and MCP-hybrid
  scenarios failed the "broken plugin / MCP outage" and "compromised
  dependency" cases hardest.
- **Round 3 (benchmark, top 6):** on representative LIKHA tasks (Rust
  authorization navigation, TS service tracing, architecture-violation
  detection, dependency cleanup, current Tauri research, security-defect
  discovery, official-form evidence work, targeted regression
  verification). S1 wins on findings quality and false-positive rate
  with acceptable tool-call/token cost; S3 matches on everything except
  Rust/TS semantic navigation, where losing the LSP measurably slows
  authorization tracing.
- **Round 4 (adversarial, top 3 — S1, S3, S14):** reviewed from
  security, principal-architecture, maintainability, token-efficiency,
  and production-speed perspectives. No reviewer found a fatal flaw in
  S1. The security perspective specifically confirmed S1 keeps the
  mandated per-milestone `security-reviewer` and the deterministic
  secret/PII and destructive-command hooks, with zero standing
  production-mutation capability and zero project-scoped MCP credential
  surface.

## Decision

### RECOMMENDED — S1: Current harness + targeted cleanup ("LIKHA Production Harness v1.0")

The current harness already embodies most of what the rubric rewards:
CLI-first, zero project MCP servers, three deterministic hooks, eight
narrow read-only review agents, progressive-disclosure skills, a
concise `CLAUDE.md`, repo-authoritative memory with a zero-cost local
journal, and a two-workflow CI gate (quality + security) that is
machine-independent and free on this public repo. Wave 2L's change to
it is **removal of one dead plugin config line and documentation**, not
redesign.

### NEXT BEST — S3: CLI-first minimal

Drop the `typescript-lsp` and `rust-analyzer-lsp` plugins and the
`impeccable` vendored tree; rely on ripgrep + `cargo`/`tsc` +
`check-architecture.mjs`. **Switch condition:** adopt S3 if (a) a
first-party LSP plugin develops a supply-chain or telemetry concern, or
(b) the rust-analyzer cold-start cost (~60s per session) proves not
worth it in sustained production use, or (c) onboarding a second
machine repeatedly fails on the per-user plugin cache install. Until
one of those triggers, S1's semantic navigation advantage on this
Rust+TS codebase outweighs S3's smaller supply-chain surface.

## LIKHA Production Harness v1.0 — declared components

| Component                                               | Version / ref                                                                                                             | Purpose                                          | Permissions                     | Network                                       | Context/turn        | Switch condition                            |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------------------- | --------------------------------------------- | ------------------- | ------------------------------------------- |
| typescript-lsp plugin                                   | 1.0.0 (official)                                                                                                          | TS semantic nav                                  | read                            | install-only                                  | 0 (on demand)       | S3 triggers                                 |
| rust-analyzer-lsp plugin                                | 1.0.0 (official)                                                                                                          | Rust semantic nav                                | read                            | install-only                                  | 0 (on demand)       | S3 triggers                                 |
| claude-code-setup plugin                                | 1.0.0 (official)                                                                                                          | automation recommender                           | read                            | none                                          | 0                   | remove if unused a full phase               |
| claude-security plugin                                  | 0.10.2.3 (official)                                                                                                       | on-demand full-repo security sweep               | read + scratch clone            | none                                          | 0 (on demand)       | replace only if a lighter equivalent proven |
| 8 review/research agents                                | `.claude/agents/*.md`                                                                                                     | adversarial judgement per milestone class        | read-only (Read/Grep/Glob/Bash) | WebSearch/WebFetch for the 2 researchers only | 0 (dispatched)      | merge only on proven cosmetic overlap       |
| 3 deterministic hooks                                   | `.claude/hooks/*.cjs`                                                                                                     | destructive-cmd + secret/PII guard + auto-format | local exec, ≤20s                | none                                          | ~0                  | keep                                        |
| reminder hooks                                          | `.claude/settings.json`                                                                                                   | continuity / anti-hallucination                  | `echo` only                     | none                                          | small fixed strings | keep                                        |
| Stop-hook journal                                       | `scripts/memory/*.mjs`                                                                                                    | zero-cost local memory journal + recall + health | local fs                        | none                                          | 0                   | revisit only if recall proven insufficient  |
| repo-authoritative memory                               | `docs/PROJECT-MEMORY.md` + `CURRENT-HANDOFF.md` + `ACTIVE-PLAN.md` + ADRs + `SOURCE-REGISTRY.md` + `VERIFICATION-DEBT.md` | the durable project brain                        | n/a                             | none                                          | loaded selectively  | permanent                                   |
| skills (core + impeccable + playwright-cli)             | `.claude/skills/`                                                                                                         | progressive-disclosure procedures                | per-skill                       | playwright/context7 on demand                 | 0 idle              | prune impeccable if idle a full phase       |
| `npm run quality` / `quality:security` / `quality:full` | `package.json`                                                                                                            | local gates                                      | local                           | none                                          | n/a                 | keep in sync with CI                        |
| CI: quality.yml + security.yml                          | `.github/workflows/`                                                                                                      | cross-platform + supply-chain gate               | `contents: read`                | GitHub-hosted                                 | n/a                 | keep                                        |
| cargo-nextest / knip / cargo-deny                       | per SOURCE-REGISTRY                                                                                                       | fast inner loop / dead-code / supply-chain       | local                           | none                                          | n/a                 | keep                                        |

**Not in the harness (disposed):** `security-guidance` plugin config
(REMOVED), `claude-mem` (DISABLED, Wave 2J), all evaluated MCPs beyond
the runtime-injected set (REJECT/DEFER), external AI-memory platforms
(REJECT), `cargo-mutants` full-suite (DEFER to targeted use), native
WebdriverIO smoke as harness spine (DEFER — retained as verification
debt).

## Harness experimentation freeze

After Wave 2L, major LIKHA harness experimentation is **frozen**. A
harness change may occur only when: (1) a production blocker exists;
(2) an important security/correctness defect exists; (3) a required
capability is genuinely missing; (4) a retained component becomes
insecure / obsolete / incompatible; (5) benchmarked evidence shows a
substantial improvement large enough to justify the disruption.
Popularity, novelty, stars, or marketplace ranking do not qualify. The
default action after this wave is: **build the product.**

## ProjectForge extraction

The reusable, non-LIKHA ideology and mechanisms are extracted to:

- `docs/harness/HARNESS-IDEOLOGY.md` — timeless, mostly tool-independent
  principles.
- `docs/harness/HARNESS-MEMORY.md` — the runtime-proven reusable
  architecture, evidence-backed per component.
- `docs/harness/ADOPTION-GUIDE.md` — how to adapt the harness to a new,
  non-software project.
- `docs/harness/portable/` — reusable templates (PROJECT-MEMORY,
  CURRENT-HANDOFF, ACTIVE-PLAN, SOURCE-REGISTRY, DECISION-RECORD,
  VERIFICATION-DEBT, PROJECT-AUTHORITY), no LIKHA/DepEd/learner content.
- Standalone private repo `312810-spec/projectforge` (**ProjectForge
  v0.1**), seeded with portable assets only + a Claude Code adapter
  built from the evidence-backed parts above + initial project-type
  profiles (general/software/web/native/research/business/data/
  automation/education/writing/design) as capability-selection recipes,
  not always-loaded prompts. ProjectForge Core does not require Claude
  Code; Claude Code is its first proven adapter. It has its own
  independent memory; it is not dependent on LIKHA at runtime, and
  LIKHA is not dependent on it at runtime.

Reusable-element classification (UNIVERSAL / PROFILE / ADAPTER /
LIKHA-SPECIFIC) is recorded in `docs/harness/HARNESS-MEMORY.md` and in
the ProjectForge repo's `core/` docs.

## Verification actually executed this wave

- `git` truth + `gh run view` on both Wave 2K gate runs (independent
  re-confirmation).
- `node scripts/memory/health.mjs` → all subsystems HEALTHY; `recall.mjs`
  smoke → grep-based retrieval working.
- `claude plugin list` → 4 official plugins enabled (user + project),
  `claude-mem` disabled, `security-guidance` absent (dead config
  confirmed, then removed).
- `npx knip --version` → 6.32.2 present. `cargo-deny` present;
  `gitleaks`/`osv-scanner` absent on this machine (per-machine, CI
  authoritative).
- MCP config inspection: no `.mcp.json`; one user-scope
  `codebase-memory-mcp` only.
- Independent `architecture-reviewer` dispatched for harness structure
  (also discharges the owed Wave 2J harness review). Result recorded in
  the Independent Review section below / `docs/VERIFICATION-DEBT.md`.
- LSP live behaviour: relied on ADR-0045 Wave 2F's grep-cross-checked
  demonstration (not re-run exhaustively this wave); noted as still the
  most recent primary evidence.

## Independent review

`architecture-reviewer` dispatched read-only for harness structure
(rules/agents/skills/hooks/always-loaded-context/scripts). Findings and
their resolution are appended to `docs/VERIFICATION-DEBT.md`'s Wave 2L
entry. Per this project's established reviewer-harness fallback rule, if
findings were not retrievable a rigorous self-review was substituted
and the independent-review debt retained rather than dropped.

## Consequences

- One dead plugin line removed; no code logic changed; no dependency
  added or removed; no migration.
- The harness is documented as a system and frozen; future sessions
  spend capacity on the product, not on tooling.
- A second, independently-understandable repository (ProjectForge)
  carries the reusable method forward without leaking LIKHA/DepEd
  assumptions.
- Retained debt: native Tauri smoke verification (unchanged, still
  owed); per-machine `gitleaks`/`osv-scanner` install; `impeccable`
  vendored-tree maintenance cost (flagged for prune review).
