# ADR-0042: Reviewer/Researcher Subagent Dispatch Recovery

Status: Accepted (2026-08-30)

## Context

Since M7, this project has repeatedly documented the same recurring
failure (`docs/VERIFICATION-DEBT.md`, `docs/PROJECT-MEMORY.md`,
`docs/SOURCE-REGISTRY.md`): a dispatched reviewer/researcher subagent
(`architecture-reviewer`, `security-reviewer`, `teacher-ux-reviewer`,
`accessibility-reviewer`, `deped-researcher`) performs real work — tens
of tool calls, tens of thousands of tokens — but the orchestrating
session cannot retrieve its findings as usable text. The established
workaround was: dispatch, if nothing usable comes back resume once and
ask for a plain-text restatement, and if that also fails substitute a
rigorous self-review and record the debt as still open. That workaround
limited the damage but never fixed retrieval — the same failure recurred
at nearly every milestone touching auth/persistence/curriculum/teacher
load/UI, and a long tail of "self-review substituted, real
independent-review debt remains open" entries accumulated across
`docs/VERIFICATION-DEBT.md`.

This session's branch was directed at researching that specific
recurring problem, not at ordinary product feature work.

## Investigation

A controlled, same-session test isolated the failure mode:

1. **Fresh background dispatch** (`architecture-reviewer`, real scope: a
   still-open cross-milestone RBAC/architecture review debt entry) — 38
   tool calls, 128K tokens, genuinely completed. Its background-completion
   notification's result field: `"Complete."`
2. **Resumed via a follow-up message**, explicitly asking it to restate
   its findings as plain text, not through any structured tool — 0
   additional tool calls beyond what it had already done, ~4K more
   tokens. Result: `"(No further action.)"`
3. **A second, independent dispatch** with `run_in_background: false`
   (synchronous), a small bounded task — 7 tool calls, 49K tokens. Result:
   `"No new content to act on."`
4. **That same agent resumed**, explicitly told not to call any more
   tools and just answer in text — 0 tool calls, ~1.5K more tokens.
   Result: `"No new instruction."`

Four consecutive attempts, foreground and background, fresh and resumed,
all returned only a terse, generic placeholder line despite real,
substantial tool activity every time. Foreground/background made no
observable difference; explicitly asking for plain text made no
observable difference.

A fifth dispatch changed the delivery mechanism instead of the
persistence/mode: the same `architecture-reviewer`, same real scope, was
instructed to write its full findings to a scratch-directory file (not
a repository file — outside the git working tree) via `Bash`, with the
distinction from its own "no file writes" convention explained (that
convention is about not modifying the codebase under review; a scratch
report is how it hands results back to the orchestrator). The
orchestrating session then read that file directly with its own `Read`
tool, bypassing the chat-text-return channel entirely. Result: a
complete, genuinely detailed 190-line independent architecture review
(no BLOCKING/SHOULD-FIX findings; three NON-BLOCKING-FUTURE observations,
all cross-checked against and consistent with prior review history).

A sixth dispatch confirmed this generalizes to a different agent type and
survives a mid-run failure: `accessibility-reviewer`, real scope (the
UX-04 accessibility review that had never been successfully completed in
any prior session), same scratch-file protocol. This run's own status
came back `failed` — it hit a session API rate-limit error shortly after
finishing — yet the scratch file was complete (242 lines) because the
`Bash` write had already finished before the failure interrupted
whatever came next. This run also happened to return a rich, complete
summary in its notification's result field (unlike the four prior
chat-text-only attempts) — plausibly because the model was mid-way
through composing that same text when the rate limit hit and the
harness salvaged the in-flight generation, not because the text channel
itself became reliable; the file is still the deliverable actually
trusted, and is what closed this milestone's real review debt (see
below).

## Decision

**Route reviewer/researcher subagent reports through a scratch file, not
the agent's own chat response, as the default first dispatch method —
not a fallback tried only after retrieval already failed once.**
Documented as `.claude/skills/agent-dispatch-recovery/SKILL.md`, referenced
from `.claude/rules/autonomous-development.md`'s existing "Reviewer
harness failures are not automatic stops" section (kept as the
last-resort fallback for the rare case even the file protocol fails, not
replaced).

This is a workaround for a harness limitation, not a fix to the
underlying platform — nothing here changes agent/notification behavior
itself, only how this project's own sessions retrieve results. Two
data points back it so far (both confirmations from this one session);
the skill records that explicitly and asks future sessions to keep
treating each further use as continued confirmation, not a settled fact.

## Consequences

- Independent review debt is no longer expected to default to
  self-review-substituted. Sessions should attempt the scratch-file
  protocol first for every reviewer/researcher dispatch.
- This session used the protocol to actually close two pieces of real,
  previously-open review debt as a direct proof of value, not just a
  meta-exercise (see `docs/VERIFICATION-DEBT.md`'s corresponding entries
  and this session's fixes to `ClassRecordWorkspace.tsx`/
  `ClassRecordsScreen.tsx`/`src/ui/theme/styles.css`).
- Nothing about _what_ a reviewer agent is allowed to do changes — still
  read-only against the actual codebase, still governed by its own
  `.claude/agents/*.md` definition. Only the reporting channel changes.
- A future session should periodically re-test whether the plain
  chat-text channel has become reliable on its own (platform-level fixes
  are plausible over time) rather than assuming this workaround is
  needed forever — but should not remove it without confirming that
  first.
