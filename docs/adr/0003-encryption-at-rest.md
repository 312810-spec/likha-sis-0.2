# ADR-0003 — Encryption-at-Rest & Secure Key Storage (M2)

Status: Accepted

## Context

M1 proved ordinary SQLite behind the `LocalDatabase` boundary but stored
data in plaintext, deferred by design (ADR-0002). A DepEd SIS on a
Windows device that could be lost, stolen, or shared holds real minors'
PII in production; security/privacy is this project's top priority, and
every later feature milestone builds more data on top of the M1 schema —
so encryption is far cheaper to establish now than to retrofit later.

Two sub-decisions were needed: what encrypts the database, and what
protects the encryption key.

## Decision

**Encryption**: SQLCipher, via `rusqlite`'s `bundled-sqlcipher-vendored-openssl`
feature (page-level AES-256-CBC + HMAC-SHA512, SQLCipher 4 defaults —
pinned explicitly with `PRAGMA cipher_compatibility = 4` so a future
SQLCipher upgrade in this dependency cannot silently change the on-disk
format and break opening existing databases).

Rejected alternatives:

- `sqlite3mc` (SQLite Multiple Ciphers) — less mature Rust binding
  ecosystem than `rusqlite`'s SQLCipher support; no compelling advantage
  found to justify the extra integration risk.
- Relying on OS-level disk encryption (BitLocker) alone — not guaranteed
  enabled, not app-verifiable, and does not protect against a different
  OS user account or process reading the file once the volume is already
  mounted (a real risk on a shared school computer).
- Column-level encryption of individual PII fields — more bespoke and
  error-prone (breaks indexing, needs per-field IV/nonce management,
  leaves schema/metadata exposed) than whole-database page-level
  encryption via a proven library.

`bundled-sqlcipher-vendored-openssl` was verified to actually build on
this Windows/MSVC toolchain (it needed Perl installed for the vendored
OpenSSL build — added via winget). The database is keyed with a raw
256-bit key (`PRAGMA key = "x'<hex>'"`), not a passphrase — we already
have a strong random key, so passphrase-mode's PBKDF2 derivation would
be pure overhead.

**Key storage**: a fresh 256-bit key is generated once with the OS CSPRNG
(`rand::fill`), protected with Windows DPAPI (`CryptProtectData`, current
Windows user scope, `CRYPTPROTECT_UI_FORBIDDEN` set so it can never block
on a prompt), and the protected blob is written to a key file in the app
data directory (`likha-sis.key`, alongside `likha-sis.db`).

Rejected alternative: Windows Credential Manager (`wincred` API) — more
UI/credential-target oriented; DPAPI protecting a self-managed blob is the
simpler, more standard pattern for "protect a generated secret" and needs
no additional API surface.

**Fail-closed, not fail-open**: `DpapiKeyStore::load_or_create_key`
creates the key file atomically (`OpenOptions::create_new`), so two
racing app instances can never clobber each other's key. If a key file
exists but DPAPI cannot decrypt it (corruption, wrong user profile), the
app returns a hard error — it never silently generates a replacement key,
which would open (or create) a different database than the one the
existing key protects, orphaning all previously encrypted data.

**Key hygiene**: the raw key and its intermediate hex/string
representations are wiped with `zeroize` immediately after each use
(after the `PRAGMA key` statement runs, after DPAPI-unprotecting an
existing key) rather than left for the allocator to reuse verbatim.

## Consequences

- **Threat model, stated honestly**: DPAPI (current-user scope) defends
  against a lost/stolen device or a different OS user/profile reading the
  raw key file. It does **not** defend against malicious code already
  running as the same logged-in Windows user — that would need a much
  heavier hardware-backed key store (TPM, Windows Hello). Acceptable as a
  v1 baseline; revisit if the threat model changes.
- Every process that opens `likha-sis.db` now needs both the db file and
  the matching `likha-sis.key` (DPAPI-bound to the same Windows user
  account on the same machine). There is intentionally no recovery path
  for a lost key file in this milestone — restoring from a cloud sync
  backup (once sync exists) is the intended recovery mechanism, not a
  local escape hatch that would weaken the encryption guarantee.
- New build-time dependency: Perl (Strawberry Perl), required to compile
  vendored OpenSSL for SQLCipher on Windows. Documented in
  `CURRENT-HANDOFF.md`.
- `db::open` and `db::open_app_db`'s signatures changed to require a key;
  every repository/command test now generates a throwaway key via
  `crypto::generate_key()`. The repository/command/migration pattern from
  M1 is otherwise unchanged — encryption is transparent below `db::open`.
- Verified empirically, not just by design: a test opens an encrypted
  database with no key and with the wrong key and confirms SQLCipher's
  HMAC check genuinely rejects both (visible in the test's own log
  output), not just that our Rust code assumes it would.
