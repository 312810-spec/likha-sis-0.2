# LIKHA-SIS 0.2 — Codex

## Mission

Build a production-grade, teacher-centered SIS for Philippine DepEd schools.

Priority:
security/privacy → correctness → DepEd compliance → teacher usability → offline reliability → maintainability → zero billing → performance → speed

## Product

- Native-first, local-first, offline-capable
- Windows first; Android later
- React + TypeScript + Tauri 2
- SQLite is the device working database
- Cloud sync is separate
- Provider-specific code stays behind interfaces/adapters
- Synthetic data only

## Architecture

UI → Application Services → Domain → Repository Ports → Infrastructure/Platform Adapters → SyncProvider → Cloud

Rules:

- UI/domain must not directly depend on Tauri, SQLite, Cloudflare, or another provider.
- Offline writes save locally first.
- Business logic stays outside UI.
- Security must not rely on UI hiding.
- School isolation must be enforced at a trusted boundary.

## Teacher Experience

Efficient / Comfortable / Guided. Comfortable is default. All modes keep functional parity.

## Engineering

At session start read:

1. `docs/PROJECT-MEMORY.md`
2. `docs/CURRENT-HANDOFF.md`
3. `docs/ACTIVE-PLAN.md`
4. only ADRs/docs relevant to the current task

Detailed, topic-specific rules live in `.claude/rules/` (architecture,
security-privacy, testing, project-state, autonomous-development) and
narrowly-triggered procedures live in `.claude/skills/` — read the
relevant one when the task matches it rather than expecting this file to
contain everything.

Inspect code before changing it.

Method:
Inspect → Research if needed → Specify → Implement → Test → Review → Record

Rules:

- Small, reversible changes.
- No unrelated refactors.
- TDD for important domain, security, persistence, and sync logic.
- Never claim checks passed unless they actually ran.
- Never add paid infrastructure/APIs without explicit approval.
- Record durable decisions in ADRs.
- Keep this file concise.
- Never reopen a milestone already marked complete without a new
  instruction to do so.

**Default mode is Autonomous Continuous Development** — see
`.claude/rules/autonomous-development.md` for the full loop and rules.
In short: a completed milestone is a checkpoint, not a stopping point.
Verify it, record it, then autonomously select and continue to the next
highest-value work using LIKHA's priority order above. Stop only for a
genuine human approval gate (irreducible product-policy choice, external
material only the user can provide, paid infrastructure, a production
PII/security gate, a destructive/irreversible operation, unresolvable
missing compliance evidence, explicit user instruction to stop) or a
practical session/context boundary — never merely because an M-number
completed.

## Completion

Before marking work complete:

- run relevant tests;
- run affected lint/type/build checks;
- inspect edge/error states;
- review security/privacy impact;
- update project state docs when the milestone materially changes.

Report only:

- Completed
- Verified
- Blockers/Risks
- Memory/ADR changes
- Exact next task
