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

Candidate `1fb734674525abd6d0b3d114eb2e16bbbeeb8629`, tree
`14f867c5e1aa6a3fbcfca1b8711333792c19d1bb`, passed exact-head Quality
run 38982145244: 1,522 Ubuntu native tests (job 117245342110) and 1,531 Windows
native tests (job 117245342227). All nine new applicability regressions passed on
both platforms. Rustfmt, Clippy with warnings denied, 618-file spreadsheet
source-provenance verification and all Security scans passed.
Windows debug packaging and test-installer artifact upload 12082630839 succeeded.

PR144 merged as `1e6d2275499c8f7b4236126c557f6232670319b5`; the merged root
tree equals the tested candidate tree. Initial formatting differences were corrected
before the passing run. Rust is unavailable locally. JavaScript/UI files were not
changed; the frontend unit suite was not rerun for this native-only slice.

Additional local SQL probes rejected pins for another period or a changed grade,
and rejected writes after administrator-role revocation. These are synthetic SQL
checks, separate from the passing native repository tests above.

## Remaining work and limits

No official requirements are seeded. Scheduling weekly minutes remain separate.
No configuration UI or annual report completeness integration yet. Existing report
source-lock v2 does not include optional applicability pins; consumers must explicitly
adopt selected identities and preserve legacy/unknown states before issue/amend work.
No broader cohort/track/equivalence rules or date-range precedence semantics.
No installed-device, printer, teacher, official-form or release acceptance is claimed.
M11 remains partial. Automation remains skipped.

## Next consumer integration

The current annual-export call sites are in `commands/export.rs` (SF5, SF6 and SF10).
They call `class_record::annual_report_subject_names`, configured-period coverage,
and `annual_report_has_pinned_policy_context`. Required-subject applicability must
be an additional explicit input; configured assignments alone cannot fill it.

Use canonical subject IDs with exact section/period versions. Preserve assigned
and record-only subjects while making absent required subjects visible as pending.
Do not require a subject in a period that explicitly excludes it, or silently
choose among overlapping period policies. Missing/withdrawn/changed-context or
mixed-curriculum selections keep affected annual results pending. Do not invent
annual weighting/equivalence rules or convert registry confirmation into official
source certification. Pin the adopted identities in the next preparation source
version; old source locks and existing snapshots must remain unchanged.

Regression targets: required subject without an assignment/record; term-specific
subject; missing one period's confirmation; newer draft; withdrawal; changed grade;
foreign cohort; duplicate/same-name identity; historical snapshot after correction.
