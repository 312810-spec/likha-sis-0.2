---
name: deped-compliance
description: Use when a feature must match Philippine DepEd policy, terminology, workflow, or reporting requirements.
---

# DepEd Compliance

Do not implement DepEd-specific behavior (enrollment rules, learner
reference numbers, reporting periods, terminology) from memory or
assumption — training data may be stale or simply wrong about current
DepEd policy, and getting this wrong has real compliance consequences for
a school-facing product.

Before implementing: dispatch the `deped-researcher` agent to find and
cite the current authoritative source (DepEd Order, official memorandum,
or DepEd-published form/manual). Implement against what it finds, with
the source recorded in code comments or the relevant ADR — not against a
guess.

If no authoritative current source can be found, say so explicitly and
flag it rather than implementing a plausible-looking guess. Synthetic
data only for any fixture/test resembling DepEd forms or learner records.

**Known environment limits, don't rediscover these each session**: direct
`WebFetch` of `deped.gov.ph` is blocked by this environment's network
egress policy (confirmed 2026-08-25) — triangulated `WebSearch` results
plus secondary sources are the fallback, and must be disclosed as
secondary-sourced (not primary-source-verified) rather than upgraded to
"confirmed" in an ADR. `deped-researcher` has hit this project's
recurring agent-resume/retrieval failure (documented since M7) on
multiple occasions — retry once via `SendMessage`, then substitute direct
`WebSearch`/`WebFetch` yourself rather than retrying further.
