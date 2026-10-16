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
