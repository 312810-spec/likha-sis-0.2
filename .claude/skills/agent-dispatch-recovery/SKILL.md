---
name: agent-dispatch-recovery
description: Use whenever dispatching a reviewer or research subagent (architecture-reviewer, security-reviewer, teacher-ux-reviewer, accessibility-reviewer, reliability-reviewer, deped-researcher, dependency-researcher, evaluator) — read this BEFORE writing the dispatch prompt, not after retrieval fails.
---

# Agent Dispatch Recovery

This project has a long, extensively documented history (recorded across
`docs/VERIFICATION-DEBT.md`/`docs/PROJECT-MEMORY.md`/`docs/SOURCE-REGISTRY.md`
since M7) of dispatched reviewer/research subagents doing real work — many
tool calls, tens of thousands of tokens — but the orchestrating session
being unable to retrieve their findings as usable text. The old fallback
was "retry once via a resume message, then substitute a self-review" —
which worked as damage control but never actually fixed retrieval, so the
same failure kept recurring milestone after milestone and real independent
review debt kept accumulating.

## Root cause, confirmed with a controlled test (2026-08-30)

The chat-text-return channel — the agent's own final conversational
response, whether read from a background-agent completion notification or
a synchronous (`run_in_background: false`) call, fresh or resumed via a
follow-up message — is **not reliable** for a subagent expected to produce
a long, substantive report. In a same-session controlled test:

- Four consecutive attempts to retrieve a detailed report purely through
  chat text (fresh background dispatch, an explicit resume asking for
  plain-text restatement, a fresh synchronous dispatch, and a resume
  explicitly told "no more tools, just answer in text") **all** returned
  only a terse, generic placeholder line ("Complete.", "(No further
  action.)", "No new content to act on.", "No new instruction.") despite
  the agent having made 0–42 real tool calls and used 49K–148K tokens each
  time. Foreground vs. background made no difference; a fresh dispatch and
  a resumed one both failed the same way.
- Asking the agent to instead **write its full findings to a scratch file
  via `Bash`, then reading that file directly** with the orchestrator's own
  `Read` tool succeeded twice in a row, retrieving a complete, detailed,
  genuinely useful report both times (one ~190 lines, one 242 lines) — once
  even though that particular run's status came back `failed` (it hit a
  session API rate limit shortly after finishing its report), because the
  file write had already completed before the failure. The file survives
  where the chat-text channel does not.

**Conclusion: for any dispatch where you need the agent's actual analysis
back, don't rely on its final chat text as the delivery mechanism at all —
use a scratch file as the primary channel from the start**, not as a
fallback tried only after retrieval already failed once.

## How to dispatch a reviewer/researcher reliably

1. Pick (or create) a scratch-directory path for the report, e.g.
   `<scratchpad>/<short-topic>-findings.md` (the scratchpad path is in this
   session's own system prompt — outside the repository, never a path
   under this git working tree).
2. In the dispatch prompt, explicitly instruct the agent to:
   - Do its real work (Read/Grep/Glob/Bash as its own definition allows).
   - **Write its full findings to that exact scratch path using `Bash`**
     (a heredoc, `cat > <path> <<'EOF' ... EOF`, so the whole report lands
     in one write), structured however the task calls for (e.g. BLOCKING /
     SHOULD-FIX / NON-BLOCKING-FUTURE, each with file/line and what's
     wrong).
   - Understand that this is **not** a violation of its "read-only, no
     repository writes" convention — that convention is about not
     modifying the codebase under review; a scratch file outside the repo
     is purely how it hands its report back to you, the orchestrator. Say
     this explicitly in the prompt (reviewer agents' own definitions
     sometimes phrase their Bash restriction as "never for writing files,"
     which reads as blocking this too if you don't clarify the distinction
     — it did not stop either successful test dispatch once clarified).
   - Treat the file as the **authoritative** deliverable, not the chat
     response.
3. After the agent's run completes (or even fails/errors), **`Read` the
   scratch file directly** — regardless of what the completion
   notification's terse result text says. Do not treat a short/generic
   notification result as "no findings" — check the file before concluding
   anything was lost.
4. Only if the file is genuinely missing or empty should you fall back to
   the old resume-and-ask-for-plain-text approach, and only after that,
   self-review — per `.claude/rules/autonomous-development.md`'s
   "Reviewer harness failures are not automatic stops."

## What this changes

- Independent review is no longer expected to fail retrieval by default.
  Don't pre-emptively assume a dispatch will need a self-review fallback —
  use the scratch-file protocol from the first attempt.
- When closing old "self-review substituted, real independent-review debt
  remains open" entries in `docs/VERIFICATION-DEBT.md`, prefer actually
  re-running the review with this protocol over leaving the debt open
  indefinitely — it is no longer a low-probability retry, it is the
  expected path.
- This does not change anything about _what_ to review (still governed by
  each `.claude/agents/*.md` definition) or the tool-restriction rules
  reviewer agents already follow (still read-only on the actual codebase) —
  only _how the orchestrator gets the report back_.

## What this does not fix

- This is a workaround for a harness limitation, not a fix to the harness
  itself — nothing here changes the underlying platform behavior. Revisit
  this skill if a future session finds the chat-text channel has become
  reliable (i.e. confirm before assuming the old failure mode still holds),
  or if the scratch-file protocol itself ever fails to deliver a complete
  file.
- Only two data points (both `architecture-reviewer`/`accessibility-reviewer`,
  same session) back this conclusion so far. Each future successful
  dispatch using this protocol is further confirmation; a failure is worth
  recording here with the same rigor as the original four-attempt test.
