# ADR-0007 — Claude Code Development Harness Architecture

Status: Accepted

## Context

Through M0–M6, all Claude Code guidance lived in one file (`CLAUDE.md`) and
project memory was three docs (`PROJECT-MEMORY.md`, `CURRENT-HANDOFF.md`,
`ACTIVE-PLAN.md`). That worked at this scale but had no mechanism for:
narrowly-triggered, topic-specific procedure (everything had to either
bloat `CLAUDE.md` or be re-derived from scratch each session); independent
review (the same session that built a feature was the only one checking
it); deterministic safety nets (nothing stopped a destructive command or
an accidental secret from a keystroke away); or reproducible security/
dependency tooling. This ADR records the harness built to close those
gaps, as a one-time infrastructure upgrade — it does not change any M0–M6
application architecture.

## Decision

**Progressive disclosure over a bigger prompt.** `CLAUDE.md` stays small
(87 lines as of this writing, target ~100-150) and holds only durable,
always-relevant rules. Everything topic-specific moved to:

- `.claude/rules/{architecture,security-privacy,testing,project-state}.md`
  — read when the task matches, not every turn.
- `.claude/skills/` (16: project-memory, architecture-boundaries,
  security-privacy, local-database, auth-authorization, failure-recovery,
  premium-teacher-ui, accessibility, tauri-windows, offline-sync,
  deped-compliance, official-forms, completion-verification,
  planning-with-files, playwright-cli, context7-docs) — each with a
  precise trigger description, pointing back to the relevant ADR/rule
  rather than duplicating it.

**Working memory as files, not prompt state.** For a substantial
multi-phase task, three files under `.planning/<task>/` (`task_plan.md`,
`findings.md`, `progress.md`) — gitignored, disposable, session-recoverable.
Reproduced as a small custom skill (`planning-with-files`) rather than
importing `OthmanAdi/planning-with-files` as a plugin: that plugin's own
docs say its skill-only install is a degraded subset missing hooks/slash
commands, and a third-party marketplace plugin is more attack surface
than a markdown convention warrants here. This very harness upgrade used
the pattern under `.planning/harness-upgrade/` as its own working memory.

**Independent, read-only review.** 8 agents under `.claude/agents/`:
`evaluator` (default-FAIL, fresh-context, evidence-based — reimplements
the completion-contract principle from `anthropics/cwc-long-running-agents`,
studied as reference only, not imported), `security-reviewer`,
`architecture-reviewer`, `reliability-reviewer`, `teacher-ux-reviewer`,
`accessibility-reviewer` (all read-only — Read/Grep/Glob/Bash for
read-only inspection, no Write/Edit), and two researchers
(`deped-researcher`, `dependency-researcher`, with WebSearch/WebFetch).
Only the main session normally writes application or project state.

**Deterministic hooks, not an LLM in the loop for routine checks.**
`.claude/settings.json` + `.claude/hooks/*.cjs`: `SessionStart` points at
`CURRENT-HANDOFF.md`/`ACTIVE-PLAN.md` (doesn't dump them);
`PreToolUse`/`Write|Edit` pattern-checks for known secret-token shapes
(deny) and Philippine government-ID-number-shaped values (ask) — defense
in depth, not a substitute for Gitleaks; `PreToolUse`/`Bash` requires
explicit approval for `git push`, `git reset --hard`, `git clean -f`,
`rm -rf`, and similar, without touching normal compiler/test/package-
manager commands; `PostToolUse`/`Write|Edit` runs Prettier on just the
changed file; `PreCompact` reminds to persist state before compaction;
`SubagentStop` reminds on findings shape; `Stop` is a lightweight
reminder only — no auto-loop, no auto-commit.

**Security/dependency tooling, installed and verified, not just
documented.** Gitleaks 8.30.1 (winget, hash-verified), cargo-deny
(`cargo install --locked`), OSV-Scanner 2.4.0 (winget, hash-verified),
`@playwright/cli@0.1.18` (npm, exact-pinned) with its official skill.
`npm run quality` (fast tier, now includes a new deterministic
architecture-boundary checker, `scripts/check-architecture.mjs`),
`quality:security` (Gitleaks + cargo-deny + OSV-Scanner, offline mode),
`quality:ui` (currently an honest placeholder — no Playwright UI-smoke
suite exists yet), `quality:full` (adds `cargo test`/`cargo clippy`).
`cargo deny check` surfaced one real fix (the `app` crate needed
`publish = false` + `licenses.private.ignore` for its intentionally
empty license field) and confirmed 16 transitive unmaintained-crate
RUSTSEC advisories (all from Tauri's own dependency tree, no fix
available upstream) are the only advisories present, now documented in
`deny.toml`. OSV-Scanner additionally surfaced `RUSTSEC-2024-0429`
(glib, transitive, Linux-only via Tauri's WRY backend) — accepted, not
fixed, since it isn't reachable on the Windows target this project
currently ships; see `docs/SOURCE-REGISTRY.md`.

**No new always-on MCP server.** The one MCP server visible in this
environment (`context7`) was already connected at a scope outside this
project's control before this session started; this harness does not add
to it and uses the official `ctx7` CLI instead, wrapped in the
`context7-docs` skill, invoked only on demand.

**Anthropic's `security-guidance` plugin**, declared in
`.claude/settings.json` (`enabledPlugins`) with pattern rules on
(default) and both LLM-backed review layers off
(`ENABLE_STOP_REVIEW=0`, `ENABLE_COMMIT_REVIEW=0`) — commits are
currently prohibited project-wide, and the milestone-level reviewer
agents above are the deep review layer for this project's autonomous
token budget. Same caveat as the hooks below: this declaration was added
after session start and was not observed actually loading in this
session — confirm on next session start.

## Consequences

- Always-loaded context stays small (`CLAUDE.md` 87 lines); everything
  else is pulled in only when its trigger matches.
- A future session can discover the current task from
  `CURRENT-HANDOFF.md`/`ACTIVE-PLAN.md` alone, find the matching skill by
  its trigger description, and not need to re-read this ADR or the full
  session transcript to continue safely.
- `.claude/settings.json` did not exist when this session started, so its
  hooks are written and unit-tested (pipe-tested with synthesized stdin)
  but were not observed to be live within this same session — the
  settings file watcher only watches directories that existed at session
  start. A `/hooks` reload or a session restart is needed before the
  hooks take effect for a user. This is a known, disclosed gap, not
  silently claimed as verified.
- Reviewer agents' read-only tool grants are a Claude Code-side
  convention (frontmatter `tools:` list), not an OS-level sandbox
  guarantee — they rely on the harness being followed correctly by future
  sessions, the same as every other rule in this ADR.
- The harness adds real, running tooling (Gitleaks/cargo-deny/OSV-Scanner
  installed system-wide via winget/cargo) rather than only configuration
  files — a machine without those installed will see a clear tool-missing
  error from `quality:security`, not a silent false-clean result, but a
  fresh machine does need that one-time setup step.

## Addendum (2026-08-24): third-party dev-tooling vetting precedent

`Graphify-Labs/graphify` (a candidate code-graph accelerator for
architecture exploration) was evaluated and **rejected** before any
installation, on independently-verified supply-chain-trust grounds — an
anomalous star/fork count (109,806/10,675 on a 4.5-month-old repo, ~245x
the next most-starred same-named project) consistent with documented
fake-star reputation-laundering, plus the maintainers explicitly
declining to address a live PyPI typosquat vector raised against their
own install path. Full writeup: `docs/SOURCE-REGISTRY.md` and
`.planning/graphify-eval/findings.md`. This sets a concrete precedent for
this harness's "no unnecessary always-on MCP / vet third-party dev
tooling before installing" principle: a plausible-looking feature set on
paper is not sufficient — verify trust signals (`gh api`, issue tracker,
star history) directly, don't take documentation or popularity at face
value, and a real red flag is grounds to reject before reaching
functional evaluation at all.
