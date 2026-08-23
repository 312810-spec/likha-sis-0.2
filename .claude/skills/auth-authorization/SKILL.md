---
name: auth-authorization
description: Use when touching src-tauri/src/auth, commands/{auth,user}.rs, session handling, or adding any new command that reads or writes tenant-scoped data.
---

# Auth & Authorization

Read `docs/adr/0004-authentication-and-local-session.md` fully before
touching this area — it documents a real vulnerability that was found and
fixed once (unauthenticated `register_user`/`add_user_to_school` letting
anyone self-grant membership in an existing school). Do not reintroduce
an equivalent gap.

Rules:

- Every new command that creates accounts/memberships must pass through
  an `authorize_*` gate in `auth/mod.rs`, except the two narrowly-scoped
  exceptions already documented in the ADR (device's very first account,
  a school's very first membership).
- Every command reading/writing tenant data derives `school_id` from
  `SessionManager::require_active_school_scope`, never accepts it as a
  parameter.
- Sessions are in-memory only, never survive a process restart, and are
  checked against both expiry and an independent DB revocation lookup.
- Password hashing is Argon2id; unknown-username and wrong-password paths
  must be timing-comparable (no username-enumeration oracle).
- Plaintext password `String`s are zeroized at the command boundary.

Any change here requires an independent security review before being
marked complete (fresh context — not the session that implemented it).
