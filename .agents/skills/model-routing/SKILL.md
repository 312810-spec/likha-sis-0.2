---
name: model-routing
description: Route planning, research, implementation, debugging, and review by capability and risk rather than by provider name. Use before major/high-risk work, difficult debugging, or multi-agent planning.
---

# LIKHA capability routing

Purpose: maximize correctness per token and useful work per minute without making LIKHA depend on any AI vendor, model family, IDE, or agent runtime.

## Core rules

1. Route by capability and risk, never by a hard-coded provider or model name.
2. Build a compact evidence packet before escalating to a stronger reasoning tier.
3. Use content-aware retrieval: task/diff/search first, then the smallest relevant ranges.
4. A retry requires new evidence or a materially different hypothesis.
5. The harness remains evolving; benchmark and replace runtime bindings without changing repository architecture.

## Capability tiers

### Scout

Fast, inexpensive discovery and extraction: file/commit triage, search summaries, structured extraction, formatting, and repetitive low-risk work. Scouts never decide architecture, security, schema, policy, PII, or official-form semantics.

### Specialist / builder

Default for implementation from an approved contract, focused synthesis, normal domain/application work, UI implementation, and tests around established patterns.

### Senior reviewer

Use for difficult debugging, security/architecture challenge, and unresolved cross-cutting tradeoffs after bounded evidence collection.

### Apex planner

Use only for major/high-risk/cross-domain planning where stronger reasoning materially reduces risk or rework. The planner receives a scoped Planning Packet rather than repository-wide context and normally returns Recommended + Next Best, assumptions, risks, ordered slices, stop conditions, and verification gates.

The active runtime may bind any available model/provider/tool to these tiers. Bindings are operational configuration, not durable architecture.

## Risk routing

- LOW: docs, styling, repetitive tests, mechanical refactors using proven patterns → Scout or Specialist.
- MEDIUM: UI workflows, application services, adapters, non-sensitive persistence following established patterns → Specialist; escalate only for unresolved cross-cutting tradeoffs.
- HIGH: auth/RBAC, encryption/key storage, sync/conflicts, tenant isolation, learner PII, destructive migrations, official forms, major schema/provider/dependency choices → focused specialists/research → Prompt Master/evidence packet when useful → Apex planning → independent Senior review → bounded builder → affected verification.

## Evidence funnel

Scout → focused specialists when needed → compact Planning Packet → planner only when justified → independent challenge proportional to risk → bounded builder → independent verification.

No downstream worker repeats completed discovery unless new evidence invalidates it.

## Context budget

- Scout return: target <=300 words.
- Specialist return: target <=800 words unless evidence requires more.
- Planning Packet: target <=3,000 words unless HIGH risk requires more.
- Prefer diffs/functions/ranges over whole files.
- Never load whole `ACTIVE-PLAN.md`, `CURRENT-HANDOFF.md`, `PROJECT-MEMORY.md`, `SOURCE-REGISTRY.md`, or the whole repository by default.

## Debugging budget

For one failure mechanism, allow at most two evidence-based attempts before changing strategy or escalating. Attempt 2 must use new evidence or a materially different hypothesis. Never weaken privacy, security, architecture, data integrity, or required verification merely to pass.

## Tool freshness

When adding, replacing, or materially revisiting an external tool, dependency, action, plugin, skill, MCP, framework, or runtime binding:

1. check the current stable official release and relevant security/compatibility notes;
2. compare against the retained version;
3. change only when compatible and beneficial;
4. avoid unrelated version churn;
5. record durable evidence when the decision matters.

## Builder contract

For non-trivial implementation, define: task/outcome, risk, authorized areas, evidence to read first, reusable pattern, architecture/security invariants, non-goals, required tests, verification commands, stop conditions, and required return evidence.

Stop on architecture conflict, correctness-changing ambiguity, unapproved dependency/provider/schema choice, uncontracted security-boundary change, possible learner-PII exposure, unrelated repository changes, destructive actions, or unavailable required verification.

## CI discipline

Optimize for fast evidence, not fewer protections. Run cheap deterministic checks before expensive browser/native work; use affected-work routing; keep security scanning independent and fail-closed; retain full/manual checkpoints for relevant high-risk boundaries.
