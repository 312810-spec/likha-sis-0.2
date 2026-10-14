# M11 native preparation-review evidence — 2026-10-15

Base: PR129 merge `bbe47574b8a193e5058e6e7a00c0f3c03a19d4b1`.
Verified PR129 head: `39837c076e2c84969497bd097a563b0d5753e458`;
Quality 38618289165 and Security 38618289229 both succeeded before merge.
Branch: `ctos/m11-preparation-review-20261015`.

## Contract

- Native authenticated preparation-review event, not issuance or grade approval.
- Explicit teacher confirmation, expected retained snapshot/source SHA-256 and
  current source revalidation share the write transaction. Legacy, unsupported,
  missing, stale, mismatched and unauthorized evidence cannot create review events.
- Native actor/time; deny unknown caller authority/approval fields; bounded notes.
- School-scoped UUID request identity: identical retries return the original
  event without another write; different payload reuse fails. Current source and
  authority are still required on retries; uncertain writes can be resolved by history.
- Migration 56 adds immutable events with retained parent/source binding and
  same-school/class-record insertion guard. No backfill or official-form mutation.
- Latest 50 history reads reauthorize current access and retain historical evidence
  without recomputing current grades. Notes are immutable database evidence, not
  independently cryptographically signed professional acceptance.
- Incomplete preparation evidence can be reviewed. Such review does not mean it
  is issuable. Existing official fidelity remains `not_verified`.

## Verification actually run

- Architecture and dead-code checks PASS; batch-runner 4/4 PASS; diff whitespace PASS.
- SQL-only SQLite: all 56 migrations applied with foreign keys enabled; review
  table empty, all three scope/immutability triggers present. This is not Rust,
  SQLCipher, installed-device or professional acceptance.
- Four native tests added: immutable/idempotent review, invalid/stale/no-write
  cases, current authority/foreign/missing/legacy denial, caller-field rejection.
  Native cargo fmt/test/clippy unavailable locally; exact-source CI required.
- No frontend changes: reuse valid unchanged PR129 frontend/browser evidence.
- Native schema/readiness changes conservatively change implementation fingerprint;
  older locks may report changed and must not be silently backfilled or approved.

## Remaining

PR130 initial published head `a8206a72fc444b409f9d4fba6f575876d2035c4c`
had identical local/remote tree `f0c39805d3814987b87b19b911e29dff1502a670`.
Quality run 38629394227 Ubuntu job 116076874149 failed at `cargo fmt --check`
before tests. Applied its 20 exact formatter hunks across three native files;
verified whitespace/trailing-comma-only equivalence. Native behavior is unchanged,
but conservatively captured implementation fingerprints change. Documentation
formatting PASS. Require fresh exact-head gates for the repair; no failure bypass.

Require applicable exact-head Quality/Security before merge. Next: explicit review
UI with uncertain-write handling, issuance revalidation, append-only amendments,
cross-form reconciliation and remaining milestones in controlling order. Official
source/templates, installed Windows/Android evidence and professional acceptance
remain external dependencies; no deployment and no all-batches completion claim.
