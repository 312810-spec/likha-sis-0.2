# M10 — immutable external planning-draft review provenance

Branch: `ctos/m10-draft-lineage-20261014`.
Parent: PR120 merge `31530f93ca3ee8677f43ef5178fd9677d11f93c5`.
Verified PR120 head: `701f1d7f0e8f30276a9b5f2ed2d36e69f8d336be`.
Quality `38510739285` and Security `38510739234`: PASS.

## Outcome contract and boundaries

Preserve the last applied teacher-confirmed external planning suggestion when a new
lesson is saved. Five bounded planning fields only; unknown keys, competencies,
sources, records and actor/time overrides cannot deserialize through the native
review request. A false confirmation, required blank fields or oversized fields
reject creation without a partial row. Session/assignment authorization remains
native and the expanded reviewed write boundary independently rechecks ownership.
The saved review actor and timestamp come from native state, not browser claims.

Migration 53 adds nullable immutable review JSON to the existing lesson row. Review
and lesson save happen in one insertion; later lesson edits/source amendments cannot
replace it. Existing lessons remain unknown and are not backfilled. Teachers can
edit final lesson fields after applying a suggestion; the original applied text is
retained separately, with no claim that the two still match. An explicit display
shows the saved provenance and original five fields as plain text. The unsaved
actor/context-scoped workspace retains the applied review through navigation and
clears it only with the corresponding successful save/discard.

This is the last applied suggestion's origin snapshot at creation, not a log of
every unsaved review, all later lesson revisions, verified AI generation or a
professional/official approval. No provider is selected/contacted, no credentials
are inspected, no learner records are transmitted. Missing live provider/privacy
decisions remain deferred. M10 is not complete and no deployment is authorized.

## Verification

- Focused service/adapter/screen checks: 46 tests PASS, including post-application
  teacher edits, remount retention, confirmed-only save and truthful provenance.
- Full frontend quality PASS: 152 files / 1,488 tests, typecheck, lint, formatting,
  architecture, dead-code and four runner regressions.
- Production build and preview isolation PASS (21 files); existing bundle advisory.
- Structural accessibility PASS on the retained applied-review state. Repository
  teacher-UI/accessibility skills used; human native screen-reader testing still owed.
- Added native regressions for confirmation/content rejection, authorization,
  server actor/time, edit preservation, direct overwrite refusal and legacy unknown.
  Added FK-enabled migration 52-to-53 regression for preserved text/unknown review.
- Rust/Cargo/rustfmt and security scanners unavailable locally. Require exact-source
  applicable native formatting/test/Clippy and Security CI before merge. Local browser
  launch remains an unchanged Chromium SIGSEGV limitation; do not claim a local browser
  pass or repeat unchanged launches. Exact-source browser/recovery CI required.

## Continue

Publish a small reviewable PR with expected-head lease and exact remote/local tree
verification. Inspect failing excerpts and apply minimal repairs; never bypass gates.
Merge only with applicable gates passing at the current verified head. Inspect
remaining M10 integrations; park source/provider/device/professional dependencies,
then continue independent M11 and subsequent work in controlling milestone order.
Do not disable continuation while implementable work remains. No deployment.
