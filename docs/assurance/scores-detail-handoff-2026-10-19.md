# Scores detail execution — evidence and handoff

## Current continuation result — supersedes the initial native block

Native prerequisite repaired and fully CI-verified at e6f13fd /tree086de06e:
1,526 Ubuntu /1,535 Windows native tests,1,581 frontend tests, Windows build and
Security PASS. Detailed receipts/protocol: `sqlcipher-startup-handoff-2026-10-19.md`.
Six additional zero/60-roster browser layout cases PASS, with explicit read-model limits.
Full Scores pilot is now INCONCLUSIVE because required teacher/device/manual evidence
is NOT RUN. Earlier BLOCKED statements below describe the first UI checkpoint.
No merge/deployment or broader journey acceptance is inferred.

## Result and boundary

Implemented the bounded Scores pilot on `forge/scores-detail-20261019`, based on
PR148 head `237b7b5bfc1df50fe11b9069cf966288c3276877` → PR147 → PR146.
Main remains `ac4c3add56fb7a0677f1a0f745bf1de816ea55ee`. No dependency/library
replacement, global navigation restyle, native mutation, merge or deployment.
User's “Execute this prompt” authorizes this implementation; existing Git publication
authorization is preserved. The attached revision2 and four supplied FORGE references
were inspected from their local copies. The standalone Scores audit was not supplied;
its F1–F8 claims were reconciled using revision2, current source and tests, not a
claimed fresh read of the missing report.

**Technical UI checks: PASS within the executed cases below. Full journey acceptance:
BLOCKED by the inherited failed native Quality gate; teacher/device evidence remains
NOT RUN.** A polished Scores screen does not close the full app redesign or M10–M17.

## Outcome, mechanism and retained contracts

Teacher edits a canonical learner/item score, sees the exact recorded/proposed decision,
keeps newer typing during acknowledgment, and can distinguish local save, transfer
snapshot and saved-data completeness. Canonical school/class/year/term/item/learner
identities, missing versus zero, exceptions, teacher correction authority and history
remain intact. Session drafts remain memory-only; no process-death guarantee added.

| Claim                                            | Current evidence and cause                                                                                                                          | Decision / alternative / counterexample                                                                                                                                           | Check and limit                                                                                                                                              |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| F1 old acknowledgment discards newer typing      | Already repaired in parent; submitted18/draft19/one request reproduced                                                                              | Retain independent draft revisions; disabling score input would lose continued entry                                                                                              | Browser fixture reads18, displays19, focus retained; native save is separate                                                                                 |
| F2 correction comparison and incidental Tab save | Parent already shows Recorded/Change to/reason and deliberate Save                                                                                  | Retain inline review; modal adds context/focus transition without evidence                                                                                                        | Browser Tab→Save→Cancel performs zero writes; explicit commit produces exact18→19 lineage                                                                    |
| F3 boundary/interior keyboard escape             | Parent boundary exit works; clean interior Tab still skipped History/exception controls                                                             | Refine: changed nonblank Tab keeps rapid commit; unchanged/blank/restored Tab uses native traversal. Enter/arrows retain rapid entry. Visible keyboard help added                 | Unit restores then reaches interior Excused without write; browser reaches History; both boundaries checked                                                  |
| F4 resize obscures correction field              | Baseline1280×900→390×844: top843.453125,bottom883.453125,navTop783,focused=true,hit=false                                                           | Measure actual viewport/footer and scroll only missing clearance. Permanent spacer does not react to actual focus/layout/keyboard                                                 | Candidate top731.453125,bottom771.453125,navTop783,focus/hit=true; 18 focus combinations pass. Actual on-device keyboard NOT RUN                             |
| F5 trusted assignment guard                      | Parent native command reuses AssessmentItem trusted scope for score write/roster/history; owner/current assignment and established school-head path | Retain PR146 cause repair; UI hiding cannot authorize writes                                                                                                                      | Native source unchanged; current source-SQL owner/outsider/reassignment PASS. Historical native receipts remain at original revisions; no new local Rust run |
| F6 score/history atomicity                       | Parent nested local savepoint wraps history/live score and nests under enrolled score/outbox transaction                                            | Retain atomic transaction; deleting false history after failure cannot guarantee rollback                                                                                         | Current SQLite source-SQL probe:57 migrations,failed history0,stable identity/value and rollback PASS; not SQLCipher/Rust execution                          |
| F7 missing transfer check feedback               | Parent returns null for pending/null/error                                                                                                          | Refine explicit checking/unavailable/error/known snapshot with accessible status, identity cancellation and read-only refresh label. Inferring receipt from local save is invalid | Unit pending/null/error/all four known/stale/service replacement PASS; browser fixture does not exercise real transfer                                       |
| F8 saved completeness hides pending edit basis   | Preview source is saved records but parent lacks basis/pending disclosure                                                                           | Refine always-visible saved-device-data basis and current-item pending notice; no draft injected into calculations                                                                | Workspace/readiness tests PASS incl unchanged saved preview plus warning; save revision invalidation retained                                                |
| Concurrent exception intent                      | Parent permits an exception write while first score acknowledgment is pending, with generation guard only                                           | Refine synchronous shared per-learner write guard and disabled row exceptions; other learners remain editable. One in-flight canonical decision per learner                       | Updated regression proves two learners independent, no third overlapping write; after receipt exception requires correction reason                           |
| IME reason submission                            | Parent Enter handler does not check composition                                                                                                     | Ignore composing keyboard events on score/reason; normal deliberate Enter unchanged                                                                                               | Composition Enter does not write; subsequent normal Enter writes once                                                                                        |

The previous concurrent-write regression expected overlapping writes. It was explicitly
replaced with the serialized-intent test because preventing that race is the selected
behavior, not because a failing assertion was dropped. Write generations and roster
request checks remain as stale-response defenses. No required acceptance criterion was
removed. Initial stale-label test failures and the old race expectation are retained
in the local execution log; the corrected full suite passes.

## Element, button, token and effect deliverables

- `scores-element-ledger-2026-10-19.json`: 23 core element contracts plus 26 co-visible
  controls in this same workspace; source owner, labels/help, geometry, states,
  permission/visibility, trigger/receipt, input/focus/continuity, theme/density/effects,
  check, decision and evidence status. Adjacent report/authoring controls are source
  specifications, not acceptance of those downstream journeys.
- `scores-computed-controls-2026-10-19.json`: raw actual visible-control computed styles
  and bounds for light/dark × Efficient/Comfortable/Guided ×1280/640/390. It preserves
  real overrides rather than replacing them with revision2's proposed measurements.
- `scores-detail-evidence-2026-10-19.json`: source SHA256s, baseline/candidate raw checks,
  geometry, repository fixture values/call counts and current source-SQL result.
- `scores-detail-contract-2026-10-19.md`: frozen A1–A7 and unchanged invariants.

Retain Public Sans, school identity, raw→semantic→component token mappings and existing
three densities. Current raw control heights34/40/72px are retained; source numbers are
not changed merely to match a proposed scale. Phone exceptions already use44px targets.
Normal buttons use semantic surface/text/border,1px border,8px radius,base600 type,
0×1.5spacing padding. Inputs use0×.75spacing, semantic background/border; phone numeric
font and widths remain. Computed snapshots include actual wraps and context overrides.
Selected, focus and disabled semantics stay separate; 2px focus/+2px offset is retained.
No blanket WCAG conformance or complete manual contrast assessment is claimed.

Effects: retain existing hover brightness1→.97 and background-color transition120ms
cubic-bezier(.2,0,0,1); interrupt from current CSS state. Reduced motion token .01ms was
measured in the control inventory. Focus is immediate. Correction expansion, status,
error and value changes have no new animation; no save flash, transform or fake progress
is added. New clearance scrolling is instant and never writes data. Focus/layout/resize
listeners and ResizeObserver are cleaned up on unmount. The footer remains actual
fixed layer z40; the hook reads its rendered bounds and visual viewport instead of
hardcoding its height or adding a permanent spacer. Real device soft-keyboard coverage
remains distinct from browser resize coverage.

## Executed verification and limits

| Check                                                              | Status                             | Evidence                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend quality                                                   | PASS                               | 158 files /1,581 tests; typecheck,lint,format,architecture,deadcode and four batch-runner checks                                                                                                                                                   |
| Targeted browser                                                   | PASS                               | 47 recorded candidate checks: fixture storage/reason/history/rejection/retry/blank, both boundaries, interior action reachability, resize,18 focus and18 axe/overflow/render cases,touch Cancel and equivalent200% CSS viewport                    |
| Matched baseline                                                   | Executed                           | Same parent fixture and core task/script; baseline resize loses hit testing. Baseline matrix contains46 checks; candidate adds interior-action assertion. No participant timing/benchmark claimed                                                  |
| UI smoke                                                           | PASS on final source               | Both themes×three densities×four widths; final repeat PASS after refinement                                                                                                                                                                        |
| Recovery                                                           | PASS on final source               | 50 checks incl draft retention,focus,200% text and touch; final repeat PASS after refinement                                                                                                                                                       |
| Build                                                              | PASS on final source               | Production HTML/assets emitted; final final repeat PASS after refinement; no release/native package inferred                                                                                                                                       |
| Storage                                                            | PASS as SQLite source-SQL fallback | 57 migration blocks,failed history0,assignment/reassignment,stable identity,normal correction/rollback                                                                                                                                             |
| Native local                                                       | NOT RUN                            | Cargo not installed in this environment; source unchanged from PR148                                                                                                                                                                               |
| Inherited exact-head native CI                                     | FAIL                               | PR148 Quality39137295517,Ubuntu job117704347054: two learner_management cases fail opening DB with PRAGMA key/rekey error before authorization assertions. Windows job117704347090 PASS; Unix probe/negative controls skipped after Ubuntu failure |
| Inherited Security                                                 | PASS at parent head                | Security39137295459; not a candidate Security result                                                                                                                                                                                               |
| Installed Windows / actual Android / real two-device exchange      | NOT RUN                            | Browser fixtures/CI packaging cannot supply this evidence                                                                                                                                                                                          |
| Teacher comprehension / manual assistive technology / real OS zoom | NOT RUN                            | No participants/devices or manual AT session available. Equivalent CSS viewport is labeled separately                                                                                                                                              |

A1 current native enforcement INCONCLUSIVE (source+SQL/historical native available,
no new complete native execution); A2/A3 executed UI cases PASS; A4/A5 automated/render
subset PASS with manual/device portions NOT RUN; A6 matched fixture comparison PASS,
teacher observation NOT RUN; A7 inherited required native gate FAIL. Overall BLOCKED.
The attached plan's broader whole-journey contract is stricter than the parent's advisory
teacher trial: its missing evidence remains required here.

## Canonical task reconciliation and next action

D00/D01 done. D02/D03 implementation reconciled but fresh native gate remains unresolved.
D04–D09 implemented/retained and checked within named UI/source-SQL evidence. D10/D11
ledger and computed inventory created; expanded adjacent controls are source-only.
D12/D13/D15 refined within Scores; D14 existing responsive roster retained and checked
with long synthetic names/titles,not large-roster performance. D16 existing effects
specified and reduced-motion measured; full frame/latency benchmark NOT RUN.
D17 existing context/stale/retry unit coverage passes; installed interruption untested.
D18 automatic/render checks done,manual AT/device/OS zoom pending. D19 core matched
comparison done; no human outcome comparison. D20 teacher observation NOT RUN. D21 installed/native acceptance remains unresolved.
D22 decision/handoff is complete for the current evidence; publication receipts follow. D23/D24 queued; do not widen to
another journey or promote global rules while this pilot's applicable gate is blocked.

Next: resolve the inherited SQLCipher initialization failure in a bounded native follow-up
with a reliable reproduction/positive control and fresh full CI; do not suppress it.
Then perform the specified teacher/disposable-Windows/device checks. No production
records/installations were altered. Recheck source hashes,PR heads,CI and assigned
context on resume; old results do not certify a changed tree. Keep TANAW/ILAW/tEAcher
Aide and official reporting requirements separate.

## Local publication checkpoint

Implementation commit: `0459d28d5ca2de12e0c5745ab6de4b22b5f69639`.
Final local quality1,581 tests,UI smoke,recovery50,production build and targeted47
browser checks PASS. Native source diff against parent is empty; evidence JSON binds
source hashes. Ledger structural check:49 unique nonempty contracts PASS.

Automatic approval review rejected `git push -u origin forge/scores-detail-20261019`
to public `312810-spec/likha-sis-0.2`: it judged prior implementation authorization
insufficient for this exact publication payload. No alternative publication route was
attempted. Push is BLOCKED; no candidate PR/CI/merge/deployment is claimed. Required
next authorization is publication of this branch's source/tests/assurance documents
to that public repository and a dependent draft PR targeting
`forge/opener-dependency-maintenance-20261018`. Prior user publication authorization
was present in supplied history, but automatic review did not accept it for this payload.
Local Git commit and files are confirmed; remote persistence is not established.

## Confirmed publication — supersedes the local publication block

The user explicitly approved the pending publication on19 October2026 and requested
continued automatic action. Platform approval controls remain in effect. Terminal Git
credentials were unavailable, so the connected GitHub tool published the authorized
payload. Remote implementation commit `e87b3c11db78dff72a6a1f38fc23bd1cf5b27bb7`
has tree `872784025de745d96b4555806eaf0ec7784e2d01`, exactly matching the local reviewed
checkpoint. Remote fetch/checkout succeeded; original local history is retained on
`forge/scores-detail-local-checkpoint-20261019`.

Draft PR149: https://github.com/312810-spec/likha-sis-0.2/pull/149, targeting
`forge/opener-dependency-maintenance-20261018`. Publication is confirmed, not blocked.
At this check Quality39150853445 and Security39150853292 are IN PROGRESS, not PASS.
The prior native/teacher/device gates remain unresolved. No merge/deployment.
