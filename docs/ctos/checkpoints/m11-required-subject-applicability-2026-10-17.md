# M11 required-subject applicability — 2026-10-17

## Scope and acceptance

Build from main `ee7d3cc775c8ac552138954d4cdacc5063d8638d`, not PR103.
PR144 branch: `ctos/m11-required-subject-applicability-20261017`.
Initial durable implementation: `bfd5ec2bf4c87cf76192795f3a19972059fb95f7`;
follow-up verification/hardening changes must be read from the live branch.

Required acceptance: exact school/year/grade/cohort/period identity; atomic roots
and successors; immutable evidence/actor/time; explicit draft/confirmation/withdrawal;
current trusted scope; preserved historical pins; synthetic concurrency and scope tests.
Quality and Security must pass at the final exact head before merge.

## Implemented

- Concrete section ID is the cohort; concrete grading-period ID is the period.
  School/year/grade are derived and validated. No wildcard, date-only or free-text
  track selection. Overlapping dates never choose an arbitrary rule.
- Immutable revisions retain curriculum ID, sorted canonical subject IDs, declaration
  citation/locator/revision/optional SHA256, reason, actor and database timestamp.
  A citation/hash is traceability evidence, not certification of official applicability.
- Immediate transactions plus unique root, revision and predecessor constraints reject
  stale concurrent appends. SQL triggers reject foreign scopes, subjects and actors.
  Referenced subject identities cannot be deleted or moved to another school.
- Latest non-draft event determines selection. Drafts preserve the prior confirmation;
  withdrawal makes selection unavailable until an explicit later confirmation.
  Changed section grade is pending rather than silently reusing old applicability.
- Native commands derive actor/school from the active session. Current same-school
  Registrar/School Head may append; current administrators or teachers/advisers
  assigned to the exact section may read its registry.
- Optional report-draft pins require current source evidence, exact record/curriculum
  context, a current confirmed version and report authority. Existing pins are
  immutable and read by retained identity after later changes/withdrawals.
  First binding and pin timestamp are separate preparation evidence, not original
  draft capture, review, issuance or amendment. No historical backfill.

## Verification

Local Python SQLite executed all 57 migration SQL bodies and the synthetic fixture
with foreign keys enabled. Executed constraint checks cover duplicate roots/forked
successors, cross-cohort lineage, wrong year, foreign/duplicate subjects, teacher write,
immutability, overlapping-period isolation, withdrawal/pin retention and concurrent
root/successor inserts. Foreign-key check returned no violations.

Rust toolchain is unavailable locally. First CI candidate reported rustfmt differences;
apply the formatter output and rerun, without weakening any gates. Rust tests,
compiler, Clippy, source provenance and Windows package evidence remain pending
until recorded from successful final-head CI. JavaScript/UI changed files: none.

## Remaining work and limits

No official requirements are seeded. Scheduling weekly minutes remain separate.
No configuration UI or annual report completeness integration yet. Existing report
source-lock v2 does not include optional applicability pins; consumers must explicitly
adopt selected identities and preserve legacy/unknown states before issue/amend work.
No broader cohort/track/equivalence rules or date-range precedence semantics.
No installed-device, printer, teacher, official-form or release acceptance is claimed.
M11 remains partial. Automation remains skipped.
