# Provider-neutral capability routing

Goal: maximize accepted work per token/minute without weakening LIKHA safety.

The repository defines capability tiers, not vendor/model bindings: Scout, Specialist/Builder, Senior Reviewer, and Apex Planner. The active AI/runtime may map available models or tools to those tiers and may change that mapping without an architecture change.

## Rules

- Use the cheapest capable tier that can safely complete the bounded task.
- Escalate for high-risk decisions, unresolved ambiguity, or after the two-attempt debugging budget.
- Gather targeted evidence before escalation; do not ask an expensive planner to rediscover the repository.
- Major/high-risk planning uses a compact Planning Packet and, when useful, Prompt Master.
- Independent review is proportional to security/correctness/compliance risk.
- No model/provider is a required control plane.
- Runtime bindings must never alter privacy, security, architecture, approval, or verification requirements.

## Risk map

LOW: docs, formatting, mechanical refactors, proven patterns → Scout or Specialist.

MEDIUM: normal UI/application/adapters and non-sensitive persistence → Specialist; Senior review when cross-cutting ambiguity remains.

HIGH: auth/RBAC, encryption/key storage, sync/conflicts, tenant isolation, learner PII, destructive migrations, official forms, major schema/provider/dependency choices → focused research/specialists → compact plan → Apex planning when justified → Senior challenge → bounded builder → full affected verification.

See `.agents/skills/model-routing/SKILL.md` for the operational contract and `docs/harness/PLANNING-PACKET-TEMPLATE.md` for major planning input.
