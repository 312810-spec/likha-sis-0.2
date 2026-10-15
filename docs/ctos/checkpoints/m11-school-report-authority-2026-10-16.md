# M11 school-wide reporting authority — 2026-10-16

Base main: `d3c517da536e68094fc48171af94e0aeb6518f22`.
Branch: `ctos/m11-school-report-authority-20261016`.

## Outcome and repair

SF4/SF6 previously required only an active school-scoped session, allowing an
ordinary teacher to prepare summaries across sections outside their assignment.
Both actual commands now require `ExportSchoolReports` before report-input reads.
The dedicated capability uses the existing Registrar/School Head school-data
boundary. Membership, teaching assignments and advisory responsibility alone do
not confer school-wide reporting authority. Authority is re-read from trusted
role rows on each call; no client-supplied role/school field is trusted.
No new role, schema, official approval rule, grade or attendance mutation.

## Verification and limitations

Executed source checks confirm both command bodies select the fixed capability
before their first school/report read and contain no session-only fallback.
Four native regressions cover absent session; plain member/Teacher/adviser denial;
same-school Registrar/Head positive controls, foreign-school denial and immediate
revocation; and real command-source wiring. Existing SF4/SF6 integration fixtures
now explicitly grant the head role and use the same capability. File writes and
installed interaction are not exercised by these tests.

Rust/Cargo unavailable locally. Exact-head native tests, rustfmt, Clippy,
Windows build/tests and Security must pass CI before merge. Readiness is
INCONCLUSIVE until those results exist. No new frontend/UI verification claim.
Existing UI denial presentation and installed-device journeys remain untested.
The change narrows reads and leaves local data, sync queues and historical records
untouched. This is preparation access, not official issuance/approval authority.

## Automation and continuation

The existing hourly LIKHA task `6ace2785c2588191b7c940f124c3bfec` was found paused.
Resuming it was rejected because the account already has five active scheduled
tasks (limit five). No unrelated automation was paused and no duplicate created.
The user must free one task slot before scheduled continuation can resume.

Next: inspect this PR's exact-head CI, repair failures and merge only after the
applicable gates pass. Then continue versioned subject/policy applicability and
immutable issue/amend reconciliation. M10/M11 and external acceptance remain
incomplete; no deployment. Preserve the compact continuation structure.
