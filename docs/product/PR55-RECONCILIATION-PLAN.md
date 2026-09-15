# PR #55 Reconciliation Plan

## Status

PR #55 (`claude/pending-tasks-batch-vjy67v`) is **not a merge candidate**. It contains 73 commits, 236 changed files, and approximately 47k additions accumulated before the current Legacy Soul / Golden Journey recalibration, affected-work CI redesign, and provider-neutral harness.

Its exact final head is preserved at:

- source commit: `fdcdabf1ec65f214444a294cd50770dc6f6162cf`
- archive branch: `archive/pr55-pending-tasks-batch`
- clean reconciliation branch: `reconcile/pr55-salvage` (based on current `main`)

No work from #55 should be recovered by merging the archive branch wholesale. Recover only bounded vertical slices on top of current `main`, with current architecture, authorization, tests, CI, and product-scope rules.

## Why wholesale merge is rejected

1. The branch is materially diverged from `main` and conflicts with work already merged after its base.
2. It contains obsolete `.claude` harness/control-plane changes that conflict with the provider-neutral harness now on `main`.
3. It mixes security, migrations, sync, RBAC, cloud/document integration, teacher UI, experimental productivity features, and documentation in one mega-change.
4. Several areas are compliance/security sensitive and the PR itself records retained verification debt.
5. LIKHA 0.2 now follows the Focused 1.0 / Minimum Lovable School Product and Golden Journey rules; features that do not serve that path should not re-enter by inertia.

## Recovery order

### P0 — security/correctness fixes to inspect first

Recover only if current `main` still has the underlying gap.

- school-logo MIME/magic-byte validation hardening
- authorization fixes that close concrete trusted-boundary gaps
- session/capability correctness fixes
- migration correctness or data-loss protections

Every P0 item requires a fresh comparison against current `main`; do not assume the old fix is still applicable.

### P1 — core SIS/domain work likely worth preserving

Rebuild as small independent PRs when it directly supports the Golden Journey or required school operations:

- Master Teacher RBAC and two-tier grade review, after a fresh authorization/security review
- transfer registry where required for learner lifecycle correctness
- SF8 / nutrition domain foundation when tied to required DepEd workflows
- child-protection authorization boundaries if the corresponding domain is admitted to release scope
- backup / disaster-recovery mechanisms that protect the local-first working database
- sync correctness/reliability fixes that remain compatible with the current SyncProvider architecture
- configurable sync-hub addressing only if the current sync topology still needs it

### P2 — valuable but gated / revalidate before adoption

- Microsoft 365 / SharePoint official-school-repository adapter
  - keep provider code in infrastructure adapters
  - require fresh security review for OAuth, token custody, egress, permissions, and recovery
  - require explicit confirmation of real school Microsoft 365 / SharePoint availability before live pilot
  - must not become a required dependency for normal offline work
- grade-review UI and related oversight workflows
- anecdotal/guidance records and award-eligibility logic
- scholastic workbook importer

These are not inherited as approved merely because implementation exists in the archive.

### P3 — defer unless the Legacy Soul admission rule later justifies them

Examples from #55 include:

- weather/hazard UI integrations
- ID-card / QR features
- visual timetable extras not needed by the current Golden Journey
- theme/palette enhancements that are not required for premium core workflow quality
- seating-chart and other peripheral productivity modules
- certificates/awards extras beyond required release scope

Code can remain in the archive as reference. Do not carry it onto current `main` until a concrete teacher job and release need justify it.

### Reject / do not restore

- `.claude/` control-plane, Claude-specific hooks/settings/skills, or any requirement that a particular model/provider be the harness runtime
- stale planning/memory text that conflicts with current repository decisions
- hardcoded vendor/model routing superseded by the provider-neutral harness
- duplicate implementations where current `main` already has the capability
- any feature whose only justification is that it was already built

## Slice rules

For each recovered slice:

1. Start from current `main`.
2. Re-check whether the underlying need still exists.
3. Inspect current architecture and relevant ADRs before porting code.
4. Port the smallest coherent vertical slice; prefer reimplementation from the archived intent over conflict-heavy cherry-picking when architecture has changed.
5. Preserve trusted-boundary authorization below the UI.
6. Use synthetic data only.
7. Add/update tests for domain logic, migrations, authorization, offline/recovery behavior, and UI states as applicable.
8. Run the affected-work quality gate and independent security checks.
9. For auth/security/storage/cloud/repository decisions, use the LIKHA scenario rule and record durable decisions.
10. Merge only after the slice is independently understandable and reversible.

## Initial execution sequence

1. Audit P0 security/correctness deltas against current `main`.
2. Reconcile backup/DR and sync reliability pieces that directly protect the local-first architecture.
3. Re-review Master Teacher RBAC + grade review authorization and recover only after the trusted-boundary model is confirmed.
4. Evaluate required DepEd-domain slices (transfers, SF8/nutrition, child protection) against Focused 1.0 admission criteria.
5. Reassess Microsoft 365/SharePoint as an optional infrastructure adapter, not a core dependency.
6. Leave peripheral productivity/features archived until the Golden Journey core is materially complete.

## Relationship to Golden Journey work

Golden Journey implementation remains the product-development spine. PR #55 reconciliation should interrupt it only for security/correctness/data-loss issues or a domain dependency required by the next Golden Journey slice. Otherwise, salvage work proceeds as bounded supporting slices without reopening mega-backlog development.
