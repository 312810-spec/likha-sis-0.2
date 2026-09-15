---
name: memory-health
description: Check LIKHA repository memory, local journal/index health, and optional external-observer status without making any AI provider a dependency.
---

# Memory Health

Run `node scripts/memory/health.mjs` and report its deterministic output. This is a zero-cost local check: no network call and no inference dependency.

The canonical memory layer is the git-committed repository brain: `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md`, `docs/ACTIVE-PLAN.md`, `docs/SOURCE-REGISTRY.md`, `docs/VERIFICATION-DEBT.md`, and relevant ADRs.

The optional local journal/index/retrieval layer (`scripts/memory/journal.mjs`, `recall.mjs`) is local-only and must not become a required cloud/provider dependency.

Any external memory observer is optional enrichment only. Its failure must never make canonical project knowledge unavailable or block normal development.

For targeted recall, use `node scripts/memory/recall.mjs "<query>"` and retrieve only the smallest relevant evidence. Do not dump whole memory files, raw journals, secrets, tokens, or PII into prompts or reports.
