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

A seventh and eighth dispatch (same session, immediately after the above
was documented and used) tested the one case the scratch-file protocol
cannot cover: `teacher-ux-reviewer`'s own declared tools are `Read, Grep,
Glob` — no `Bash` — so it has no way to write a report file at all. A
fresh dispatch on real, previously-never-completed scope (UX-04's own
teacher-UX review) returned only `"No action needed — my review is
complete and was fully delivered in prior turns."`; the one permitted
resume, explicitly telling it its findings had **not** reached the
orchestrator and asking it to restate everything in that reply, returned
only `"No further response required."` — the identical terse-placeholder
failure signature as the four chat-text-only tests above, confirming
this is not fixable by asking harder, and that no `Bash` means no
available workaround at all today. A rigorous self-review was substituted
per the established fallback (see `docs/VERIFICATION-DEBT.md`'s
corresponding entry) and found and fixed two real, if minor, teacher-UX
gaps.

## Decision

**Route reviewer/researcher subagent reports through a scratch file, not
the agent's own chat response, as the default first dispatch method —
not a fallback tried only after retrieval already failed once — for any
agent whose declared tools include `Bash`.** Documented as
`.claude/skills/agent-dispatch-recovery/SKILL.md`, referenced from
`.claude/rules/autonomous-development.md`'s existing "Reviewer harness
failures are not automatic stops" section (kept as the last-resort
fallback for the rare case even the file protocol fails, not replaced).
**For an agent without `Bash` (confirmed: `teacher-ux-reviewer`), no
retrieval fix is known yet — go straight to the resume-retry-then-
self-review fallback rather than expecting the file protocol to help.**

This is a workaround for a harness limitation, not a fix to the
underlying platform — nothing here changes agent/notification behavior
itself, only how this project's own sessions retrieve results. Three
data points back the `Bash`-agent conclusion so far (two successes, both
from this session); one data point (also this session) confirms the
no-`Bash` gap is real and not solved by retrying. The skill records both
explicitly and asks future sessions to keep treating each further use as
continued confirmation, not a settled fact, in either direction.

**Both conclusions were independently reconfirmed the same session on a
second milestone (UX-03).** A third `Bash`-agent dispatch
(`accessibility-reviewer` on `AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx`)
succeeded again via the scratch-file protocol, retrieving a genuinely
useful ~300-line review that found a real, systemic BLOCKING bug
(every "Retry" button in the codebase's `Alert`+retry pattern drops
keyboard focus to `<body>`, including in 3 call sites this very session
had just added to `ClassRecordWorkspace.tsx` — exactly the "broader
pattern risk" the UX-04 review's own finding #8 had flagged but not
verified). A second `teacher-ux-reviewer` dispatch, this time explicitly
coached to lead with a one-line summary and keep findings short (testing
whether response length was the actual driver of the failure), still
returned only a terse placeholder on both the fresh attempt and the
retry — ruling out "the response was too long" as the cause and
reinforcing that this is a structural limitation of dispatching an
agent with no `Bash` tool, not a fixable prompting problem.

**A fourth `Bash`-agent dispatch on a third milestone (UX-02) succeeded
on the first attempt, no retry needed** — `accessibility-reviewer` on
`TeacherWorkspaceScreen.tsx` found the same systemic Retry-focus-loss
bug a third time (this screen's variant went undetected longer because
it uses the shared `PageHeader` component, whose mount-only focus effect
had no way to be re-invoked on a later retry) and a real, distinct
finding: this project's own `docs/adr/0032-teacher-workspace-polish.md`
had claimed its self-review's `expectNoAccessibilityViolations` calls
covered "every screen state," which the reviewer checked directly and
found false (only the happy path was ever axe-scanned). Four consecutive
`Bash`-agent dispatches have now succeeded via this protocol with zero
failures; the `teacher-ux-reviewer` gap remains the only unresolved
retrieval failure mode.

**The `teacher-ux-reviewer` gap was investigated as a fixable problem,
not just documented, and the obvious fix does not work.** Hypothesis:
the gap is really "no `Bash` tool," so granting `Bash` should close it
the same way it closed the gap for the other two agent types.
Temporarily added `Bash` to `.claude/agents/teacher-ux-reviewer.md` with
the identical scratch-file-exception wording already proven to work
elsewhere, then dispatched on genuinely new scope
(`TeacherWorkspaceScreen.tsx`, never reviewed by this agent type
before). Result: falsified. The scratch file was never created — across
a full dispatch (23 tool calls) and a resumed diagnostic question asking
directly whether `Bash` was attempted (0 further tool calls), the agent
never once invoked `Bash`, despite the tool being available and
explicitly instructed. The real blocker is therefore this agent type's
own behavior when given this task, not tool availability — a materially
different, more specific finding than "no `Bash`, structurally
impossible." The tool grant was reverted (confirmed byte-identical to
before) since it added capability with no measured benefit. Full record
and untried next steps: `.claude/skills/agent-dispatch-recovery/SKILL.md`'s
"Known gap" section.

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
