# ADR-0081 — School logo sync byte budget: shrink `MAX_LOGO_BYTES`, wire to sync

Status: Accepted. Batch 10, continuing the Batch 6/9 pattern of wiring an
existing entity's writes into ADR-0067's sync protocol.

## Context

Batch 6 deliberately deferred wiring the school-logo/branding upload
(`commands::school::set_school_logo`/`clear_school_logo`, ADR-0070) into
sync. The reason: `MAX_LOGO_BYTES` (the command-layer upload cap) was
512 KiB, comfortably larger than `sync::MAX_ENCRYPTED_CHANGE_BYTES`
(256 KiB, the hard ceiling every `PendingChange.encrypted_payload`
must fit under, enforced by `sync::validate_change` and by the SQLite
`CHECK (length(encrypted_payload) <= 262144)` on all four sync tables).
A logo upload at or near the 512 KiB cap could never be synced without
either raising `MAX_ENCRYPTED_CHANGE_BYTES` (a change with much broader
blast radius — every other entity's payload budget too, and the schema
CHECK constraints on four tables) or shrinking `MAX_LOGO_BYTES` to
actually fit.

**This is a judgment call made in the project owner's absence.** The
owner has instructed that this class of decision — a self-contained,
reversible sizing choice with no DepEd compliance implication and no
externally-imposed constraint — is Claude's to make using best judgment
per `.claude/rules/autonomous-development.md`'s decision-mechanism
process, not something to block a wave on. The choice, and the
alternative not taken, are recorded here in full so the owner can
revisit it later if they'd prefer a larger logo limit (see "Not chosen"
and the FYI entry added to
`docs/product/OWNER-DECISIONS-NEEDED.md`).

## Decision

**Shrink `MAX_LOGO_BYTES` from 512 KiB to 48 KiB and wire
`set_school_logo`/`clear_school_logo` into the existing sync protocol
using the same JSON-then-encrypt payload shape every other entity
already uses** — no new binary-safe payload path. `EntityKind::SchoolLogo`
joins the `entity_kind` allowlist (migration 54); the ADR-0070
structural-lock gate is unaffected and verified to still run before any
sync code executes (see "Structural-lock survival" below).

### Why shrink rather than build a new binary-safe payload path

- **Simplicity and reversibility** (`CLAUDE.md`'s stated priority
  order places maintainability above zero-billing/performance/speed,
  and the autonomous-development rules call for "small, reversible
  changes"). A binary-safe sync payload path — a second wire format
  alongside the JSON-then-AES-GCM shape every other entity uses,
  understood by both `push_once`/`pull_once` and the hub server this
  crate talks to — is materially more code, more surface for a security
  review to cover, and a permanent fork in how sync payloads are shaped,
  for a feature (a small branding icon) that does not need anywhere
  near 512 KiB to do its job.
- **A school logo is a small identity icon, not a document store** —
  this was already this codebase's stated rationale for `MAX_LOGO_BYTES`
  existing at all (see the constant's doc comment, pre-Batch-10). A
  48 KiB WebP/PNG is still generous for a sidebar/header-sized logo; it
  is the _sync_ ceiling, not photographic-image storage, that motivates
  the number.
- **No dependency addition required.** Shrinking needs no new code path
  at all — the entity's plaintext already goes through
  `serde_json::to_vec` then `payload_key::encrypt_payload`, identical to
  every other entity. A more space-efficient binary encoding (e.g.
  base64) was considered and rejected for this same reason — see "Not
  chosen" below.

## Byte-budget math

The real question this ADR has to answer precisely: what raw byte count
X, run through this crate's actual JSON-then-AES-GCM encoding, produces
an `encrypted_payload` that stays safely under 256 KiB?

**Step 1 — how logo bytes are actually encoded in the plaintext.**
Every synced entity's plaintext is `serde_json::to_vec(&record)`
(verified directly in `commands::nutrition`, `commands::transfer_record`,
and now `commands::school::enqueue_school_logo_sync_change`). `serde_json`
has no special-cased encoding for `Vec<u8>` without an extra crate
(`serde_bytes`) or a hand-rolled `serialize_with` — by default it
serializes a `Vec<u8>` exactly like `Vec<u16>` or any other integer
vector: a JSON array of decimal numbers, e.g. `[137,80,78,71,...]`, NOT
a base64 string. A `base64` crate IS present in `Cargo.lock` as a
_transitive_ dependency of something else in the dependency graph, but
is **not** a direct dependency of this crate's `Cargo.toml` — using it
directly would require adding one, which this batch's constraints
forbid ("MUST NOT add a new dependency"). Hand-rolling a minimal base64
encoder without a crate was considered and rejected too (see "Not
chosen") — so the real, load-bearing encoding this ADR must budget for
is the **JSON-array-of-numbers** encoding, not base64.

Worst-case size of that encoding, per input byte: a byte 0–255 renders
as 1–3 ASCII digits plus a `,` separator between elements — at most
`"255,"`, i.e. **4 characters per byte** in the worst case (every byte
in the 100–255 range). This is the bound used, not the ~3.57-byte
_average_ for uniformly distributed bytes, per this batch's instruction
not to cut the margin to the exact average case.

**Step 2 — the small JSON wrapper around the bytes.** The synced record
(`repository::school::SchoolLogoSyncRecord`) also carries `schoolId`
(a 36-character UUID string) and `mime` (up to `"image/webp"`, 10
characters) alongside `bytes`. Measuring the actual field/key/brace/
quote overhead: `{"schoolId":"<36 chars>","mime":"<≤10 chars>","bytes":` `}`
comes to roughly 80 bytes. This ADR budgets **256 bytes** for it — triple
that measurement, generous headroom for the field names or an extra
field (e.g. a future `updatedAt`) growing later without silently
eating into the safety margin.

**Step 3 — AES-256-GCM overhead.** Verified directly from
`crypto::payload_key::encrypt_payload`/`NONCE_LEN`: the stored blob is
`nonce (12 bytes) || ciphertext`, and AES-GCM's ciphertext is the
plaintext length plus a 16-byte authentication tag appended by the
`aes_gcm` crate (`Aes256Gcm::encrypt`) — no other overhead. Total
encryption overhead: **12 + 16 = 28 bytes**, independent of plaintext
size.

**Step 4 — solve for X (`MAX_LOGO_BYTES`).** Target ceiling: comfortably
under `MAX_ENCRYPTED_CHANGE_BYTES` (262,144 bytes) — this ADR uses
**200 KiB (204,800 bytes)** as the safety-margin target, leaving roughly
23% headroom (57,344 bytes) below the hard cap for the wrapper/overhead
estimate to be wrong by a wide margin and still not blow the real limit.

```
encrypted_blob_len(X) = 4·X + 256 (wrapper) + 28 (nonce+tag)
                       = 4·X + 284

Solve 4·X + 284 ≤ 204,800:
    4·X ≤ 204,516
    X   ≤ 51,129 bytes
```

**Chosen value: `MAX_LOGO_BYTES = 48 * 1024 = 49,152 bytes`** — under
the 51,129-byte solved ceiling, and a clean, self-documenting binary
round number consistent with this codebase's existing convention
(the old constant was also written as `512 * 1024`).

**Verification of the final number**, worst case:

```
plaintext (JSON array, worst case) = 4 × 49,152      = 196,608 bytes
+ wrapper                                             +     256
+ AES-GCM nonce+tag                                    +      28
                                                       ---------
encrypted_payload (worst case)                        = 196,892 bytes

262,144 (MAX_ENCRYPTED_CHANGE_BYTES) − 196,892 = 65,252 bytes headroom
                                                  (≈ 24.9% under the cap)
```

This exact inequality is now also a standing regression test:
`commands::school::tests::max_logo_bytes_leaves_headroom_under_the_sync_encrypted_change_cap`
recomputes the same worst-case bound from `MAX_LOGO_BYTES` and asserts
it against the live `sync::MAX_ENCRYPTED_CHANGE_BYTES` constant, so the
two can never silently drift apart again the way the old 512 KiB figure
did (that figure was never actually checked against the sync cap until
this batch, because the sync path for this entity didn't exist yet).

## Not chosen

- **Raise `sync::MAX_ENCRYPTED_CHANGE_BYTES` instead.** Rejected: this
  constant is shared by every entity's sync payload, not just the logo,
  and is embedded in a `CHECK` constraint on four separate SQLite
  tables (`sync_outbox`, `sync_hub_log`, `sync_conflict_review`,
  `sync_version_cache`). Raising it to accommodate one entity's binary
  payload would widen the ceiling for every other entity too (a much
  larger blast radius for a change motivated by one feature) and would
  itself need another 12-step CHECK-widening migration for no benefit
  to any entity but this one.
- **A dedicated binary-safe sync payload path** (e.g. a separate table
  or column for raw bytes, bypassing the JSON-then-encrypt envelope).
  Rejected for this batch — this is the "new binary-safe payload path"
  this batch's owner-provided context explicitly named as the
  alternative not to build, given the shrink-based fix is materially
  simpler and the school logo doesn't need a large limit. Left as a
  documented option if the owner later wants a larger logo ceiling (see
  the FYI entry in `docs/product/OWNER-DECISIONS-NEEDED.md`).
- **Hand-rolled base64 encoding (no crate)** for just the `bytes` field,
  to buy back the ~3x space the JSON-array encoding wastes (base64's
  4/3 inflation vs. the JSON array's ~4x worst case would raise the
  safe ceiling from ~48 KiB to roughly 140–150 KiB at the same 200 KiB
  target). Considered seriously — it needs no new dependency, `base64`
  encode/decode is a well-known, small, pure-function algorithm. **Not
  chosen for this batch**: it is still new code (an encoder, a decoder,
  and tests for both) on a security-sensitive path (the payload later
  gets AES-GCM-encrypted and is trusted content once decrypted) purely
  to raise a limit that 48 KiB already serves adequately for its actual
  purpose (a small branding icon, not photographic storage). Recorded
  as the natural next lever if the owner wants a materially larger logo
  ceiling without the bigger step of a whole new binary payload path.
- **Cutting the safety margin closer to the 256 KiB cap** (e.g. solving
  for exactly 262,144 bytes instead of a 200 KiB target). Rejected per
  this batch's explicit instruction not to cut the margin to the exact
  byte — the 200 KiB target leaves room for the wrapper-overhead
  estimate (Step 2) to be meaningfully wrong without silently
  regressing past the real hard cap.

## Structural-lock survival through the sync path

ADR-0070's `auth::require_structural_lock_unlocked` gate (per-school,
optional, session-scoped PIN unlock) already wrapped
`set_school_logo`/`clear_school_logo` before this batch, alongside their
`Capability::ManageSchoolBranding` check. **Verified, at the same rigor
as Batch 6's `LessonPlan::authorize_own_assignment` check and Batch 9's
`TransferRecord` authorization verification**: in both commands, the
call order in the `#[tauri::command]` function body is

```
authorize_capability_with_actor(...)?;     // Capability::ManageSchoolBranding
require_structural_lock_unlocked(...)?;    // ADR-0070 gate
let sspk = resolve_sspk_if_enrolled(...)?; // sync setup only
set_school_logo_with_optional_sync(...)    // sync-aware write path
```

Both gates use Rust's `?` operator, which returns immediately on
`Err` — there is no code path in `set_school_logo` or `clear_school_logo`
that reaches `resolve_sspk_if_enrolled` or the `*_with_optional_sync`
functions without both checks having already succeeded. The sync-aware
write functions (`set_school_logo_with_optional_sync`,
`clear_school_logo_with_optional_sync`) take an already-authorized
`school_id`/`actor_user_id` as plain parameters — they perform no
authorization of their own and have no way to be reached except through
the gated command functions above. Sync wiring in this batch added
SSPK resolution and an outbox enqueue **after** both gates, never
before and never as an alternative path around them.

## What shipped

- **Migration 54**: widens the `entity_kind` allowlist (`sync_outbox`/
  `sync_hub_log`/`sync_conflict_review`/`sync_version_cache`) to add
  `'school_logo'`, the same 12-step CHECK-widening rebuild as every
  prior entity addition (migrations 24, 26, 36, 41, 47, 48, 53).
- **`sync::EntityKind::SchoolLogo`** (`"school_logo"` wire string).
- **`repository::school::SchoolLogoSyncRecord`** — the wire shape
  (`schoolId`, `mime`, `bytes`), plus `upsert_logo_from_sync` and
  `find_logo_by_id`. Unlike every other synced entity, a logo has no
  `id` column of its own (it lives as two columns directly on the
  `schools` row) — this entity's sync `entity_id` **is** `school_id`
  itself, a school-scoped singleton. `find_logo_by_id` fails closed
  (returns `None`) if a caller ever passes a mismatched
  `(school_id, entity_id)` pair, which should never legitimately occur
  since this device is the only source of `entity_id` for its own logo
  changes.
- **`commands::school`**: `set_school_logo`/`clear_school_logo` follow
  `commands::nutrition`'s exact enrollment-gated encrypt-on-enqueue
  `SAVEPOINT` pattern. `clear_school_logo` enqueues a
  `ChangeOperation::Delete` carrying the last-known logo content (so a
  receiving device's `apply_decrypted_change` can still validate
  `school_id` before acting, matching `commands::teaching_assignment`'s
  own delete-payload precedent) only when a logo actually existed to
  clear — clearing an already-absent logo remains a true no-op,
  enqueueing nothing.
- **`sync_client::apply_decrypted_change`**: `EntityKind::SchoolLogo`
  arm, handling both `Upsert` (`school::upsert_logo_from_sync`) and
  `Delete` (`school::clear_logo`) — the second entity kind (after
  `TeachingAssignment`) with a real `Delete` handler; the existing
  "any other kind's `Delete` is untrusted" guard was widened to allow
  both.
- **`ConflictEntityPreview::SchoolLogo { mime, byte_len }`** in
  `commands::conflict_review` — deliberately omits the raw logo bytes
  from the preview (a conflict-review screen renders text/JSON, not an
  `<img>`, and shipping the full binary blob through a preview payload
  defeats the point of keeping `MAX_LOGO_BYTES` small); `byte_len` lets
  a teacher still see "this changed" without needing to see the image.

## Verification

Commands run this session, actual output — see `docs/CURRENT-HANDOFF.md`'s
Batch 10 entry for the full transcript. Summary:

- `cargo test` (whole crate) — all tests passed, including 5 new
  `commands::school::tests::sync_tests` tests, 5 new
  `repository::school::tests` tests (sync record round-trip,
  entity-id-mismatch fail-closed), 2 new `sync_client::tests` push/pull
  round-trip tests (`SchoolLogo` upsert and delete), and 1 new
  `commands::conflict_review::tests` typed-preview test.
- `cargo clippy --all-targets -- -D warnings` — clean.
- `cargo fmt --check` — clean.
- `npm run quality` — run for the Checkpoint 1 frontend `MAX_LOGO_BYTES`
  mirror change (`src/domain/school-logo.ts`,
  `src/application/school-logo-service.test.ts`); typecheck, lint,
  format:check, architecture check, `knip`, and `vitest run` (138 test
  files, 1273 tests) all passed.

No natural-key-collision test — like `TransferRecord` (ADR-0080), this
entity's sync identity is `entity_id` alone (here, always `school_id`),
resolved by a plain singleton `UPDATE`/`ON CONFLICT`-equivalent path
with no separate uniqueness rule to violate.
