# M10 — inspect and verify stored source bytes

Branch: `ctos/m10-source-integrity-20261014`.
Parent: PR117 merge `10b189d26217de06e2d1397fd1b1ccbd2f6ee141`.
PR117 verified head: `a521f0ec55030d79e847f2622783e6414896010d`.
Quality `38485793948` and Security `38485794062`: PASS.

## Outcome and contract

Attached source metadata is returned only after the native repository recomputes
SHA-256 from the exact encrypted-database bytes and checks the recorded byte length.
Hash mismatch returns an error, not a misleading verified artifact. Source creation
and provenance amendments now use the same verified school-scoped reader before
linking an artifact; deduplication also uses it. No source bytes cross IPC.

The lesson editor offers an explicit integrity check and shows file name, type,
size, ingesting actor/time and a selectable fingerprint. Loading, failure and retry
are explicit. Missing/wrong identities and late responses after unmount do not
render a success. The read changes no lesson or artifact record.

This verifies byte identity only, not that the source is official, approved,
applicable or semantically correct. The display says this. No professional source
attestation or learner record is fabricated. No schema, dependency or provider
change is introduced.

## Verification

- Focused service/lesson-screen/integrity-panel tests: 38 PASS, including expanded
  panel automated accessibility, failure/retry and late response handling.
- Full frontend quality PASS: 152 files / 1,482 tests; typecheck, lint, formatting,
  architecture, dead-code and four batch-runner regressions PASS.
- Production build PASS with existing bundle-size advisory.
- Preview isolation PASS: 21 production files scanned.
- Local browser smoke remains unexecuted: Chromium headless shell exits SIGSEGV at
  launch. Prior unchanged retry showed the same result; no passing browser claim.
- Native synthetic corruption regression added. It inserts a schema-valid row with
  mismatched hash/bytes using valid FK parents; it disables neither foreign keys nor
  immutability triggers. It asserts read/link failure, school isolation and no lesson
  insert. Native tests/format/Clippy unavailable locally: exact-source CI required.
- Local security scanners unavailable; exact-source Security CI required.

## Continue

Publish as a bounded draft PR with expected-head lease and exact local/remote tree
comparison. Require applicable Quality and Security before merge. Continue M10
declared term/cohort applicability and durable external-draft review lineage;
verified official sources and live AI provider/privacy choices remain dependencies.
Installed-device and professional acceptance remain separate from CI. M10 and other
remaining batches are incomplete. No deployment.
