# M10 — teacher-declared source grade applicability

Branch: `ctos/m10-source-grade-scope-20261014`.
Parent: PR119 merge `ebb13de145a08da60746fba4348675538969c22a`.
PR119 verified head: `fbae7411d9f5b8b83e0be7e32c3d2cbb122521c5`.
Quality `38503472166` and Security `38503472171`: PASS.

## Outcome and boundaries

An optional declared grade extends the existing subject/year source scope. The
native creation boundary validates it against canonical captured class context.
Source corrections validate against the saved lesson's grade even after the
class configuration changes. Mismatch, blank and oversized declarations cannot
insert plans or amendments. Absent grade stays unknown; existing serialized
references remain compatible and are not backfilled. Source amendment history and
classroom origin snapshots retain the serialized declaration without rewriting
historical values. This adds no migration, dependency or live AI call.

The existing source panel offers an optional labeled grade field, retained in the
actor/context-scoped draft and locked after save except through source correction.
It is shown only with explicit subject/year scope. Disabling scope clears it.
The declaration is not evidence of official curriculum, cohort or competency
applicability. Professional acceptance remains separate; M10 is not complete.

## Verification

- Focused service/screen tests: 37 PASS, including grade normalization, blank and
  oversized rejection, draft retention, saving, locked edits and correction access.
- Expanded-control structural accessibility check PASS. Human compiled-app screen
  reader and installed-device acceptance remain untested.
- Full frontend quality PASS: 152 files / 1,486 tests, typecheck, lint, formatting,
  architecture, dead-code and four batch-runner regressions. Build and preview
  isolation PASS (21 production files); existing bundle-size advisory remains.
- Native grade/history/legacy regressions added; Rust, Cargo and rustfmt absent
  locally. Exact-source native formatting/tests/Clippy CI required before merge.
- Local Chromium launch SIGSEGV is an unchanged known limitation; do not repeat
  unchanged launches or claim visual/browser proof. Exact-source browser CI required.
- Local security scanners unavailable; exact-source Security CI required.
- One focused failure was a source-less fake create response, repaired to return
  the submitted source reference without changing production logic.

## Exact-head CI repair

At published head `b600693c5140d63c001763eee26407cfb80a3bb9`, Security
`38509918314` passed. Quality `38509918289` passed frontend, browser accessibility
and recovery checks; Ubuntu job `115675856715` then stopped at `cargo fmt --check`
on two formatting-only differences in the legacy JSON test. Apply the exact
formatter output without behavior changes. Reuse unchanged frontend evidence,
but require both applicable gates at the repaired published head before merge.
Windows build/tests were still running when this failure was inspected.

## Next action

Publish with an expected-head lease and verify the remote tree against local Git.
Inspect any failing CI excerpts; do not weaken gates. Merge only at a verified head
with applicable Quality/Security passing. Continue durable external-draft review
lineage and remaining unblocked controlling milestones. Official source/curriculum
authority, live provider/privacy choice, installed devices and professional acceptance
remain pending. No deployment; keep continuation enabled while implementation remains.
