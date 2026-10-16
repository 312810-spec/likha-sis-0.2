# Spreadsheet ZIP 9 compatibility — 2026-10-16

Base: main `e5703aa5a03024eaa26e8870b26e1aab83e2142f`.
Branch: `fix/spreadsheet-zip9-compat-20261016`.
Risk tier: High-Fidelity (imports, exports, dependency integrity).

## Output contract

Remove withdrawn ZIP 8 from the dependency graph without weakening cargo-deny
or inventing upstream compatibility. Keep latest stable reader sources, genuine
XLSX output and existing templates. Make local compatibility changes explicit,
minimal, reproducible and reviewable, preserving upstream MIT notices.
Fallible name errors must propagate; preserve legitimate legacy CP437 filenames.
Truncated archives must produce errors rather than panic.

Artifacts: narrowly patched library-only source snapshots, provenance verifier,
Cargo manifest/lockfile, synthetic spreadsheet regressions and this checkpoint.
Evidence: official registry archive checksums and version/dependency metadata;
Context7 `/zip-rs/zip2` technical docs were unversioned, corroborated by actual
ZIP 9.0.3 compiler/API evidence. Context7 CLI 0.6.1; not an app dependency.
Validators: provenance check; focused import/form-generation/path/error tests;
full Rust tests/rustfmt/Clippy; applicable frontend quality; fresh native and
security CI. Independent review of patch/provenance/error handling before merge.
Acceptance: no ZIP 8 in lockfile; security policy unchanged; valid spreadsheets
remain readable/writable; malformed names fail normally; no teacher data changes.

## Initial probe

Official metadata: only ZIP 9.0.3 is non-yanked; latest Calamine 0.36.1 requires
ZIP ^8.6 and umya-spreadsheet 3.1.1 requires ^8.6.0. Archive SHA-256 checks passed.
Local prototype changed both manifest requirements and propagated fallible ZIP
name reads through Calamine XLSX/XLSB constructors and umya's path lookup.
`cargo check --tests` passed; focused SF1 import/formgen tests: 22 passed.
This is a local compatibility fork, not a claim of upstream support or acceptance.

## Adopted candidate and executed checks

The repository now carries library-only snapshots (618 inventoried files), the
two explicit path patches, ZIP 9.0.3 and the latest stable umya 3.1.1 source.
Only six upstream files change: two normalized manifests and four Rust source
files adapting fallible name APIs. Original manifests/MIT notices remain intact.
Git attributes preserve upstream bytes across Windows/Linux checkouts; native CI
verifies the inventory before build/test. Prettier excludes vendor snapshots only,
not security scanning. Generation is development-only and refuses overwrites.

Passed locally: 26 focused spreadsheet/import/form-generation tests; full native
suite 1,522 tests across 24 suites; rustfmt; Clippy with warnings denied;
provenance inventory; deliberate tamper rejection; fresh official-archive
regeneration producing byte-identical provenance. New synthetic cases cover
normal values, mixed-case/backslash paths, legacy CP437 and truncated archives.

Independent bounded review found no blocking correctness issue and verified the
618-file inventory. Limits: truncated archives do not exercise a filename-decoding
error specifically; no dedicated new XLSB runtime fixture; offline inventory is
checked against committed provenance, not redownloaded in every CI run; interrupted
generation may leave incomplete directories that verification rejects.

The first concurrent frontend run had ten timeout/follow-on failures while Rust
crypto tests were consuming the host. Type/lint/format/architecture/deadcode and
batch-runner checks passed; all frontend tests are rerunning with two workers
after the native run completed: all 1,565 tests passed (158 files).
No test timeout or app behavior was relaxed. The earlier failed run is retained
here as resource-contention evidence, not erased from the verification record.

The first local security run found one historical font-name false positive and
then failed advisory DB fetch on DNS. The literal historical heading is
"Typography pairing: token-level pairing now, Fraunces/IBM Plex Mono deferred";
only its immutable commit/file/line fingerprint is in .gitleaksignore. Rules,
cargo-deny and OSV policies are unchanged. After DNS recovery, security rerun:
3 tools passed, 0 failed, 0 missing (gitleaks, cargo-deny, OSV-Scanner).

No school/teacher records, permissions, grading rules, sync or templates changed.
Cargo.lock changes conservatively invalidate earlier draft-source matches through
the existing fingerprint; retained evidence is not rewritten. No installed-device,
printer, official-form or release acceptance claim. Fresh CI and review of the
final PR head remain required before merge; no deployment.
