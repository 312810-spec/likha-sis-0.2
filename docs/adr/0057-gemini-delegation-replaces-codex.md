# ADR-0057 — Gemini Delegation Harness Replaces Codex (PILOT)

Status: Accepted (PILOT, not ADOPT)

## Context

The user asked to replace the Codex/ChatGPT delegation pattern
(`codex@openai-codex`, ADR-0038) with an equivalent using Google's
Gemini, specifically to authenticate via their existing Gemini Pro
subscription rather than a billed API key. This is a development-harness
decision, not a product milestone. No product code changed.

Per `.claude/rules/autonomous-development.md`'s harness-lock rule
(CLAUDE.md: "LIKHA Production Harness v2.0 — certified and locked"),
this kind of change needs real justification, not preference alone. The
justification here is the user's explicit, direct instruction — a
genuine human-owner decision about which second-vendor tool their own
subscription pays for — not an autonomous optimization pass.

## Research (verified, not assumed)

A `dependency-researcher` subagent confirmed, from primary sources:

- **The plugin is real.** `m-ghalib/gemini-plugin-cc` exists on GitHub;
  its README (fetched directly, not paraphrased) states it was forked
  from `openai/codex-plugin-cc` — "broker lifecycle, state management,
  and other modules forked and adapted for Gemini integration." Same
  architecture family already piloted in this repo. License: Apache 2.0.
- **Live verification in this session** (same bar ADR-0038 held Codex
  to): `claude plugin marketplace add m-ghalib/gemini-plugin-cc`
  performed a real `git clone` against `github.com/m-ghalib/gemini-plugin-cc.git`.
  `claude plugin install gemini@gemini-plugin-cc` succeeded. `claude
plugin details gemini@gemini-plugin-cc` reported a real component
  inventory: 10 skills (`adversarial-review`, `cancel`,
  `gemini-3-prompting`, `gemini-cli-runtime`, `gemini-result-handling`,
  `rescue`, `result`, `review`, `setup`, `status`), 1 agent
  (`gemini-rescue`), 3 hooks (`SessionStart`/`SessionEnd`/`Stop`,
  "harness-only — no model context cost"), **0 MCP servers** — same
  shape as Codex's. Projected token cost: **~441 tokens always-on** per
  session (vs. Codex's 449), plus ~30–1.5k tokens per invoked
  skill/agent.
- **Authentication**: the plugin wraps the user's local `gemini` CLI
  (Google's official open-source terminal agent) and supports five
  configurable auth modes in `~/.gemini/settings.json`: `oauth-personal`
  (Google account / Gemini Pro or Google One AI Premium subscription
  login), `gemini-api-key`, `google-api-key`, Vertex AI, or an AI
  Gateway. The user chose **`oauth-personal`** — their existing paid
  subscription login, not a separate metered API key. This is
  subscription-based auth, not the paid-per-use API billing
  `.claude/rules/autonomous-development.md` gate 3 is aimed at, but is
  disclosed here regardless because it is a real financial/account asset
  of the user's being connected to automated tooling.
- **Environment-specific finding, not a general limitation**: this
  sandboxed session has no `gemini` binary installed (`which gemini`
  fails) and no Google OAuth session — the same class of restriction
  ADR-0038 recorded for Codex/`api.openai.com`. A live, credentialed
  Gemini pilot task can only run on a machine without this sandbox's
  restrictions (the user's own local Claude Code / terminal session).

## Real, disclosed account risk (load-bearing — read before enabling)

Independent verification against the primary source
(`github.com/google-gemini/gemini-cli` GitHub discussion #20632, fetched
directly) confirmed: in February 2026, Google suspended a batch of
Gemini CLI accounts for "use of 3rd party tools or proxies to access
[...] resources and quotas," specifically "harvesting or piggybacking on
Gemini CLI's OAuth authentication." Named tools caught in that sweep:
OpenCode, OpenClaw, Pi, and a proxy called `9router` — third-party
clients authenticating through a user's Google account other than the
official CLI. Google announced an automated system-wide unban ("access
restored in a day or two"), but multiple affected users reported the
promised reinstatement had **not** completed as late as May 2026 despite
following the documented appeal process.

`gemini-plugin-cc` launches the user's **own, officially-installed**
`gemini` CLI binary in `--acp` mode (Agent-Client Protocol, JSON-RPC
2.0/stdio) rather than extracting or relaying its OAuth token to a
separate backend — architecturally closer to normal use of the official
CLI than the token-piggybacking pattern Google's statement named. It is
still an automated orchestration layer driving an OAuth-authenticated
session, and Google's February 2026 enforcement was blunt enough to
catch adjacent legitimate use and slow to fully reverse for some users.

**This risk was disclosed to the user before any auth mode was chosen.
The user explicitly accepted it and chose `oauth-personal` anyway,
understanding it uses their real Gemini Pro subscription login and that
the unban process has not been reliable for everyone.** This is
recorded here as the durable evidence of that decision, per gate 2/5 of
`.claude/rules/autonomous-development.md` (external/account-risk
decisions only the user can make).

## Decision (internal 10-scenario pass; reporting Recommended + Next Best only)

**Recommended**: adopt `gemini@gemini-plugin-cc` as **PILOT**, in the
same scoped role ADR-0038 defined for Codex — bounded implementation
delegation for LOW/MEDIUM-risk tasks via a written implementation
contract, and as a genuinely independent **second-vendor** adversarial
reviewer (`/gemini:adversarial-review`) for HIGH-risk work, for the same
documented reason ADR-0038 gave: this project has a recurring,
documented failure mode of same-vendor Claude reviewer subagents not
returning retrievable findings via the normal resume path. **This PILOT
replaces, not supplements, the Codex PILOT** — per the user's explicit
instruction to replace ChatGPT/Codex with Gemini, not run both. Codex's
entry in `docs/SOURCE-REGISTRY.md` and its skill are marked superseded,
not deleted (historical record, reversible if Gemini's real-world pilot
underperforms).

Why this won over full ADOPT: identical reasoning to ADR-0038 — no live,
credentialed run was possible in this sandboxed environment. PILOT is
the honest classification; promotion to ADOPT requires an actual
authenticated run on the user's own machine, reviewed the same way any
other delegated work in this project is reviewed.

**Next Best**: keep both Codex and Gemini as parallel PILOTs (belt and
suspenders for the reviewer-retrieval failure mode) instead of a strict
replacement. Rejected because the user asked specifically for a
replacement, and running two second-vendor delegation plugins
simultaneously roughly doubles the harness's always-on token cost
(~890 tokens/session) for a benefit — redundant second-vendor
coverage — the project hasn't asked for.

Scenarios considered and rejected without a full write-up: identical set
to ADR-0038 (Claude-only status quo; a bespoke CLI wrapper; a
LIKHA-authored agent duplicating `gemini-rescue`; a maximum-isolation
sandboxed-worktree model; do-nothing-until-later) — none of ADR-0038's
reasoning for rejecting these changed by switching vendor.

## Consequences

- **Added**: `.claude/skills/gemini-delegation/SKILL.md` — same
  risk-routing policy, implementation/return contract shape, stop
  conditions, independent-review checklist, and Git-safety rules
  ADR-0038 established, adapted for Gemini's slash commands
  (`/gemini:rescue`, `/gemini:review`, `/gemini:adversarial-review`,
  `/gemini:setup`, `/gemini:status`/`/gemini:result`/`/gemini:cancel`)
  and its `gemini-rescue` agent. Carries forward the same hook-coverage
  finding: LIKHA's `PreToolUse` secret/PII hooks are wired to Claude
  Code's own tool calls and do not fire for Gemini's external-process
  writes — independent Claude review remains the only real safety net.
- **Marked superseded, not deleted**: `docs/SOURCE-REGISTRY.md`'s
  `codex-plugin-cc` entry and `.claude/skills/codex-delegation/SKILL.md`
  — both now point here and to this ADR, so a same-vendor-reviewer
  fallback stays available if the Gemini pilot underperforms without
  re-doing the original research.
- Global (user-scope) Claude Code state changed on this machine: one
  marketplace (`gemini-plugin-cc`) added, one plugin
  (`gemini@gemini-plugin-cc`) installed. Fully reversible (`claude
plugin uninstall gemini@gemini-plugin-cc`, `claude plugin marketplace
remove gemini-plugin-cc`); nothing in this repository depends on either
  existing.
- **Not added**: no `~/.gemini/settings.json` auth wiring was performed
  by this session (no `gemini` binary or Google account available here)
  — the user must run `/gemini:setup --verify` themselves on their own
  machine to actually complete `oauth-personal` login. This is recorded
  as verification debt below, mirroring how ADR-0038 left Codex's real
  credentialed run to the user's own environment.
- **No live pilot task was actually delegated and completed** — same
  structural blocker as ADR-0038 (no `gemini` CLI, no Google OAuth
  session in this sandbox). The "pilot" this milestone performed is the
  verification-and-harness-construction work above; a real task-level
  pilot, run by the user locally after completing `/gemini:setup
--verify`, is the explicit prerequisite for promotion to ADOPT.
- No product code, schema, or existing verification/architecture script
  was touched.

## Verification debt

Recorded in `docs/VERIFICATION-DEBT.md`: `/gemini:setup --verify` and a
real, credentialed end-to-end delegation task have not been run — both
require the user's own machine (a `gemini` CLI install and their Google
account's OAuth session), which this sandboxed session structurally
cannot provide.
