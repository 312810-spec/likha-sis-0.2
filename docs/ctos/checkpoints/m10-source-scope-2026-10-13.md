# M10 — declared source subject/year scope

Branch: `ctos/m10-source-scope-20261013`.
Parent: PR112 repaired checkpoint `f9f3ae82c6a05c6dcf47f2f0912a97b857b3e7d7`.
Implementation commit: `1fa0191` (before parent checkpoint reconciliation).

## Outcome and contract

A teacher may explicitly declare that a referenced source applies to the selected
subject and school year. Creation checks that declaration against the canonical
assignment context at the native boundary, under the existing connection lock.
Wrong subject IDs, changed years and blank scope are rejected before insertion;
subject names are not used as identity. Draft scope is retained on navigation and
saved references remain immutable through the existing JSON trigger. Earlier JSON
without scope deserializes as unknown; there is no backfill or migration change.

Source scope is unverified teacher metadata. Term remains declared text, not a
verified grading-period relationship. This does not establish cohort applicability,
official source approval, competency accuracy or schedule applicability. The existing
classroom learning-target seeding was inspected and already reads the day's lesson;
no second linkage implementation was added.

## Verification and assurance

- Focused frontend: 3 files / 32 tests PASS, including explicit UI declaration,
  scope transport, normalization, incomplete-scope rejection, retained drafts and
  disabled saved-source controls.
- Final full frontend quality PASS: typecheck, lint, formatting, architecture,
  dead-code, four batch-runner regressions and 149 files / 1,449 frontend tests.
- Production build PASS; existing bundle-size advisory remains.
- Browser smoke PASS: both appearances, three densities, four widths, keyboard
  scoring, context/navigation and zero configured axe findings.
- Targeted real-browser scope check PASS: opened the source disclosure, confirmed
  scope starts unchecked, explicitly declared scope, navigated away/back and
  preserved declaration/title. No horizontal overflow or configured axe findings
  at 1280px and 390px. This is a synthetic frontend fixture, not native/device proof.
- Recovery browser suite PASS: 49 checks. Frontend synthetic fixtures only.
- Official stable Rust 1.99 formatter downloaded with manifest SHA-256 verification;
  changed Rust file format check PASS. Native regressions added for mismatch/no
  insert, stale-year rejection, saved-history preservation and legacy JSON. Native
  test and Clippy execution require applicable CI; not executed locally.
- No production data or installed-device/professional acceptance was fabricated.
  Scope readiness remains INCONCLUSIVE pending native/UI/Security CI.

## Continue

Merge PR112 only after applicable gates pass at its live head. Retarget this slice
to main, inspect its resulting diff, and require its applicable gates at the verified
head before merging. Next: canonical term/cohort applicability and explicit provenance
amendments, verified source ingestion, teacher-confirmed AI drafts. Approved BOW and
installed-device/professional acceptance remain external dependencies. M10–M17 and
batches C–G are not complete. No deployment.
