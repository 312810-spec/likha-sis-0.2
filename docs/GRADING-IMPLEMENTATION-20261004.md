# Grading and score import implementation checkpoint

Implemented in the existing app, October 4, 2026:

- Activity lifecycle records planned/closed state, actual activity dates, and due date. Native validation checks real dates, term boundaries, ownership, and event membership eligibility. Historical items retain term-wide eligibility. Scored items cannot have their dates, denominator, category, or class identity changed by a pulled replacement.
- Lifecycle saves and encrypted transfer queue entries are atomic. The receiver validates school and assigned teacher authority. Deletion of lifecycle history is unsupported.
- Grades report expected/scored/excused/not-applicable/unresolved item counts. Unresolved work is distinguished from recorded zero. Incomplete grades are excluded from report-card, summary, and SF9 final values.
- Fractional grades falling between the printed transmutation intervals return a clear error pending an authoritative rounding rule; the implementation does not manufacture a rule.
- The class record accepts a strict three-column CSV template: `learner_id,status,score`. Native preview checks stable learner IDs, duplicate IDs, activity eligibility, finite values, maximum points, and score/status pairing. CSV quoted cells and workbook imports are outside this template's scope.
- Confirmation requires a reason and the exact preview's snapshot. Native commit rejects an unchanged previously imported file and any stale preview. Every score, encrypted queue entry, reason/history row, and import ledger entry commits together; failure restores the previous records.
- Manual score corrections and assessment exceptions require a reason. The teacher retains authority to make the decision. The local encrypted history records previous and next values, actor, reason, and timestamp. History access is limited to the assigned teacher.
- The embedded class-record panel supports preparing the class template, opening a CSV file, editing rows, previewing, confirming, and inspecting score changes.

## Verification in this resumed run

Frontend: 64 existing assessment/score/class-record tests passed; two new import-review tests passed. After the teacher-facing grading-message refinement, 58 affected tests passed again. Focused ESLint passed, and global TypeScript checking passed at that checkpoint.

Native: three score-import tests cover ID/range/authority validation, transaction rollback and stale preview, duplicate import prevention and stored history. One lifecycle test covers planned work, transfer-date eligibility and scored-definition preservation. Full native compilation/testing is performed by the root agent with the restored native dependency prefix; this document does not claim these native tests passed before that check.

## Remaining limitations

The correction ledger is local encrypted data and included in installation backups. Score changes and lifecycle metadata transfer through the existing synchronization queue; correction history is not yet separately replicated. CSV is a supported explicit template, not arbitrary ECR/XLSX mapping. Final transmutation rounding gaps remain parked until a confirmed rule is supplied. Formal moderation/publication review remains a separate workflow rather than approval for every teacher correction.
