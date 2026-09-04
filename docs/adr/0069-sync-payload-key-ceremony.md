# ADR-0069 — Sync payload key ceremony (ADR-0067 addendum)

Status: Accepted (foundation). Not yet wired into `sync_outbox` enqueue or
a network listener — see "Next slice" below.

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
