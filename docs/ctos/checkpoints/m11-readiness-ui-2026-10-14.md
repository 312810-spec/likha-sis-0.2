# M11 — teacher-facing read-only reporting preparation preview

Branch: `ctos/m11-readiness-ui-20261014`.
Parent: PR122 merge `dea115f75eeb970efed7dd319257310858bf1977`.
Verified PR122 head: `e11600141e60a18b16fcbd59a7444b4ff68e0624`.
Quality `38537534183` and Security `38537534016`: PASS.

## Outcome and boundaries

The class record workspace can request the full-period native report-card preparation
read model without exporting a file, changing a record or implying issuance. A
dedicated read-only port is injected through the existing export application service;
the native export adapter implements it and production composition supplies it.
Existing test/prototype compositions without this capability fail truthfully as
unavailable rather than fabricate a preview. Native authorization is unchanged.

The panel shows captured year/section/subject/term and period dates, native check
time, counts of missing/provisional/complete computed grades and missing LRNs,
full-period per-learner issues and the existing export omissions. A zero-learner
preview is not approval. Complete grades are not professional approval. Official
fidelity is explicitly unverified; nothing declares an official form ready.

Checks are explicit, loading is visible, pending reentry is refused, failure and
missing states have a retry action, and wrong-record replies are rejected. Earlier
success is hidden on refresh/failure. Request identity/unmount guards ignore late
responses after service/class/revision changes. Workspace item changes, score-write
state and manual refresh invalidate the visible snapshot; external data changes
require an explicit recheck, as disclosed. No current selected-item roster is used
to infer full-period readiness. All three teacher modes retain functionality;
Guided adds contextual caution about transferred learners and policy applicability.

No native code, schema, dependency, issued-state or approval policy changes here.
The legacy export actions remain separate and are not represented as issued records.
SF8 stays inactive. M10/M11 remain incomplete; source/provider/device/professional
acceptance is distinct from this implemented preparation interface. No deployment.

## Verification

- Focused service/adapter/panel/workspace checks: 108 PASS before adding the empty
  roster regression; the updated panel's seven tests PASS, including all three modes,
  structural axe, missing/failure/retry, stale identity/revision, writes and no export.
- Full frontend quality PASS: 153 files / 1,497 tests, typecheck, lint, formatting,
  architecture, dead-code and four evidence-runner regressions. Production build
  and preview isolation PASS (21 files); existing bundle-size advisory remains.
- No Rust source changes; reuse PR122's unchanged native evidence, not as proof of
  new frontend behavior. Applicable exact-source CI still required before merge.
- Local browser launch remains the unchanged Chromium SIGSEGV limitation. Require
  exact-source browser/recovery CI; no local visual/native-device pass claimed.
- Human compiled-app screen reader, installed Windows/Android and professional
  acceptance remain untested. Repository teacher-UI/accessibility skills used.

## Continue

Publish with expected-head lease and verify the exact remote/local tree. Inspect
failed gate excerpts and make minimal repairs without bypasses; merge only at a
verified passing head. Continue native reviewed/issued immutable snapshots and
append-only amendments, then cross-form reconciliation and remaining controlling
milestones. Revalidate authorization and source freshness at issuance; current
preview/CSV alone does not establish that lifecycle. No deployment.
