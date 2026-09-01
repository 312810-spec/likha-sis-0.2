---
name: gemini-delegation
description: Use when considering delegating an implementation or review task to the Gemini plugin (`gemini@gemini-plugin-cc`), or when reviewing work that came back from Gemini. Replaces the earlier Codex/ChatGPT delegation pattern (see codex-delegation, superseded).
---

# Gemini Delegation (PILOT — not ADOPT)

Status: **PILOT**, added 2026-09-01, replacing the Codex PILOT. See
`docs/adr/0057-gemini-delegation-replaces-codex.md` and
`docs/SOURCE-REGISTRY.md` for the evaluation record. Do not treat this
as a settled, always-use workflow — it has not yet had a real,
credentialed end-to-end run on this repository (this environment has no
`gemini` CLI install or Google OAuth session; ADR-0057 documents the
exact blocker). Re-evaluate for promotion once that real run has
happened on the user's own machine.

## What Gemini is here

`gemini@gemini-plugin-cc` wraps the user's **local** `gemini` CLI
(Google's official terminal agent) via `--acp` mode — it is not a
separate sandboxed runtime. Once authenticated (`/gemini:setup
--verify`, using `oauth-personal` — the user's Gemini Pro/Google One AI
Premium subscription login; never fabricate or provision credentials
yourself), it operates on **the same repository checkout and machine** a
Claude Code session already has. It is not more isolated than Claude's
own tool access, and it is not less either — it is the same blast
radius, a second actor in it.

**Account risk, disclosed and accepted by the user (ADR-0057)**: Google
suspended a batch of Gemini CLI accounts in Feb 2026 for automated
third-party tools driving Gemini CLI's OAuth session; the unban process
was not reliable for everyone through May 2026. This plugin drives the
user's own official local `gemini` binary rather than proxying tokens
elsewhere — closer to normal use than the banned pattern — but it is
still an automated orchestration layer on top of an OAuth-authenticated
session. Do not re-litigate this with the user unprompted; it is a
recorded, accepted risk. Do flag it again if `gemini-plugin-cc`'s
architecture materially changes (e.g. it starts relaying tokens to a
third-party backend), since that would be a different risk than the one
accepted.

**Important, same finding ADR-0038 made for Codex, re-verified for
Gemini**: LIKHA's `PreToolUse` hooks (`check-write-edit.cjs`/
`check-bash.cjs`, the secret/PII-pattern defense-in-depth) are wired to
Claude Code's own `Write`/`Edit`/`Bash` tool names. Gemini edits files as
an external process, not through those tool calls — **these hooks do
not protect against Gemini-originated writes.** The only safety net for
anything Gemini touches is the independent review step below. Treat it
as non-negotiable, never as a formality.

## Claude owns architecture; Gemini is a bounded worker

Claude decides and never delegates: RBAC/authorization semantics,
encryption/key management, cross-school isolation, sync conflict policy,
production learner-PII handling, cloud/provider architecture, major
schema decisions, official DepEd form interpretation, major dependency/
provider choices, teacher-workflow redesign. If executing a delegated
task surfaces one of these, the contract's STOP CONDITIONS require
Gemini to report back rather than decide — if it doesn't, that is itself
a review finding.

## Risk-based routing

| Risk       | Examples                                                                                                                                                                                                     | Flow                                                                                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **LOW**    | formatting, repetitive test additions, mechanical refactors, straightforward type fixes, docs explicitly specified by Claude, implementation from an already-proven in-repo pattern                          | Claude instruction → Gemini implementation → automated verification (`npm run quality` / `cargo test` etc.) → Claude lightweight diff read                                                                                     |
| **MEDIUM** | repository/application-service changes, UI workflows, migrations following an established pattern (see `local-database` skill's versioned-reference-data shape), native adapters, non-sensitive domain logic | Claude spec → **written implementation contract** (below) → Gemini implementation → verification → Claude independent review                                                                                                   |
| **HIGH**   | RBAC, auth, encryption, key storage, sync, tenant/school isolation, learner PII, destructive migrations, backup/recovery, official-form correctness, security-sensitive native code                          | Claude architecture (+ specialist agent challenge, e.g. `security-reviewer`) → written contract → Gemini bounded implementation → verification → Claude independent review → security/domain specialist review → accept/reject |

When uncertain which tier applies, use the higher one. Claude may always
override a task's classification upward.

## Implementation contract (Claude → Gemini)

Write this before invoking `/gemini:rescue` (or the `gemini-rescue`
subagent) for anything above LOW risk. Keep it concrete and scoped —
enough to execute without inventing architecture, no more:

```
TASK: <one line>
OBJECTIVE: <what "done" means>
AUTHORIZED FILES/AREAS: <explicit paths/globs; nothing outside this>
FILES TO READ FIRST: <the minimum needed — don't make Gemini re-derive
  what Claude already knows>
ARCHITECTURAL CONSTRAINTS: <layering rules from architecture-boundaries
  skill; established patterns to reuse, not reinvent>
DOMAIN INVARIANTS: <e.g. school_id always session-derived, never a
  parameter; versioned reference data is append-only>
SECURITY INVARIANTS: <e.g. no new authorization surface without an
  authorize_* gate; no INSERT OR IGNORE where a CHECK/UNIQUE violation
  must still error>
OUT OF SCOPE: <explicit non-goals>
EXPECTED TESTS: <what must be covered, TDD where this project requires it>
VERIFICATION COMMANDS: <the actual commands to run, from
  .claude/rules/testing.md>
STOP CONDITIONS: architecture conflict; requirement ambiguity affecting
  correctness; a new dependency is needed; a schema decision not already
  approved; any security-boundary or authorization-behavior change;
  unexpected unrelated repository changes; inability to run required
  verification; any possible learner-PII exposure. Report the blocker —
  do not improvise past it.
REQUIRED RETURN FORMAT: <the return contract below>
```

## Return contract (Gemini → Claude)

Require this shape; never accept "tests should pass" — require "command
X ran and produced Y," and an explicit `UNVERIFIED:` line for anything
not actually run.

```
STATUS: complete | blocked | failed
FILES CHANGED: ...
IMPLEMENTED: ...
TESTS ADDED/UPDATED: ...
COMMANDS ACTUALLY RUN: ...
RESULTS: ...
UNVERIFIED: ...
ARCHITECTURAL QUESTIONS: ...
SECURITY CONCERNS: ...
DIFF SUMMARY: ...
```

## Independent review (mandatory, not optional)

Gemini is never the final authority on its own work. After a task
returns, review the actual `git diff`, the actual test files, and the
actual command output — **not** Gemini's own summary. Check
specifically for: scope creep beyond `AUTHORIZED FILES/AREAS`; hidden
architecture changes; weakened authorization; missing school scoping; a
provider dependency reaching above the infrastructure layer; missing
offline behavior; swallowed errors; missing migrations/tests; duplicated
business logic; UI/domain coupling; unnecessary new dependencies;
generated-code noise. For HIGH-risk work, follow with the same
specialist-agent review (`security-reviewer`, `teacher-ux-reviewer`,
etc.) this project already requires for that area — Gemini's involvement
does not shrink that requirement.

## Git safety

Gemini must never force-push, `reset --hard`, delete branches, rewrite
shared history, bypass hooks, or perform broad cleanup on its own
initiative — the same rules that already bind Claude in this harness.
Prefer running a delegated task against a clean, already-committed
baseline, and reviewing the resulting diff as a whole rather than
interleaving manual edits mid-task (Gemini shares the live working tree —
there is no isolation between a concurrent Claude edit and a
Gemini-in-progress one).

## Token/context discipline

The plugin adds a real, measured always-on cost (~441 tokens per
session just from being enabled, confirmed via `claude plugin details
gemini@gemini-plugin-cc`; further ~30-1.5k tokens per invoked
skill/agent). Don't delegate trivial single-line changes where the
contract-writing overhead exceeds the savings. Give Gemini only the
paths/context a task needs — don't have it re-derive architecture Claude
already worked out, and don't re-run a review that already happened
without new risk to justify it.

## Configuration

Project-level Gemini defaults, if ever set, belong in the plugin's own
project-scoped config (see the plugin's README) — never
`~/.gemini/settings.json` on the user's behalf without them running
`/gemini:setup` themselves, since that file also holds their chosen auth
mode (`oauth-personal`, tied to their real subscription). Do not
duplicate LIKHA's own project rules/ADRs/skills into Gemini
configuration — Gemini consumes the same `CLAUDE.md` → skills/ADRs →
Claude orchestration chain every other worker in this harness does; give
it a scoped contract, not a second project brain.
