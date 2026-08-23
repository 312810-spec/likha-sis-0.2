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
