# M11 curriculum source context — 2026-10-16

Base: merged PR139 `d033fb17817059c92b824d7f34717809e7838488`.
Branch: `ctos/m11-reporting-continuation-20261016`.
Risk tier: High-Fidelity. Audience: teachers reviewing retained report drafts.

## Output contract

Capture the resolved curriculum reference alongside native draft evidence.
Changes to that reference must invalidate the source match even when grades
are unchanged. Unrelated curriculum versions must not invalidate pinned context.
Retained draft/source bytes remain immutable. Advance the source format version;
older versions remain readable but cannot claim a current source match.

Expected artifacts: native source collector, focused regressions, compact handoff.
Validators: focused Rust tests, rustfmt, native tests/Clippy and fresh CI.
Review: check tenant scope, legacy-null resolution and immutable-history behavior.
Failure behavior: explicit changed/unsupported-version status, never silent approval.
Acceptance: source-context regressions pass; no issuance or official applicability claim.

Implemented: source v2 captures only the resolved curriculum ID/name/citation;
pinned records ignore unrelated versions/default switches; legacy NULL records
capture the current default's reference. No schema or official policy changes.
Three new native regressions cover metadata changes despite unchanged projections,
retained evidence, pinned/unrelated context, legacy NULL references and v1 retention.
Focused `cargo test --lib curriculum_`: 18 passed; rustfmt passed.
Full native tests/Clippy and fresh CI pending. The prior merged PR139 baseline
passed 1,510 native and 1,565 frontend tests plus web build on this Windows host.
Versioned required-subject applicability, issuance/amendments and external/device
acceptance remain pending. This slice establishes source context, not official
curriculum applicability or release readiness.
