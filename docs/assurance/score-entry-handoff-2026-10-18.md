# Bounded score-entry UI/UX + Assurance handoff

## Result and checked target

Draft PR: https://github.com/312810-spec/likha-sis-0.2/pull/146.
Branch: `forge/bounded-journey-assurance-20261018`.
Checked source: `129ef31d84992235e48c9f9d8ca70c950d683585`.
CI merge: `1cec109a7a5fba7749259eba7d28cb2e9c01cab8`.
Both have tree `014f02b5cf1bde516b8dea7ba52b642e3317d3a2`; fetched and compared.
Baseline: `ac4c3add56fb7a0677f1a0f745bf1de816ea55ee`.
Acceptance criteria remain unchanged in `score-entry-contract-2026-10-18.md`.
User approved branch publication and a draft PR; no merge/deployment performed.

**Bounded journey: READY FOR REVIEW against the unchanged contract.**
**Merge/release readiness: BLOCKED by dependency-security gates.**
Teacher task trial and installed-device acceptance remain pending.
No whole-app completion or usability validation is claimed.

## Journey and boundary

Enter/correct one eligible learner score in an existing Class Record. Selected
because lost/misattributed scores can contaminate grading and reporting. Earlier
F01–F16 findings were treated as claims. This was a bounded consequence judgment,
not an exhaustive whole-app ranking. No redesign, report issuance or new policy.

Trace: score input/selected roster → application validation → Tauri command →
current session and trusted assignment check → eligibility/range/status checks →
canonical score plus correction history → optional encrypted sync outbox → local
confirmation. School/actor derive from session; item/learner IDs identify targets.
Unique item+learner identity and school-scoped joins remain; no migration changed.
Existing transfer evidence remains separate from local save. Session drafts remain
memory only; no new reload/process-death recovery is promised.

Synthetic example: blank → submit 18 → type 19 while saving → persisted 18 with
unsaved 19 retained → explicit correction reason → persisted 19 and history 18→19.
Browser fixture storage was queried independently of displayed values. It is
memory storage, not native persistence; native evidence is recorded separately.

## Verified causes and repairs

| Failure                                                        | Root cause                                                                             | Smallest coherent repair                                                                                                           |
| -------------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Older acknowledgment erased newer score input                  | Unconditional draft deletion and focus movement after asynchronous save                | Track input revision separately from write generation; retain newer draft/focus and require explicit next save.                    |
| Same-school unassigned teacher could write a score             | Command checked session/school without current assignment authority                    | Reuse trusted AssessmentItem assignment/school-head guard for save, roster and history; action denial preserves the session/draft. |
| Failed local correction left history claiming an unmade change | History append and score update lacked a surrounding transaction on unenrolled devices | Local nested savepoint wraps history and live score; existing enrolled score/outbox savepoint remains intact.                      |

## Executed checks

| Check                                | Result / evidence                                                                                                                                                                                                                                                    |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Baseline UI deferred-save regression | FAIL as expected: typed 19 became 18. Candidate regression PASS.                                                                                                                                                                                                     |
| Full frontend quality                | PASS: 158 files / 1,569 tests; typecheck, lint, formatting, architecture, dead-code and batch-runner.                                                                                                                                                                |
| Production build                     | PASS; JS 676.38 kB / 175.53 kB gzip, existing bundle-size advisory.                                                                                                                                                                                                  |
| Focused browser journey              | Eight checks PASS: retained draft/focus, explicit reason/history, rejection preservation, keyboard retry, four appearance/width checks.                                                                                                                              |
| Accessibility/render                 | Zero assessed axe violations/overflow at light/dark × 1280/390; internal renders inspected. Existing UI smoke and recovery CI gates PASS. No screenshots delivered.                                                                                                  |
| Source-SQL fallback                  | All 57 migration SQL blocks executed; baseline failed-update history count 1, candidate count 0; normal stable identity/value/history and assignment/reassignment predicates PASS. This is not Rust execution.                                                       |
| Ubuntu native                        | PASS: 1,525 tests, including all three new score regressions, Rustfmt, Clippy and source provenance.                                                                                                                                                                 |
| Native baseline comparisons          | PASS: both new authorization/rollback tests fail in their assertions against pinned original production code, and pass on the candidate. Candidate tests/synthetic fixture retained; source restored byte-for-byte. No compile error accepted as a negative control. |
| Windows                              | PASS: native application/installer build and 1,534 tests, including all three new score regressions.                                                                                                                                                                 |
| Security                             | Gitleaks PASS; cargo-deny and OSV FAIL on the three existing unmaintained dependency advisories below.                                                                                                                                                               |

Quality run `39113853343`; Ubuntu job `117635552350`; Windows job `117635552432`.
Quality run concluded SUCCESS. Windows test-installer artifact `12131064945`
was uploaded; no installed-app acceptance is inferred.
Security run `39113853340`; jobs `117635465165` (gitleaks), `117635465401`
(cargo-deny), `117635465447` (OSV). Detailed receipts and source hashes:
`score-entry-evidence-2026-10-18.json`.

The native comparisons execute the original command/repository production code
from the pinned baseline, with compatible candidate synthetic test setup. They
are not execution of the entire untouched historical app. Both expected failures
were observed; candidate positives ran first. The comparison harness also passed
a local source-restoration check when Cargo was deliberately unavailable.

## Remaining limits and next action

Installed Windows GUI/credential ceremony,
real two-device transfer/conflict/reassignment, process-death/upgrade recovery,
Android and manual assistive-technology checks are not established by this slice.
Teacher task trial: NOT RUN; usability validation pending.

Security gates report RUSTSEC-2026-0370 (`zvariant` 5.15.0), 0371 (`zbus_names`
4.3.4), 0372 (`zvariant_derive` 5.15.0), classified as unmaintained. Both lockfiles
are unchanged from baseline. Baseline scanners were not executed here; do not
claim an executed baseline security failure. No suppression/dependency change was
added. Preserve these merge blockers for a separate dependency-maintenance scope.

S1–S6 pass with the recorded execution evidence. S7 passes its disclosure
requirement; the actual teacher trial is NOT RUN. Retain the bounded handoff. Other assessment/term-grade/export authorization surfaces and official
report issuance are not certified by this investigation. AI prepares; teacher
reviews and approves.
