# M11 — immutable native readiness source fingerprints

Branch: `ctos/m11-source-lock-20261015`.
Parent: PR127 merge `1bac457279eb7ce7d2a9dc4bc60ca3eb35933f8c`.
Verified PR127 head: `b3b93011267272aeb63bcb802ec618ae221825b8`.
Quality `38588983691` and Security `38588983626`: PASS.
PR111/112 live merged heads rechecked, unchanged.

## Outcome and limits

Append migration 55; earlier migrations unchanged. New native draft capture now
reads the projection and exact source inputs in one SQLite transaction, then
inserts both immutable draft and source-lock rows before commit. A failed child
insert rolls back the draft. Existing drafts receive no invented source history.
Source locks enforce draft-school scope and prohibit update/delete. No production
data is migrated here; installed-device migration acceptance remains separate.

`report-card-readiness-source-v1` serializes deterministically ordered, explicitly
selected input columns with SQL type tags and exact IEEE-754 real bits. Numeric
rounding or equal computed grades cannot hide raw score/max-score/weight changes.
Only the projection's volatile check timestamp is excluded; score author/time
metadata is retained. Inputs are conservative: all same-school scores/items under
the selected record are captured, including scores irrelevant to current roster.

| Input group        | Retained evidence                                                                                                                                 |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Context            | School/record/section/subject identity and names, grade/year, period identity/label/sequence/dates, pinned weight and curriculum version identity |
| Period memberships | Overlapping membership identities/dates plus learner names, actual LRN digits and sex; school scope enforced on joins                             |
| Items and scores   | Item/category/name/max-score, score identity/status/raw value, learner identity and score author/time                                             |
| Weight policy      | Resolved policy name/citation/default and each weighted category/component, exact weights, parent relationship, category-set name/citation        |
| Projection         | Existing full-period readiness evidence, counts, grades/issues and disclosure, excluding checkedAt                                                |
| Implementation     | SHA-256 over exact grading, readiness, class-record, roster, disclosure, collector and schema source plus native Cargo.lock                       |

Implementation identity deliberately includes tests/comments/formatting and all
native dependencies/schema, so even non-behavior changes can conservatively mark
older locks changed. No silent carry-forward across a changed implementation. This
is a readiness-input protocol, not all future official-form inputs; adding new form
dependencies requires extending/versioning the collector, not assuming coverage.
Stored citations remain metadata, not proof of authoritative source applicability.

The new native read-only command derives actor/school from the active session,
reauthorizes record assignment or School Head authority, verifies exact draft and
source hashes/context, and recomputes inside a consistent read transaction. Returns
only identities/version/hashes and matches/changed/legacy_unavailable/unsupported_version.
Corruption fails instead of becoming an unprotected legacy success. Raw input JSON
including LRN digits is retained in encrypted local SQLite and never returned over
IPC. A read-time match expires with subsequent changes and is NOT atomic issue
authorization, professional approval, source verification or official fidelity.

## Verification

- Architecture/dead-code and four evidence-runner checks PASS; diff whitespace clean.
- SQL-only check: all 55 exact appended migrations execute on SQLite 3.53.1 with
  foreign keys enabled; source table empty and three retention/scope triggers present.
  All six exact collector queries prepare/execute against that schema. This is not
  Rust, SQLCipher, installed-device or native behavioral acceptance.
- Native regressions added: adjacent real-bit/type distinctions, repeatable hashing,
  unchanged/read-only source checks, authorization/isolation, immutable source rows,
  legacy absence, unsupported protocol, integrity refusal, raw LRN/score changes
  masked by equal projections, policy-content changes, unrelated-school isolation,
  and atomic rollback on a synthetic child failure. Migration 54→55 regression
  preserves a real-FK-parent legacy draft without source backfill.
- Rust/Cargo/rustfmt unavailable locally; native compilation/format/tests/Clippy and
  applicable Security must pass exact-source CI before merge. No native PASS claimed.
- Frontend unchanged; reuse PR127's 155-file/1,519-test, build/browser/recovery and
  structural accessibility evidence, not proof of the new persistence semantics.
- No source-check UI, review/issue/amendment transition or reconciliation implemented.
  M10/M11 incomplete, SF8 inactive. Official sources, manual screen-reader, installed
  devices and professional acceptance remain distinct unavailable evidence. No deployment.

## Continue

Publish with expected-head lease and verify remote/local tree identity. Inspect
failed excerpts and apply minimum repairs; merge only at applicable green verified
head. Expose source-check states next, then atomic native review/issue semantics,
append-only amendments and cross-form reconciliation. Never use a stale read-time
match or legacy/unsupported evidence to bypass an issue-time check or professional
review. Continue independent work and park external acceptance. No deployment.
