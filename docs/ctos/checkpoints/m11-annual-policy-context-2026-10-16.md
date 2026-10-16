# M11 annual policy context — 2026-10-16

Base: PR140 `db7f992995549e9e8ebf5bf07613412a65c48572` (CI pending at start).
Branch: `ctos/m11-annual-policy-context-20261016`.
Risk tier: High-Fidelity. Audience: teachers preparing annual SF5/SF6/SF10.

## Output contract

Annual subject averages require consistent explicitly pinned grading and
curriculum policies across their class records, in addition to configured period
coverage and complete scores. Missing/foreign records, legacy unpinned context
and mixed policy versions remain pending; current defaults cannot certify history.
This is a conservative development guard, not an official equivalence rule.

Artifacts: shared native repository guard, three export call sites, regressions.
Validators: focused native tests, rustfmt, full native tests/Clippy and fresh CI.
Review: verify school scope, absent/partial input, policy changes and retained data.
Failure behavior: blank annual grade/PENDING, never silently reconcile versions.
Acceptance: matching pinned records continue; ambiguous context cannot average;
no mutation of scores, drafts, issued records, assignments or sync queues.

Implemented: a school-scoped read-only guard checks raw pinned weight/curriculum
IDs, never their current-default resolutions. All three actual annual export
commands require it beside the configured-period coverage guard before averaging.
Five focused regressions passed: matching pins after default switches, mixed
weight/curriculum versions, legacy NULLs, empty/missing/foreign records, and
actual SF5/SF6/SF10 source wiring. Rustfmt, Clippy with warnings denied,
checkpoint formatting and Git whitespace checks passed. Full local native suite:
1,518 passed across 23 suites, zero failures.

PR140 platform CI remains pending; its security checks passed. Keep this slice
separate and merge only after its prerequisite and its own applicable gates pass.
No UI changes or new frontend/browser/installed-device claim. Official policy
applicability, explicit transition/equivalence evidence, issuance/amendments and
device acceptance remain open. Legacy ambiguous preparation exports may now be
PENDING; retained historical data is unchanged. A review/correction path for
legacy policy evidence remains future work; do not backfill it from defaults.
