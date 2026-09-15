# LIKHA-SIS 0.2 — Agent Guide

## Mission

Build a production-grade, teacher-centered SIS for Philippine DepEd schools.

Priority: privacy/security → correctness → DepEd compliance → teacher usability → offline reliability → maintainability → zero billing → performance → speed.

## Product invariants

- Native-first, local-first, offline-capable; Windows workstation first, Android teacher companion later.
- React + TypeScript + Tauri 2; SQLite is the device working database; sync is separate.
- UI/domain do not depend directly on Tauri, SQLite, Cloudflare, or another provider.
- Offline writes save locally first; business logic stays outside UI.
- Security is enforced at trusted boundaries; school isolation is mandatory.
- Synthetic data only in development, tests, demos, screenshots, and AI prompts.
- Efficient / Comfortable / Guided retain functional parity.

## Context rule

Do not reread the repository or giant project-memory files by default.

1. Start from the task, current diff, and changed paths.
2. Search/find the smallest relevant sections of project memory, handoff, active plan, ADRs, code, and tests.
3. Read the matching skill in `.agents/skills/` only when needed.
4. Expand context only when evidence is insufficient, conflicting, or stale.
5. Reuse settled evidence; do not rediscover it without a reason.

## Harness philosophy

Read `docs/harness/HARNESS-PRINCIPLES.md` for substantial harness work and `.agents/skills/model-routing/SKILL.md` for major/high-risk planning.

The harness is living and provider-neutral. It grows only when measured value exceeds its context, maintenance, CI, and failure cost. Prefer deleting overlap over adding another layer.

Prompt Master prepares major plans from compact evidence packets. Use the cheapest capable worker for bounded tasks and stronger reasoning only when risk, ambiguity, or failed bounded attempts justify it. Model/provider names are runtime bindings, not architecture.

## Debugging

For one failure mechanism, allow at most two evidence-based attempts. Attempt 2 requires new evidence or a materially different hypothesis. Then change mechanism, use a safe workaround, escalate, or mark blocked. Never weaken privacy, security, architecture, data integrity, or required verification to pass.

## Tool freshness

When adding, replacing, or materially revisiting a tool/dependency/action/skill/framework, check its current stable official release plus relevant security/compatibility notes. Do not churn unrelated tools merely because a newer version exists.

## Engineering loop

Inspect → Research if needed → Specify → Implement → Test → Review → Record.

- Small reversible changes; no unrelated refactors.
- TDD for important domain/security/persistence/sync logic.
- Narrow checks first; expand verification with risk.
- CI fails cheap and fast before expensive native/browser work.
- Never claim a check passed unless it ran.
- No paid infrastructure/API without explicit approval.
- Record durable architecture/product decisions in ADRs.

## Completion

Run relevant tests/checks, inspect failure/offline states, review privacy/security impact, and update durable project state when materially changed.

Report only the useful summary: completed, verified, blockers/risks, durable changes, next task.
