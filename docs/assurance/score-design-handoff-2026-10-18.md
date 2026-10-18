# Score decision design handoff

## Scope and provenance

Follow-up to draft PR146, baseline `10cfe8c16033a8ec260a2ba030f7518c4ec25741`.
Branch: `forge/score-decision-design-20261018`. Frozen supplemental criteria D1–D7:
`score-design-contract-2026-10-18.md`. Original S1–S7 remain unchanged.
This task explicitly authorizes bounded design beyond the original no-redesign investigation.
The four attached current reference files were read; their hashes are retained in evidence.

## Current checkpoint

Implemented inline recorded/proposed correction review, a visible associated reason label,
explicit correction confirmation, a synchronous duplicate-write guard, keyboard Cancel/focus
restoration and score-sequence boundary escape. Draft text explains recorded versus unsaved
values; blank input explicitly preserves existing values. Required-reason error clears when
that prerequisite is supplied. Reason/actions cannot change during the pending correction;
exception changes are unavailable until the current review is saved/cancelled.

Baseline: four regression tests FAIL in their assertions as expected. Live browser reproduces
Tab writing a correction (repository calls 1→2), with neither old nor proposed value shown.
Candidate: full `npm run quality` PASS, 158 files / 1,576 tests, typecheck, lint,
formatting, architecture/dead-code and batch runner. Build PASS (existing size advisory).
Focused production browser: 15 probes PASS; zero assessed axe violations/overflow at
light/dark × 1280/640/390. Long title/name, keyboard and touch-emulated Cancel checked.
All six final renders inspected internally. UI smoke PASS; recovery PASS, 50 checks
including its 200% text/touch scenarios. Equivalent 640px reflow is not native browser zoom.
Source-SQL corroboration passes 57 migrations/rollback/identity checks.

Checked implementation: `54bdb1488dd2863e67f9f31cfa8310886e2b3dbb`.
Final checkpoint updates documentation only; four implementation/test/probe hashes are
recorded with raw check receipts in `score-design-evidence-2026-10-18.json`.
D1–D6 PASS; advisory D7 NOT RUN. Bounded technical readiness: READY FOR REVIEW.
Teacher usability benefit remains provisional. Merge/release remains BLOCKED by the
existing PR146 dependency-security failures. Remote Quality Gate run 39125554539 PASS on published implementation `8c9ce19`:
Ubuntu job 117669843641 SUCCESS; JavaScript quality, UI smoke and recovery steps PASS.
Windows/native execution skipped by affected-work classification; no new native claim. Security run
39125554557 FAIL; gitleaks PASS, OSV reports the same three existing zbus/zvariant
advisories (RUSTSEC-2026-0370/0371/0372). Lockfiles/suppressions unchanged.
Native commands/repository/migrations/service/bridge are byte-identical to baseline;
original native receipts remain revision-bound. Browser fixtures are memory only.

Initial push was rejected by automatic approval review because export authorization and
destination were considered unverified. GitHub connector then confirmed repository
1344185717 is exactly the expected user-owned public repository, with push/admin access.
Existing scoped push authorization is preserved; retry only after this concrete verification.
Publication succeeded through the authenticated GitHub connector after verification; shell
Git retry lacked credentials. Draft PR147: https://github.com/312810-spec/likha-sis-0.2/pull/147,
based on PR146. Published implementation `8c9ce19e60b43ff66776fde762eb64f1250e58a7`
has tree `0aee5373ff2f4c9e48cd0224326ae3a28f68e39e`, exactly matching local verified
checkpoint `96cf5de`. A fresh public Git fetch confirmed byte-identical remote contents.
Local branch now tracks that published commit; original local history is retained under
`checkpoint/score-design-local-96cf5de`. No merge or deployment.

## Design decision

Inline review keeps learner and change together. Recorded value is secondary; proposed value
is emphasized by weight and a token-based side rule. Reason and actions follow the comparison.
The incumbent Public Sans, semantic colors, density, spacing and responsive roster are preserved.
A modal alternative adds a context switch and was rejected without claiming user preference.
No measured speed, error-rate or comprehension gain is claimed.

## Teacher trial — NOT RUN

Use only synthetic records in a disposable build. Recruit actual intended teachers only with
participation authorization. Capture device/build/context and prior familiarity. Counterbalance
baseline/candidate order using equivalent learner/item fixtures; separate first-time performance
from repeat familiarity. Record actual results; do not fabricate sample size, times or averages.

Give tasks without control hints:

1. Identify the class, subject, school year, period, item and maximum score before entering a score.
2. Enter 18; while its save is delayed, type 19. Identify the recorded versus unsaved value and next action.
3. Change a recorded 18 to 19, inspect what will change, give a reason, then decide to cancel.
4. Repeat the correction and commit it. Explain whether local save also proves hub receipt.
5. Recover from a denied write and retry the retained value.
6. Explain blank input, zero, Excused and N/A; leave the final score row using keyboard.

Observer oracle: context matches fixture identities; recorded18/unsaved19 are distinguished;
cancel writes nothing and restores18; committed correction has exact19/reason/history18→19;
local save is not hub receipt; denied draft survives; blank never deletes or becomes zero.
Measure unassisted completion, consequential errors, status comprehension, recovery, assists
and actual task times. Participant explanation is evidence for usability; automated action
success is evidence for behavior only. Keep findings provisional until this trial occurs.

## Limits and next action

Existing PR146 dependency-security blockers remain separate; do not merge/deploy this stack.
Installed Windows UI, actual Android, real two-device exchange, manual screen reader and native
browser/OS zoom remain untested. Six rendered widths/themes and 640px reflow are not device proof.
Review the remaining CI result on PR147, then conduct the teacher trial when participants
are available and authorized. Keep existing dependency repairs in a separate scope. No automation or unrelated work is authorized here.

## Verification boundary

Keyboard evidence covers score sequence boundaries and correction Save/Cancel/Enter,
not a complete keyboard or screen-reader audit of all roster exception/history actions.
Baseline/candidate used the same 18→19 task and synthetic repository; candidate additionally
stressed a longer item title. No matched participant timing comparison occurred.
