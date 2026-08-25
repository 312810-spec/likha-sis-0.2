---
name: local-database
description: Use when touching src-tauri/src/db, src-tauri/src/repository, SQL migrations, or the SQLCipher/DPAPI key store.
---

# Local Database

Read `docs/adr/0002-local-database-foundation.md` (schema/repository
pattern) and `docs/adr/0003-encryption-at-rest.md` (SQLCipher + DPAPI)
before changing anything here.

Pattern to follow:

- All SQL lives in Rust (`src-tauri/src/repository/`) behind narrow Tauri
  commands (`src-tauri/src/commands/`). The frontend never sends SQL.
- New migrations go through `rusqlite_migration`; never hand-edit an
  already-applied migration — add a new one.
- The database is SQLCipher-encrypted; the key is DPAPI-protected via
  `KeyStore`/`DpapiKeyStore` and fails closed on a corrupted/undecryptable
  key file — never write code that would silently mint a replacement key
  on failure.
- School-scoped reads must filter by the session-derived `school_id`, not
  a caller-supplied one (see `auth-authorization` skill).
- **Versioned/DepEd-sourced reference data** (grading policies, weight
  policies, curriculum versions, key stages — anything with a
  `source_citation` column): global, not school-scoped; at most one
  `is_default = 1` row enforced by a `CREATE UNIQUE INDEX ... WHERE
is_default = 1` partial index, never a check-then-act guard (two real
  races in this project's history, M4 and M6, came from that shape). An
  operational record (e.g. `class_records`) that needs to remember which
  version applied pins a nullable `..._id` foreign key at creation time
  and resolves it via a `resolved_..._in_school`-style `COALESCE(pinned,
default)` lookup — never re-reads "whichever is default today" for an
  already-created record. See `docs/adr/0010`, `0013`, `0015`, `0037` for
  four applications of this exact shape; reuse it again rather than
  inventing a new one for the next versioned-reference-data need (a
  future role/duty/qualification concept for Teacher Load is a likely
  candidate).
- Never use `INSERT OR IGNORE` to make a grant/insert idempotent when a
  `CHECK`/`UNIQUE` violation on that same statement should still error —
  `OR IGNORE` silently swallows _any_ constraint violation, not just the
  intended conflict. Use `INSERT ... ON CONFLICT (columns) DO NOTHING`
  instead — it only suppresses the named conflict target. **This exact
  mistake has been made and caught twice**: `repository::role::grant()`
  (RBAC milestone, caught by independent review) and
  `repository::schedule_meeting::create()` (Teacher Load milestone,
  caught by this project's own TDD/adversarial-self-review before any
  review even ran — a missing Rust-side weekday-range check meant the
  schema's own `CHECK (weekday BETWEEN 0 AND 6)` was the only
  guard, and `OR IGNORE` would have silently reported a bogus
  "duplicate" instead of the real out-of-range error). If you write
  `INSERT OR IGNORE` (or catch one in review), stop and ask: does this
  table have _any_ `CHECK` or FK besides the one conflict this is
  supposed to catch? If yes, either validate every one of those in Rust
  first, or use `ON CONFLICT` targeting the exact conflict intended.

Any schema or key-handling change touching this area needs an independent
security/reliability review before being marked complete — see the
`security-privacy` skill.
