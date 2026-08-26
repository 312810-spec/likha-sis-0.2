# ADR-0045: Claude Code Harness Audit — Official Plugins, AgentMemory, Rust Token Killer

Status: Accepted
Date: 2026-08-26

## Context

This is a Claude Code harness-improvement milestone, not a LIKHA
product-feature milestone — it does not touch `src/` or `src-tauri/`.
The directing brief asked for an evidence-based audit of the project's
`.claude/` harness against the official Anthropic plugin marketplace,
plus a research-only classification of two external tools
(AgentMemory, Rust Token Killer) that are not part of the marketplace.
The brief's own hypothesis (a specific set of plugins to adopt) was
explicitly offered as a challengeable starting point, not an
instruction to follow blindly — "Repository inspection and current
official documentation can overrule this hypothesis."

## Repository truth

Branch `claude/likha-sis-wave2a-learner-core`, local HEAD == `origin`
HEAD == `183bd42` (Wave 2E's final commit) at session start, `main`
unchanged at `d9ab036`, working tree clean.

`.claude/settings.json` already had `security-guidance@claude-plugins-official`
enabled, with `ENABLE_STOP_REVIEW=0`/`ENABLE_COMMIT_REVIEW=0` — i.e.
the deterministic-pattern-only posture this milestone's brief asked to
verify was **already correctly in place** before this session began.
The official `claude-plugins-official` marketplace was already added
(`~/.claude/plugins/known_marketplaces.json`), so no marketplace
addition was needed, only plugin-level enable decisions.

## Method

Used `claude-code-setup@claude-plugins-official`'s
`claude-automation-recommender` skill (single skill, read-only, no
agents/hooks/MCP) as an independent auditor, but treated its output as
evidence to weigh, not an instruction — every candidate it or the
brief surfaced was independently verified by reading the plugin's own
`plugin.json`/`SKILL.md`/agent frontmatter/`hooks.json` directly, and
by running `claude plugin details <name>@claude-plugins-official`
(available in Claude Code CLI v2.1.237) for exact, measured always-on
and on-invoke token costs per plugin — not estimated figures.

## Decisions

Full evidence and per-item reasoning: `docs/SOURCE-REGISTRY.md`'s
"Claude Code harness audit" entry (added alongside this ADR). Summary:

**ADOPT** (enabled in `.claude/settings.json`):

- `typescript-lsp@claude-plugins-official` — native LSP registration,
  ~0 tok always-on (out-of-process). `typescript-language-server` was
  not present in this environment; installed globally via
  `npm install -g typescript-language-server typescript` (v6.0.0).
- `rust-analyzer-lsp@claude-plugins-official` — same shape, ~0 tok
  always-on. The `rust-analyzer` shim existed on `PATH` but the actual
  rustup component was missing; installed via
  `rustup component add rust-analyzer` (v1.98.0).
- `claude-code-setup@claude-plugins-official` — the auditor itself,
  ~139 tok always-on, read-only, kept enabled so a future session can
  re-run this audit as the harness evolves.

**PILOT** (enabled but not invoked this session, or evaluated and
deliberately left disabled with a named revisit condition):

- `claude-security@claude-plugins-official` — enabled. Purely
  menu-driven (`/claude-security`), confirmed via its own `hooks.json`
  that its only hook is a cosmetic banner on that exact command, no
  automatic triggering. ~642 tok always-on. Distinct from LIKHA's
  existing `security-reviewer` subagent (narrow, milestone-scoped) —
  this is a periodic, exhaustive, independently-verified whole-repo
  scanner, better suited to a pre-release checkpoint. Not run this
  session; revisit before the next tagged release.
- `pr-review-toolkit@claude-plugins-official` — evaluated, **not
  enabled**. Two of its six agents cover genuine gaps in LIKHA's
  existing reviewer roster (`silent-failure-hunter`,
  `type-design-analyzer`), but three of the six agents' own
  descriptions explicitly say they "should be used proactively" or
  "triggered automatically after completing a coding task" — directly
  in tension with this milestone's own instruction ("do not invoke a
  large multi-agent review after every trivial edit") and with LIKHA's
  established milestone-gated review discipline. Enabling the whole
  plugin risks biasing the main session's autonomous dispatch judgment
  toward frequent, expensive per-edit reviews. A future session may
  invoke `type-design-analyzer` or `silent-failure-hunter` by name on
  one milestone's diff as a bounded trial, without enabling the plugin.
- AgentMemory (`rohitg00/agentmemory`, researched via WebSearch/
  WebFetch, not installed) — REFERENCE, not PILOT: Windows support
  exists but needs manual binary extraction or WSL2/Docker (real
  friction, not a one-line install); privacy filtering only strips
  secrets/API keys, with no documented PII-shape handling comparable
  to this project's own `check-write-edit.cjs` hook; its memory store
  lives outside the repo, isn't git-controlled, and isn't reviewable
  via PR — conflicting with this project's memory-authority hierarchy.
  Revisit if Windows install simplifies, PII handling is documented,
  or a genuine recall gap appears that curated `PROJECT-MEMORY.md`
  isn't solving.
- Rust Token Killer / `rtk` (`rtk-ai/rtk`) — **already ADOPTED**,
  predates this session, unaffected by it. Confirmed genuinely active
  and effective, not merely present: `rtk gain` reports 1,489 commands
  and 78.3% average token reduction (2.1M tokens saved) measured
  across this machine's real usage, including this project's own prior
  Wave milestones. User-scoped (`~/.claude/settings.json`), not
  repo-scoped — no LIKHA-specific configuration needed. No isolated
  pilot needed; it's already proven in exactly this environment.

**REFERENCE** (documented, not installed, no current trigger):
`hookify@claude-plugins-official`.

**REJECT** (evaluated, no capability gap found, LIKHA's existing
mechanism is more precise): `security-guidance` layers 2/3 — no
change, already correctly off; `frontend-design@claude-plugins-official`
(auto-triggers on frontend work per its own README, directly
conflicting with `premium-teacher-ui`'s restraint/parity/WCAG
philosophy — LIKHA is an internal teacher tool, not a marketing site);
`feature-dev@claude-plugins-official` (LIKHA's own Understand →
Research → Specify → Plan → Implement → Test → Review → Update Memory
→ Stable Checkpoint workflow, enforced by
`.claude/rules/autonomous-development.md`, is more specific and
already proven across every Wave milestone); `code-review@claude-plugins-official`
(LIKHA already dispatches purpose-built, milestone-scoped reviewer
subagents); `commit-commands@claude-plugins-official` (LIKHA's own git
commit conventions are more specific and already followed correctly);
`plugin-dev@claude-plugins-official` (not applicable — LIKHA is not
building a Claude Code plugin).

## MCP budget

**Zero MCP servers added.** No `.mcp.json` exists in this repository.
The only MCP server present anywhere in this environment
(`codebase-memory-mcp`, a pre-existing local binary at global scope)
predates this session and was not touched. AgentMemory's 54 MCP tools
were the only candidate that would have added an MCP server — rejected
specifically to keep this budget at zero, per the milestone's own
"default expectation is NONE" instruction.

## Verification

- `.claude/settings.json` validated as syntactically correct JSON
  after editing.
- `claude plugin details <name>@claude-plugins-official` successfully
  resolved all five newly-enabled plugins (confirming Claude Code
  recognizes them) with exact component inventories matching direct
  inspection of each plugin's files, and exact token-cost figures
  quoted above/in `docs/SOURCE-REGISTRY.md` — not estimated.
- `typescript-language-server --version` → 6.0.0;
  `rust-analyzer --version` → 1.98.0 rust-analyzer — both language
  server binaries confirmed present and runnable on `PATH` after
  installation.
- Existing project hooks re-verified unaffected by the settings.json
  edit: `check-write-edit.cjs` still passes clean input through
  (exit 0) and still denies a credential-shaped string (`AKIA...`)
  with the expected `permissionDecision: "deny"` output;
  `check-bash.cjs` still passes clean input through.
- Confirmed no `.mcp.json` was introduced; confirmed the project-level
  `enabledPlugins` map was the only change to `.claude/settings.json`
  (hooks, env, and all other keys untouched, diffed directly).
- **Verification debt, disclosed rather than assumed**: this same
  running session was started before the settings.json edit, so
  the newly enabled LSP servers/skills/agents could not be exercised
  live within this session (Claude Code loads plugin-provided
  skills/LSP registrations at session start). `claude plugin details`
  confirms the plugins are correctly _registered_; actual live
  go-to-definition/find-references behavior from `typescript-lsp`/
  `rust-analyzer-lsp`, and the `claude-automation-recommender` skill
  actually appearing in a fresh session's tool listing, are unverified
  until the next session starts fresh. Recorded in
  `docs/VERIFICATION-DEBT.md`.

## Non-goals

No LIKHA product code was touched. No commit/push was performed as
part of this milestone unless the user separately authorizes it — see
`docs/CURRENT-HANDOFF.md`'s note distinguishing this harness-audit
entry from the current LIKHA feature-track state (still Wave 2E,
complete, CI-confirmed).

## Addendum (Wave 2F): LSP live-behavior verification, and a correction

A fresh session (Wave 2F) closed the LSP verification gap this ADR
left open — and found the original assumption about what was needed to
close it was wrong.

**Correction**: `claude plugin details` (used in the original audit to
confirm plugins were "recognized") only inspects a plugin's manifest —
it does not prove the plugin's content is actually cached and loadable.
A headless verification run showed all four newly-enabled plugins
failing with `plugin-cache-miss` and `Total LSP servers loaded: 0`,
despite being correctly listed in `.claude/settings.json`. The missing
step was `claude plugin install <name>@claude-plugins-official` for
each — a genuine, separate action from toggling `enabledPlugins`, and
one this ADR's original "Verification" section did not know to call
out. Fixed by running the install command for all four; confirmed via
`claude plugin list` afterward. This install is **user-scoped**, not
part of the repository — a different machine needs to repeat it once.

**Live behavior demonstrated and independently cross-checked against
`grep`** (not just claimed): Rust LSP (`rust-analyzer`)
`workspace/symbol`, `findReferences`, and `hover` all returned correct,
verifiable results for real symbols in this codebase
(`authorize_capability_with_actor`, `commit_import`). TypeScript LSP
(`typescript-language-server`) `workspaceSymbol`, `documentSymbol`,
`findReferences`, and `hover` did the same for
`Sf1ImportApplicationService`/`commitImport`. Full location-by-location
verification: `docs/VERIFICATION-DEBT.md`'s "Claude Code harness audit
— LSP live-behavior gap — CLOSED" entry.

**Two real, non-blocking operational findings**: rust-analyzer needs
roughly 60 seconds to finish indexing this Tauri-scale workspace before
symbol queries succeed (a query fired immediately after server start
returns "not finished indexing," not an error or wrong answer — retry
after the wait); the LSP client logs a cosmetic `ERROR` on
rust-analyzer server shutdown (a response-shape mismatch in the
shutdown handshake) that occurs only during teardown, after all real
queries had already succeeded, and does not affect navigation during a
session.

## Addendum (Wave 2F): controlled MCP pilot — zero MCPs installed

LIKHA's standing rule is no global MCP by default; every MCP must earn
its context budget, permissions, maintenance cost, and security
surface against a CLI/native/skill alternative. Five candidates were
evaluated internally against an 20-scenario comparison (LIKHA
priorities: learner privacy, token efficiency, correctness, actual
capability gap, Windows/Tauri/Rust/TS fit, maintainability,
zero-billing, external data exposure, duplication, permission breadth,
reversibility). Result: **zero MCP servers installed.** Full
per-candidate reasoning:

- **Context7** (Upstash, official `@upstash/context7-mcp`, no signup
  required for basic use, project-scoped install available) —
  **REFERENCE, not adopted.** Its real value-add over ordinary web
  lookup is curated, version-pinned, token-efficient library-doc
  snippets — a genuine efficiency argument in principle, but this
  session's own actual documentation-lookup needs (GitHub Action
  release SHAs, `gitleaks-action`'s v2→v3 migration notes, AgentMemory
  and RTK's current repos, OSV-Scanner's reusable-workflow permissions)
  were all resolved successfully via plain `WebSearch`/`WebFetch`/
  `gh api`, with zero friction and zero added persistent tool-schema
  cost. LIKHA's actual dependency set (Tauri 2, React/TypeScript, a
  handful of mature Rust crates) has stable, well-indexed official
  docs; no session in this project's history has recorded being
  blocked by inaccurate/outdated version-specific guidance for a
  dependency it actually uses. No standalone "Context7 CLI" product
  exists to compare as the middle option (B) the milestone asked for —
  the real comparison was MCP vs. ordinary lookup, and ordinary lookup
  has a 100% observed success rate here. Revisit if a concrete instance
  of wrong/outdated version-specific guidance for a real LIKHA
  dependency actually occurs.
- **GitHub MCP** — **REJECT (for now); `gh` CLI wins decisively.** This
  session and Wave 2E made dozens of real `gh`/`gh api` calls (CI run
  status/logs, workflow job breakdown, release tags, commit
  verification, repository/owner-type checks) — all read-heavy, all
  successful, all through the already-core `Bash` tool with zero
  incremental context/tool-schema cost, using the user's own
  already-authenticated `gh auth` session (no new credential surface).
  A GitHub MCP would duplicate this with a persistent tool-schema
  footprint for a capability already fully met. Revisit only if a
  concrete `gh`-CLI limitation is actually hit (e.g., a write-heavy
  PR-review workflow `gh` genuinely can't express well).
- **Playwright MCP** — **REJECT; CLI+skill wins decisively, already
  adopted.** LIKHA's existing `playwright-cli` skill
  (`.claude/skills/playwright-cli/SKILL.md`, pinned
  `@playwright/cli@0.1.18` per `docs/SOURCE-REGISTRY.md`) already
  covers everything a Playwright MCP would add — accessibility-tree
  snapshots, click/fill/keyboard/mouse, network mocking, tracing, video
  recording, storage-state, an annotated-design-feedback workflow —
  invoked via `Bash`, not a standing MCP registration. It is a superset
  of typical Playwright-MCP capability, not a subset. Its own disclosed
  limitation (cannot attach to the compiled Tauri window/webview, only
  `vite dev`/a built web bundle) is a Tauri-architecture constraint no
  Playwright MCP would solve either. A dedicated Playwright MCP would
  be pure duplication. The three-way responsibility split the brief
  proposed (deterministic tests → regression; exploratory audit →
  browser automation; teacher-comfort discipline →
  `teacher-ux-reviewer`/`accessibility-reviewer`) already exists in
  this project using the CLI+skill+agents, not an MCP.
- **Cloudflare Documentation MCP / Workers Bindings MCP** — **REJECT,
  no concrete present need.** Cloud sync implementation has not begun
  and this wave explicitly excludes starting it. Cloudflare's own
  developer docs are reachable via ordinary `WebFetch` (same tool that
  already worked for every other lookup this session), so a dedicated
  Docs MCP would duplicate that. Workers Bindings MCP has zero current
  use case with no Worker/Durable-Object/D1 code written yet. Revisit
  at the start of the dedicated cloud-sync spike this project's roadmap
  already names as a future milestone, not before.
- **Semgrep** — **REFERENCE (CLI only if ever adopted; MCP rejected
  outright).** Its listed potential value (forbidden cloud imports
  above infrastructure, architecture-rule enforcement, unsafe SQL/
  command-execution patterns, accidental secret handling) substantially
  overlaps capability LIKHA already has as deterministic, project-
  specific checks: `scripts/check-architecture.mjs` (import-direction
  enforcement, already proven), `cargo clippy --all-targets -D
warnings`, `.claude/hooks/check-write-edit.cjs`/`check-bash.cjs`
  (secret/PII pattern guards), `gitleaks`/`cargo-deny`/`osv-scanner`
  (this wave's new CI gate, see below), and `security-guidance`'s
  layer-1 pattern rules (~25 built-in checks, already enabled). No
  concrete gap was identified this wave that these don't already cover.
  If ever adopted, the CLI (not an MCP) is the only form that would
  make sense — "do not introduce a permanent MCP merely to invoke a CLI
  tool" applies directly. Revisit if a future milestone (especially the
  cloud-sync spike, which will introduce genuinely new forbidden-import
  surface) finds a static-pattern security bug that none of the above
  would have deterministically caught.

**MCP servers actually present in this environment after this wave**:
unchanged from before it — the one pre-existing `codebase-memory-mcp`
(global scope, predates every LIKHA session, untouched). No `.mcp.json`
exists in this repository, still.
