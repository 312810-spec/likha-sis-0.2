# M10 — local external planning-draft review

Branch: `ctos/m10-draft-review-20261014`.
Parent: PR116 merge `c2ccb996890474051c72e57e1fbd53c8792c7212`.
PR116 verified head: `aa9eeb5cf26191ccc90d241c253cce07b3e8b974`.
Quality `38479592630` and Security `38479592658`: PASS.

## Outcome and contract

Teachers can paste an externally obtained planning suggestion into a local review
panel for a new lesson. The application service validates a bounded JSON object
containing only objectives, connection to previous learning, activities, assessment
and ways forward. Competencies, codes, source references, records, approvals and
unknown fields are rejected. No model, API, credential or network request is used.
The suggestion is teacher-supplied text; LIKHA does not verify its AI origin.

Staging shows plain text without changing lesson fields or writing a record.
Applying requires an explicit teacher-review checkbox that authorizes replacing
exactly those five fields in the unsaved draft. Competencies and source declarations
remain untouched. Editing the pasted text or switching class/date resets staged
review and approval. Raw text is retained in the existing actor/context-scoped
session draft, not durable storage; a remount requires review again. Applying clears
the pasted text. Confirmed lesson save also clears it. The lesson is saved only
through the separate existing teacher save action. Existing saved lessons do not
expose the import panel, preventing bulk replacement of historical lesson content.

This is a bounded teacher-confirmation interface, not complete M10 AI acceptance.
Live generation, provider/privacy decisions, durable AI generation/review lineage
and semantic correctness against approved BOW remain pending. No generated
competency, source approval, learner record or professional acceptance is claimed.

## Verification

- Focused parser/review/lesson screen checks passed: 33 tests before adding the
  integration regression. The full suite includes the explicit separate-save case.
- Frontend quality: final service-layer routing tree PASS, 151 files / 1,477 tests;
  typecheck, lint, formatting, architecture, dead-code and batch-runner PASS.
- Final production build and preview isolation PASS. Existing bundle-size advisory
  remains.
- Automated component accessibility PASS on the expanded review panel.
- Local browser smoke could not execute: Chromium headless shell crashed with
  SIGSEGV at launch, including a sequential retry after frontend workers finished.
  This is unverified browser evidence, not a passing gate. Exact-source CI required.
- No Rust/schema/dependency/provider changes. Reuse PR116 native evidence for
  unchanged native source; applicable repository CI remains mandatory.
- Local security scanners unavailable; exact-source Security CI required.

## Continue

Publish a small draft PR with an expected-head lease and verify remote/local tree
identity. Require applicable Quality/Security gates; never bypass browser failure.
Continue M10 term/cohort applicability with configurable, explicitly declared
rules, source verification workflow and durable review provenance as independently
useful work. Official sources, installed-device journeys and professional acceptance
remain external. Remaining batches are incomplete. No deployment.
