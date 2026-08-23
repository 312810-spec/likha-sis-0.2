# ADR-0004 — Authentication & Local Session Foundation (M4)

Status: Accepted

## Context

M1–M3 proved persistence, encryption-at-rest, and an Application Services
layer, but every operation was implicitly trusted — a caller could ask
for any `school_id` and get that school's data, with no check on whether
it should be allowed to ask. That gap has to close before any real
teacher-facing feature is safe to build on top of it.

Authoritative product decision for this milestone (from the user):
shared school computers used by multiple teachers must be supported —
Windows OS accounts cannot be assumed to map 1:1 to teachers. Each
teacher has an independent LIKHA identity: username + password, hashed
with a modern memory-hard scheme, verified locally (no internet
dependency), with an explicit local session tied to teacher identity and
school scope. No Microsoft/Entra/AD/Hello/biometrics/internet dependency
for this milestone.

Ten scenarios were considered internally across three axes — session
persistence (in-memory-only vs. DB-persisted-and-resumable vs. hybrid),
password hashing library (`argon2` pure-Rust vs. `argonautica`
C-bindings vs. non-memory-hard schemes, rejected outright per the
product decision), and school-scope enforcement point (client-supplied
`school_id` re-checked server-side vs. `school_id` derived entirely
server-side from session vs. no explicit scope at all). The choices
below are the synthesis: Recommended in each dimension, with the
rejected alternatives and why.

## Decision

**Password hashing**: `argon2` (RustCrypto, pure Rust, no new native
build dependency — everything else in this project's native dependency
graph, SQLCipher/OpenSSL, is already enough native-build surface to
manage) using `Argon2::default()` (Argon2id v19, RFC 9106 recommended
minimum params). Rejected: `argonautica` (C bindings, another native
toolchain dependency, less actively maintained) and non-memory-hard
schemes (bcrypt/scrypt) — the product decision explicitly requires a
modern memory-hard scheme. The password hash is stored as its
self-describing PHC string (`$argon2id$v=19$...`, salt embedded) in a
single `password_hash` TEXT column — no separate salt column, no custom
format to get wrong.

**Timing-safe unknown-user handling**: a login for a username that does
not exist still runs a full Argon2id verification against a fixed dummy
hash before returning the same generic `authentication_failed` error a
wrong password would produce. Without this, response time alone would
reveal whether a username exists (real work only happens for real
users), even though the error message is already identical.

**Session model — Recommended: persisted row + in-memory gate, sessions
never survive a process restart.** A `sessions` table (`id`, `user_id`,
`school_id`, `created_at`, `expires_at`, `revoked_at`) is the durable,
revocable record. But the actual authorization decision on every
protected command is made against Tauri-managed state,
`Mutex<Option<Session>>` — exactly the same pattern as the M1 database
connection — which is always `None` the instant the process starts,
regardless of any un-revoked row sitting in the table. Sessions
fixed-expire 8 hours after creation (checked against
`SystemTime::now()` on the in-memory copy — no background timer, no
idle-activity tracking).

Rejected: **persist-and-auto-resume across restart** ("remember me").
This is the normal default for consumer apps, but it is actively wrong
for this product's stated deployment model — on a shared school
computer, an auto-resumed session would let the next person at the
keyboard continue as the previous teacher with no password prompt at
all. Rejected: **pure in-memory, no DB table at all** — loses the
ability to represent explicit revocation and any future audit trail for
close to zero benefit over the hybrid.

**School scope — Recommended: derived entirely from the session,
never accepted as a client-supplied argument for scoped operations.**
`list_learners_by_school`/`create_learner` Tauri commands drop their
`school_id` parameter entirely (a change from M1/M2's shape) and read
`school_id` from the current in-memory session instead. This is a
strictly stronger guarantee than "re-validate a client-supplied
`school_id`": there is no parameter to get wrong, forget to check, or
have a future refactor accidentally skip checking. Repository functions
underneath (`repository::learner::list_by_school`, etc.) are unchanged —
this only changes what the command layer is allowed to trust.

Rejected: keep `school_id` as a parameter and re-validate it against the
session. Strictly weaker — it adds a check that can be forgotten on a
future command, versus removing the possibility entirely.

**Bootstrap operations are unauthenticated only for the exact first-time
case that has no alternative.** There is a real chicken-and-egg problem
otherwise (nothing can ever create the first teacher account on a fresh
install). `register_school`/`list_schools` never needed gating — they
don't touch tenant data. `register_user` and `add_user_to_school` do, and
an earlier version of this design left them unconditionally
unauthenticated; the independent review caught that this let anyone with
UI access, zero credentials, enumerate schools via `list_schools`,
register a throwaway account, self-grant it membership in an _already
populated_ school via `add_user_to_school`, and log in to read that
school's real learner data — completely reproducing the pre-M4 gap. Fixed
by narrowing each gate to the one legitimate case it exists for:
`register_user` skips authentication only while zero user accounts exist
system-wide (`authorize_user_registration`); `add_user_to_school` skips
authentication only for a school's very first membership
(`authorize_school_membership_grant`) and otherwise requires an active
session already scoped to that same school. Every operation that touches
existing tenant data (`Learner`, or a second account/membership) requires
a session.

**No role/permission system.** A session carries exactly `user_id` +
`school_id`. There is no role, no permission list, no admin flag. The
one authorization rule implemented is "you must have an active session
scoped to the school whose data you're asking for." This is intentionally
the narrowest useful policy — extending it (e.g., a school-admin role)
is a future decision, not implied or blocked by this one: `Session` has
room to grow a `roles: Vec<String>` field later without restructuring
anything below it.

**Future cloud-authentication compatibility, without building it now.**
`users.id` is a UUIDv7 like every other entity in this schema, not tied
to any Windows/local-only concept. A future cloud identity provider can
add an optional `cloud_user_id` column and a linking flow without
touching `Session`, `Application Services`, or any UI code — the
session concept (an authenticated identity scoped to a school) is
already provider-agnostic in shape.

## Consequences

- `src-tauri/src/auth/` — `password.rs` (hash/verify), `mod.rs`
  (`Session`, `SessionManager` = the Tauri-managed `Mutex<Option<Session>>`
  gate; `require_active_school_scope(conn)` is the check every protected
  command calls first — it checks in-memory expiry AND an independent DB
  lookup of `revoked_at`, so a future revocation path that forgets to
  also clear the in-memory session still cannot leave it usable;
  `authorize_user_registration`/`authorize_school_membership_grant` are
  the bootstrap gates described above).
- `src-tauri/src/repository/{user,session}.rs` — persisted rows;
  `verify_credentials` never returns a password hash to its caller, only
  a `User`; `any_users_exist`/`school_has_any_members`/`is_revoked` back
  the authorization gates.
- `src-tauri/src/commands/{auth,user}.rs` — `login`/`logout`/
  `current_session`/`register_user`/`add_user_to_school`; plaintext
  password `String` arguments are zeroized after use at this boundary.
  `commands::learner::*` updated to require a session and derive
  `school_id` from it instead of accepting one.
- New migration (append-only, per ADR-0002's discipline): `users`,
  `user_school_memberships`, `sessions`.
- TS: `src/domain/user.ts`, `src/domain/session.ts`; `LearnerRepository`
  port methods drop their `schoolId` parameter to match; a new
  `AuthApplicationService` wraps `login`/`logout`/`currentSession`. The
  TS layer is a convenience/UX layer only — the real enforcement is the
  Rust command layer, proven by tests that call Rust directly with no
  session set and confirm rejection, independent of anything TypeScript
  does.
- Does not touch `src-tauri/src/db/` or `src-tauri/src/crypto/` —
  encryption-at-rest (ADR-0003) is unchanged; the new tables live in the
  same encrypted database.
- No password reset, no account lockout after repeated failures, no
  idle-timeout (only fixed 8-hour expiry), no audit log UI — none of
  these were required for this milestone's "smallest complete reusable
  foundation" scope; each is addable later without restructuring what's
  built here.
