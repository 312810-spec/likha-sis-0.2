# LIKHA Planning Packet Template

Use for major/high-risk planning before Prompt Master or an Apex Planner. Keep the completed packet <= 3,000 words unless HIGH-risk evidence genuinely requires more.

## Outcome

What must be true when the work is complete?

## Risk

LOW | MEDIUM | HIGH, with the reason.

## Repository truth

Only the smallest verified facts needed for this decision. Include relevant paths, symbols, tests, current failures, and durable decisions.

## Product / teacher job

What is the teacher or authorized school user trying to finish? What workflow should be eliminated, generated, reused from existing data, performed locally, or simplified?

## Invariants

Architecture, privacy/security, DepEd/compliance, offline/local-first, zero-billing, accessibility, and platform constraints that cannot be violated.

## Authorized scope

Files/areas allowed to change. State explicit non-goals.

## Evidence / research

Current authoritative sources and strong OSS evidence when the decision requires research. Note unknowns rather than guessing.

## Options method

For LIKHA major architecture/database/sync/auth/hosting/framework/security/repository/dependency choices: generate the required viable scenarios internally, score against LIKHA priorities, challenge the strongest candidates, and present only Recommended + Next Best unless more options are requested.

## Recommended / Next Best

State the decision candidates, tradeoffs, reversibility, and why they fit LIKHA.

## Ordered implementation contracts

Small reversible slices, each with outcome, authorized areas, acceptance criteria, required tests, and rollback/recovery consideration.

## Verification

Exact relevant checks: unit/integration/UI/accessibility/native/security/recovery/offline/authorization as risk requires. Never claim a check passed unless it ran.

## Stop conditions

Human approval required for paid infrastructure/APIs, destructive or irreversible operations, production PII/security gates, unresolved compliance evidence, material scope expansion, or a genuine product-policy choice not settled by the packet.

## Return evidence

Files changed, tests changed, commands actually run, results, unverified items, blockers/risks, durable ADR/memory changes, and exact next task.
