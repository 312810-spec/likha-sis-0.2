# ADR-0038 — Codex Delegation Harness (PILOT)

Status: Accepted (PILOT, not ADOPT)

## Context

The user asked whether the official OpenAI Codex integration for Claude
Code can safely become a bounded implementation/verification worker
under Claude Code orchestration — Claude remaining the architectural
authority, Codex never becoming an independent product architect.

This is a development-harness decision, not a product milestone. No
product code changed.

## Research (verified, not assumed)

Initial `WebSearch` results for "codex-plugin-cc" were dominated by
SEO/content-farm-style secondary sources (`aitoolly.com`,
`coddykit.com`, `smartscope.blog`, a Medium post) with the same
hype-inflation pattern this project already flagged once before and
rejected (`Graphify-Labs/graphify` in `docs/SOURCE-REGISTRY.md` — inflated
star counts, breathless "unprecedented" framing). That pattern alone was
**not treated as trustworthy**. `developers.openai.com` and
`community.openai.com` (the actual official OpenAI documentation/forum
domains) are blocked by this environment's network egress policy and
could not be fetched directly.

The plugin's existence and shape were instead verified directly and
conclusively:

- `git clone` (via `claude plugin marketplace add openai/codex-plugin-cc`)
  succeeded against the real `github.com/openai/codex-plugin-cc.git` —
  a real git operation against a real host, not a summarized page.
- The cloned repository contains a coherent, substantial, versioned
  project: `plugin.json` (name `codex`, version `1.0.6`, author
  `OpenAI`), a `CHANGELOG.md`, `LICENSE`/`NOTICE` (Apache-2.0, matching
  the `@openai/codex` npm package's own license), a CI workflow, and a
  real test suite (`tests/*.test.mjs`).
- `claude plugin install codex@openai-codex` succeeded; `claude plugin
details codex@openai-codex` reported a real component inventory: 11
  skills, 1 agent (`codex-rescue`), 3 hooks (`SessionStart`/`SessionEnd`/
  `Stop`, described by the tool itself as "harness-only — no model
  context cost"), **0 MCP servers** — confirming the current official
  approach does not use MCP (superseding whatever an older MCP-based
  community approach might have looked like; no such approach was found
  referenced anywhere in the current official materials, so there was
  nothing specific to explicitly deprecate here beyond noting MCP is not
  the mechanism).
- Projected token cost, from the tool itself: **~449 tokens always-on**
  per session merely from having the plugin enabled, plus ~30-1300
  tokens per invoked skill/agent.

**Verified facts about the integration** (from the plugin's own README,
fetched directly via `raw.githubusercontent.com` after the clone
independently confirmed the repository is real):

- Install: `/plugin marketplace add openai/codex-plugin-cc` → `/plugin
install codex@openai-codex` → `/reload-plugins` → `/codex:setup`.
- **Authentication**: the plugin has no credential of its own — it
  wraps the user's **local** `codex` CLI and reuses whatever
  authentication that CLI already has (`codex login`, either a ChatGPT
  account — including the Free tier — or an OpenAI API key). Usage
  contributes to the same Codex usage limits as using Codex directly;
  API-key auth would draw on separate, billed API usage — a user choice,
  not something this plugin forces.
- **Runtime model**: "No separate Codex runtime... it uses the same
  Codex install you would use directly... the same local authentication
  state... the same repository checkout and machine-local environment."
  Codex is not more sandboxed than the invoking Claude Code session —
  it is a second actor with the same reach.
- Configuration: `~/.codex/config.toml` (user), `.codex/config.toml`
  (project, loads only when the project is marked trusted).
- Slash commands: `/codex:review`, `/codex:adversarial-review` (both
  read-only), `/codex:rescue` (delegates a task, backgroundable,
  resumable), `/codex:transfer` (hands a live Claude Code session to
  Codex), `/codex:status`/`/codex:result`/`/codex:cancel` (background-job
  management), `/codex:setup` (installs/checks Codex, and toggles an
  optional review-gate `Stop` hook the README itself warns "can create a
  long-running Claude/Codex loop and may drain usage limits quickly").

**Environment-specific finding, not a general limitation of the
integration**: this sandboxed session has no `~/.codex` config and no
`OPENAI_API_KEY`/`CODEX_*` environment variable (confirmed via direct
inspection) — `codex login status` reports "Not logged in." Beyond that,
attempting `codex exec` anyway (a safe, reversible, read-only-intent
probe — `--skip-git-repo-check "say hello"`, no real task) did not fail
fast; it hung, then after ~30s logged repeated `wss://api.openai.com/v1/responses`
connection failures — **`Proxy connection failed: HTTP CONNECT failed
with status 403`** — i.e., this environment's own network egress policy
blocks `api.openai.com` outright, the same class of restriction already
seen for `deped.gov.ph`/`developers.openai.com`/`community.openai.com`.
This means a live, credentialed Codex pilot is not merely blocked by
missing credentials here; it is structurally blocked by this sandbox's
network policy regardless of credentials, and can only be run for real
on a machine without that restriction (e.g. the user's own local
Claude Code / terminal session).

## Decision (internal 10-scenario pass; reporting Recommended + Next Best only)

**Recommended**: adopt the official plugin as **PILOT**, scoped to (a)
bounded implementation delegation for LOW/MEDIUM-risk tasks via a
written implementation contract, and (b) as a genuinely independent
**second-vendor** adversarial reviewer (`/codex:adversarial-review`) for
HIGH-risk work — deliberately named as a distinct use case because this
project has a long, documented history (M7 onward, recurring through
this very session's RBAC and Curriculum milestones) of same-vendor
Claude reviewer subagents failing to return retrievable findings via the
normal completion/resume path. A second vendor's review path, run from a
completely different infrastructure stack, is a real, evidenced
mitigation for a real, repeated failure mode this project already has —
not a generic "more review is better" argument. All delegation goes
through the risk-routing policy and implementation/return contracts now
recorded in `.claude/skills/codex-delegation/SKILL.md`; independent
Claude review of the actual diff remains mandatory and is never replaced
by Codex's own summary.

Why this won over full ADOPT: no live, credentialed run was possible in
this environment (see above) — there is zero real-world track record on
this repository yet, and the permission-surface question below is
reasoned, not observed. PILOT is the honest classification; promotion to
ADOPT requires an actual authenticated run, on a machine without this
sandbox's network restriction, reviewed the same way any other
delegated work here is reviewed.

**Next Best**: official plugin, ad hoc/manual delegation only — no
formal contract-writing overhead, a human decides per task whether to
invoke `/codex:rescue`/`/codex:review`. Switch to this if the pilot (once
actually run with real credentials) shows the implementation-contract
overhead costs more Claude reasoning/context than it saves for LIKHA's
current task sizes, or if Codex's architectural compliance proves
inconsistent enough that per-task human judgment is safer than routing
by a fixed risk tier.

Scenarios considered and rejected without a full write-up: Claude-only
(status quo — forgoes a real, evidenced opportunity to work around this
project's own recurring reviewer-retrieval failure); an isolated
bespoke `codex exec` CLI wrapper (reinvents the plugin's own
session/background-job machinery for no benefit); a LIKHA-authored
specialist-agent wrapper duplicating the plugin's own `codex-rescue`
agent (harness bloat, "avoid a second project brain"); a
maximum-isolation sandboxed-worktree-per-task model (the plugin
deliberately shares the live checkout by design — this would require
building isolation the integration doesn't natively support, disproportionate
for this project's current size); do-nothing-until-later (rejected only
because the research/contract/policy work is valuable now regardless of
when a live run becomes possible, and costs nothing while blocked).

## Real, load-bearing risk found this session

Read directly from this repository's own hook source
(`.claude/hooks/check-write-edit.cjs`, `check-bash.cjs`): LIKHA's
`PreToolUse` secret/PII-pattern defense-in-depth is wired to Claude
Code's own `Write`/`Edit`/`Bash` tool names. Codex, per its own README,
edits the repository as an external local process (its own app server),
not through Claude Code's tool-call pipeline — **these hooks almost
certainly do not fire for Codex-originated writes.** This is recorded as
a hard requirement in `.claude/skills/codex-delegation/SKILL.md`:
independent Claude review of the actual diff is the _only_ safety net
for anything Codex touches, never a formality, and this must be
re-verified for real (not just reasoned about) the first time a live
pilot actually runs.

## Consequences

- **Added**: `.claude/skills/codex-delegation/SKILL.md` (risk-routing
  policy, implementation contract, return contract, stop conditions,
  independent-review checklist, Git-safety rules, token-cost note). No
  new agent (the plugin ships its own `codex-rescue` agent — a
  LIKHA-authored duplicate would be harness bloat). No new hook (the
  plugin ships its own three; LIKHA's existing hooks are unaffected and,
  per the finding above, insufficient alone for Codex-originated
  changes — review is the real gate). No project command.
- Global (user-scope, not project-scope) Claude Code state changed on
  this machine: one marketplace (`openai-codex`) added, one plugin
  (`codex@openai-codex`) installed. Both fully reversible
  (`claude plugin uninstall codex@openai-codex`,
  `claude plugin marketplace remove openai-codex`); nothing in this
  repository depends on either existing.
- **Not added**: no `.codex/config.toml` (nothing to configure yet
  without a real run to tune against); no review-gate enablement (the
  README's own usage-limit-drain warning applies; not turned on).
- **No live pilot task was actually delegated and completed** — the
  network/credential blockers above made that impossible in this
  session. The "pilot" this milestone actually performed was the
  verification-and-harness-construction work above; a real task-level
  pilot is the explicit prerequisite for any future promotion to ADOPT,
  and must happen outside this sandbox's network restriction.
- No product code, schema, or existing verification/architecture script
  was touched.
