# ADR-0062 — File-based output workaround for the agent-resume/retrieval failure

Status: Accepted

## Context

Since M7 (2026-08-25), independent-review dispatches (`security-reviewer`,
`architecture-reviewer`, `accessibility-reviewer`, `teacher-ux-reviewer`,
and others) have repeatedly hit the same harness-level failure: a
dispatched subagent does real work — reads files, runs checks, forms a
verdict — but its final findings text is never retrievable by the
orchestrating session. The completion notification arrives with an empty
or generic placeholder result (e.g. "standing by", "nothing to relay",
"holding") instead of the agent's actual output. This is documented
extensively across `docs/VERIFICATION-DEBT.md`'s many "independent review
not retrievable" entries and `docs/adr/0027-audit-timestamp-readability-fix.md`.

The project's standing mitigation (`.claude/rules/autonomous-development.md`,
"Reviewer harness failures are not automatic stops") was: retry once via
`SendMessage`, and if that also fails, substitute a rigorous self-review
and retain the independent-review debt. This kept development unblocked
but never actually closed the debt — sessions kept hitting the same wall
indefinitely, and self-review is a materially weaker guarantee than a
genuinely independent, fresh-context reviewer.

## What was ruled out

Adding `Write` access to the dedicated reviewer agents
(`.claude/agents/accessibility-reviewer.md`, `teacher-ux-reviewer.md`,
`security-reviewer.md`, `reliability-reviewer.md`,
`architecture-reviewer.md`, `evaluator.md`) so they could persist their
own findings to disk was considered and rejected. Two of those agents'
own review checklists explicitly flag this as a defect:
`architecture-reviewer.md` states "a reviewer with `Write` access is
itself an architecture defect in this harness," and `security-reviewer.md`
checks that "reviewer agents genuinely lack Write/Edit; no agent has
broader tool access than its job needs." Weakening that invariant to work
around an unrelated retrieval bug would trade one real defect for
another.

Forcing synchronous execution (`run_in_background: false` on the `Agent`
tool call) was tested directly (2026-09-02, against
`accessibility-reviewer` reviewing `TeacherWorkspaceScreen.tsx`) and made
no difference — the tool still reported "Async agent launched
successfully... working in the background," and the resulting completion
notification carried the same empty result as every background dispatch.
The flag does not appear to be honored for this agent type in this
environment.

## Decision

Route review output through the filesystem instead of the broken
response-retrieval channel, using an agent type that already has
legitimate `Write` access rather than granting it to the read-only
reviewers:

1. Dispatch the review via the `general-purpose` agent (tools: `*`),
   never the dedicated reviewer agents, when the dedicated agent's normal
   dispatch has already failed to return retrievable findings once.
2. Inline the dedicated reviewer's own checklist into the task prompt
   (copied from its `.claude/agents/*.md` body) so the review criteria
   are unchanged — only the delivery mechanism differs, not the review's
   rigor or scope.
3. Instruct the agent explicitly: no edits/creates/deletes anywhere in
   the repository; its only permitted write action is creating exactly
   one findings file at a fixed path under the session's scratchpad
   directory, in a fixed report format (verdict, findings, checks
   performed).
4. After the agent completes (still via the same async
   notification path — that part of the mechanism doesn't change), read
   the scratchpad file directly with the `Read` tool, ignoring whatever
   the notification's own result text says.

This was validated live in this session: both `TeacherWorkspaceScreen.tsx`
(UX-02, `docs/VERIFICATION-DEBT.md`'s open accessibility-review debt) and
`AttendanceScreen.tsx`/`MonthlySummaryScreen.tsx` (UX-03, the open
teacher-UX-review debt) were re-reviewed this way after their direct
dedicated-agent dispatches (plus one permitted resume each) failed again.
Both produced real, retrievable, evidence-backed findings files (computed
contrast ratios against actual hex values, line-cited mode-parity checks,
etc.) — both verdicts LOOKS-GOOD. See the matching entries in
`docs/VERIFICATION-DEBT.md` for the full findings.

## Consequences

- This does not fix the underlying harness bug (still unknown root
  cause, still a platform-level issue outside this repository's own
  code) — it routes around it for the one purpose that actually needs
  the findings back reliably: closing independent-review debt.
- Any future independent-review dispatch that hits the same retrieval
  failure (after the one permitted resume) should use this pattern next,
  rather than falling straight to self-review. Self-review remains the
  fallback only if the file-based approach itself somehow fails too
  (e.g. the scratchpad path becomes unwritable).
- No changes were made to `.claude/agents/*.md` — the dedicated
  reviewers' read-only invariant is untouched. This keeps the fix
  consistent with `architecture-reviewer`'s and `security-reviewer`'s own
  stated rules rather than working around the bug by weakening them.
- Slightly more setup cost per dispatch (the checklist must be inlined
  into the prompt instead of living implicitly in the dedicated agent's
  system prompt), but this is a one-time prompt-authoring cost, not a
  recurring one, and the checklists are short and stable.
- `docs/VERIFICATION-DEBT.md`'s "Scheduled-wakeup harness reliability"
  entry is a distinct issue (the session's own wakeup timers, not
  subagent review retrieval) and is unaffected by this decision.
