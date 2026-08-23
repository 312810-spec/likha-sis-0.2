---
name: security-privacy
description: Use when touching authentication, encryption/key storage, session handling, tenant-scoped data access, or any test/demo fixture that resembles learner or teacher data.
---

# Security & Privacy

Full rules: `.claude/rules/security-privacy.md`. Read it before acting.

Non-negotiables:

- Synthetic data only, everywhere, always — no exceptions for "just a
  quick test."
- `school_id` (tenant scope) is never a client-supplied parameter for
  tenant-data commands — always derived from the authenticated session.
- Any command creating accounts/memberships must go through the
  `authorize_*` gate pattern (`docs/adr/0004-authentication-and-local-session.md`)
  — this exact gap (unauthenticated bootstrap) was found and fixed once;
  do not reintroduce it.
- Security must never rely on a UI element being hidden.
- Milestones touching auth, persistence, or sync require an independent
  review (fresh context, not the implementer) before being marked
  complete — use the `security-reviewer` and/or `reliability-reviewer`
  agents, and `completion-verification` before claiming done.

If running secret-scanning or dependency-security tooling, see
`docs/SOURCE-REGISTRY.md` for what's adopted (Gitleaks, cargo-deny,
OSV-Scanner) and `npm run quality:security`.
