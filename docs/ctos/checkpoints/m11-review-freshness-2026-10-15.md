# M11 retained-review freshness evidence — 2026-10-15

Base: PR131 merge `224f37ef22517d55134c5afd6a7f3d722bfd7e64`.
Verified PR131 head: `2c18c34143faf81bb1e6fda5fcda03bf25eff4b6`;
Quality 38640675661 / Security 38640675500 both succeeded before merge.
Branch: `ctos/m11-review-freshness-20261015`.

## Contract

- Read-only exact school/class-record/review lookup with current native authority;
  no caller actor/school parameter at IPC. Missing returns unavailable; unassigned
  access fails. Historical authority never replaces current authorization.
- One read transaction verifies the retained draft payload and source integrity,
  review-to-draft snapshot hash and review-to-source hash/protocol bindings, then
  compares current readiness inputs. Changed inputs leave review history unchanged.
- Valid binding with unknown protocol stays unsupported; no current comparison is
  invented. Missing source evidence for a formerly bound review is invalid, not an
  excuse to backfill legacy evidence. Notes/actor/time are retained metadata, not
  independently cryptographically signed professional acceptance.
- Native result contains review/draft/record identities, snapshot/source hashes,
  protocol, current source status/hash and read-time timestamp. No raw source JSON
  or notes returned; no writes, export, approval or issuance performed.
- Explicit scope `read_time_preparation_evidence_not_issue_authorization`;
  official fidelity remains `not_verified`. A read-time match may expire and must
  never authorize a future write without its own atomic source/authority checks.
- No grading, schema, source collector or fingerprint-input implementation changes.
  Existing valid source evidence is reusable; no migration/backfill added.

## Executed checks and boundaries

- Architecture, dead-code and diff checks PASS; batch-runner 4/4 PASS.
- SQL-only: all 56 migrations applied with foreign keys enabled; exact scoped
  review and draft queries prepare/execute against missing synthetic identities.
  This is not Rust/SQLCipher/native-device execution evidence.
- Three native tests added for read-only unchanged/changed inputs, current scoped
  authority/missing identities, and adversarial review fingerprint binding.
  Corruption test drops only a review update trigger inside a synthetic in-memory
  fixture to inject corruption; foreign keys remain enabled. No application
  protection, CI gate or real user database is bypassed.
- Local Cargo/rustfmt unavailable; require current-head native CI. Frontend/UI
  source unchanged; reuse valid PR131 frontend/browser evidence.

## Next

PR132 initial head `a90d7286d90d4e8f9d82415729f2a41e58d789ce`, tree
`d90d793832e2fbe0bfa9506672fd09eb4cfdf837`, matched local source. Security
38648706033 and Quality Windows job 116141936719 succeeded. Quality run
38648706094 Ubuntu job 116141936846 failed at `cargo fmt --check` before tests.
Applied the five exact formatter hunks in `report_preparation_review.rs`, verified
whitespace/trailing-comma-only equivalence. Grading, authorization, SQL and source
fingerprint inputs remain unchanged. Require fresh applicable exact-head gates;
the initial failing Quality run is not merge evidence.

Publish exact local/remote source identity and require applicable Quality/Security.
Expose explicit retained-review source evidence, then issuance-time revalidation,
immutable issued snapshots, append-only amendments and cross-form reconciliation.
M10/M11 and remaining milestones are not complete. Authoritative official sources,
installed Windows/Android devices, human screen-reader and professional acceptance
remain external dependencies. No deployment.
