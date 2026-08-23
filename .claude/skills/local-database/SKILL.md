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

Any schema or key-handling change touching this area needs an independent
security/reliability review before being marked complete — see the
`security-privacy` skill.
