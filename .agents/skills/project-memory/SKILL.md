---
name: project-memory
description: Use at the start of any session, when asked about current status/next task, or after completing a milestone that changes project state.
---

# Project Memory

Read in this order, stop once you have what you need:

1. `docs/PROJECT-MEMORY.md` — durable facts only.
2. `docs/CURRENT-HANDOFF.md` — status + exact next action.
3. `docs/ACTIVE-PLAN.md` — per-milestone detail and verification record.
4. Only the `docs/adr/*.md` relevant to the current task.

Also check `docs/SOURCE-REGISTRY.md` (adopted third-party sources) and
`docs/VERIFICATION-DEBT.md` (known-pending verification, not a bug list)
if the task touches either.

Full workflow detail: `.Codex/rules/project-state.md`.

When a milestone materially changes project state, update
`PROJECT-MEMORY.md` (durable fact only, not a transcript),
`CURRENT-HANDOFF.md` (status + exact next action), and `ACTIVE-PLAN.md`
(verification record). Add an ADR only for a durable architectural
decision, not every configuration choice.

For a substantial multi-phase task, use the `planning-with-files` skill
for working memory instead of trying to hold it all in your head.
