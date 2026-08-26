---
name: memory-health
description: Use when asked about LIKHA's memory system status, whether the external memory observer (claude-mem) is working, or when troubleshooting why past context/decisions seem missing. Trigger `/memory-health`.
---

# Memory Health

Run `node scripts/memory/health.mjs` and print its output verbatim — do
not summarize or reword the report. It is a deterministic, zero-cost
check (no network call, no LLM call): see
`docs/adr/0050-resilient-zero-cost-memory-observer.md`.

The report distinguishes:

- **Repository brain** (`docs/PROJECT-MEMORY.md`,
  `CURRENT-HANDOFF.md`, `ACTIVE-PLAN.md`, `SOURCE-REGISTRY.md`,
  `VERIFICATION-DEBT.md`) — the canonical, git-committed source of
  truth. This is never affected by the external observer's status.
- **Local journal/index/retrieval/embeddings** — LIKHA's own zero-cost
  Layer 2 (`scripts/memory/journal.mjs`, `recall.mjs`), gitignored,
  local-only, no inference dependency.
- **External observer** — claude-mem, OPTIONAL enrichment only. Its
  status here is read from static config, never a live probe of the
  provider (a probe would itself require network/inference and defeat
  the point).

If the user asks to search past memory, use
`node scripts/memory/recall.mjs "<query>"` — it returns verbatim
matches (never paraphrased) from the canonical docs, ADRs, and the
local journal.

Do not print raw journal content or file contents beyond what
`health.mjs`/`recall.mjs` themselves output — no secrets, tokens, or PII
should ever be present in these stores, but avoid printing anything
beyond what's needed to answer the user's question regardless.
