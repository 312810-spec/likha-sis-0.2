---
name: failure-recovery
description: Use when designing error handling, key-loss/corruption scenarios, offline write failures, concurrency races, or any recovery/fallback path.
---

# Failure & Recovery Design

Default posture: **fail closed**, not open. A missing/corrupted key,
failed migration, or ambiguous auth state should block the operation and
surface a clear (non-leaking) error — never silently proceed with a
weaker guarantee (e.g. minting a replacement encryption key, or granting
access on an unclear session state).

Known precedent in this codebase — read before assuming a new area is
simple:

- `DpapiKeyStore` fails closed on a corrupted/undecryptable key file
  (`docs/adr/0003-encryption-at-rest.md`).
- `bootstrap_installation`'s first draft used a `SELECT`-then-act
  singleton guard, reasoning SQLite's write lock would serialize
  concurrent races — it doesn't (a `SELECT` doesn't invalidate an
  already-established read snapshot). Fixed with an `INSERT`-based
  singleton claim that genuinely participates in write-lock
  serialization. Any new "only once" guard must use this pattern, not a
  SELECT-then-act check — see `docs/adr/0006-first-run-bootstrap.md`.
- A narrower, accepted-not-fixed race remains between
  `bootstrap_installation` and `register_user`/`add_user_to_school`
  racing each other (both still SELECT-gated) — documented, not silently
  reintroduced elsewhere.

For concurrency-sensitive guards, write a real multi-thread/multi-connection
test against the same database file (see `src-tauri/tests/bootstrap.rs`
for the pattern) — sequential re-calls do not prove a race is closed.

Known open recovery gaps (not yet hardware-verified): see
`docs/VERIFICATION-DEBT.md`.
