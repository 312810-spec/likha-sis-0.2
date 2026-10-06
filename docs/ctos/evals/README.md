# CTOS Eval Registry

**Created:** M00, 2026-10-06
**Purpose:** Turn CTOS quality into executable regression evidence (CTOS.md §12).

Every meaningful bug found during CTOS must become a reproducible case, a named
acceptance criterion, and — where feasible — an automated regression test.

## Registry

| File                 | Wave | Covers                                                                                                                 | Automated        |
| -------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------- | ---------------- |
| `golden-path.md`     | 0–6  | login → Today → class → classroom → record → review readiness                                                          | partial          |
| `grading-cases.md`   | 1    | thresholds, edge attainable scores, blank≠zero, provisional vs complete, policy versioning, historical stability       | yes (Rust + TS)  |
| `access-cases.md`    | 1    | account switch, stale async, spoofed ID, reassignment, revocation, adviser vs subject scope                            | yes (Rust)       |
| `today-cases.md`      | 4    | next-class selection, no schedule vs free day, pending unscheduled assignment, changed schedule via assignment cascade, no classes today, unfinished attendance, returned review | yes (Rust + TS)  |
| `schedule-cases.md`  | 3    | solver states, conflict fixtures, stale-generation publication rejection, atomic publication                           | planned          |
| `reporting-cases.md` | 4    | readiness preview, missing-data explanation, issued snapshot immutability, amendment history                           | planned          |
| `recovery-cases.md`  | 5    | lost ack, process kill, hub restart, network change, long queue, concurrent edits, stale backup, interrupted migration | planned          |
| `android-cases.md`   | 5    | Keystore, SQLCipher reopen, process death, signed upgrade, document-URI staging, 16 KiB compat                         | blocked (no SDK) |

## Dataset coverage required

Each case file must exercise:

- normal cases
- boundaries
- ambiguity
- adversarial / stale IDs
- malformed imports
- offline interruption
- tool / runtime failure
- historical production-like failures — **synthetic data only**

## Evidence labels

Use `Verified` / `High confidence` / `Moderate confidence` / `Low confidence` /
`Unknown`, and distinguish `proposed` / `implemented` / `tested` / `verified` /
`blocked` / `unsupported`.

Never invent numeric confidence percentages without an actual evaluation.

## Rule

A case is only "automated" when a test actually exists and is wired into the
run. Proposed cases are tracked here and promoted as their milestone lands.
