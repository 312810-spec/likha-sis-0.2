# LIKHA-SIS 0.2 — Development Harness

## Mission

Build a production-grade, teacher-centered SIS for Philippine DepEd schools.

Priority: privacy/security → correctness → DepEd compliance → teacher usability → offline reliability → maintainability → zero billing → performance → speed.

## Product invariants

- Native-first, local-first, offline-capable.
- Windows workstation first; Android teacher companion later.
- React + TypeScript + Tauri 2; SQLite is the device working database.
- UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud.
- Offline writes save locally first. Provider code stays behind adapters. Business logic stays outside UI.
- Synthetic data only in development, tests, demos, screenshots, and AI prompts.
- Security is enforced at trusted boundaries. School isolation is mandatory.
- Efficient / Comfortable / Guided retain functional parity; Comfortable is default.

## AI/app independence

The harness belongs to LIKHA, not to an AI vendor, model, IDE, coding app, or agent runtime.
The owner chooses the active AI/app at runtime. Repository rules must not require Claude, ChatGPT, Codex, Gemini, Copilot, or another provider to function.
Provider-specific folders/configuration may exist only as optional adapters. Deterministic tests, CI, architecture, security rules, planning packets, and durable project knowledge remain provider-neutral.
Never assume the current AI/app from historical files or prior sessions.

## Context discipline

Do not reread the repository. Build context progressively:

1. inspect the task and current diff;
2. search/find the exact concept, symbol, decision, or failure;
3. read the smallest useful ranges;
4. expand only when evidence is insufficient, stale, or conflicting.

Never load whole large memory/plan files by default. Carry forward compact evidence, not transcript history.

## Living harness

The harness stays `evolving`. Keep verified checkpoints but never freeze improvement because a score once reached 100.
Prefer fewer, stronger, reusable capabilities over overlapping agents, skills, hooks, plugins, or scripts.
Add tooling only when measured value exceeds context, maintenance, security, and CI cost.

When adding/replacing/materially revisiting an external tool, fetch its current stable version and relevant official release/security/compatibility notes. Upgrade only when beneficial and compatible. Do not churn unrelated dependencies.

## Capability routing

Route by capability and risk, not vendor/model name. See `docs/harness/MODEL-ROUTING.md`.

- Scout: cheap/fast discovery and extraction.
- Specialist/builder: normal implementation from a bounded contract.
- Senior reviewer: difficult debugging and high-risk challenge.
- Apex planner: only major/high-risk/cross-domain planning where stronger reasoning materially reduces risk or rework.

The owner/runtime may map any available AI/model/app to these roles.

## Debugging budget

For one failure mechanism, allow at most two evidence-based attempts. Attempt 2 requires new evidence or a materially different hypothesis. After two failures, change mechanism, use a safe workaround, escalate, or mark blocked.
Never weaken privacy, security, architecture, data integrity, or required verification to make a workaround pass.

## Engineering loop

Inspect → Research if needed → Specify → Implement → Test → Review → Record.

- Small reversible changes; no unrelated refactors.
- TDD for important domain/security/persistence/sync logic.
- Narrow checks first; expand verification with risk.
- CI fails fast before expensive native/browser work.
- Never claim a check passed unless it ran.
- No paid infrastructure/API without explicit approval.
- Durable decisions go to ADRs; durable project state goes to memory/plan/handoff.

## Completion

Before completion: run relevant checks; inspect edge/error/offline states; review security/privacy impact; use independent review where risk requires it; update durable state when materially changed.

User-facing summary is non-technical by default: what improved, what was verified, remaining risk/blocker, and what comes next.
