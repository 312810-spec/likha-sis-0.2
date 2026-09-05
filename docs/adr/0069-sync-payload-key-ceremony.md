# ADR-0069 — Sync payload key ceremony (ADR-0067 addendum)

Status: Accepted (foundation + key rotation on revocation). Addenda below
close the enrollment-time wiring, a persistence gap found in the original
text, and (2026-09-05) the rotation-on-revocation mechanism via the
10-scenario decision process. Still not wired: `sync_outbox` enqueue does
not yet encrypt a real payload; `db::rotate_sspk` (minting a genuinely new
plaintext SSPK on revocation) does not exist yet — see the latest
addendum's "Deliberately NOT shipped" section.

## Context

ADR-0067's "Authentication and keys" section decided the _shape_ of payload
encryption but explicitly left the mechanism undecided:

> A separate school sync-payload key is wrapped for each enrolled device;
> the two key types are never reused.

`docs/ACTIVE-PLAN.md` recorded this as a genuine blocker: `sync_outbox`'s
`encrypted_payload` column and `sync::PendingChange`'s own doc comment both
assume payloads already arrive encrypted, but nothing in the repository
generates, stores, or distributes the key that would do that encrypting.
Implementing outbox wiring against an improvised scheme was explicitly
rejected as exactly the kind of security shortcut this project's own rules
(TDD + independent review for persistence/security logic, no guessed
crypto) exist to prevent.

This ADR decides that mechanism.

### A resolved ambiguity: the hub is not a blind relay

Before the key-distribution question can be answered, one fact from
ADR-0067 itself needed to be made explicit: **the hub decrypts.**
ADR-0067 says "the hub contains the complete school dataset" and
"validates, orders, and retains the consolidated accepted history" — not
"stores an opaque blob store." The `sync::PendingChange` doc comment's
"plaintext learner data must never cross the provider boundary" language
predates ADR-0067 and was written when the candidate provider was ADR-0065's
offshore Cloudflare relay; "provider boundary" there means the untrusted
network/cloud edge, not the school's own physically supervised lab laptop.
The hub is explicitly listed among "school-controlled devices" in ADR-0067's
"Data and privacy boundary" section, running its own SQLCipher-encrypted
local database like any other device.

This matters because it resolves an otherwise-unsolvable key-distribution
problem: if the hub could never see plaintext (a true zero-knowledge
relay), no party would ever be positioned to mint a payload key and
distribute wrapped copies to devices that haven't met each other, without
inventing a new peer-to-peer or human-mediated pairing ceremony (QR codes,
manually copied recovery phrases, etc.) — real UX/security surface ADR-0067
never asked for and this project has no primary source or established
pattern to design safely from scratch. Because the hub is trusted and
already the authoritative party for _everything else_ in this protocol
(ordering, validation, conflict staging), it is also the correct party to
be the payload-key issuer.

## Decision

**The hub mints the school sync-payload key (SSPK) once per school, and
wraps a copy for each device at the exact moment that device's sync
credential is issued** (`repository::device_credential::enroll`, which
already runs on the hub, already generates a fresh 256-bit secret
server-side, and already returns that secret to the caller exactly once).

This reuses 100% of the existing enrollment trust boundary
(`auth::enroll_device_sync_credential` re-verifies the enrolling user's
password) and needs zero new UX ceremony, human-mediated key exchange, or
peer-to-peer device pairing.

### Mechanism

1. **SSPK**: one 256-bit AES-256-GCM key per school. Generated lazily, in
   hub-process memory only, the first time a school has zero existing
   wraps (i.e. its first-ever device enrollment). Never persisted in
   plaintext anywhere, including in hub memory beyond the single
   transaction that wraps it for the enrolling device.
2. **Per-device wrap key**: HKDF-SHA256 over the device's own 256-bit
   enrollment secret (the same one `enroll()` already generates), with a
   fixed, version-tagged info string (`"LIKHA-sync-payload-wrap-v1"`) for
   domain separation from any future derived-key use of the same secret.
   Deterministic and stateless — nothing new to store to reproduce it.
3. **Wrap**: AES-256-GCM, a fresh random 96-bit nonce per wrap (nonce
   uniqueness only needs to hold per _wrap key_, and every device's wrap
   key is already unique by construction, but a fresh nonce is generated
   every time regardless — standard AEAD practice, not a cost worth
   cutting for one extra `rand::fill` call).
4. **Storage**: new table `sync_payload_key_wraps`, one row per active
   credential (`UNIQUE(credential_id)`), storing only the wrapped
   ciphertext and nonce — never the plaintext SSPK. A revoked credential's
   wrap row is left in place (consistent with this project's tombstone-not
   -delete convention elsewhere) but becomes unusable the moment
   `device_credential::verify` rejects the revoked credential, before any
   caller could reach the wrap lookup.
5. **Client side**: the enrolling device already receives its plaintext
   secret once, at enrollment. It independently re-derives the same wrap
   key (step 2, entirely local, no network round trip) and unwraps the
   SSPK the hub already stored for it. This ADR does not yet decide the
   client-side local-persistence format for the unwrapped SSPK (see "Not
   yet decided" below) — that is deferred to the slice that actually wires
   `enroll_device_sync_credential` end to end.
6. **A device that re-enrolls** (same `device_id`, `enroll()`'s existing
   revoke-then-reissue behavior) gets a fresh secret and therefore a fresh
   wrap key, so it needs its own fresh wrap row — `enroll()` re-wraps the
   _existing_ SSPK (not a new one) for the new credential. The SSPK itself
   is only ever generated once per school; every enrollment after the
   first one wraps the same underlying key.

### Alternatives considered

- **Fresh asymmetric keypair per device at enrollment (X25519/sealed-box
  wrap), instead of HKDF from the existing secret.** Rejected: the
  standard reason to prefer public-key wrapping is when the _wrapping
  party_ must not need the recipient's secret material — but here the hub
  already legitimately possesses the plaintext enrollment secret for the
  one transaction where it matters (it just generated it), so an
  asymmetric scheme buys no additional security property here, while
  adding a new key-exchange step to the enrollment UX and a second crypto
  primitive family to reason about and depend on.
- **ChaCha20-Poly1305 instead of AES-256-GCM.** Both are RustCrypto,
  audited, constant-time-safe AEAD ciphers. AES-256-GCM was already named
  as the illustrative example in ADR-0067 itself; kept as the actual
  choice rather than re-opening it, and Windows desktop (this project's
  only shipping target per `CLAUDE.md`) near-universally has AES-NI, so
  there is no real performance argument for ChaCha20 here.
- **Hub as a permanent escrow/KMS holding the plaintext SSPK at rest.**
  Rejected as unnecessary: the hub never needs the plaintext SSPK again
  after the wrap step for a given enrollment — every future materializer
  or pull-side consumer that needs to decrypt can derive its own copy the
  same way the enrolling device does (it must already hold _a_ valid,
  unrevoked credential's secret to be trusted at all). Not persisting the
  plaintext SSPK anywhere except transiently in memory is strictly safer
  and was free to choose.

## Not yet decided (owed before "genuinely done")

- **Client-side local persistence** of the unwrapped SSPK for offline use
  (a device must be able to encrypt an outbox write without hub contact).
  The natural answer is the same DPAPI-protected local key-file pattern
  `crypto::dpapi`/`db::open_app_db` already use for the SQLCipher key — a
  second, separately named key file, never reusing the SQLCipher key file
  or value. Deferred to the slice that wires
  `auth::enroll_device_sync_credential` to actually fetch and unwrap the
  SSPK, since that is where the local file gets written.
- **Rotation.** ADR-0067 already defers this to "a documented custodian
  procedure," unchanged here. Revoking a device's credential does not
  rotate the SSPK — a revoked device that already cached the SSPK locally
  retains it until an explicit rotation procedure exists. This matches
  ADR-0067's own explicit scope boundary, not a new gap introduced here.
- **What decrypts pulled/logged payloads at the hub** (a "materializer"
  reading `sync_hub_log` into the hub's own domain tables) is a separate,
  not-yet-built component; this ADR only ensures the key material it will
  need already exists and is reachable.

## Verification

New Rust module `crypto::payload_key` (HKDF derive + AES-256-GCM
wrap/unwrap, TDD, tamper-rejection and round-trip proven directly — not
inferred). Migration adds `sync_payload_key_wraps`; `device_credential::enroll`
extended to mint-once/wrap-every-time. See `docs/CURRENT-HANDOFF.md` for
the actual test counts this session ran.

## Consequences

Enrollment gains no new UX step and no new failure mode a teacher would
ever see (the whole ceremony is server-side, inside the existing
`enroll_device_sync_credential` trust boundary). The school's payload key
is now real and derivable by every device holding a valid credential, but
is not yet consumed by `sync_outbox` or exposed to any Tauri command — the
next slice is that wiring, plus the client-side local-persistence decision
flagged above.

## Addendum (2026-09-05) — a real gap found, plus the actual enrollment wiring

A status report cross-checking this ADR against the shipped code found two
things:

1. **`device_credential::enroll` was never actually extended to call
   `wrap_for_credential`.** This ADR's own "Verification" section claimed
   it was; the code did not match. `auth::enroll_device_sync_credential`
   issued a credential and stopped — no wrap was ever written for it.
2. **A genuine contradiction in the mechanism as originally written.**
   Point 1 said the SSPK is "Never persisted in plaintext anywhere,
   including in hub memory beyond the single transaction that wraps it
   for the enrolling device," while point 6 required "every enrollment
   after the first one wraps the same underlying key." Those two claims
   cannot both hold: without persisting the plaintext SSPK _somewhere_
   durable, nothing can re-derive it for a school's second device — the
   hub has no way to recover a key it never wrote down and cannot decrypt
   the first device's wrap without that device's enrollment secret, which
   the hub never retains (only its SHA-256 digest, per
   `device_credential`'s existing design).

**Resolution**: extend the same DPAPI-protected local key-file pattern
`crypto::dpapi`/`db::open_app_db` already use for the SQLCipher key — this
was already the "natural answer" this ADR's own "Not yet decided" section
named for client-side persistence, so applying it to the hub's own local
copy first is the same pattern, not a new one. `db::load_or_mint_sspk`
resolves (or mints, on first use) this installation's SSPK from a second,
separately-named DPAPI-protected file (`SSPK_KEY_FILE_NAME`,
`likha-sis-sspk.key`) — never the same file or value as the SQLCipher key.
For the current single-installation architecture (no network split yet;
enrollment and "the hub" are the same running process), this single local
file is sufficient: a first enrollment mints the SSPK, every later
enrollment call for the same installation transparently reloads the same
value. A genuinely separate remote device recovering its own copy over
the network (once a transport exists) still unwraps from its own
credential the same way `sync_payload_key::unwrap_for_credential` already
proves — this addendum does not change that path.

**Shipped**:

- `db::load_or_mint_sspk` / `SSPK_KEY_FILE_NAME` (Windows via
  `DpapiKeyStore`, fails closed on any other host, matching
  `open_app_db`'s own precedent exactly).
- `auth::enroll_device_sync_credential` now takes the resolved SSPK as a
  parameter and calls `sync_payload_key::wrap_for_credential` in the SAME
  atomic step as `device_credential::enroll` (a `SAVEPOINT`, rolling back
  both together on any failure) — closing the gap in point 1 above for
  real, with tests proving it.
- `crypto::payload_key::encrypt_payload`/`decrypt_payload` — general-purpose
  AES-256-GCM encrypt/decrypt of arbitrary-length bytes under the SSPK
  (`nonce || ciphertext` in one blob, matching the single-`Vec<u8>` shape
  of `sync_outbox`/`sync_hub_log`'s `encrypted_payload` columns), distinct
  from `wrap_payload_key`/`unwrap_payload_key` (which only ever wrap a
  fixed 32-byte key). This is the primitive an actual outbox-enqueuing
  domain write will call; wiring a real call site is still the next slice.

**Still not done** (unchanged from before this addendum): no Tauri command
resolves an SSPK or calls enrollment; no domain write encrypts a payload
and calls `sync_outbox::enqueue`; per-entity "what hub version does this
device believe it's at" tracking (needed to set a correct `base_version`
on an _update_, not just a first-time create) does not exist anywhere;
the network listener/transport does not exist. Rotation remains
out of scope per ADR-0067.

## Addendum (2026-09-05) — the 10-scenario decision on key rotation on revocation

By the time this addendum was written, `hub_server` (ADR-0067's own
addenda) and `sync_client` already existed, closing the "network
listener/transport does not exist" gap above. This addendum closes the
one item this ADR had explicitly deferred without a mechanism: what
happens to the SSPK when a device is revoked.

### Why this needed its own decision, not just "call rotate"

The obvious-looking answer -- "on revocation, mint a new SSPK and
re-wrap it for every remaining active device" -- is not actually
available. The hub only ever retains a SHA-256 digest of each device's
enrollment secret (`device_credential`'s design, unchanged since ADR-0004),
never the plaintext. Deriving a device's wrap key (`derive_wrap_key`)
needs the plaintext secret. So the hub cannot re-wrap a new SSPK for any
device it isn't, at that exact moment, actively authenticating.

### Options considered

1. **Do nothing on revocation (status quo before this addendum).** A
   revoked device that had already cached the SSPK locally (or captured
   the hub's own copy some other way) retains indefinite decrypt ability
   for anything encrypted under that key, forever, with no path to cut it
   off short of re-keying the whole school by hand. Rejected: this is a
   real, unbounded exposure window for a device that may have been
   revoked specifically BECAUSE it was lost or stolen -- exactly the case
   ADR-0067's "Authentication and keys" section names as the reason a
   separate, revocable sync credential exists at all ("a stolen device
   can be denied future sync"). Leaving the payload key itself
   unrotated defeats half of that promise.
2. **Fresh asymmetric keypair per device (X25519), so the hub can always
   re-seal a new SSPK for any device without needing its secret.**
   Rejected for the same reason ADR-0069's original "Alternatives
   considered" rejected it: a second crypto primitive family and a new
   enrollment-time key-exchange step, for a school-LAN deployment that
   has no PKI and no budget for one. It would solve rotation cleanly, but
   at a cost this project's zero-PKI, zero-billing constraints (`CLAUDE.md`
   priorities: teacher usability and offline reliability rank above this
   marginal improvement, and correctness is not actually improved for the
   realistic threat model here -- see point 4 below) don't justify.
3. **Human-mediated re-enrollment: revoking a device requires every OTHER
   device to be manually re-enrolled too, driven by the ICT custodian.**
   Rejected: turns a single revocation into an O(n) manual ceremony
   across every teacher's device, exactly the "new UX ceremony" ADR-0069's
   original decision was chosen specifically to avoid, and something a
   school's ICT coordinator would very plausibly skip or delay under
   real workload, silently leaving devices unable to sync (a teacher
   usability and offline-reliability regression, both ranked above this
   in `CLAUDE.md`'s priority order) rather than a security improvement.
4. **Lazy propagation: rotate by clearing every wrap row for the school;
   each still-active device transparently re-establishes its own wrap
   the next time it authenticates, using the same trust the hub already
   extends it on every push/pull (Recommended).** The hub already sees a
   device's plaintext secret on every authenticated request (bearer auth
   over the loopback/LAN trust boundary, matching `hub_server`'s existing
   design) -- so "wait for the device to next prove itself" costs nothing
   new: no additional network round trip, no new UX, no new crypto
   primitive, and it reuses `device_credential::verify`'s existing
   authentication as the sole gate. A revoked device's credential never
   verifies again, so it can never reach the re-wrap step, so it can
   never recover a wrap of any key minted after its revocation. The
   tradeoff, disclosed rather than hidden: a device revoked while
   genuinely offline for a long stretch is not retroactively denied
   access to data encrypted between the moment of revocation and its next
   contact with the hub -- but it was never going to receive anything new
   from a network it isn't reachable on anyway, and once it does reconnect
   its very first authenticated request is what performs the rotation
   check that then denies it, before that request's own payload is ever
   returned.

### Decision: option 4 (lazy propagation), fresh SSPK minted and old wraps cleared on revocation, no asymmetric crypto

**Recommended: option 4** -- chosen for the reasons in point 4 above and
because it is the option requiring the least new surface (no dependency,
no schema change beyond what `sync_payload_key_wraps` already has, no new
Tauri command) while closing the real gap (indefinite post-revocation
decrypt ability). **Next best: option 2** (asymmetric per-device
keypairs) -- the only option that would also cut off an offline-at-
rotation-time device immediately rather than lazily, but only worth its
added complexity if this project ever needs synchronous, guaranteed-immediate
revocation (e.g. a compliance requirement stronger than "denied at next
contact"); revisit if that requirement appears. Option 1 (status quo) and
option 3 (manual re-enrollment) are both rejected outright, not merely
ranked below Recommended, for the reasons given above.

**What "rotation" means precisely here**: the OLD SSPK is not securely
erased from anywhere it may already have been cached (a revoked device's
own local copy, if it had contacted the hub before revocation, is
unaffected by this rotation and remains exactly as readable to that
device as before -- this addendum does not, and structurally cannot,
reach into a device that will never contact the hub again). What
rotation actually buys is forward secrecy from the moment of rotation
onward: nothing encrypted under the new SSPK is ever reachable by a
credential that cannot re-authenticate to obtain it.

**Shipped**:

- `repository::sync_payload_key::rotate_for_school` -- deletes every
  `sync_payload_key_wraps` row for a school (scoped to that school only,
  proven by test). Called from `auth::revoke_device_sync_credential`
  inside the SAME `SAVEPOINT` as `device_credential::revoke`, so a
  revocation and its rotation either both commit or both roll back
  together -- there is no window where a credential is revoked but the
  key is not yet rotated, or vice versa.
- `repository::sync_payload_key::ensure_wrapped_for_credential` -- wraps
  the current SSPK for a credential only if it has no wrap row yet
  (idempotent; a pre-existing wrap is left untouched, never silently
  overwritten). Called from `hub_server::authenticate`, immediately after
  `device_credential::verify` succeeds, using the exact same device
  secret the request just proved it holds and the hub's own in-memory
  `HubServerState.sspk` (resolved once at listener startup via the
  existing `db::load_or_mint_sspk`, unchanged). A `verify` failure (unknown
  id, revoked credential, wrong secret) short-circuits before this call is
  ever reached -- the enforcement boundary is entirely `verify`'s, by
  design, not a second check duplicated inside the re-wrap path itself
  (proven directly: `a_revoked_credential_never_gets_a_lazy_rewrap`).
- Tests (TDD): repository-level rotation/idempotent-rewrap coverage
  (`rotate_for_school_clears_every_wrap_row_for_that_school`,
  `rotate_for_school_does_not_touch_another_schools_wraps`,
  `ensure_wrapped_is_a_no_op_when_a_wrap_already_exists`,
  `ensure_wrapped_creates_a_wrap_when_none_exists`,
  `rotation_then_ensure_wrapped_recovers_the_new_key_for_a_still_active_device`);
  `auth`-level integration proving a real revocation clears every active
  device's wrap, not only the revoked one
  (`revoking_a_device_clears_every_wrap_for_that_school_including_other_active_devices`)
  and that a revoked credential can never recover a post-rotation wrap
  (`a_revoked_device_can_never_recover_a_wrap_of_the_post_rotation_key`);
  `hub_server`-level end-to-end HTTP proof that one real authenticated
  request lazily re-establishes a wrap
  (`a_successful_authenticated_request_lazily_re_establishes_this_devices_wrap`)
  and that a revoked credential's request never does
  (`a_revoked_credential_never_gets_a_lazy_rewrap`). 8 new tests across
  `repository::sync_payload_key`, `auth`, and `hub_server`; full suite
  (784 lib tests + existing integration/doctests) green, `cargo clippy
--all-targets -- -D warnings` clean, `cargo fmt --check` clean. See
  `docs/CURRENT-HANDOFF.md` for the exact command output this session
  actually ran.

**Deliberately NOT shipped this slice** (still owed, see
`docs/CURRENT-HANDOFF.md`'s "Exact next task"): no Tauri command yet
mints and persists a NEW SSPK on the hub's own local DPAPI file when a
revocation happens -- `revoke_device_sync_credential` rotates the
DATABASE side (clearing wraps) but nothing yet calls an equivalent of
`db::load_or_mint_sspk` that OVERWRITES the file with a fresh key rather
than reloading the existing one; without that, "rotation" today is
`rotate_for_school`'s wrap-clearing proven correct in isolation, but a
real revocation on a running installation would still hand out the SAME
old plaintext SSPK to the next re-wrap unless a `db::rotate_sspk`-shaped
function is added and wired into the revoke command path. This was
deferred rather than guessed at because it touches the Windows-only
DPAPI file store this sandboxed environment cannot exercise or verify
(same limitation `load_or_mint_sspk` itself already carries) -- adding an
untested file-overwrite function here would violate this project's "never
claim a check passed unless it actually ran" rule more than it would
close the gap. Recorded in `docs/VERIFICATION-DEBT.md`. Domain-table
materialization of pulled changes (decrypting `encrypted_payload` and
writing to `learners`/etc.) remains out of scope, unchanged from
ADR-0067's own client-side-sync-loop addendum.

## Addendum (2026-09-05) — self-review finding closed: `ensure_wrapped_for_credential` now checks revocation itself

A self-review of the rotation addendum above (performed as the
documented fallback for an unavailable independent-reviewer subagent,
`docs/VERIFICATION-DEBT.md`) found that `ensure_wrapped_for_credential`
had no `revoked_at` check of its own -- its safety depended entirely on
its one real call site (`hub_server::authenticate`) always calling it
_after_ a successful `device_credential::verify`. That is true today, but
is a convention, not an enforced invariant: any future caller that
invoked it without checking revocation first would silently re-establish
a revoked device's decrypt capability. This is exactly the class of gap
`.claude/rules/security-privacy.md` warns against ("security must never
rely on ... enforce at the ... repository ... boundary").

**Fixed in the same slice, before considering it done**:
`ensure_wrapped_for_credential` now also checks
`device_sync_credentials.revoked_at IS NULL` (and that the credential
exists at all) before wrapping, refusing silently (returning `Ok(())`
with no wrap created, matching its existing no-op-on-already-wrapped
shape) for a revoked or unknown credential -- independent of whatever its
caller already checked. Two new tests prove this directly, calling the
function with no `verify` call anywhere in the test:
`ensure_wrapped_is_a_no_op_for_a_revoked_credential`,
`ensure_wrapped_is_a_no_op_for_an_unknown_credential`. The existing
`auth::a_revoked_device_can_never_recover_a_wrap_of_the_post_rotation_key`
test (previously misleadingly named -- it had only proved `verify`
rejects a revoked credential, not that this function does) now also
asserts the function itself refuses. Full suite after this fix: 786 lib
tests passed (784 + 2 new), `cargo fmt --check` clean, `cargo clippy
--all-targets -- -D warnings` clean.

## Addendum (2026-09-05) — the encrypt/decrypt round trip closed end to end for the learner entity

This slice closes the one remaining gap this ADR's own "Deliberately NOT
shipped" notes above kept flagging: pulled changes were never decrypted
or materialized, only version-tracked. Scoped to exactly the entity
already wired on the push side (`EntityKind::Learner`, via
`commands::learner`), per this slice's own task boundary — not
generalized to every `EntityKind` variant yet.

**On enqueue**: already done by an earlier slice
(`commands::learner::enqueue_learner_sync_change`) — a created/duplicate-
checked learner is serialized to JSON and encrypted under the resolved
SSPK via `crypto::payload_key::encrypt_payload` before
`sync_outbox::enqueue` ever sees it. This addendum found that wiring
already complete and correctly tested; nothing needed to change there.

**On pull — new this slice**: `sync_client::pull_once` now actually
decrypts a non-conflicting `AcceptedChange`'s `encrypted_payload` and
applies it, instead of only advancing `sync_version_cache`'s watermark.
This needed a new capability the client side did not have: a way for a
device to obtain its OWN plaintext SSPK. The wrap row
(`sync_payload_key_wraps`) lives only in the HUB's database — a device's
own local database never held one — so a new authenticated hub endpoint,
`GET /sync/payload-key-wrap`, was added: it hands the requesting device
back exactly its own stored wrap (ciphertext + nonce), read via the new
`repository::sync_payload_key::get_wrap_for_credential` (a plain,
un-unwrapping SELECT — the hub itself never holds a device's secret, so
it could never unwrap on the device's behalf even if it wanted to). The
device unwraps that response locally with the wrap key it derives from
its own already-held device secret
(`crypto::payload_key::derive_wrap_key` + `unwrap_payload_key`,
`sync_client::resolve_sspk`) — the plaintext SSPK crosses the network
boundary exactly as many times as it did before this addendum (zero;
only its per-device wrapped form ever does), consistent with the
enrollment ceremony's own existing guarantee.

This is a genuinely new wiring point (a new network endpoint plus a new
client-side HTTP round trip on every pull round that needs to decrypt
something), not merely filling in a stub — hence this addendum rather
than treating it as an unrecorded implementation detail. It also means
`hub_server::authenticate`'s existing lazy `ensure_wrapped_for_credential`
call has a second consumer now (the new endpoint's own `authenticate`
call), not just the push/pull handlers — no new behavior there, but
worth noting since a wrap row can now be _read back_ by a device, not
only lazily _written_ for it.

**Applying a decrypted change**: routed through the EXISTING repository
write path, `repository::learner::upsert_from_sync` (new), an
`INSERT ... ON CONFLICT(id) DO UPDATE` — deliberately not a separate
insert-vs-update branch, since a pulled change this device chose to
apply (i.e. it has no unsynced local edit disputing it — the existing
conflict check is unchanged) is never something to distinguish "new to
this device" from "this device has a stale copy" for. The decrypted
payload's own `school_id` field is cross-checked against the pull's
`config.school_id` before writing — defense in depth (decrypting
successfully under this school's SSPK already strongly implies the
match, but this is not treated as proof) — a mismatch is rejected exactly
like a tampered payload, never silently written under a possibly-wrong
school scope.

**Fail-closed on rejection**: a payload that fails to decrypt (wrong or
rotated key, corrupted ciphertext, tampered AES-GCM auth tag), fails to
deserialize as the expected entity, or fails the `school_id` cross-check
is rejected outright — `sync_client::apply_decrypted_change` returns
`Err(())`, and `pull_once` responds by incrementing a new
`PullRunSummary::rejected` counter, marking the round `failed`, and
**stopping the batch loop right there** — neither the domain table, the
version cache, nor `sync_pull_cursor` advances past the bad change. The
same exact change is therefore retried (and re-rejected, if the
condition persists) on every future pull round rather than being
silently skipped past or partially applied. An entity kind other than
`Learner` reaching `apply_decrypted_change` (unreachable today — no other
kind is ever enqueued yet) is treated the same way: fail closed, never a
silent no-op "success."

**Tests (TDD)**: 2 new at `repository::sync_payload_key`
(`get_wrap_for_credential` returns the stored ciphertext/nonce verbatim
and unwraps correctly; returns `None` for a credential with no wrap), 2
new at `hub_server` (the new endpoint returns THIS device's own wrap of
the CURRENT `state.sspk`, proven by unwrapping the response and comparing
directly to `state.sspk`; the endpoint is unauthorized with no
credential headers), 2 new at `repository::learner`
(`upsert_from_sync` inserts a never-seen learner; updates an existing row
in place without duplicating it), and at `sync_client`: the existing
`pull_once_applies_a_non_conflicting_change` test now asserts a REAL row
exists in the `learners` table (not just an advanced version watermark),
the existing conflict test now also asserts the domain table was NOT
touched, plus two new tests —
`pull_once_rejects_a_tampered_payload_without_applying_or_advancing_past_it`
and `pull_once_rejects_a_payload_encrypted_under_the_wrong_key` — both
proving the domain table, version cache, and cursor all stay put on a
rejected change. The encrypt-then-decrypt round trip itself was already
covered by `crypto::payload_key`'s own pre-existing tests (nothing new
needed there); the "domain write enqueues an actually-encrypted payload"
requirement was likewise already covered by
`commands::learner`'s existing `create_learner_with_an_sspk_enqueues_a_
correctly_encrypted_outbox_entry` test.

**Verification actually run this session**: `cargo build` (whole crate,
including `src-tauri`'s Tauri binary target) — clean; `cargo test --lib`
— **794 passed, 0 failed** (784 baseline + 10 new: 2
`sync_payload_key`, 2 `hub_server`, 2 `learner`, and the pull_once test
updates/additions in `sync_client` net +4 there); full-crate `cargo test`
(lib + every integration test binary + doctests) — exit code 0, all
integration suites green, 0 doctests (unchanged); `cargo fmt --check` —
clean (after one `cargo fmt` pass this session to fix formatting drift
this change introduced); `cargo clippy --all-targets -- -D warnings` —
clean, zero warnings; `npm run quality:security` — **3 ok, 0 failed, 0
missing** (gitleaks, `cargo-deny`, `osv-scanner` all present and passing;
no new dependency was added). `npm run quality` (TypeScript side) was not
attempted — no TS/UI file was touched by this slice, matching the prior
addendum's own scope boundary.

**Independent review**: a fresh `security-reviewer` subagent was not
reachable in this session's toolset (same known gap as the prior two
addenda) — the fallback in `.claude/rules/autonomous-development.md`
("Reviewer harness failures are not automatic stops") was followed:
recorded honestly here, and a rigorous self-review was performed instead,
covering: (1) the new endpoint never returns a wrap for anyone but the
credential that authenticated the request (`verified.credential_id`, not
a caller-supplied id — there is no such parameter to mistrust); (2) a
missing wrap row on this endpoint is treated as `Internal`, never a
silent empty/default response a caller could mistake for a real (but
empty) wrap; (3) `apply_decrypted_change`'s `school_id` cross-check
closes the one plausible "decrypts fine but for the wrong tenant"
concern defense-in-depth, even though it is not reachable today given
the SSPK is already per-school; (4) confirmed the batch-stopping
behavior on rejection is a deliberate fail-closed choice, not an
oversight -- continuing past a rejected change and only skipping it would
let a persistent decrypt failure "lose" that one change forever with no
retry, which is worse than temporarily stalling the rest of that pull
round behind it (the next round, seconds later per `POLL_INTERVAL`,
retries from the same cursor position). No blocking issue was found.
This independent-review debt is retained, not dropped — owed for a
future session with a healthy reviewer harness, same as the two prior
addenda's outstanding debt.

**Deliberately NOT shipped this slice, and why**: `db::rotate_sspk` and
the Windows DPAPI file-overwrite path remain exactly as deferred by the
prior addendum — untouched by this slice, still needing native Windows
verification this sandbox cannot perform. Generalizing this same
encrypt/decrypt wiring to the other nine `EntityKind` variants
(`Section`, `SectionMembership`, `Attendance`, ...) is explicitly out of
scope for this slice too — none of them has a producing write path
enqueued into `sync_outbox` yet, so there is nothing real to generalize
against without guessing at a schema. Local caching of the unwrapped SSPK
across pull rounds (today, `resolve_sspk` re-fetches and re-unwraps on
every round that needs to decrypt something) was deliberately not added
either — it would be new persisted-or-cached key material, the same
scope boundary `crypto::payload_key`'s own doc comment already draws
around this slice, and the extra HTTP round trip's cost is negligible
next to `POLL_INTERVAL`'s 30-second cadence.

## Addendum (2026-09-05) — `db::rotate_sspk` closes the deferred file-overwrite path, run on real Windows hardware

The prior addendum's own deferral above is now closed. This session ran
on a genuine Windows machine (not the Linux sandbox that deferred this
three times before), so the new DPAPI-touching code and tests exercise
the real `CryptProtectData`/`CryptUnprotectData` Win32 APIs, not a
skipped placeholder.

**What shipped**: `crypto::KeyStore` gained a second trait method,
`rotate_key`, alongside the existing `load_or_create_key`. Unlike that
method (which reads and reuses an existing key, only minting on a
missing file), `rotate_key` always overwrites the target file with a
genuinely new key regardless of what's there, via
`DpapiKeyStore::rotate_key_file`: generate → DPAPI-protect → write to a
randomly-suffixed sibling temp file → `rename` that temp file over the
target path. The temp file is a sibling in the same directory (never a
separate system temp dir, which could be a different volume) so the
final `rename` is a single filesystem operation with no window where the
target is missing or half-written; a rename failure removes the
now-orphaned temp file before propagating the error. `db::rotate_sspk`
is a one-line wrapper over this, structured identically to
`load_or_mint_sspk` (same `cfg(windows)`/`cfg(not(windows))` split, same
fail-closed error message on an unsupported platform).

**Wiring decision — closure injection over threading an `AppHandle`
through `auth`**: the natural "wire it into the revocation call site"
instruction (this ADR's own prior addenda, and `docs/CURRENT-HANDOFF.md`'s
recurring "exact next task") could have meant changing
`auth::revoke_device_sync_credential`'s own signature to accept an
`AppHandle` and call `db::rotate_sspk` internally. That would have broken
every one of that function's existing tests, none of which can construct
a real `AppHandle` (this crate has no `tauri::test` mock-runtime
dependency, and adding one just for this would be a new dev-dependency
for a single call site). Instead, a new
`auth::revoke_device_sync_credential_and_rotate_sspk` composes the
existing, completely unchanged `revoke_device_sync_credential` with a
`rotate_sspk: impl FnOnce() -> AppResult<()>` closure parameter — the
same "accept already-resolved crypto material, never a Tauri handle"
convention this module already uses for `enroll_device_sync_credential`'s
`sspk` parameter. This keeps 100% of the existing revocation test suite
untouched and makes the new coordination logic itself fully testable
(closure call counting, forced-failure injection) without any Tauri
runtime dependency at all.

**Ordering decision**: filesystem rotation runs strictly after the
DB-side revoke/wrap-clear `SAVEPOINT` has released (committed), never
inside it — a filesystem write cannot participate in a SQL transaction,
so true cross-system atomicity isn't achievable, and the two possible
failure directions are not equally bad. Committing the DB revoke first
means a filesystem hiccup can never block or roll back the
security-critical revocation itself; if rotation then fails, the
function returns `Err`, and a rotation retry is always safe since it
never needs to know or verify the previous key's value. The reverse
order (rotate, then revoke) risks the worse inconsistency: the SSPK file
already changed while a rolled-back DB transaction leaves every device's
stored wrap still describing the OLD key, silently breaking every future
sync round for every device until manually corrected. A dedicated test
injects a forced rotation failure and confirms the revocation is still
durably committed regardless.

**No command/UI surface exists for this at all** — confirmed by
searching the whole `commands/` tree before starting: neither
`enroll_device_sync_credential` nor `revoke_device_sync_credential` (nor
now `revoke_device_sync_credential_and_rotate_sspk`) is wrapped in a
`#[tauri::command]` anywhere in this codebase. This is not a regression
from this slice — building that command and the conflict-review UI
remain the concrete open items under this ADR's own "OPEN" production
gates.

**Tests**: `crypto::dpapi` — 4 new, all genuinely exercising DPAPI on
this Windows machine (rotation produces a different key and a later load
sees the rotated value; rotation succeeds with no prior file; no temp
file left behind on success; the rotated file still round-trips through
`unprotect`). `auth` — 4 new (rotation invoked exactly once on an actual
revocation; never invoked for an unknown credential, matching the
existing `Unauthorized` gate; never invoked when the caller lacks
authority to revoke; a forced rotation failure does not undo the
already-committed revocation). `repository::sync_payload_key` — net 1
new, see the real finding below.

**Independent review — real finding, fixed same session**: a
`security-reviewer` subagent was dispatched specifically for this
crypto-sensitive change and found a genuine SHOULD-FIX, confirmed
reachable given this slice's own chosen ordering, not a false positive:
`ensure_wrapped_for_credential` only checked whether a wrap row already
_existed_ for a credential, never whether its content actually matched
the current SSPK. Because the DB-side wrap-clear (`rotate_for_school`)
and the filesystem SSPK rotation (`db::rotate_sspk`) cannot commit
atomically together, a device authenticating in the gap between the DB
commit and the file rotation finishing would be wrapped against the
NOT-YET-ROTATED old key — and the exists-only check meant that wrap
would never be revisited again, permanently stranding that one device on
a stale key while every other device moved on to the new one.

**Fix**: `ensure_wrapped_for_credential` now unwraps and compares a
wrap's actual decrypted content against the SSPK it was given for THIS
call; a mismatch is treated as stale and triggers a new
`refresh_wrap_for_credential` — a narrowly-scoped `INSERT ... ON
CONFLICT(credential_id) DO UPDATE`, deliberately kept separate from
`wrap_for_credential`'s existing plain-`INSERT` contract (a dedicated
test proves that one still errors on a second wrap for the same
credential — "at most one wrap per credential" remains a real invariant
for the normal enrollment path, only this self-healing path is allowed
to overwrite). This closes the race regardless of which order the two
non-atomic steps land in: a stale wrap self-heals the very next time
that device authenticates, no matter which side of the gap created it —
making the earlier "commit DB first" ordering decision belt-and-suspenders
rather than the only thing standing between this feature and a real bug.
One pre-existing test,
`ensure_wrapped_is_a_no_op_when_a_wrap_already_exists`, had encoded the
old (buggy) behavior as the intended contract ("a second SSPK must never
overwrite the existing wrap"); split into two corrected tests: one
proving a wrap that already matches the current SSPK is left untouched,
one (`ensure_wrapped_self_heals_a_stale_wrap...`) proving a stale one
self-heals.

Reviewer's three other findings were informational, no action taken: (1)
this feature is not reachable via any Tauri command yet, matching the
"no command/UI surface exists for this at all" note above — expected,
not a gap introduced here; (2) the freshly generated key in
`dpapi.rs` is not explicitly zeroized after use, but this matches an
existing, pre-established pattern elsewhere in this same file, not a new
regression; (3) `rotate_key_file` calls `fsync` before its rename while
the older `create_new_key_file` does not — a minor inconsistency worth
aligning if that older function is ever touched again, not blocking now.
No BLOCKING findings. No recurrence of this project's two
previously-documented failure classes (unauthenticated bootstrap,
check-then-act singleton races) — `revoke_device_sync_credential`'s own
authorization gate was independently re-confirmed intact.
