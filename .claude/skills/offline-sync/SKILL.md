---
name: offline-sync
description: Use when designing any feature that might eventually sync to a cloud backend, or when touching a SyncProvider-shaped interface.
---

# Offline & Sync

Current state: cloud sync is **not implemented** and out of scope for
current milestones (see `docs/ACTIVE-PLAN.md` "Out of Scope"). This skill
exists to prevent premature coupling, not to guide building sync now.

Rules that still apply today even with no sync implementation:

- Offline writes save locally first — never design a flow that requires
  a network round-trip to complete a local action.
- `SyncProvider` is a boundary, not a concrete dependency — if you're
  ever tempted to have `src/domain/` or `src/application/` reach toward a
  specific cloud provider (Cloudflare or otherwise), stop; that belongs
  behind a port, implemented later in `src/infrastructure/`, matching the
  `UI → Application Services → Domain → Repository Ports →
Infrastructure/Platform Adapters → SyncProvider → Cloud` layering in
  `CLAUDE.md`.
- Do not scaffold speculative sync infrastructure ("just in case") —
  YAGNI applies; wait for an actual milestone that needs it.

When sync work actually starts, it gets its own ADR before implementation
begins, matching how encryption (`0003`) and auth (`0004`) each got one.
