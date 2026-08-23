# Security & Privacy

- Synthetic data only — in development, tests, fixtures, screenshots,
  demos, and anything AI-assisted. Never real learner/teacher PII, ever,
  for any reason including "just for a quick test."
- The working SQLite database is SQLCipher-encrypted; the key is
  DPAPI-protected and fails closed on a corrupted/undecryptable key file —
  never silently mint a replacement key. See
  `docs/adr/0003-encryption-at-rest.md` before touching `src-tauri/src/crypto/`
  or `src-tauri/src/db/`.
- Auth: Argon2id hashing, timing-safe unknown-user handling, sessions
  in-memory only (never survive a process restart), checked against both
  expiry and independent DB revocation. Any command that creates
  accounts/memberships or touches tenant data must go through the
  `authorize_*` gate pattern in `docs/adr/0004-authentication-and-local-session.md`
  — an earlier draft shipped an unauthenticated bootstrap path that let
  anyone self-grant access to an existing school; this was caught by
  review once and must not be reintroduced.
- Security must never rely on UI hiding a control — enforce at the
  Rust/repository/session boundary, not by omitting a button.
- No paid infrastructure, APIs, or services without the user's explicit
  approval — this includes security-tooling defaults that phone home for
  a paid tier (see `docs/SOURCE-REGISTRY.md` for what's actually adopted
  and its network/privacy behavior).
- Hooks (PreToolUse pattern checks for secrets/PII-shaped fixtures) are
  defense-in-depth only, not a privacy guarantee — the real guarantees
  come from encrypted storage, the authorization boundary, fixtures
  discipline, and code review. Do not claim a simplistic pattern-matching
  hook "solves" PII protection.
- Milestones touching auth, persistence, or sync get an independent
  security/reliability review (a fresh reviewer agent, not the same
  context that implemented it) before being marked complete.
