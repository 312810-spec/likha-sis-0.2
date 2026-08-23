---
name: context7-docs
description: Use when you need current, version-specific API documentation for a library/framework this project depends on (Tauri, React, a Rust crate) and aren't fully confident training data is up to date — not for architecture judgment, business logic, code review, or project-memory retrieval.
---

# Context7 Docs Lookup

Uses the official `ctx7` CLI (npm package, `upstash/context7`), invoked
via Bash — not the always-on MCP server (project policy: no unnecessary
always-on MCP; see `docs/SOURCE-REGISTRY.md`). If a `context7` MCP server
happens to already be connected in this environment at a scope outside
this project's control, prefer the CLI here anyway to keep usage
consistent and auditable in scripts/history.

Usage:

```
ctx7 library <name>              # resolve a library to its Context7 ID
ctx7 docs <library-id> "<query>" # fetch focused docs for a query
```

Rules:

- Use only for current framework/library/API documentation questions
  (e.g. "what's the current Tauri 2 `invoke` error-handling API",
  "current rusqlite_migration API shape"). Do not use it to make
  architecture decisions, review code, or recall anything about this
  project's own history — those come from `docs/` and the codebase
  itself.
- Never include secrets, PII, or proprietary business logic in a query —
  queries may leave the machine.
- Free tier is limited (roughly 1,000 calls/month as of this writing, and
  has shrunk before) — use it for genuine lookups, not exploratory
  spam. If it's unavailable or over quota, fall back to a direct
  WebFetch of the library's official docs site instead of guessing.
- Do not enable any paid Context7 tier without the user's explicit
  approval (project-wide no-paid-infra rule).
