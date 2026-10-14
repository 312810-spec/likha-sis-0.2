# M11 — teacher-facing retained preparation drafts

Branch: `ctos/m11-report-draft-ui-20261014`.
Parent: PR124 merge `1d9669e85fb84ccc5ee04430781c03d584e55cde`.
Verified PR124 head: `aad6bbaec035b4ed00149f6e52803d79c76ef02b`.
Quality `38556969885` and Security `38556970000`: PASS. Ubuntu native
format/tests/Clippy and Windows native package/tests passed. Those are not installed
device or professional acceptance.
PR111/112 live merged identities rechecked; no stale-head assumption or retarget needed.

## Outcome and boundaries

Wire the existing native capture/recent-read commands through a dedicated domain
port, application service and configured native adapter. Only record identity
crosses IPC; no client snapshot, actor, school, approval or issue payload.
Unavailable ports in prototypes/fakes remain explicitly unavailable.

Teachers explicitly confirm draft-only retention before capture. The confirmation
resets after an attempt, history load or context/revision change; pending actions
cannot repeat. Native capture saves current data, not a guarantee of equality to
an earlier preview. Repeated captures remain distinct drafts, not idempotent issue.
Failures do not claim nothing changed: an interrupted response may follow a saved
draft, so load history before another attempt. No automatic write retries.

Recent history is newest first, at most 50, not a full history claim. Expand each
draft to inspect historical context/period, grade evidence, missing explanations,
LRN flags, omissions, native saver/time and SHA-256 identity. Native reads verify
the stored bytes; the UI does not independently hash or recompute historical grades.
Official fidelity remains unverified. Nothing approves, issues, exports or sends.

All teacher modes retain functionality; Guided adds concrete historical/uncertain
capture help. Existing controls/tokens preserve target sizes; identities wrap on
narrow surfaces and grade/LRN cells retain visible labels. Record/service/revision
switches, pending writes and unmounts invalidate visible state and late responses.
Wrong record, snapshot identity, stage or fidelity responses are rejected.

## Verification

- Focused five-file reporting/workspace suite: 120 tests PASS.
- Full frontend quality: 154 files / 1,508 tests PASS; typecheck, lint, formatting,
  architecture, dead-code and four evidence-runner tests PASS.
- Build and development-preview isolation PASS. Build reports existing large bundle
  warning, not a failure. The same full quality/build/isolation ladder passed again
  after the final wrapping/visible-label refinement; diff whitespace clean.
- New panel tests exercise explicit confirmation, all three modes and structural
  axe checks, historical evidence, empty/error/retry history, uncertain capture,
  context/revision invalidation, pending guards, late response, identity/fidelity
  rejection and null capture. Service/IPC tests assert identity-only calls.
- Native source unchanged; valid PR124 native evidence reused. Exact-head applicable
  CI Quality/Security required before merge. Local Chromium's already-observed
  pre-execution SIGSEGV is unchanged; do not repeat it or claim local visual proof.
  Repository browser/recovery gates remain CI acceptance, not installed app proof.
- No manual screen-reader, actual device, verified official template/source or
  professional acceptance evidence. M10/M11 remain incomplete; SF8 inactive.

## Continue

Publish an exact-source draft PR with expected-head lease and compare remote/local
trees. Merge only after applicable verified-head gates pass. Next implement reviewed
snapshot/freshness semantics, then issued immutability, append-only amendments and
cross-form reconciliation. Park external source/device/professional acceptance,
continue independent authorized development. No production deployment.
