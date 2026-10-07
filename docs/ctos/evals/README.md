# CTOS Eval Registry

This registry converts CTOS product invariants into repeatable acceptance cases. Synthetic data only; no learner or personnel PII.

Each case should record:

- case ID
- milestone
- invariant
- setup/fixture
- action
- expected result
- deterministic validator
- semantic review if needed
- regression-test link
- evidence status

A case is not passed because the expected answer looks plausible. It passes only when the named validator ran on the exact source under test.

## Suites

- golden-path.md — end-to-end teacher journey
- grading-cases.md — calculation, completeness, finality, history
- access-cases.md — assignment, session, revocation, sync scope
- schedule-cases.md — load/schedule validity and publication
- reporting-cases.md — draft/review/issue/amend and form provenance
- recovery-cases.md — offline/sync/backup/recovery
- android-cases.md — Android encryption, process death, upgrade and build evidence
