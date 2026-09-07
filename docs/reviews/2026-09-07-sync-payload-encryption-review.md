# Independent Security Review — Sync Payload Encryption / SSPK Rotation

Date: 2026-09-07
Reviewer: independent read-only security-review agent (fresh context, no
prior involvement in this feature's implementation).
Closes review debt recorded in `docs/VERIFICATION-DEBT.md`:

- "Sync payload encrypt/decrypt round trip, learner entity (2026-09-05)"
- "Payload-key rotation on device revocation (2026-09-05)"

Scope reviewed (read-only, adversarial):

1. `src-tauri/src/hub_server.rs` — `GET /sync/payload-key-wrap`, `authenticate`
2. `src-tauri/src/repository/sync_payload_key.rs` — `get_wrap_for_credential`,
   `rotate_for_school`, `ensure_wrapped_for_credential`,
   `refresh_wrap_for_credential`
3. `src-tauri/src/sync_client.rs` — `resolve_sspk`, `apply_decrypted_change`
4. `src-tauri/src/repository/learner.rs` — `upsert_from_sync`
5. `src-tauri/src/auth/mod.rs` — `revoke_device_sync_credential`,
   `revoke_device_sync_credential_and_rotate_sspk`
6. `src-tauri/src/db/mod.rs` — `rotate_sspk`, `load_or_mint_sspk`
7. `src-tauri/src/crypto/dpapi.rs` — `rotate_key`
8. Design intent read first: `docs/adr/0067-*.md`, `docs/adr/0069-*.md`,
   `docs/adr/0003-encryption-at-rest.md`

Two prior self-reviews (recorded 2026-09-05 and 2026-09-07) found no
blocking issues. This review found **one new BLOCKING finding** that both
self-reviews missed, plus one SHOULD-FIX and several confirmed
no-issue-found areas.

---

## BLOCKING — SSPK rotation on device revocation does not take effect in the

## running hub process; a revoked device retains decrypt access to all new

## sync traffic until the app is restarted

**Files/lines:**

- `src-tauri/src/hub_server.rs:106-118` (`HubServerState.sspk` field),
  `:157-172` (`spawn`), `:180-188` (`spawn_all`), `:201-211`
  (`maybe_spawn_listener`)
- `src-tauri/src/lib.rs:54` (the only call site of `maybe_spawn_listener`,
  inside the Tauri `setup` hook, i.e. executed exactly once per app launch)
- `src-tauri/src/db/mod.rs:149-156` (`rotate_sspk`, writes a new key to the
  DPAPI file on disk only)
- `src-tauri/src/auth/mod.rs:1108-1119`
  (`revoke_device_sync_credential_and_rotate_sspk`)
- `src-tauri/src/commands/device_sync.rs:116-127`
  (`revoke_device_sync_credential` Tauri command — the only production
  call site of the rotating wrapper, passing `|| db::rotate_sspk(&app)`)

**Evidence:**

`HubServerState.sspk` is a plain `[u8; PAYLOAD_KEY_LEN]` value (not a
`Mutex`/`RwLock`/`Arc<AtomicCell>` or any other shared-mutable cell). It is
resolved exactly once, via `db::load_or_mint_sspk(app)`, inside
`hub_server::maybe_spawn_listener` (line 206), which itself is invoked from
exactly one place in the whole codebase: `lib.rs:54`, inside the Tauri
`.setup()` closure that runs once at application startup. `spawn_all`
clones this same `HubServerState` (cheap `Arc`/plain-array clone) into
every bound-address listener task, and every subsequent request handler
(`push_handler`, `pull_handler`, `payload_key_wrap_handler`, and the shared
`authenticate` helper they all call) reads `&state.sspk` — the value
captured at startup — for the remaining lifetime of the running process.
There is no code path anywhere that re-invokes `maybe_spawn_listener`,
re-reads `SSPK_KEY_FILE_NAME` into a running `HubServerState`, or otherwise
propagates a new key into the live Axum router after startup. Confirmed by
grep: `maybe_spawn_listener` has exactly one call site in the whole crate.

Meanwhile, `db::rotate_sspk` (called by
`revoke_device_sync_credential_and_rotate_sspk`, which is itself the only
production path `commands::device_sync::revoke_device_sync_credential`
calls — confirmed by its own doc comment warning against calling the raw,
non-rotating function directly) does exactly one thing: atomically
overwrite the on-disk DPAPI-protected `likha-sis-sspk.key` file with a
freshly generated key (`crypto::dpapi::rotate_key`, verified separately —
this file-level mechanism is itself correct: atomic rename, zeroized
intermediate buffers, well tested). It never touches, notifies, or
restarts the running hub listener. `HubServerState` is not registered via
`app.manage(...)` in `lib.rs` (only `Mutex<Connection>` and
`SessionManager` are, at lines 44-45) so there is no reachable handle a
command could even use to push a fresh key into the live listener even if
it tried to.

**Consequence:** the moment `revoke_device_sync_credential` runs while the
hub server is already up and running (the normal case — a school laptop
hub is expected to run for a whole school day or longer per ADR-0067's own
deployment model), two things happen that together defeat the entire
point of ADR-0069's rotation design:

1. The DB-side wrap rows for the affected school are cleared
   (`rotate_for_school`, correct and school-scoped).
2. The DPAPI file on disk is genuinely rotated to a new random key
   (correct, file-level).
3. **But `HubServerState.sspk` — the value every subsequent
   `authenticate()` call, `payload_key_wrap_handler` response, and lazy
   `ensure_wrapped_for_credential` re-wrap actually uses — is still the
   OLD, pre-rotation key**, because nothing re-reads the file into the
   running process.
4. Every still-active device's very next authenticated request triggers
   `ensure_wrapped_for_credential`, which happily "self-heals" its wrap —
   but self-heals it to match `state.sspk`, i.e. the STALE key, not the
   genuinely-new one sitting on disk. The self-healing logic is correct in
   isolation (it truly does converge every active device onto whatever
   `sspk` value `authenticate` was given), but that value itself never
   changes for the life of the process, so it converges everyone back onto
   the OLD key instead of the new one.
5. Consequently every push from this point forward continues to be
   encrypted client-side under the OLD SSPK (clients fetch it fresh every
   pull round via `resolve_sspk`/`/sync/payload-key-wrap`, but the hub
   keeps handing out wraps of the same stale key), and the **revoked
   device — which by definition already had the old SSPK cached from
   before its revocation — remains fully able to decrypt every single
   piece of sync traffic (new learner records, attendance, grades, etc.)
   pushed by any other device in the school for as long as the hub process
   keeps running.**

This directly and specifically contradicts ADR-0069's own stated security
guarantee for this feature (`docs/adr/0069-*.md` line ~329): _"nothing
encrypted under the new SSPK is ever reachable by a revoked device"_ and
the revocation addendum's explicit design goal that a revoked device
"can decrypt only data encrypted under the now-retired key, never anything
encrypted after rotation." In the current implementation, as long as the
app is not restarted, there effectively _is_ no "after rotation" — the
retired key keeps being used in practice regardless of what the DPAPI file
says.

**Why the existing tests didn't catch this:** every existing rotation test
(`sync_payload_key.rs`'s `rotation_then_ensure_wrapped_recovers_the_new_key_for_a_still_active_device`,
`hub_server.rs`'s lazy-rewrap tests) constructs its `sspk` value directly
in the test and passes the ALREADY-ROTATED value straight into
`ensure_wrapped_for_credential`/`HubServerState` by hand — none of them
model the real production wiring where `HubServerState.sspk` is fixed at
process start and `db::rotate_sspk` runs against a live, already-listening
server. The unit-level self-healing logic is correct; the integration gap
is that nothing in production ever gets the rotated key from the
filesystem into that live state.

**Suggested direction (not implemented — this is a read-only review):**
`HubServerState.sspk` needs to become genuinely live-refreshable — e.g.
`Arc<RwLock<[u8; PAYLOAD_KEY_LEN]>>` or an `ArcSwap`, with
`revoke_device_sync_credential_and_rotate_sspk`'s `rotate_sspk` closure (or
a new explicit hook) updating the shared value the running listener reads,
in addition to rewriting the DPAPI file. Restarting the whole listener
(unbinding and rebinding every address) is a heavier alternative that would
also work but drops in-flight connections unnecessarily.

**Severity justification:** BLOCKING, not SHOULD-FIX — this defeats the
confidentiality guarantee the whole revocation feature exists to provide,
for the realistic and expected deployment shape (long-running school-day
hub process), against DepEd learner PII, which is this project's own
top-listed priority ("security/privacy" is first in `CLAUDE.md`'s stated
priority order).

---

## SHOULD-FIX — SSPK is minted/rotated per _installation_, not per _school_,

## despite ADR-0069 explicitly specifying "one SSPK per school"

**Files/lines:**

- `docs/adr/0069-*.md` (design intent, quote: _"The hub mints the school
  sync-payload key (SSPK) once per school"_ / _"one 256-bit AES-256-GCM key
  per school"_)
- `src-tauri/src/db/mod.rs:103-126` (`load_or_mint_sspk`) and `:138-156`
  (`rotate_sspk`) — both take only `app: &AppHandle`, no `school_id`
  parameter, anywhere in the codebase (confirmed by grepping every call
  site: `commands/*.rs`, `hub_server.rs`, `auth/mod.rs`)
- `src-tauri/src/hub_server.rs:107-118` — `HubServerState.sspk` is a single
  value shared by every bound address and therefore every school this one
  installation's local database might hold device-sync credentials for
  (`should_listen` explicitly iterates "ANY school known to this
  installation" at line 141)
- `src-tauri/src/repository/school.rs:7-8` — "A school is the top-level
  data-isolation scope: every other record in the working database is
  owned by exactly one school" — confirming multi-school-per-installation
  is a real, designed-for case in this codebase generally, not a
  theoretical one

**Evidence:** every call site of `load_or_mint_sspk`/`rotate_sspk`
resolves a single DPAPI file (`SSPK_KEY_FILE_NAME`, a fixed filename with
no per-school suffix) scoped to the whole app-data directory — i.e. to the
whole _installation_, not to an individual school. `load_or_mint_sspk`'s
own doc comment even conflates the two ("this school's very first device
enrollment... for this single-installation architecture"), treating
"school" and "installation" as synonyms, whereas
`repository::school`'s own doc comment states the opposite: a school is
just a data-isolation scope inside one working database, and the schema
supports multiple schools coexisting in one local DB (this is exactly what
`hub_server::should_listen` iterates over).

**Consequence:** if a single hub installation ever hosts device-sync
credentials for more than one school (a scenario the existing schema and
`should_listen` logic explicitly accommodate, even if it isn't the primary
expected deployment), every one of those schools' sync payloads —
including PII like learner names, LRNs, attendance, and grades — would be
encrypted under the exact same plaintext SSPK. The only thing currently
preventing actual cross-school plaintext exposure is the query-level
`WHERE school_id = ?1` scoping in `repository::sync_hub::pull_since` (which
I verified is correctly present and covered by its own
`pull_since_never_returns_another_schools_changes` test) — i.e. tenant
isolation for this data currently rests entirely on one query-level filter
rather than on cryptographic separation, which is a defense-in-depth
regression relative to ADR-0069's own stated design and relative to this
project's own architecture rule ("school isolation must be enforced at a
trusted boundary," `.claude/rules/architecture.md`). A future bug or
refactor of `pull_since`, `push_change`, or any new code path that pools
`encrypted_payload` bytes across schools (e.g. a bulk export/import,
diagnostics dump, or an admin-facing "view raw sync queue" screen) would
immediately become a full cross-school PII leak rather than being
contained by the crypto boundary ADR-0069 describes.

Not classified BLOCKING because: (a) no currently-shipped code path
actually mixes ciphertext across schools — `pull_since`'s scoping is
correct today; (b) the single-school-per-hub-laptop deployment is very
plausibly the only shape LIKHA actually ships for the foreseeable future.
But it is a real gap between documented design and implementation that
should be either fixed (key-file-per-school, keyed by `school_id`) or the
ADR should be explicitly amended to record "single-installation SSPK" as a
superseding decision with the residual risk written down, so a future
reader doesn't rely on the "one SSPK per school" cryptographic-isolation
claim that ADR-0069 currently makes and the code does not deliver.

---

## Reviewed with NO issue found

**`hub_server::authenticate` / `GET /sync/payload-key-wrap`
(hub_server.rs:255-411).** Credential/secret extraction and verification
correctly collapse every failure mode (missing header, unknown credential,
revoked credential, wrong secret) into an indistinguishable `Unauthorized`,
matching `device_credential::verify`'s own enumeration-safety contract.
`ensure_wrapped_for_credential` is only ever invoked after a _successful_
`verify()`, so a revoked credential genuinely never reaches the re-wrap
code path (confirmed directly by the
`a_revoked_credential_never_gets_a_lazy_rewrap` test, which asserts no wrap
row is created). `payload_key_wrap_handler` hands back only the
credential's OWN wrap (scoped by `credential_id`, which is 1:1 with a
single device+school per `device_credential::enroll`), never another
device's, and never the plaintext key. A missing wrap row surfaces as
`Internal`, not a silently-empty success. No cross-school or cross-device
leakage found in this handler in isolation.

**`sync_payload_key::{get_wrap_for_credential, rotate_for_school,
ensure_wrapped_for_credential, refresh_wrap_for_credential}`
(sync_payload_key.rs).** `rotate_for_school` is correctly scoped by
`school_id` at the SQL layer (`DELETE ... WHERE school_id = ?1`, verified
by `rotate_for_school_does_not_touch_another_schools_wraps`).
`ensure_wrapped_for_credential` independently re-checks
`revoked_at IS NULL AND school_id = ?2` itself rather than trusting its
caller's ordering (defense in depth, matches
`.claude/rules/security-privacy.md`), and is covered by a direct test
(`ensure_wrapped_is_a_no_op_for_a_revoked_credential`) that never calls
`verify` at all. The self-healing TOCTOU claim in this function's own
comment (lines 122-137) — that comparing decrypted wrap content against
the `sspk` this exact call received makes recovery order-independent
regardless of when in the DB/filesystem rotation gap a device
authenticates — **checks out against the actual code**: it doesn't just
check row existence, it unwraps and byte-compares
(`unwrap_for_credential(...) == *sspk`), and refreshes via
`refresh_wrap_for_credential`'s `ON CONFLICT ... DO UPDATE` when they
differ. This logic is sound _given a correct `sspk` input_ — but per the
BLOCKING finding above, the real defect is one layer up: the `sspk` value
`hub_server::authenticate` actually passes in is never updated after
rotation, so this correct self-healing mechanism keeps faithfully healing
every device back onto the same stale key. The TOCTOU-recovery claim
itself is verified true; it just doesn't help against the bug found above,
which is a different failure mode than the one this comment was written to
address.

**`sync_client::{resolve_sspk, apply_decrypted_change}`
(sync_client.rs:219-236, 553-641).** `resolve_sspk` collapses every
failure (network error, non-2xx, malformed body, bad unwrap) into `None`
uniformly, and `pull_once` treats `None` as "reject this round's
non-conflicting changes, never apply anything using a missing/wrong key" —
correctly fail-closed (verified by reading `pull_once`'s handling at
sync_client.rs:490-495). `apply_decrypted_change` independently re-checks
`incoming.school_id != school_id` for every one of its ten `EntityKind`
arms even though a payload that decrypts successfully under this school's
SSPK already strongly implies the right school — explicit defense in
depth, not silently trusted. The match is exhaustive over `EntityKind`
with no wildcard arm, so a newly-added entity kind fails to compile here
rather than silently no-op-succeeding. A decrypt/auth-tag failure,
malformed JSON, or school_id mismatch all map to the same `Err(())`,
which `pull_once` turns into `summary.rejected`/`summary.failed = true`
and a `break` — halting the rest of the batch rather than skipping past a
tampered entry, and never advancing the cursor/version-cache/domain table
past a rejected change. No silent-success-on-rejection path found.

**`repository::learner::upsert_from_sync` (learner.rs:70-91).** Performs a
plain `INSERT ... ON CONFLICT(id) DO UPDATE`, including overwriting
`school_id` from the incoming payload. In isolation this looks like it
could let a same-`id` row "move" between schools on a device that somehow
holds two schools' data, but by the time this function is called,
`apply_decrypted_change` has already rejected any payload whose declared
`school_id` doesn't match the pull's own `config.school_id` — so this
function can only ever be reached with a `school_id` matching what the
caller already validated. Given the BLOCKING and SHOULD-FIX findings
above concern the _key_ layer rather than this validation, I did not find
an additional issue specific to this function. One residual note (not a
new finding, just flagging for future readers): this function does not
itself re-validate `school_id`, relying entirely on its caller — consistent
with this module's other sync-write functions and an accepted pattern
elsewhere in the codebase, but worth remembering if `upsert_from_sync` is
ever called from a second call site that doesn't perform the same check.

**`auth::{revoke_device_sync_credential, revoke_device_sync_credential_and_rotate_sspk}`
(auth/mod.rs).** Authorization gate (self-revoke or
`ManageSchoolMembership` in the same school) and the
SAVEPOINT/ROLLBACK-on-error transaction wrapping around
`rotate_for_school` + audit logging look correct; `rotate_sspk`'s ordering
(revoke-then-rotate, never rotate-then-revoke) is deliberately chosen and
documented to fail toward the safer inconsistency (credential durably
revoked even if the filesystem rotation subsequently fails) rather than
the reverse. No blocking issue found in this ordering/transaction logic
itself — the defect is what happens (or doesn't happen) to the _live
process's_ key material after this function successfully returns, covered
above.

**`db::rotate_sspk` / `crypto::dpapi::rotate_key`.** File-level rotation
is atomic (write to a distinct temp file, then `rename` over the target —
same-filesystem guarantee documented and relied on), zeroizes intermediate
plaintext buffers, and is covered by tests for "produces a genuinely
different key," "succeeds even with no prior key file," and "never leaves
a temp file behind." No key material found logged anywhere in any of the
files reviewed (`log::warn!`/`log::error!` call sites in `hub_server.rs`
and `sync_payload_key.rs` were checked individually — none interpolate a
key, secret, or wrap byte, only error variants/counts and fixed strings).

---

## Not verified / out of scope for this pass

- I did not run the test suite in this session (read-only review, no
  compiler/test execution performed) — findings above are based on static
  reading of the code and its existing tests' assertions, not on executing
  anything. The BLOCKING finding is an architectural/integration gap
  (missing live-refresh wiring) that existing unit tests structurally
  cannot catch because none of them construct the real
  `lib.rs` → `maybe_spawn_listener` → long-running-process → later
  `revoke_device_sync_credential` sequence; confirming it would require a
  new integration-style test (spawn a real listener via `hub_server::spawn`
  on an ephemeral port exactly like `sync_client`'s own tests already do,
  rotate via the command path, then assert a subsequent
  `/sync/payload-key-wrap` response no longer unwraps to the OLD key) —
  recommend adding exactly that test alongside whatever fix is chosen.
- Windows-specific DPAPI behavior itself (`crypto::dpapi`) was read but not
  executed on real Windows DPAPI (this session has no interactive Windows
  desktop/keychain access) — relying on the module's own existing test
  coverage and code reading only.
- Did not review the full `sync_client.rs` file end-to-end (it is ~3700
  lines with per-entity-kind test fixtures); read the module doc comment,
  all production (non-test) code, and enough of the test module to confirm
  the `resolve_sspk`/`apply_decrypted_change`/`pull_once` behavior claimed
  in the doc comments. Did not re-read every one of the ten per-entity-kind
  test blocks individually — no reason to suspect they diverge from the
  `Learner`/`Attendance` pattern already verified, but flagging the gap for
  completeness.
- Did not review `sync_hub::push_batch`/`push_change` line-by-line beyond
  confirming `school_id` is session/credential-derived, never
  client-supplied, and that `pull_since` is correctly scoped — a full
  independent review of `sync_hub.rs` itself was not in this task's
  explicit scope list and was not performed exhaustively.

---

## Summary

| #   | Finding                                                                                                                                          | Severity                                                              |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| 1   | Live hub process never picks up a rotated SSPK; revoked device retains decrypt access to all new sync traffic until app restart                  | **BLOCKING**                                                          |
| 2   | SSPK is per-installation, not per-school as ADR-0069 specifies; cross-school crypto isolation currently rests entirely on one query-level filter | SHOULD-FIX                                                            |
| 3   | `hub_server::authenticate`/`payload-key-wrap` endpoint scoping, wrap-row isolation                                                               | No issue found                                                        |
| 4   | `sync_payload_key` self-healing TOCTOU claim                                                                                                     | Verified true (but doesn't help against finding #1)                   |
| 5   | `sync_client::resolve_sspk`/`apply_decrypted_change` fail-closed behavior                                                                        | No issue found                                                        |
| 6   | `learner::upsert_from_sync`                                                                                                                      | No issue found (relies on caller's school_id check, which is present) |
| 7   | `auth::revoke_device_sync_credential[_and_rotate_sspk]` transaction/authz                                                                        | No issue found                                                        |
| 8   | `db::rotate_sspk` / `crypto::dpapi::rotate_key` file-level mechanics                                                                             | No issue found                                                        |

This closes the two independent-review debts recorded in
`docs/VERIFICATION-DEBT.md` with **one genuine BLOCKING finding** that both
prior self-reviews missed. Recommend: do not mark this milestone's
independent-review debt fully resolved until finding #1 is fixed (or
explicitly triaged/accepted) — the fix directly affects whether device
revocation, a stated security feature, actually works as documented.
