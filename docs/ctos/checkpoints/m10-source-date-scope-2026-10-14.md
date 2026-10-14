# M10 — teacher-declared source date applicability

Branch: `ctos/m10-source-date-scope-20261014`.
Parent: PR118 merge `eded81dbc79841e17ac8786fe93e481bc746e7c7`.
PR118 verified head: `2e95fcc3689bbe6c00f824976e7c0fa3d9e46575`.
Quality `38491465693` and Security `38491465695`: PASS.

## Outcome and boundaries

Lesson source declarations can carry an optional inclusive start/end date window.
Both boundaries must be real Gregorian dates in order. The native creation path
checks the lesson date against that window; source corrections use the saved
lesson's own date, not today's date or a mutable term assumption. Out-of-window
creation/correction is refused without inserting a plan/amendment. Existing source
JSON remains compatible and has unknown date applicability; no dates are backfilled.

The UI offers an explicit optional declaration, keeps both dates in the existing
actor/context-scoped draft and locks them for saved lessons except through the
append-only source correction flow. Disabling the declaration clears the window.
The application service normalizes dates and validates new drafts before IPC;
native checks remain authoritative for historical corrections and direct calls.
Captured classroom provenance already retains the serialized source declaration.

Dates are teacher-provided scope metadata, not an official term calendar or
approved BOW assertion. Nothing infers cohort/term rules, approved competencies,
source approval, records or professional acceptance. No schema/dependency/provider
change is introduced. This is an applicability slice, not completion of M10.

## Verification

- Focused service/lesson screen checks: 34 tests PASS before adding UI retention
  regression; the full suite includes that regression.
- Full frontend quality PASS: 152 files / 1,484 tests, typecheck, lint, formatting,
  architecture, dead-code and four batch-runner regressions.
- Production build and preview isolation PASS; existing bundle-size advisory remains.
- Automated accessibility PASS with the declared date controls expanded.
- Local browser smoke could not execute: Chromium headless shell launch SIGSEGV.
  No browser pass is claimed; exact-source CI required.
- Native regressions added for inclusive endpoints, invalid/leap dates, rejection
  outside the window, historical correction rejection/no insertion and backwards
  compatible unknown scope. Rust formatter/native tests/Clippy unavailable locally;
  exact-source Quality CI must pass before merge.
- Local security scanners unavailable; exact-source Security CI required.

## Continue

Publish a small draft PR with an expected-head lease; compare remote/local trees.
Inspect failing CI excerpts and make the smallest repair without weakening gates.
Continue durable external-draft review provenance and explicitly configured cohort
applicability, then remaining unblocked controlling milestones. Official-source
authority, live AI provider/privacy choice, installed-device journeys and professional
acceptance remain pending. No deployment.
