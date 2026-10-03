---
name: auth-authorization
description: Use when touching src-tauri/src/auth, commands/{auth,user}.rs, session handling, or adding any new command that reads or writes tenant-scoped data.
---

# Auth & Authorization

Read `docs/adr/0004-authentication-and-local-session.md` fully before
touching this area — it documents a real vulnerability that was found and
fixed once (unauthenticated `register_user`/`add_user_to_school` letting
anyone self-grant membership in an existing school). Do not reintroduce
an equivalent gap. Read `docs/adr/0036-rbac-foundation.md` too if the
change touches roles/capabilities at all.

Rules:

- Every new command that creates accounts/memberships must pass through
  an `authorize_*` gate in `auth/mod.rs`, except the two narrowly-scoped
  exceptions already documented in ADR-0004 (device's very first account,
  a school's very first membership).
- Every command reading/writing tenant data derives `school_id` from
  `SessionManager::require_active_school_scope` (or, when the command
  also needs a role check, `auth::authorize_capability` — see below,
  which returns `school_id` too), never accepts it as a parameter.
- **Role/capability checks** (ADR-0036, Wave 1A): never write a scattered
  `if role == "..."` check. Add a new `Capability` variant in
  `auth/mod.rs` and list its allowed roles in
  `Capability::allowed_roles()` — that match arm is the _only_ place a
  role is ever mapped to what it's allowed to do. Gate the command with
  `auth::authorize_capability(&conn, &sessions, Capability::Whatever)`
  instead of `require_active_school_scope`. A new _role_ (beyond
  Teacher/Registrar/School Head — Adviser, LIS Coordinator, ICT
  Coordinator, Master Teacher/Department Head, etc. are expected) is a
  new `role_repo` constant plus a migration widening
  `user_school_roles`'s `CHECK` constraint — never a redesign of the
  table, `Capability`, or `authorize_capability` itself, since a person
  can already hold more than one role in the same school (the table's
  primary key is `(user_id, school_id, role)`, not `(user_id,
school_id)`). Role membership must always be a fresh DB lookup
  (`role_repo::has_any_role`) — never cache it on `Session`, or a
  revoked/changed role stays effective until the process restarts, the
  same staleness bug class ADR-0004's session-revocation check already
  closes for session validity itself.
- **SQLite insert idempotency**: never use `INSERT OR IGNORE` when a
  `CHECK` constraint should still be able to reject the row — `OR IGNORE`
  silently swallows _any_ constraint violation, not just the intended
  primary-key/unique conflict (verified: an `INSERT OR IGNORE` violating
  a `CHECK` inserts 0 rows and raises no error at all). Use
  `INSERT ... ON CONFLICT (<columns>) DO NOTHING` instead — it only
  suppresses the named conflict target, so an actual `CHECK` failure
  still propagates as an error. Found by independent security review
  during Wave 1A's `role::grant()` (see `docs/VERIFICATION-DEBT.md`).
- Sessions are in-memory only, never survive a process restart, and are
  checked against both expiry and an independent DB revocation lookup.
- Password hashing is Argon2id; unknown-username and wrong-password paths
  must be timing-comparable (no username-enumeration oracle).
- Plaintext password `String`s are zeroized at the command boundary.

Any change here requires an independent security review before being
marked complete (fresh context — not the session that implemented it).
