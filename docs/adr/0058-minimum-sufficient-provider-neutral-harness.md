# ADR-0058: Minimum Sufficient, Provider-Neutral Harness

- Status: Accepted
- Date: 2026-09-15
- Scope: Harness philosophy, orchestration, CI, context, provider independence

## Context

The 0.2 harness accumulated useful safety and review patterns but also vendor-specific configuration, duplicated surfaces, broad context loading, and CI work that could slow feedback. The owner authorized a living harness and now explicitly requires the harness to be provider-neutral, token-efficient, content-aware, fast, and free of Claude dependency.

A ten-perspective review and twenty-scenario comparison were applied to the harness itself. The strongest design was not a larger orchestration framework; it was a smaller evidence-driven control plane that preserves strong verification while progressively disclosing context and compute.

## Decision — Recommended

Adopt the **Minimum Sufficient Harness** defined in `docs/harness/HARNESS-PRINCIPLES.md`.

- `AGENTS.md` is the provider-neutral root instruction surface.
- `.agents/skills/` is the provider-neutral reusable skill surface.
- `.agents/reviewers/` contains narrow specialist reviewer definitions.
- `.harness/` stores measurable harness state/inventory/score evidence.
- GitHub Actions and package scripts remain the deterministic CI control plane.
- `.claude/`, `CLAUDE.md`, Claude-specific plugins, settings, and hooks are removed from the required harness.
- Model routing uses capability tiers and benchmarks rather than vendor identity.
- Major/high-risk planning may use Prompt Master plus the best measured planner, but routine work bypasses that cost.
- The harness remains `evolving`; verified checkpoints never lock future improvement.

## CI decision

Prefer GitHub-native path/change routing, concurrency cancellation, caches, and existing scripts before adding a CI framework. Expensive browser/native checks follow cheap deterministic gates. Security scanners remain independent and fail-closed.

## Next Best

If measured repository growth makes native affected routing insufficient, pilot a small dependency-aware task graph with local caching. Do not enable paid remote orchestration by default.

## Rejected patterns

- permanent harness lock/certification as a freeze;
- vendor-specific harness as the source of truth;
- open-ended agent swarms;
- whole-repository or whole-memory default context;
- repeated full CI after every tiny change;
- retry-until-green debugging;
- adding frameworks, MCPs, plugins, hooks, or agents without a measured gap;
- paid remote CI/orchestration by default.

## Consequences

The harness becomes smaller and easier to move between model providers. Some vendor-specific convenience hooks disappear; their critical protections must live in deterministic repository checks, CI, permissions, and explicit approval boundaries instead. Harness quality is measured by delivery outcomes and regression prevention, not component count.
