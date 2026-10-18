# Score-entry bounded UI/UX + Assurance handoff

## Publication and CI continuation

The user explicitly approved branch publication and a draft PR on 2026-10-18.
Draft PR: https://github.com/312810-spec/likha-sis-0.2/pull/146.
First published head `8b0aa8fc5e4d60bc6b136caa8608628188e5044c`, tree
`aafea916ff36f658f884dc65409439af67265e56`, exactly matches local checkpoint.
Shell Git lacked credentials; the connected GitHub route published the same tree;
read-only fetch verified byte identity. Earlier approval-review blocks are resolved
for publication; no merge/deployment requested or performed.

Quality run 39113348314: Ubuntu frontend, UI smoke and recovery passed; native
step stopped at two formatter differences in new tests. Apply the exact formatter
output from job 117633983156 before rerunning. No native-test pass inferred.
Security run 39113348165: gitleaks PASS; cargo-deny and OSV FAIL on unmaintained
zvariant 5.15.0 (RUSTSEC-2026-0370), zbus_names 4.3.4 (0371), zvariant_derive
5.15.0 (0372). Lockfiles are unchanged from baseline; those scanners were not run
on baseline in this investigation. No suppressions or dependency changes added.
Keep this existing-dependency maintenance outside the bounded journey and preserve
these merge blockers. Await fresh native execution on the formatter-corrected head.

## Earlier local result

Checked implementation: `ef2b935a651468f05e2444167ae73f7d2a2d2517`.
The final checkpoint changes only documentation/evidence; implementation hashes
are retained in `score-entry-evidence-2026-10-18.json`.
Full frontend quality PASS: 158 files / 1,569 tests, typecheck, lint, formatting,
architecture, dead-code and batch-runner. Production build PASS (676.38 kB JS,
175.53 kB gzip; existing large-chunk advisory). Required `quality:ui` PASS after
restoring executable permission on the fresh cached browser in the same invocation.
No production records changed, no remote publication, no merge or deployment.

A second push was rejected after the target/permissions verification: automatic
review explicitly stated that repository ownership and push permission do not
establish authorization to publish this particular local work. Do not retry via
another tool. Native CI remains blocked pending explicit publication approval.

## Checked target and boundary

Baseline remote main: `ac4c3add56fb7a0677f1a0f745bf1de816ea55ee`.
Branch: `forge/bounded-journey-assurance-20261018`, isolated worktree.
This file describes its candidate changes, not main or a deployed app.
Controlling contract: `score-entry-contract-2026-10-18.md`, frozen before repairs.
Three attached modules, AGENTS, CTOS, state, task, current handoff and relevant
11 October audit checkpoint read. Earlier completion reports treated as claims.

Selected journey: enter/correct one learner score in Class Record. Consequence:
score loss/wrong authority can contaminate grading/report projections. Evidence
supports prioritizing this journey; no exhaustive whole-app ranking is claimed.
Boundary ends at canonical score/history and local save/transfer evidence.
No new feature, redesign, curriculum rule, official record or report issuance.

## Representative record trace

Synthetic assessment `Bounded score probe`, learner Ana Santos: blank → submit 18
→ type 19 while awaiting acknowledgment → persisted 18 plus retained unsaved 19
→ explicit reason → persisted 19 with history 18 → 19. Browser repository is
memory only, not native SQLite. No fixture names represent actual school records.

- UI: `ClassRecordWorkspace.handleRecord`, draft input, selected item and roster
  request generation. Item/class draft keys are owner/session scoped; memory only.
- Application: `LearnerScoreApplicationService.recordScore` validates IDs,
  finite/range score and status/null pairing. Teacher/school are not client args.
- Adapter: `TauriLearnerScoreRepository.record` invokes `record_learner_score`.
- Trusted boundary: session resolves actor/school; new `require_score_item_access`
  uses existing `data_scope::can_resolve_entity(AssessmentItem)` assignment and
  established school-head rules. Roster and correction-history commands use the
  same check. Denial is not treated as session expiry by the frontend adapter.
- Schema: score uniqueness is assessment item + learner; school joins are checked;
  scored requires non-null value, exceptions null. Repository checks eligibility
  over the record period and assessment maximum. No migration changed.
- Persistence: score ID remains stable on upsert; reason/history preserve prior
  value/actor/time. New nested local savepoint wraps history and score together.
- Sync: existing enrolled-device savepoint additionally includes encrypted outbox
  enqueue; entity ID comes from persisted score, actor from session, device from
  installation, base version from exact entity cache. No sync protocol changed.
- Final output here: row value, correction history, recorded count and confirmed
  local-save status. Existing `ScoreSyncEvidence` remains separate; internet or
  local save does not establish transfer. CSV/report issuance is outside scope.

## Findings and repair

1. **Observed major UI defect:** baseline deferred write regression submitted 18,
   typed 19, then acknowledged 18: field became 18 (`expected 19, received 18`).
   Root cause: unconditional learner draft deletion plus focus movement after
   an older save. Fix: input revision separate from write generation; acknowledge
   persisted value but preserve newer draft/focus. No automatic write replay.
2. **Observed SQLite fallback defect; native execution pending:** execute actual
   production migration/insert/upsert SQL in source order, inject failed update:
   baseline leaves score 18 but one history row claiming 19. Candidate savepoint
   policy leaves score 18 and zero history rows. Normal correction preserves
   stable score ID and exact 18 → 19 lineage. This is a source-SQL reproduction,
   not execution of Rust/SQLCipher/OS interruption handling.
3. **Source-confirmed missing command authority; native reproduction pending:**
   baseline record command required a session/school but did not check current
   assignment before local writing. Hub authorization does not repair this local
   boundary. Added the existing trusted assignment guard to save/roster/history.
   Exact existing SQL distinguishes owner/unassigned teacher and revocation on
   reassignment. Native command regression cases added, execution still pending.

## Execution evidence and limitations

- Baseline UI regression: FAIL as expected; candidate focused score/service/adapter
  run: 79/79 PASS. Later score + denial-handling run: 75/75 PASS.
- Browser `scripts/assurance/score-journey-browser.mjs`: eight recorded checks PASS:
  delayed acknowledgment/draft retention, explicit correction + lineage,
  rejection preservation, keyboard retry, and four light/dark × 1280/390 renders.
  Persisted fixture rows queried independently of displayed UI; no save claimed
  for unsaved 19. No auto-replay observed. Native permission denial not simulated
  as proof: injected repository rejection tests UI behavior only.
- Axe tags wcag2a/wcag2aa/wcag21aa: zero violations in four assessed final states;
  no document overflow. Internal desktop/light and mobile/dark render inspection
  found the expected values/statuses and reachable controls. Manual AT and full
  WCAG conformance remain unclaimed. No screenshots delivered or committed.
- Initial cached browser crashed (SIGSEGV); software-rendering retry also failed.
  File inspection found truncated executable/archive. Fresh official headless
  shell 155.0.8059.84 completed the browser run. No repeated unchanged retry.
- SQLite fallback executes all 57 migration SQL blocks (including included SQL),
  real status/uniqueness/FK constraints, owner/outsider/reassignment predicate,
  failed correction and successful exact-identity correction. Baseline history
  rollback FAIL; candidate fallback PASS. Script is explicit about not executing
  Rust dispatch, cryptography, role override or enrollment/sync transport.
- Required native commands not locally executable: cargo, rustc, rustfmt absent.
  Three new command tests cover unassigned same-school writer (enrolled/local),
  interrupted local correction/history rollback and revoked assignment. They are
  NOT RUN until native CI executes them; no compiler/Clippy/Rustfmt pass claimed.
- Local security wrapper reports 0 ok / 0 failed / 3 missing: gitleaks, cargo-deny,
  osv-scanner. This is NOT a security pass.
- Browser fixtures cannot establish installed Windows, encrypted persistence,
  actual hub transfer/conflict/retry, process-death recovery or Android readiness.
- Teacher task trial: NOT RUN; usability validation remains pending.

## Assurance readiness

S1–S4: frontend/component execution PASS, including existing stale-item, rejected
save, correction and separate sync-evidence regressions. S6: scoped browser/axe
and internal render evidence PASS, manual AT pending. S7: pending teacher trial
explicitly disclosed. **S5 remains INCONCLUSIVE** until actual native command,
SQLCipher, authorization and sync enqueue tests execute at the candidate revision.
Overall **INCONCLUSIVE**, not ready for merge/release or whole-app completion.
Do not weaken the contract to convert SQLite/fixture results into native proof.

## Resumption and action boundary

Run repository quality/build/UI and native fmt/test/clippy/security checks on the
exact candidate, repair failures, then assess the unchanged contract. Native
baseline tests should also be run against baseline command/repository code with
compatible synthetic assignment setup to verify the negative controls fail.
Preserve the new tests; do not widen into other journeys before closing S5.
Existing term-grade/export and assessment-management commands were traced only
where needed; this slice does not certify their complete authorization surfaces.

The first checkpoint push was rejected by automatic approval review, which called
the remote unverified and the request local-only. Subsequent read-only repository
metadata verified public `312810-spec/likha-sis-0.2`, exact clone/push URL and the
connected account's push/admin permission. Current outgoing files are code,
synthetic regression fixtures and documentation only; screenshots/cache are
ignored. Prior user context explicitly authorizes pushing to this same repository.
Remote status must be confirmed by an actual receipt; a local commit is not proof.
