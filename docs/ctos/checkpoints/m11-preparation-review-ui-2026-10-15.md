# M11 teacher preparation-review controls — 2026-10-15

Base: PR130 merge `205cac2ecb7c029727ffe110f6859a46088d4256`.
Verified native head: `0164ceb34d0fb2563b2236a3f08c0336400128d4`.
Quality 38629720197 and Security 38629720189 succeeded before merge;
Ubuntu and Windows native gates completed successfully. Native source unchanged
in this slice; reuse that valid evidence rather than repeating unavailable local Cargo.
Branch: `ctos/m11-preparation-review-ui-20261015`.

## Contract and verification targets

- New preparation-review port, application validation/whitelist, native adapter
  and composition wiring. No caller school/actor/time/approval fields; native
  session remains authoritative. UUID request identity and explicit confirmation.
- Mounted per retained draft: explicit current input check, notes and checkbox,
  followed by explicit record action. Legacy/unsupported/changed/missing/mismatched
  results cannot enable review. Native writer revalidates atomically at save time.
- Note edits, rechecks, context/revision/disabled changes invalidate confirmation.
  Unsaved notes survive revision changes within the same mounted draft; never leak
  to another draft/record/service. Stale async responses dropped after changes/unmount.
- No automatic write retries; one attempt per mounted draft view. Lost, missing or
  malformed acknowledgement means uncertain, not unsaved. Keep submitted request
  identity/notes visible; load recent native-authorized history to resolve exact
  request, snapshot/source fingerprints, protocol and notes. Absence from latest
  50 class-record events is not proof of no write. No persistent browser copy of
  school evidence was added; mounted UI state is not restart continuity evidence.
- History remains immutable preparation-review evidence, not current freshness,
  grade approval, professional acceptance, official-source verification or issuance.
  Cross-record/malformed history refused. No export/issuance calls introduced.
- Efficient/Comfortable/Guided functional parity; Guided concrete help. Existing
  theme controls (24px checkbox minimum), labels, linked hints, loading/status/error
  states reused. Repository premium-teacher-ui/accessibility skills applied.

## Executed evidence

- Focused service/adapter/UI tests 66/66 PASS before final note-preservation refinement;
  final focused UI tests 13/13 PASS, including three-mode axe checks.
- Full quality gate PASS: typecheck, lint, formatting, architecture, dead-code,
  batch-runner 4/4 and 157 test files / 1,543 tests. An interim run caught loss of
  notes after revision invalidation; separate scoped editor state repaired it,
  final focused/full regression runs passed. No failed test was waived.
- Production frontend build and preview isolation PASS after final implementation;
  no browser fixtures leaked into the build. Existing bundle-size advisory remains.
- Local Chromium pre-execution SIGSEGV is a previously established unchanged
  runtime blocker, not repeated as a new experiment. Real browser/layout coverage
  required in CI; automated structural axe is not human/native screen-reader acceptance.

## Remaining

Publish exact local/remote tree identity and require current-head Quality/Security.
Next: issuance-time source revalidation, immutable issued snapshots, append-only
amendments and cross-form reconciliation, then remaining controlling milestones.
Official sources/templates, installed Windows/Android devices and professional
acceptance remain external dependencies. M10/M11 incomplete; no deployment.
