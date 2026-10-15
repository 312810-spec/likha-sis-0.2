# M11 retained-review freshness viewing — 2026-10-15

Base: PR132 merge `981204d11d528bdee7c1d8a17aa6504c1bd0625b`.
Verified native head `03e7bcfa22436854c3255d9034ec67293b683edb`;
Quality 38658848902 / Security 38658848812 succeeded before merge.
Branch: `ctos/m11-review-freshness-ui-20261015`.

## Contract

- Extend the existing preparation-review domain port, application validation and
  native adapter. Read parameters are trimmed record/review identities only;
  authenticated actor/school authority stays native. Existing composition reused.
- Each retained review offers an explicit read-only check; no automatic checks,
  review writes, export or issuance calls. No raw learner source JSON requested.
- Match/changed/unsupported states have distinct visible non-approval text;
  missing history and failed/inconsistent evidence remain distinct. Unknown legacy
  status is rejected for a bound review rather than backfilled or approved.
- Validate exact review/draft/record identities, stored snapshot/source hashes,
  retained source protocol, current status/hash consistency, native timestamp,
  explicit read-time non-issuance scope and `not_verified` official fidelity.
- Review identity/hash/protocol, service, revision and disabled-state changes
  invalidate prior evidence immediately. Drop late responses after context changes
  and unmount; block duplicate reads; clear prior badges during retry/loading.
- Historical review does not certify current records. Notes/actor metadata are not
  independently signed professional acceptance. Even a match is read-time only;
  future issuance needs its own atomic source/authority verification.
- Repository premium-teacher-ui/accessibility skills applied: three-mode parity,
  Guided concrete help, native shared controls, visible loading/error/status,
  semantic labels and text (not color-only) evidence. No new CSS or theme colors.

## Actually executed

- Focused service/adapter/review UI tests: 88/88 PASS.
- Full `npm run quality`: typecheck, lint, formatting, architecture, dead-code,
  batch-runner 4/4 and 158 test files / 1,565 tests PASS.
- `npm run build`, `npm run check:dev-preview-isolation`, diff checks PASS;
  existing large-bundle advisory remains, no preview fixture leakage.
- New panel tests cover three-mode axe, unsupported metadata, thirteen inconsistent
  evidence variants, missing/error retry, context invalidation and late responses.
- Actual existing light/dark hex token checks: normal text at least 13.29:1,
  muted text at least 5.46:1, borders at least 3.42:1 against both surfaces.
  Error/warning text at least 5.93:1; button text at least 8.74:1. Existing shared
  controls retain the 24px checkbox/radio floor; this slice adds no small input.
- Local Chromium pre-execution SIGSEGV remains an unchanged established blocker;
  do not repeat the same failed experiment or claim new layout/browser proof.
  Require applicable CI browser/recovery gates; human/native screen-reader and
  installed-device acceptance remain separate and owed.
- Native source unchanged; reuse exact-head PR132 native evidence and preserved
  source fingerprints. No migration, backfill or official-source approval added.

## Next

Publish exact local/remote source identity; require applicable Quality/Security
at the current head before merge. Then implement issuance-time revalidation,
immutable issuance, append-only amendments and cross-form reconciliation, followed
by remaining controlling milestones. M10/M11 incomplete; no deployment.
Authoritative official sources/templates, installed Windows/Android and professional
acceptance remain external dependencies; a source reference alone verifies none.
