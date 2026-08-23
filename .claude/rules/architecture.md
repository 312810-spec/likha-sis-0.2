# Architecture Boundaries

Layering (do not shortcut):

UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud

Enforced rules:

- `src/ui/**`, `src/domain/**`, and `src/application/**` must never import
  from `src/infrastructure/**` or `@tauri-apps/*` directly. Only
  `src/composition.ts` is allowed to
  import concrete `infrastructure/tauri/*` classes (see
  `docs/adr/0005-app-shell-and-first-ui-slice.md`). UI screens receive
  their `*ApplicationService`s as constructor/props args, not by importing
  `composition.ts`.
- All SQL lives in Rust (`src-tauri/src/repository/`). The frontend never
  constructs or sends SQL, not even parameterized SQL — it calls narrow
  Tauri commands (`src-tauri/src/commands/`). See
  `docs/adr/0002-local-database-foundation.md`.
- `src/application/*-service.ts` validates input (trim, non-empty, max
  length) before calling a repository port. New TS entities follow this
  pattern rather than a UI component calling a repository port directly.
- Tenant scope (`school_id`) is never a client-supplied parameter for
  tenant-data commands — it is always derived server-side from the
  authenticated session (`SessionManager::require_active_school_scope`).
  See `docs/adr/0004-authentication-and-local-session.md`.
- A deterministic architecture-boundary check script enforces the
  import-direction rules above; run it as part of `npm run quality` (see
  `.claude/rules/testing.md`). Don't hand-wave this with code review alone
  if the script can catch it.

Before changing a layer, read the ADR that established it (`docs/adr/`) —
do not re-derive the reasoning from scratch or silently drift from it.
