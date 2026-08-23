---
name: architecture-boundaries
description: Use before adding an import across UI/application/domain/infrastructure layers, adding a new repository port or adapter, or touching src/composition.ts.
---

# Architecture Boundaries

Full rules: `.claude/rules/architecture.md`. Read it before acting.

Quick check before writing an import:

- `src/ui/**` or `src/domain/**` importing `src/infrastructure/**` or
  `@tauri-apps/*` directly → wrong, stop. Only `src/composition.ts` may
  do that.
- Frontend code constructing or sending SQL, even parameterized → wrong,
  stop. All SQL lives in `src-tauri/src/repository/`.
- A UI component calling a repository port directly instead of an
  `Application Service` → wrong, stop.

After changing anything under `src/` or `src-tauri/src/`, run the
architecture-boundary checker (`npm run check:architecture`, part of
`npm run quality`) — it catches import-direction violations
deterministically; don't rely on manual review alone.

Read the ADR that established the layer you're touching
(`docs/adr/0001` through `0006`) before changing its shape.
