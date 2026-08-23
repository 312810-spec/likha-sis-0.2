# Project State & Memory Workflow

Canonical durable memory (read in this order at session start, per
CLAUDE.md):

1. `docs/PROJECT-MEMORY.md` — durable facts only, not a transcript.
2. `docs/CURRENT-HANDOFF.md` — status, current goal, exact next action.
3. `docs/ACTIVE-PLAN.md` — per-milestone detail and verification record.
4. Only the specific `docs/adr/*.md` relevant to the current task.

Also present:

- `docs/SOURCE-REGISTRY.md` — durable third-party sources actually
  adopted (tooling, libraries, patterns), each tagged
  ADOPT/PILOT/REFERENCE/REJECT. Not browsing history — only what was
  actually decided.
- `docs/VERIFICATION-DEBT.md` — known-pending verification (native visual
  inspection, device-specific tests, Android checks, hardware-dependent
  recovery scenarios). Not a bug backlog; only things that are correct-as-
  far-as-checked but not yet checked by the missing means.

For a substantial task (multi-phase, spans context-compaction risk),
maintain working memory as three files under `.planning/<task>/`:
`task_plan.md` (phased plan), `findings.md` (research results), and
`progress.md` (what's done, a running log). `.planning/` is gitignored
and disposable — canonical truth stays in `docs/`. If context is lost
mid-task, re-read `task_plan.md` + `progress.md` first.

On completing a milestone that materially changes project state, update
`PROJECT-MEMORY.md` (durable fact only), `CURRENT-HANDOFF.md` (status +
exact next action), and `ACTIVE-PLAN.md` (verification record), and add
an ADR only for a durable architectural decision — not for every small
configuration choice.
