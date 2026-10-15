# M11 configured annual-period coverage — 2026-10-15

## Base and verified merge

PR134 merged as `9961a7c59a2f37a9b24f9f3f90086a36c0ac55ae` after current-head
Quality 38671136623 and Security 38671136580 succeeded at
`b9331b04a2d08bd84ba04fffedaa53978a7db9cd`.
Local base tree equals that published source tree; local commit IDs differ.
Branch: `ctos/m11-configured-period-coverage-20261015`.

## Outcome and implementation

Prevent SF5/SF6/SF10 annual numeric projections from silently averaging an
incomplete or ambiguous set of configured school-year periods. Shared guard
requires a nonempty unique configured period set, exactly one record per period,
no unexpected periods, and one canonical subject ID within each existing
subject-name group. Missing periods, same-name subject collisions and duplicate
transfer records yield unavailable/PENDING; nothing is zero-filled or resolved by
guessing. Existing complete-record and rounding checks remain in force.
SF10 resolves the configured periods separately for each historical school year.
No schema, authorization, raw record, score, official policy or UI changes.

## Verification

Architecture, dead-code and diff checks passed. Verification-runner 4/4 passed.
Two native regression tests added with positive unordered coverage and negative
empty, missing, unexpected, duplicate configuration, duplicate transfer and
same-name subject identity controls. Rust/Cargo/rustfmt unavailable locally;
these tests and formatter/Clippy must pass current-head CI before merge.
Frontend unchanged; do not invent a new frontend test count or device acceptance.

## Limits and next action

Configured coverage is not official required-period coverage. An incomplete
school configuration can still be internally complete. Required subjects,
policy applicability, semester-specific subjects, approved transfer resolution,
annual source binding, issuance/amendments and reconciliation remain pending.
The guard conservatively withholds ambiguous projections; it does not mutate
historical records. Readiness fingerprints remain preparation evidence only.
M10/M11 and external device/source/professional acceptance remain incomplete.
No deployment. Publish exact tree, require current-head Quality/Security, then
continue source-aware annual reconciliation and issuance/amendments.

## Formatter repair

Initial published head `dec1726d45f18963c2398cde24bd6e9c9621079a`, tree
`d154053b8ee9bcf2e853b412cb9cc086d613be82`, equals the local committed tree.
Quality 38680322167 Ubuntu job 116243185858 stopped at four formatter hunks.
Obtained official Rust 1.99 rustc/rustfmt archives and verified both SHA-256
values against the official stable manifest before execution. The formatter now
runs locally with its matching compiler library; both affected Rust files pass
`rustfmt --edition 2021 --check`. Exact formatter output matches CI differences;
no behavior changes. Cargo/full native compilation still requires CI.
Repaired head must pass fresh Quality/Security before merge.
