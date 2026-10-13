# Remaining batch acceptance cases

These are required case specifications, not executed results. Use synthetic
school data. Record actual source/artifact, environment, expected/observed result
and evidence. Missing devices mean NOT RUN, not PASS or N/A.

| Case | Batch | Required scenario                                                       | Acceptance                                                                                |
| ---- | ----- | ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| RB01 | A     | Compare main, TASK, state, migrations and PR100/103                     | Consistent next action; historical source retained; no mass merge                         |
| RB02 | B     | Owned assignment ID with another teacher's lesson ID                    | Native rejection; victim lesson unchanged; valid owner update succeeds                    |
| RB03 | B     | Planner read with distinct actor/school IDs                             | Reads derive school scope; absent/revoked session denied                                  |
| RB04 | B     | Two real clients correct one score; drop hub acknowledgment             | No duplicate application; conflict review preserves unresolved work                       |
| RB05 | B     | Revoke/regrant assignment; retry queued writes and backfill             | Current authority checked; unauthorized replay rejected; authorized history arrives       |
| RB06 | B     | Kill app before/after acknowledged draft save and during Finish         | Honest durability boundary; explicit scoped restore; stale revision rejected              |
| RB07 | B     | Backup/restore to fresh Windows account/device, interrupted upgrade     | Keys reprotected; metadata/records/pending work preserved; failure leaves original intact |
| RB08 | C     | New curriculum/BOW version after a historical lesson                    | Old context retained; applicability and provenance explicit; teacher confirms drafts      |
| RB09 | C     | Switch class/year while generation or save completes                    | Response cannot overwrite another context; Mathematics/TLE remain separate                |
| RB10 | D     | Issue report, then correct canonical data                               | Issued version immutable; amendment linked; missing data explained                        |
| RB11 | D     | Import duplicate/returned TANAW package                                 | Duplicate-safe receipt/correction lineage; no unofficial authority claim                  |
| RB12 | E     | Android encrypted startup, offline restart, force-stop, signed upgrade  | Actual device/build proof; no plaintext fallback; provider failures recoverable           |
| RB13 | F     | Planner/support and golden path with keyboard, screen reader, 200% text | Reachable actions and focus; accurate announcements; retained work                        |
| RB14 | F     | Heavy synthetic roster, cold/warm startup, score/export/reconnect       | Recorded device measurements; no unmeasured speed claim                                   |
| RB15 | G     | Reconcile latest main and assess unchanged acceptance contract          | Applicable required evidence present; capability status and approval kept distinct        |

## Automated development verification

Run `npm run quality:batches` for frontend quality, production build and fixture
isolation. Add `-- --ui --native` to request browser/recovery and native gates.
The runner saves a receipt after each check, with source digest and execution
details. Logs stay in ignored `.ctos-evidence/`; no publication is automatic.

Exit 1 means a requested check failed; exit 2 means required external evidence
remains. Passing development checks never closes device or professional cases.
The runner validates checks; it does not generate or implement batches C–G.

The normal quality gate also executes the runner's four subprocess regressions.
For Windows, Android, official fidelity and teacher acceptance, use the case
register and existing release checklist with actual receipts.
