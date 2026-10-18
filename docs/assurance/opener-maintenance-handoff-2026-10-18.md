# Separate opener maintenance checkpoint

Branch `forge/opener-dependency-maintenance-20261018`, based on PR147 head `88e0686`.
Frozen criteria O1–O6 in `opener-maintenance-contract-2026-10-18.md`.
Latest PR147 Quality39125900679 PASS; Security39125900458 FAIL on the same three
retired standalone crates. This branch preserves that journey and its pending trials.

## Mechanism and candidate

The graph is opener2.7.0 → zbus5.19 → zvariant/zbus_names/zvariant_derive.
Official RustSec says the standalone APIs moved into zbus6. Latest stable opener2.7.2
still requires zbus5.9. A normal update is insufficient; scanner filtering/suppression
and removing teacher export reveal were rejected.

Verified official opener2.7.2 archive checksum; retained 37 files and both licenses.
Only normalized Cargo.toml and Unix reveal implementation are patched. zbus6 removed
its blocking facade: use async Connection/proxies with block_on on the existing dedicated
thread; retain FileManager1 first, portal fallback for the first path, and propagated denial.
Windows code, permissions/scopes, commands and mobile assets are byte-identical to upstream.
No upstream support or installed-platform acceptance is implied by this local snapshot.

Cargo1.99.1 generated the real lockfile: removes all three retired crates and their unused
async stack. zbus6 requires Tokio1.53.3; attempting to preserve1.53.1 failed the resolver,
so the required patch update is retained. No blanket update, spoofed checksums or new ignore.
Toolchain archives were checked against official stable-manifest SHA256 before local use.
Context7 returned an unversioned index with mixed historical examples; downloaded v6 source
and actual compilation take precedence. No Context7 component is added to teacher runtime.

## Executed / pending

O1 local PASS: clean regeneration byte-for-byte, refuses overwrite, rejects source tamper
and unexpected file; 37-file provenance and original spreadsheet provenance PASS.
O2 local PASS: Cargo-generated lock contains none of the three retired crates; unchanged
security policy, score source and export bridge checked byte-for-byte.
O3 security CI pending. O4 native/Windows checks pending. The actual patched Unix module and synthetic mock services compiled with zbus6 locally.
Local execution then stopped because this host denied the private D-Bus socket (Operation
not permitted). Runtime behavior remains NOT RUN locally, not a product failure or pass.
Earlier harness namespace/API setup errors were corrected before the successful compilation.
The same probe is wired to unrestricted Ubuntu CI; it never uses a real desktop/session bus.
O5 frontend gate running; no teacher-app UI source changes. O6 verifier/private-bus regression
steps wired into native Ubuntu CI and provenance into Windows CI; not yet remotely executed.

## Next action and limits

Complete local probe, publish this separate dependent draft and capture security/native/Windows
receipts against exact source. Repair any actual failure; no readiness claim until O1–O6 pass.
Teacher trial, installed Windows GUI, real desktop portal and Android remain untested.
Do not claim this dependency patch alone closes those acceptance items. No deployment.

## First candidate CI and targeted repairs

Published first candidate ec13fbe as draft PR148, dependent on PR147. Cargo-deny
job117698055333 PASS: retired crate blocker removed. Gitleaks job117698055123
flagged the public SHA256 of upstream api-iife.js in the path→hash JSON map, not a
credential; the digest was checked against archive bytes. Inventory format2 uses
explicit path/sha256 records. A scan of all changed candidate files with the same
Gitleaks8.24.3 binary/rules then PASS (zero findings). A broad vendor directory scan
still reports the two historical spreadsheet inventory matches already recorded in
existing policy; no new ignore was added.

OSV job117698055398 reported zero vulnerable packages but failed extracting upstream
LICENSE.spdx: its old DataFormat tag is not a valid SPDX package field. Preserve the
notice bytes as LICENSE-SPDX-notice.txt with an explicit provenance path mapping;
both complete license texts remain intact. This is document typing, not a dependency
or vulnerability exclusion. Clean regeneration including that mapping PASS.

Windows job117698095402 stopped at the new provenance checker: str(relative_path)
produces Windows backslashes while upstream inventory uses slash paths. Use as_posix()
for inventory identity on every platform; do not normalize hashes or accept mismatch.
Full Windows compile/test and final security results still need the repaired candidate.

The first unmerged maintenance commit is retained in local checkpoint history and CI
receipts. Replace only this task-owned draft branch using an exact expected-head lease,
so Gitleaks evaluates the corrected inventory representation rather than an obsolete
false-positive intermediate commit. No other branch/history or scanner policy changes.
