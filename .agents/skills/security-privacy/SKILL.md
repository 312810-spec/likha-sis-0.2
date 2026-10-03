---
name: security-privacy
description: Use when touching authentication, encryption/key storage, session handling, tenant-scoped data access, or any test/demo fixture that resembles learner or teacher data.
---

# Security & Privacy

Use current `AGENTS.md`, relevant authorization/key-storage source and tests.
These are application behavior checks, not legal-policy development gates.

Engineering checks:

- Use synthetic data in development, tests, demonstrations and AI prompts.
- `school_id` (tenant scope) is never a client-supplied parameter for
  tenant-data commands — always derived from the authenticated session.
- Any command creating accounts/memberships must go through the
  `authorize_*` gate pattern (`docs/adr/0004-authentication-and-local-session.md`)
  — this exact gap (unauthenticated bootstrap) was found and fixed once;
  do not reintroduce it.
- Security must never rely on a UI element being hidden.
- Use independent challenge when an auth, persistence or sync change warrants it.
  Choose available capabilities; no named reviewer, agent definition or approval
  ceremony is required for ordinary development. Report review limits honestly.

If running secret-scanning or dependency-security tooling, see
`docs/SOURCE-REGISTRY.md` for what's adopted (Gitleaks, cargo-deny,
OSV-Scanner) and `npm run quality:security`.
