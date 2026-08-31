# LIKHA-SIS 0.2 — Claude Code

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

The Claude Code harness is **LIKHA Production Harness v2.0 — certified and locked**
(`docs/adr/0054-final-harness-v2-certification.md`). Do not open a new
tooling/MCP/plugin/agent/skill/hook optimization wave. Change it only
for a production blocker, an important security/correctness defect, a
genuinely missing capability, a retained component becoming
insecure/obsolete/incompatible, or benchmarked evidence of substantial
improvement — never for popularity or novelty. Reusable, non-LIKHA
parts are extracted to `docs/harness/` and the separate ProjectForge
repository; LIKHA does not depend on ProjectForge at runtime.

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

**Default mode is Autonomous Wave Development** — see
`.claude/rules/autonomous-development.md` for the full loop and rules.
Work autonomously within the active wave. After that wave's final CI is
green, record the checkpoint, produce the wave summary, identify the
exact next slice, and **stop**. Do not begin another wave until the user
asks to continue. Genuine approval and safety gates can still stop a
wave earlier.

**Standing owner authorization:** automatically commit and push/sync
the action-managed branch, open its PR, and squash-merge without asking.
Never write directly to `main`, force-push/rebase, or bypass/admin-merge.
Merge only after Quality and Security pass for the exact SHA; otherwise
fix or report the blocker and stop.

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

## Wave completion reports

After a wave's final CI completes green, produce a copy-ready Markdown
delivery report for that wave. Keep it **outside tracked source
changes** — write it to the sibling directory
`../LIKHA-SIS-DELIVERY-REPORTS/WAVE-<id>-FINAL-REPORT.md` (or a
git-ignored path such as `.planning/`), never into `docs/` or anywhere
that would land in the wave's own commit. The report must be complete
and self-contained (no "see above"/link-only), state repository truth
before/after, list what shipped, the verification actually run, the
independent reviews and their outcomes, the checkpoint commit + CI run
ids, retained debt, and the exact next slice. Do not let writing it
modify or invalidate the checkpoint it documents.

After the report is written and the wave's final CI is confirmed green,
relay it to the durable ChatGPT-to-Claude bridge (PR #1) by running:

```
npm run relay:wave-report -- --report <path-to-report> --sha <checkpoint-sha> --branch <branch>
```

(`scripts/relay-wave-report.mjs`; see `docs/adr/` if a relay ADR exists,
otherwise the script's own header comment is authoritative.) The script
independently re-confirms CI is green for that SHA, refuses to post a
duplicate for a SHA already relayed, and never mentions `@claude`. If the
relay fails for any reason (`gh` missing/unauthenticated, report
missing/empty/too large, CI not confirmed, GitHub rejects the comment),
record the relay failure in the handoff and stop — do not begin the next
wave with an unrelayed report. Use `--dry-run` to preview a comment
without posting.
