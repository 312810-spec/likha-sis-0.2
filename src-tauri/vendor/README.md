# Temporary spreadsheet compatibility snapshots

Calamine 0.36.1 and umya-spreadsheet 3.1.1 are explicit local compatibility forks
of the latest stable upstream releases checked on 2026-10-16. Both upstream
versions require ZIP 8, whose releases are all yanked. These snapshots require
the non-yanked ZIP 9.0.3 and adapt its fallible archive-name APIs.

This is not a claim that upstream supports ZIP 9. Cargo resolves the actual
modified manifests; no package version is spoofed and no deny policy is relaxed.

Only library sources, manifests, upstream README/changelog, VCS metadata and MIT
notices are retained. Unrelated examples, benches, dev dependencies, lockfiles,
images and workbook test assets are omitted. Upstream MIT notices remain intact.
Compiled source changes are limited to Calamine's ZIP path cache plus XLSX/XLSB
callers and umya's fallback name lookup. Name decoding errors propagate normally.

`scripts/vendor-spreadsheet-compat.py` downloads the pinned official crate archives,
checks their SHA-256 values, applies exact guarded transformations and records
every retained file hash plus original/modified hashes for changed files.
Run with `--verify` for an offline read-only inventory/hash check. Regeneration
refuses to overwrite existing snapshot directories. No teacher runtime networking.
The manifest is review evidence, not a security certification or upstream signature.

Remove the patches and snapshots when maintained upstream releases support a
non-yanked ZIP version, then rerun provenance/dependency, spreadsheet and native
checks. Do not silently carry them forward during dependency upgrades.

## Opener / zbus compatibility snapshot

`tauri-plugin-opener-2.7.2` is an explicit compatibility snapshot of the latest
stable release checked on 2026-10-18. Official RustSec RUSTSEC-2026-0370/0371/0372
retire standalone zvariant, zbus_names and zvariant_derive; their APIs moved into
zbus6. Upstream opener2.7.2 still requires zbus5.9, so a normal update leaves the
findings. This snapshot requires zbus6 and adapts its removed blocking facade to
async Connection/proxies driven by `zbus::block_on` on the existing dedicated
thread. FileManager1-first and OpenURI-directory fallback behavior is retained.

Only Cargo.toml and the Unix reveal implementation are patched. Windows, Apple,
mobile assets, permission scopes, command source and both upstream licenses are
retained byte-for-byte. This is a local compatibility fork, not upstream support
or a claim of installed-platform acceptance. The upstream package lock is omitted
because the application uses its own committed Cargo.lock, scanned without new
exclusions. The snapshot retains 37 upstream files in total.

`scripts/vendor-opener-compat.py` verifies the pinned archive SHA256 against the
published registry checksum, refuses overwrite, applies guarded edits and records
all retained hashes in `opener-provenance.json`. `--verify` is offline/read-only;
`--archive PATH` accepts an already downloaded archive with the same mandatory
checksum. Remove the snapshot/patch when a maintained compatible opener release
uses zbus6, then rerun source provenance, security, native tests and Windows packaging.

The upstream legacy `LICENSE.spdx` is retained byte-for-byte as
`LICENSE-SPDX-notice.txt`, with its original path recorded in provenance. It is an
old license notice, not a valid scanner-readable SBOM (`DataFormat` in its package
section causes OSV extraction to fail). Both full license texts stay unchanged.
The hash inventory uses explicit path/sha256 records so a filename containing
`api` is not mistaken for an API-key assignment. No scanner policy is changed.
