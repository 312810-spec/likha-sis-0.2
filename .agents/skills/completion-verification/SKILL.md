---
name: completion-verification
description: Use before claiming any task, feature, or milestone is complete, fixed, or passing — before writing a completion report or updating docs/CURRENT-HANDOFF.md to say something is done.
---

# Completion Verification

Default assumption: **not done** until proven. Do not self-certify a
milestone that touches auth, persistence, encryption, or sync — those
require the `evaluator` agent (fresh context, starts at FAIL, inspects
evidence, does not trust the builder's summary) and/or a relevant
reviewer agent (`security-reviewer`, `architecture-reviewer`,
`reliability-reviewer`) before being marked complete.

Before claiming complete:

- Run the actual checks — `npm run quality` (or the tier that applies,
  see `.Codex/rules/testing.md`), `cargo test`, `cargo clippy -D
warnings` for Rust changes. Never write "tests pass" without having run
  them in this session.
- Inspect edge/error states, not just the happy path.
- State plainly what could NOT be verified (no browser tool, no device,
  no hardware) rather than implying coverage that didn't happen — log
  real gaps in `docs/VERIFICATION-DEBT.md`.
- Update `docs/CURRENT-HANDOFF.md`/`docs/ACTIVE-PLAN.md` only after the
  above, not before.

Report format (matches `AGENTS.md` Completion section): Completed /
Verified / Blockers-Risks / Memory-ADR changes / Exact next task. Nothing
else.
