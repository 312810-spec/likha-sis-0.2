# CTOS State

Updated: 2026-10-16 (Asia/Manila). Repository: `312810-spec/likha-sis-0.2`.
Controlling plan: `CTOS.md`; execution rules: `AGENTS.md` and `docs/ctos/FORGE-V3-ADAPTER.md`.

## Current source and verification

PR136 calendar repair: `8f3d4a3923a91be5ba90757fe5e990870389d6df`.
PR137 assigned-subject/year scope: `2380f0c298f32ada353ed313e46fe11d34950b14`.
Both heads passed Ubuntu native Quality (1,494 / 1,497 tests), rustfmt, Clippy,
Windows build/tests (1,503 / 1,506 tests) and Security with zero test failures.
PR136 merged as `774fdd6ba3363e319d88783f3bb76318b123ae49`; PR137 merged as
`c53f05f0a8bacf63f920ad09970c5a120e9c5ee1`. Quality runs: 38768358186 / 38768994643.
Latest Windows test-installer artifact: 11991713118. No deployment.

Exact receipts and limits: `docs/ctos/checkpoints/m11-assigned-subject-coverage-2026-10-16.md`
and `docs/ctos/checkpoints/m11-annual-calendar-scope-2026-10-15.md`.
Refresh live main, open PRs and Git status on resume; this document cannot prove a clean checkout.

## Program status

- M00–M09 and F01–F16 are recorded complete in their checkpoints; do not rebuild them by default.
- M10 remains partial: versioned source ingestion, scope, review, lineage and classroom origin exist;
  official BOW/curriculum applicability and the complete teaching loop still require acceptance.
- M11 remains partial: readiness, retained drafts/reviews, source checks and annual completeness
  guards exist. Issuance, immutable amendments and cross-form reconciliation remain open.
- M12 TANAW exchange remains pending; research is not an implemented production integration.
- M13 recovery/sync acceptance, M14 Android, M15 manual accessibility/performance/security,
  M16 teacher acceptance and M17 release remain open within their CTOS contracts.

## Next execution

PR139 merged as `d033fb17817059c92b824d7f34717809e7838488`; SF4/SF6 now require
administrative reporting capability. Head `b955dde` passed Ubuntu/Windows Quality
38824681475 and Security. Local native suite: 1,510 passed; frontend: 1,565 passed.
Receipt: `docs/ctos/checkpoints/m11-school-report-authority-2026-10-16.md`.
PR140 merged as `9444d9b427a41f1b501c1802c83fdd73a928a99f`; head `db7f992`
passed Ubuntu/Windows Quality 38842928675 and Security. Source v2 captures the
applicable curriculum reference without rewriting older retained drafts.
PR141 head `62e9e45` targets main. Ubuntu/Security and Windows build passed;
Windows native tests remain pending. It guards pinned annual policy context.
Local native suite: 1,518 passed; rustfmt/Clippy, browser smoke and 50 recovery
checks passed. Independent bounded source review found no blocking regression.
Documentation branch: `ctos/m11-reporting-verification-20261016`.
Receipts/limits/next design: `docs/ctos/checkpoints/m11-reporting-verification-2026-10-16.md`.
Hourly continuation remains paused: resumption hit the five-active-task limit.
A task slot must be freed; no unrelated task was changed.

Finish PR141 and the documentation checkpoint after exact-head gates pass.
Then design/test canonical versioned required-subject applicability; adapt only
the safe PR103 offering concepts, with atomic versions and exact scoped reads.
Continue issue/amend transitions and cross-form reconciliation afterward.
Configured periods/assignments do not prove official completeness. Keep missing values pending.

Preserve current school hub and canonical data; historical issued records must remain unchanged.
PR100, PR103 and PR106 are reconciliation/salvage sources; never mass-merge them.

## External evidence and release limits

Installed Windows golden journey/upgrade/recovery/printing, real two-device assignment/backfill,
manual assistive-technology and teacher acceptance remain untested on this candidate.
Android remains unsupported as a release claim until native Keystore/encrypted startup, process
recovery, signed upgrade and file-provider/device evidence passes M14.

Official current local form-checking guidance, anonymized LIS samples, West 1 TANAW dictionary,
Mandaue-specific eSF7 details, actual school offerings/schedules and SF8 health rules remain
source-dependent. TANAW Coordinator-only Lock and no DMET API are recorded product decisions;
implementation/official mapping still needs evidence. Keep SF8 inactive.

## Historical evidence

Prior state is preserved byte-for-byte in `docs/ctos/history/CTOS-STATE-through-2026-10-16.txt`;
prior task history in `docs/ctos/history/TASK-through-2026-10-16.txt`.
`docs/ctos/history/archive-receipts.json` records hashes/sizes. These are historical snapshots,
not current execution instructions. Load only relevant checkpoints; do not reload the archives
for ordinary continuation. Latest verified source and official guidance take precedence.
