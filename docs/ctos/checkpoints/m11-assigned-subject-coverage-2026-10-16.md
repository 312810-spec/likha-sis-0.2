# M11 assigned-subject completeness — 2026-10-16 (Asia/Manila)

## Outcome and source

Base: PR136 calendar repair `8f3d4a3923a91be5ba90757fe5e990870389d6df`,
tree `d002a479a28fbecbbf67d4ac46004cd39962f9d5` before file-ending repair.
The exact final base tree is recorded in the Git parent; do not use that earlier
tree as the candidate identity. PR136 must pass fresh CI before merge.
Branch: `ctos/m11-assigned-subject-coverage-20261016`.

Annual SF5/SF6/SF10 subject lists previously came only from existing class records.
A configured teaching assignment without any class record was absent, so an
otherwise complete subset could produce a numeric general average/promotion.
The shared school/section/year-scoped query now unions record-backed subjects
with assigned subjects. Missing records remain blank/PENDING through the existing
coverage and completeness guards. Record-only subjects survive reassignment;
unassigned catalogue subjects do not become implied requirements. SF10 unions
configured work across its existing historical section groups.

## Verification and limits

The actual SQL extracted from the Rust source passed six SQLite scenarios:
assigned-but-unrecorded inclusion; record/assignment deduplication; unrelated and
forged foreign subjects excluded; foreign school, foreign/missing section and
wrong-year exclusion; and record retention after assignment deletion. Scenario
groups overlap in the six assertions; these are not six native Rust tests.
Two native regression tests added: missing TLE beside recorded Mathematics keeps
the general average unavailable/PENDING; school/year boundaries reject reads.
Local Rust/Cargo unavailable; native tests, rustfmt and Clippy require exact-head
CI. No UI interaction, schema, score or raw-record changes. No new frontend run.

Configured assignments are a minimum check, not verified official required-subject
coverage. Deleted assignments without records are not historical evidence.
Curriculum/policy applicability, semester-specific requirements, transfer
resolution, immutable issuance/amendments and official fidelity remain pending.
Historical issued snapshots are not changed; existing live preparation exports
are still preparation, not issuance. Installed Windows/two-device/Android,
printer and teacher acceptance remain untested. No deployment.

## Next

Require exact-head Quality/Security, repair failures, then merge under the existing
authorization. Continue versioned required-subject/policy reconciliation and
issuance/amendments. M10/M11 remain incomplete; do not mass-merge old branches.
