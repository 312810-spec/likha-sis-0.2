# M11 annual configured-calendar scope — 2026-10-15

## Base and outcome

Live main/PR135 merge confirmed as `7aa4790d22dd97a88a2a8f9ef22ac4f3816f95ff`.
Local base tree `c7f4957c4b2ed3b1b14b960d0b6c50ebf564db90` matches PR135 source.
No other current implementation PR is open; #100/#103/#106 remain historical
reconciliation sources, not mass-merge candidates.

SF5 previously swallowed period-query errors and guessed June/year boundaries.
SF6 used a 2000–2099 roster window when no grading periods existed. These guesses
could change roster inclusion and adviser applicability without configured dates.
Both now require a nonempty, valid configured calendar and propagate lookup errors.
A shared helper validates canonical real ISO dates, rejects reversed ranges, and
uses the earliest start/latest end independently of policy sequence ordering.
No guessed official dates, period counts or subject requirements are introduced.
Existing authorization gates remain; SF5 reuses its school-scoped calendar query.
SF10 keeps its existing historical groups and configured coverage guard.

## Verification and assurance

Architecture check, verification-runner test entry and diff whitespace check pass.
Two native regressions cover missing, malformed, impossible, noncanonical, reversed
and partially invalid date ranges; unordered periods and single-day boundaries
have positive controls. Rust/Cargo/rustfmt are unavailable in this runtime after
reset; native tests, formatting and Clippy require exact-head CI before merge.
Frontend unchanged; existing frontend evidence is reused without a new claim.

Assurance review: no raw data/schema/policy mutations; helper is used by both
annual roster exporters; calendar failure occurs before export file creation;
SF5 uses the same maximum configured end for adviser lookup and roster scope.
Calendar coverage remains configuration evidence, not official completeness.
No installed-device, printer, professional acceptance or deployment claim.

## Next

Publish this coherent repair, require exact-head Quality/Security and inspect any
failing logs. Then continue source-aware annual reconciliation, required-subject
applicability, immutable issuance and append-only amendments. M10/M11 incomplete.
Git transport failed at the runtime proxy; GitHub connector remains available.
