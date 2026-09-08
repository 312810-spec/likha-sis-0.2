# ADR-0070 — Secondary structural-lock PIN

Status: Accepted (foundation + one wired gate). Ports the master-task
inventory's Tier 1.2 "Secondary PIN Lock" item
(`docs/product/MASTER-TASK-INVENTORY.md`), itself a port of
`likha-sis-master`'s `settingsLock.js`.

## Context

The legacy `likha-sis-master` reference codebase has a client-side
"settings lock": a short PIN, derived with Web Crypto PBKDF2-SHA256 at
150,000 iterations, that must be re-entered before certain
administrative screens (school identity, curriculum tracks, calendar
structures) can be edited. It exists to guard against two failure
modes, neither of which is "an unauthorized person logging in": (1) an
accidental edit by someone who is legitimately logged in but clicked the
wrong thing, and (2) an already-authenticated, unattended terminal being
used by someone who happens to be standing in front of it. Both are real
risks in a shared school-office computer environment, distinct from the
login/session boundary `auth::authorize_capability` already covers.

This project's `.claude/rules/architecture.md` and
`.claude/rules/security-privacy.md` require that any real security gate
live at the Rust/repository boundary, never rely on the frontend hiding
a button, and that key derivation and raw SQL both stay out of the
frontend entirely. Porting `settingsLock.js` verbatim (a client-side
`localStorage`-backed check) would violate all three, so this ADR
decides the Rust-side mechanism this codebase actually ships, keeping
the legacy code's cryptographic _parameters_ (PBKDF2-SHA256, 150,000
iterations) but relocating the boundary of enforcement.

## Decision

**A structural-lock PIN is a per-school, optional, second short secret,
verified server-side (Rust), that grants the CURRENT session a
short-lived (5-minute) "unlocked" window before a structural mutation
command will proceed.** It is explicitly NOT a second authentication
system:

- It never creates, replaces, or extends a login session.
- It is not a `Capability` a role either has or lacks — any
  authenticated member of the school may attempt to unlock it (knowing
  the combination is the only bar), while _configuring_ the PIN itself
  (`set_structural_lock_pin`/`clear_structural_lock_pin`) IS
  capability-gated (`Capability::ManageStructuralLock`, School Head
  only) since that is an administrative act, not an unlock attempt.
- A school that never sets a PIN sees zero behavior change — this
  feature is opt-in, matching this project's established "no new UX a
  teacher would see unless they opted in" precedent (ADR-0069's
  enrollment ceremony reasons the same way).

### Mechanism

1. **Storage**: one row per school in `structural_lock_pins`
   (`school_id` primary key, `salt` (16 bytes), `hash` (32 bytes),
   `iterations`) — never the plaintext PIN. Migration 42.
2. **Derivation**: `crypto::pin_lock::derive_pin_hash`/`verify_pin` —
   PBKDF2-SHA256, 150,000 iterations (matching `settingsLock.js`
   exactly), a fresh random 16-byte salt per PIN, constant-time
   comparison (`subtle::ConstantTimeEq`) on verify. Deliberately a
   _different_, lighter derivation than the primary Argon2id login path
   (`auth::password`): this PIN is re-entered far more often during an
   already-authenticated session to gate a UI action, not a login, so
   sub-second latency matters more here, and the threat model (a second
   short secret gating a specific mutation, not the sole credential
   guarding an account) is narrower than a login password's.
3. **Session-side unlock state**: `auth::Session` gained
   `structural_lock_unlocked_until: Option<SystemTime>`, set by
   `SessionManager::unlock_structural_lock` (private, called only from
   `auth::verify_structural_lock_pin` on a correct PIN) to
   `now + STRUCTURAL_LOCK_UNLOCK_WINDOW` (5 minutes). Never persisted —
   exactly like the rest of `Session`, it lives only in the running
   process's memory and is gone on restart or logout.
4. **The gate**: `auth::require_structural_lock_unlocked(conn,
sessions)` — called BY a structural-mutation command IN ADDITION TO
   its ordinary `Capability` check, never instead of one. Fails closed:
   no session → `Unauthorized`; a PIN configured but not currently
   unlocked (never verified, or the 5-minute window elapsed) →
   `Unauthorized`; no PIN configured for this school at all → succeeds
   immediately (opt-in, per the Decision above).
5. **Tauri commands** (`commands::structural_lock`): `set_structural_lock_pin`,
   `clear_structural_lock_pin`, `has_structural_lock_pin` (frontend
   reads this to decide "Set a PIN" vs. "Enter PIN" prompting — never an
   enforcement decision), `verify_structural_lock_pin` (returns `false`,
   not an error, for a wrong PIN or an unconfigured school — a wrong
   guess is not itself an authorization failure the way a missing
   session is).

### What is gated today, and what is deliberately not yet

The master-task item names three target screens: school identity,
curriculum-version, and calendar-structure edits. Before wiring
anything, this codebase was searched for editing commands in each area:

- **School identity**: `commands::school::set_school_logo`/
  `clear_school_logo` (branding) is the one existing school-identity
  _mutation_ command. **Wired** — both now call
  `auth::require_structural_lock_unlocked` alongside their existing
  `ManageSchoolBranding` capability check.
- **Curriculum-version edits**: no command exists anywhere in this
  codebase that edits a `curriculum_versions` row — the two seeded rows
  are read-only reference data today (`repository::curriculum` only
  exposes `list_versions`/`default_version_id`/`version_exists`, no
  `update`). There is nothing to gate.
- **Calendar-structure edits**: no school-calendar feature exists yet
  at all (tracked as an unbuilt Tier 3 item in
  `docs/product/MASTER-TASK-INVENTORY.md`). There is nothing to gate.

**This ADR deliberately does not invent editing commands for the latter
two just to have something to wire the gate to** — `.claude/rules/autonomous-development.md`'s
scope discipline ("avoid unrelated refactors," "do not broaden a
milestone merely because capacity is available") applies directly.
`auth::require_structural_lock_unlocked` is a stable, reusable,
already-tested primitive; the moment a real curriculum-version-edit or
calendar-structure-edit command is built, it calls this same function
the same way `set_school_logo` already does. This is recorded as the
concrete next step for each of those two features once they exist, not
silently dropped.

## Alternatives considered

- **Client-side-only PIN (a closer literal port of `settingsLock.js`,
  e.g. a hash compared in the frontend, backed by `localStorage`).**
  Rejected outright: this violates `.claude/rules/security-privacy.md`'s
  "security must never rely on UI hiding a control" and
  `.claude/rules/architecture.md`'s "no key derivation or raw logic in
  the frontend" as directly as a design choice can. A user with
  DevTools access (trivial in a webview-based desktop app) could bypass
  it entirely; it would provide the _appearance_ of a gate with none of
  the substance.
- **Treating the PIN as a `Capability`-holding role check instead of a
  session-local unlock window.** Rejected: a role check answers "who is
  this person," which `authorize_capability` already answers correctly
  for these commands (School Head for branding). The PIN answers a
  different question — "does the person already known to be authorized
  also currently know this second secret" — conflating the two would
  make an already-School-Head session permanently exempt from the PIN,
  defeating the "unattended terminal" threat model the whole feature
  exists for.
- **A longer or shorter unlock window than 5 minutes.** No DepEd or
  project-specific policy source dictates a number; 5 minutes was
  chosen as a conservative default long enough to complete one
  branding/identity edit without repeated re-entry, short enough that
  walking away from an unlocked terminal has a bounded exposure window.
  Not treated as final — easy to tune later (`STRUCTURAL_LOCK_UNLOCK_WINDOW`
  is a single named constant) if real teacher usage shows it's wrong in
  either direction.
- **Rate-limiting / lockout on repeated wrong PIN guesses, matching
  `auth::password`'s account-lockout behavior.** Deliberately deferred,
  not silently promised. A 4-32 character PIN is a weaker secret than a
  full login password, and in principle deserves brute-force mitigation
  of its own. This was left out of this slice because: (a) the caller
  who could attempt this is already an authenticated session (the login
  layer's own lockout already gates getting that far), narrowing the
  realistic threat to "a legitimate but curious colleague guessing at
  the terminal," and (b) no established pattern for a _second_,
  independent lockout counter exists in this codebase yet to reuse
  without inventing one from scratch. Recorded in
  `docs/VERIFICATION-DEBT.md` as follow-up hardening, not shipped as
  "unlimited guesses is fine forever."

## Independent review

A fresh-context `security-reviewer` subagent dispatch was attempted for
this new crypto/authorization surface per
`.claude/rules/autonomous-development.md`'s reviewer procedure; the
dispatch mechanism was not available in this session in a way that
could return a timely fresh-context result (the same known recurring
gap already recorded across ADR-0069's several addenda). Following the
documented fallback ("Reviewer harness failures are not automatic
stops"), a rigorous self-review was performed instead, covering:

1. **Fail-closed on every branch.** `require_structural_lock_unlocked`
   returns `Err(Unauthorized)` for no session and for an expired/never-
   granted unlock — never a silent `Ok` default. `verify_pin` returns
   `false` (not a panic, not a silent `true`) for a shape-invalid
   candidate or a stored-hash length mismatch that would otherwise slice
   out of bounds — the `[u8; N]` fixed-size arrays in `PinHash` make an
   out-of-bounds read structurally impossible rather than merely tested
   against.
2. **No plaintext PIN persisted anywhere** — `structural_lock_pins`
   stores only `salt`/`hash`/`iterations`; the plaintext `pin: String`
   parameter is never written to a log, audit row, or any table.
3. **Tenant isolation** — every repository function takes and scopes by
   `school_id`; a dedicated test
   (`a_pin_set_for_one_school_does_not_affect_another_schools_lock_state`,
   and at the `auth` layer,
   `a_pin_set_in_one_school_does_not_unlock_the_gate_for_another_school`)
   proves a PIN configured for one school neither leaks into nor
   unlocks the gate for a different school's session.
4. **Constant-time comparison** — `verify_pin` uses `subtle::ConstantTimeEq`
   rather than `==`, avoiding a timing side-channel on the derived hash
   comparison (the PBKDF2 derivation itself is not constant-time with
   respect to the _candidate PIN's length_, same as every password
   hash — not a new gap this feature introduces, and not practically
   exploitable over IPC to a local Tauri command the way a network
   timing attack would be).
5. **Recurrence check against this project's two previously-documented
   failure classes**: no unauthenticated bootstrap path exists here (
   `require_structural_lock_unlocked`'s no-PIN-configured branch is not
   a bootstrap bypass — it is the explicit, disclosed opt-in default,
   not an accidental hole); no check-then-act singleton race exists
   (`set_pin`'s `INSERT ... ON CONFLICT DO UPDATE` is a single atomic
   statement, not a separate exists-check followed by a write).

No BLOCKING finding. Independent-review debt is retained (not
dropped) — owed to a future session with a healthy reviewer harness,
consistent with this project's established practice for every other
security-sensitive slice reviewed under this same fallback.

## Verification

New Rust modules: `crypto::pin_lock` (8 tests — round trip, distinct
salts, exact iteration count, length validation, iteration-count
backward-compatibility), `repository::structural_lock` (6 tests — has/
find/set/replace/clear, per-school isolation), plus 15 new tests in
`auth` covering the full authorization surface (capability gating on
set/clear, unlock/no-unlock, opt-in-when-unconfigured, TTL expiry,
cross-school isolation) and 7 new tests in `commands::school` for the
MIME-sniffing fix below. Migration 42 adds `structural_lock_pins`.

**Commands run this session, actual output**:

- `cargo test` (whole crate: lib + every integration binary + doctests) —
  **1080 lib tests passed** (0 failed), all integration suites green,
  0 doctests (unchanged).
- `cargo clippy --all-targets -- -D warnings` — clean, zero warnings.
- `cargo fmt --check` — clean (after one `cargo fmt` pass).
- `npm run quality` — typecheck, lint, format:check, architecture
  check, `knip` dead-code check, and `vitest run` all passed (111 test
  files, 1099 tests) — no TS/UI file was touched by this slice; this
  was run anyway to confirm no regression.
- `npm run quality:security` — **3 ok, 0 failed, 0 missing**
  (`gitleaks`, `cargo-deny`, `osv-scanner` were not present in this
  sandbox at session start; installed this session — `cargo install
cargo-deny --locked`, and the official `gitleaks`/`osv-scanner` static
  release binaries, matching `docs/SOURCE-REGISTRY.md`'s existing
  version pins — and then actually run). All three passed clean against
  the two new direct dependencies this slice adds (`pbkdf2` 0.13.0,
  `subtle` 2.6.1, both RustCrypto/dalek-cryptography, MIT/Apache-2.0,
  zero-cost crates.io dependencies, no network I/O, no paid tier).

## Related finding fixed in the same batch: school-logo MIME-sniffing gap

A self-review (same fallback procedure, see
`.claude/rules/autonomous-development.md`) of
`commands::school::set_school_logo` — done as this batch's third named
independent-security-review item — found that upload validation only
checked the caller-_declared_ `mime` string against an allow-list,
never the actual bytes. A caller could label arbitrary bytes as
`image/png` and have them stored (and later read back and rendered as
an `<img>`) without ever containing a real PNG. Classified SHOULD-FIX
(not BLOCKING, given the narrow, single-app-frontend attack surface —
no path traversal or unbounded-size issue was found; tenant scoping was
already correct), and fixed in the same batch since it was cheap:
`validate_logo_upload` now also checks the actual leading bytes against
each MIME type's real magic-byte signature (PNG's 8-byte signature,
JPEG's 3-byte SOI marker, WebP's two-part `RIFF`/`WEBP` signature)
before any bytes reach the repository. 7 new tests in
`commands::school` prove real-signature acceptance, cross-type
rejection (a real PNG mislabeled as JPEG), a fully mismatched blob
(HTML/script content labeled PNG), and both length checks still hold
alongside the new signature check.

## Not yet decided / deferred

- **Brute-force mitigation on repeated wrong PIN guesses** — see
  "Alternatives considered" above; tracked in `docs/VERIFICATION-DEBT.md`.
- **Curriculum-version and calendar-structure gating** — no editing
  command exists for either yet; wire `require_structural_lock_unlocked`
  into each the moment that command is built (see "What is gated today"
  above).
- **Frontend UI** (a PIN-entry prompt component, a "Set/Change PIN"
  settings screen) is not part of this ADR's scope — this ADR closes
  the Rust-side security boundary per `.claude/rules/architecture.md`;
  the `src/ui` screens that call these four commands are a separate,
  UI-layer slice.
