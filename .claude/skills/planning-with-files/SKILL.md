---
name: planning-with-files
description: Use when starting a substantial multi-phase task that risks context compaction or spans many tool calls — before relying on conversation memory alone to track it.
---

# Planning With Files

A minimal, dependency-free reproduction of the `OthmanAdi/planning-with-files`
three-file working-memory pattern (that project's skill-only install was
found to be a degraded subset missing hooks/slash commands, and its full
plugin route pulls in a third-party marketplace — rejected for this
security-first, minimal-dependency project; see
`docs/SOURCE-REGISTRY.md`). This project's own harness upgrade used this
exact pattern under `.planning/harness-upgrade/` — read it as a working
example.

For a substantial task, create `.planning/<short-task-name>/` with:

- `task_plan.md` — phased plan: goal, constraints copied verbatim from
  any spec given, phases with concrete deliverables (no placeholders).
- `findings.md` — research results as you get them (source, purpose,
  ADOPT/PILOT/REFERENCE/REJECT recommendation, caveats).
- `progress.md` — a running log of what's actually done, updated as you
  go, not just at the end.

Rules:

- `.planning/` is gitignored — it is disposable working memory, not
  canonical project truth. Canonical truth stays in `docs/`.
- If context is lost mid-task (compaction, session restart), re-read
  `task_plan.md` + `progress.md` first, before re-deriving anything from
  scratch.
- When the task completes, fold any durable decisions into `docs/`
  (PROJECT-MEMORY, ACTIVE-PLAN, CURRENT-HANDOFF, SOURCE-REGISTRY, or an
  ADR) — `.planning/<task>/` itself is not the permanent record and can
  be left behind once its content has been captured in `docs/`.
