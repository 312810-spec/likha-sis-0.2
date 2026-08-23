# ADR-0001 — Greenfield LIKHA-SIS 0.2 Foundation

Status: Accepted

## Context

LIKHA-SIS 0.2 is being restarted as a new project to avoid inheriting implementation debt from an older codebase.

## Decision

Start with a clean repository using:

- React
- TypeScript
- Vite
- Tauri 2
- Rust
- SQLite as the future device working database

Use:
UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud

Old implementation code is not authoritative.

## Consequences

- Proven architectural principles may be selectively reused.
- Old implementation structure is not copied by default.
- Workspace quality and architecture boundaries come before feature development.
- The first persistence milestone proves ordinary SQLite behind a provider-independent boundary before encryption or sync.
