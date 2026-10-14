# M11 — teacher-facing retained/current comparison

Branch: `ctos/m11-draft-comparison-ui-20261014`.
Parent: PR126 merge `f238142642aac214340d384b792086957e03dff5`.
Verified PR126 head: `754773336d2c696ddedcbe3616bb816f9cfddfbc`.
Quality `38582226399` and Security `38582226403`: PASS.
PR111/112 live merged heads rechecked, unchanged.

## Outcome contract and boundaries

Wire the existing native comparison command through the draft domain port,
application service and configured native adapter. Only record/draft identities
cross IPC; actor/school and stored evidence remain native-derived. No new native
source, schema, migration, review record, source lock or issuance transition.

Each expanded retained draft offers an explicit read-only comparison action.
Nothing compares automatically when history loads. Show loading, missing/error,
retry, changed fields or projection-match status. Show retained/current context,
counts and current learner/grade/LRN evidence plus export omissions. Retained
evidence stays original. Unknown changed fields are labeled without invented
meaning. All modes retain functionality; Guided explains why raw inputs can change
without projection changes. Visible labels retain meaning on narrow table layouts.

Check returned draft/record/current-record identities, retained SHA-256 identity,
explicit projection-only scope, unverified fidelity and match/changed-field
consistency before display. Revision, service, draft or disabled changes invalidate
visible results immediately and ignore late responses. Pending actions cannot
repeat; refresh/failure never retains an earlier matching verdict. Parent capture
or history refresh unmounts comparison results. No captures, exports, approvals,
reviews or issues are initiated by comparison.

This remains a projection comparison, excluding check time, NOT raw-source locking
or issuance clearance. Full source-input locking must bind raw grade/policy inputs,
roster/context/LRN content and algorithm version before atomic review/issue checks.
Actual official source/template authority and professional acceptance are not
fabricated. M10/M11 incomplete, SF8 inactive, no deployment.

## Verification

- Focused reporting/workspace suite: five files / 124 tests PASS.
- Full frontend quality: 155 files / 1,519 tests PASS; typecheck, lint, formatting,
  architecture, dead-code and four evidence-runner tests PASS. Build and development-
  preview isolation PASS; existing large-bundle warning is not a failure.
- New comparison panel: nine behavioral/all-mode structural axe tests, covering
  changes, match-not-approval, missing/retry/failure, learner/omission/unknown fields,
  pending guard, stale revision/service/draft/write results, unmount and identity/
  hash/scope/fidelity/inconsistent-response refusal. Service/IPC identity-only tests.
- Initial full gate stopped at one test-formatting difference; reformatted and
  confirmed formatting before rerunning the complete ladder. No failed check waived.
- Native source unchanged; reuse exact-head PR126 native/Windows evidence. Local
  Cargo unavailable. Applicable exact-head CI Quality/Security required before merge.
- Local Chromium's unchanged pre-execution SIGSEGV is not repeated; browser/recovery
  checks remain CI evidence. Structural axe is not visual/native/human-screen-reader
  acceptance. Installed-device/professional/source acceptance remains external.

## Continue

Publish with expected-head lease; verify remote/local tree identity. Merge only at
applicable green verified head. Next implement full raw-source lock and atomic
review/issue behavior, append-only amendments and reconciliation. Never use the
projection-match boolean as an issuance gate. Continue independent authorized work;
park unavailable external acceptance, no production deployment.
