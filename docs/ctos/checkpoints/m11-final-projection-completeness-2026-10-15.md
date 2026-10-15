# M11 final-projection completeness repair — 2026-10-15

Base: PR133 merge `ec4fbe25bc36e35212d99f1b0ef75d68e56040a7`.
Verified PR133 head `82c139e0b1ec0a3cb4c7d4cdedfe9741e321b9ea`;
Quality 38664400098 / Security 38664400124 both succeeded before merge.
Branch: `ctos/m11-final-projection-completeness-20261015`.

## Verified source finding

`ComputedTermGrade.complete` documents that a provisional number must never be
presented as final. The SF5, SF6 and SF10 command paths independently matched
`Some(grade)` and averaged its term grade without checking that flag. They could
therefore populate final subject grades/general averages/promotion projections
while weighted items still lacked recorded learner statuses. This finding comes
from repository implementation/contracts, not a new external policy claim.

## Small repair

- One shared `average_complete_recorded_terms` helper used by all three paths.
- Any supplied provisional or missing computed term returns unavailable. Existing
  SF5-based status/summary logic receives a missing subject grade and remains
  PENDING with no general average, instead of promoting partial numeric evidence.
- Empty input is unavailable, not zero. Complete supplied numeric terms retain
  existing rounded-average behavior; a supplied complete zero is not mistaken for
  a missing value. No raw scores, calculation rules or curriculum policies changed.
- Removes duplicated average eligibility logic; no new IPC, writes, schema,
  authorization or browser UI. No files/real school records exported by this run.

## Executed checks and evidence limits

- Architecture, dead-code and diff checks PASS; batch-runner 4/4 PASS.
- Static integration check PASS: SF5, SF6 and SF10 each call the shared helper
  exactly once and contain no previous `all_scored`/unchecked term-grade sum path.
  This is source-structure proof, not execution of Rust or actual CSV workflows.
- Three native regression tests added: complete rounding/empty/zero; six positions
  of provisional/missing evidence; propagation to existing PENDING/no-average
  projection. Cargo/rustfmt unavailable locally; exact-source native CI required.
- Frontend unchanged; reuse valid PR133 frontend/browser evidence rather than
  repeating unchanged checks. Installed-device/professional acceptance remains owed.

## Deliberately not claimed

This checks completeness of supplied records only. Required grading-period
coverage, missing subject/period detection, duplicate/transfer periods and existing
subject-name grouping still need explicit reconciliation. It does not establish
official annual finality, professional approval or official-template fidelity.
Current readiness-source fingerprints cover term-readiness inputs/implementation,
not the changed SF5/SF6/SF10 aggregation; never use their match to certify these
annual outputs or authorize issuance. Annual-form source binding must include
its own dependencies. No source backfill or approval metadata invented.

## Next

PR134 initial head `0f15eb4f9ba395922aa74c194e25e92605abd0ca`, tree
`12a238bf51880c953d8d428d565e75b6643a7943`, matched local source. Security
38665548604 and Quality Windows job 116196613256 succeeded. Quality run
38665548529 Ubuntu job 116196613079 failed at `cargo fmt --check` before tests:
one `sf5.rs` test assertion wrapping hunk. Applied that exact formatter hunk and
verified whitespace/trailing-comma-only equivalence. No eligibility, arithmetic,
call-site or authority change. Fresh applicable exact-head Quality/Security is
required; a passing Windows job never overrides the failed aggregate gate.

Publish exact local/remote tree identity and require current-head Quality/Security
before merge. Continue required-period/source-aware reconciliation, issuance-time
authority/source checks, immutable issuance and append-only amendments. M10/M11
and remaining milestones incomplete; no deployment. Official sources/templates,
installed Windows/Android devices and professional acceptance remain external.
