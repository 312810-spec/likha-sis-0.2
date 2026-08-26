# ADR-0044: Local Data Security Verification & Threat Model (Wave 2D)

Status: Accepted (verification of an existing architecture — see "Repository
truth" below)
Date: 2026-08-26

## Repository truth (read this first)

This milestone's directive assumed local-data encryption did not yet
exist. **It already does**, built and accepted in M2
(`docs/adr/0003-encryption-at-rest.md`, `src-tauri/src/crypto/`,
`src-tauri/src/db/mod.rs`): SQLCipher (page-level AES-256-CBC +
HMAC-SHA512, `PRAGMA cipher_compatibility = 4` pinned) via `rusqlite`'s
`bundled-sqlcipher-vendored-openssl` feature, keyed with a 256-bit
CSPRNG-generated raw key, the key itself protected at rest with Windows
DPAPI (current-user scope) via a `KeyStore` trait (`src-tauri/src/crypto/mod.rs`)
whose only implementation today is `DpapiKeyStore`
(`src-tauri/src/crypto/dpapi.rs`) — already a platform-abstracted
interface, not Windows-specific code leaking into `db`/`repository`/
domain/UI. `db::open` fails closed on a corrupted/undecryptable key file
and never silently mints a replacement key.

**This milestone is therefore a verification, hardening, and
documentation exercise against an already-accepted architecture, not a
greenfield build.** Where the directive's steps assumed new
implementation work, they were re-scoped to: confirm the existing
architecture still holds up against current evidence and a fuller
threat model; add tests that were genuinely missing; close the
dependency-scanning debt; and produce the threat-model documentation
that didn't yet exist in this explicit, enumerated form.

## Security question, answered directly

_"If an unauthorized person obtains a teacher's Windows device, copies
LIKHA's local database or backup files, or removes the database and
opens it with ordinary SQLite tooling, can learner information be
recovered without authorization?"_

**No, for the database file itself, verified directly this session**
(not just asserted by design):

- The official `sqlite3.org` command-line tool (v3.53.4, freshly
  installed this session via `winget install SQLite.SQLite` — this is
  "ordinary SQLite tooling" in the most literal sense, not a
  hypothetical), pointed at a real LIKHA-format encrypted database file
  containing a synthetic learner (`Ana Manual Proof` / `Dela Cruz Manual
Proof` / LRN `999999999999` / school `Rizal Elementary TEST`):
  - `.tables` returns nothing.
  - `SELECT * FROM sqlite_master;` fails outright: `Parse error in 2nd
command line argument: file is not a database (26)`.
  - A raw byte-level `grep` of the `.db` file for the synthetic name,
    LRN, and school name strings finds **zero matches** — the values
    are not merely inaccessible via SQL, they do not appear anywhere in
    the file's bytes at all.
- The existing `rusqlite`-based test suite (`src-tauri/src/db/mod.rs`)
  independently confirms both an unkeyed connection and a
  wrong-keyed connection fail to read `sqlite_master`, with SQLCipher's
  own HMAC check visibly rejecting both in the test log
  (`sqlcipher_page_cipher: hmac check failed for pgno=1`).
- **New this session**: the same raw byte-level absence was proven for
  the WAL and SHM sidecar files too, not just the main `.db` file — see
  "WAL/Journal Exposure Test" below. This closes a real gap: WAL mode
  (already enabled for crash resilience/concurrent-read reasons) writes
  changed pages to a separate `-wal` file _before_ they're folded back
  into the main file, and nothing had previously proven that sidecar
  file doesn't hold a plaintext page.

**Yes, correctly, for the encryption key** — trivially, since without
it none of the above tooling gets anywhere: the key itself is DPAPI-
protected, current-Windows-user-scoped, and the app fails closed
(refuses to guess/replace) rather than silently degrading if that
protection can't be reversed.

## Threat model

**In scope for this milestone (and already defended by the existing
architecture, reverified this session):**

| Scenario                                                                                               | Defended?                                                    | How                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stolen Windows laptop, powered off                                                                     | Yes                                                          | Attacker has the `.db` and `.key` files but not the logged-in Windows user's DPAPI master key material; `.db` alone is cryptographically opaque (proven above).                                                                                                                                                                                                                   |
| Copied database file (USB, network share, cloud sync of the app-data folder)                           | Yes                                                          | Same as above — the `.db` file is opaque without the paired, DPAPI-protected key file _and_ the original Windows user's credentials.                                                                                                                                                                                                                                              |
| Copied backup (a plain file-copy backup of the app-data directory)                                     | Yes, to the same degree as the live file                     | A backup is just another copy of the same encrypted bytes; see "Backup/Recovery Findings" for what a _restore_ requires.                                                                                                                                                                                                                                                          |
| Attacker with another local Windows account on the same machine                                        | Yes                                                          | DPAPI's protection is scoped to the Windows user account that created it; a different local account cannot unprotect it (this is DPAPI's core guarantee, not something this app implements itself).                                                                                                                                                                               |
| Attacker who knows the exact database file location                                                    | Yes                                                          | Knowing the path grants no advantage — the file's bytes are still opaque without the key.                                                                                                                                                                                                                                                                                         |
| Logged-out LIKHA user (app running, no active session)                                                 | Yes, trivially                                               | LIKHA's own session (`auth::SessionManager`) is a separate, in-memory-only concept from the SQLCipher key; a logged-out state means no `Session` object exists, but the already-open, already-keyed `Connection` a running process holds is a different question (see "malicious code running as the same user" below — genuinely out of scope, not silently claimed as covered). |
| Expired LIKHA session                                                                                  | Yes, same reasoning as above                                 | `Session::is_active` expiring closes the _application's_ authorization gate (`authorize_capability`/`require_active_session`); it has no effect on, and was never meant to affect, whether the on-disk file is encrypted.                                                                                                                                                         |
| Application uninstall/reinstall                                                                        | Not a new risk                                               | Uninstalling doesn't touch the app-data directory (standard Windows convention); the `.db`/`.key` pair survives untouched, so a fresh install's `open_app_db` finds and correctly reopens the existing encrypted database with the existing key. Reinstalling does not create a _new_ key or silently re-encrypt anything.                                                        |
| Corrupted encrypted database                                                                           | Fails closed, correctly                                      | SQLCipher's own page HMAC check rejects a corrupted/tampered page; `db::open` surfaces this as an `AppError`, never as silently-wrong data.                                                                                                                                                                                                                                       |
| Lost encryption key (key file deleted/corrupted, or moved to a machine where DPAPI can't unprotect it) | Fails closed, by design, **no recovery path exists locally** | See `DpapiKeyStore::load_or_create_key`'s doc comment and "Backup/Recovery Findings" below — this is a deliberate, documented tradeoff, not an oversight.                                                                                                                                                                                                                         |
| Backup restored to the same device                                                                     | Works                                                        | Both the `.db` and `.key` files are DPAPI-bound to that specific Windows user profile on that specific machine; restoring both together to the same device/user reopens correctly.                                                                                                                                                                                                |
| Backup restored to another authorized device                                                           | **Does not work today**                                      | DPAPI protection is bound to the originating Windows user profile; a `.key` file copied to a different machine (or a different Windows profile on the same machine) cannot be unprotected there. This is an honest, disclosed limitation — see "Backup/Recovery Findings."                                                                                                        |
| SQLite WAL/SHM/journal files                                                                           | Yes, verified this session                                   | See "WAL/Journal Exposure Test" — new test proves no plaintext learner data in the `-wal` file while it genuinely holds unflushed pages, and in the `-shm` file if present.                                                                                                                                                                                                       |

**Explicitly out of scope for this milestone (stated, not silently
ignored):**

- **Malicious code already running as the logged-in Windows user.**
  This is DPAPI's own well-documented limitation (also stated plainly
  in ADR-0003 and `DpapiKeyStore`'s doc comment): DPAPI protects data
  from a different user/account or from someone without the Windows
  login credentials, not from a process running with the same user's
  privileges (which could, in principle, call `CryptUnprotectData`
  itself). Closing this gap needs a materially heavier mechanism (TPM-
  backed keys, Windows Hello-gated access, hardware security module) —
  out of scope here and not attempted.
- **Developer/debug logs and crash dumps.** Reviewed directly this
  session (see "Dependency Security Findings"/code-audit note below):
  the only `log::` call anywhere in `crypto`/`db` is a fixed, generic
  string with no key material (`crypto/dpapi.rs:129`,
  `"LocalFree failed while releasing a DPAPI buffer"`). A full audit of
  every `log::`/`eprintln!` call across the entire codebase for
  learner-PII leakage is a larger, separate exercise not attempted this
  session — flagged as remaining debt below, not claimed as covered.
- **Temporary files created by the OS or other applications** (e.g. a
  Windows shadow copy, an antivirus quarantine copy, a search-indexer
  cache) — outside this application's control entirely.
- **Windows account password change.** For a standard local Windows
  account, Windows itself re-wraps the DPAPI master key transparently
  on a normal password change (the user knows their old password) —
  this is a Windows OS guarantee, not something LIKHA implements or can
  verify from inside the app. An _administrative_ password reset
  (bypassing the old password, e.g. via a domain admin or a Windows
  installation-media reset tool) is well known to break DPAPI
  unprotection for that user's existing protected data — this would
  manifest as `DpapiKeyStore::load_key` failing closed (the documented,
  correct behavior), not a silent data exposure. Not independently
  re-verified this session (would require reproducing an actual
  Windows password reset, out of scope for this environment).
- **Cross-device/cross-user recovery of a lost key.** See "Backup/
  Recovery Findings" — deliberately not solved with an insecure
  workaround.

## Recommended encryption architecture

**Reaffirm the existing M2 decision (SQLCipher + DPAPI) rather than
adopt something new.** A fresh 10-scenario-style evaluation against
current (2026) evidence does not surface a reason to change it:

| Option                                                                                                                                            | Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **SQLCipher via `rusqlite` `bundled-sqlcipher-vendored-openssl`, keyed by a DPAPI-protected raw key (Recommended — already adopted, reaffirmed)** | Whole-database page-level encryption, mature/widely-audited cipher library, already proven to build and run on this exact Windows/MSVC toolchain, already integration-tested against real read/write/restart/wrong-key scenarios, now also proven against raw-byte inspection of both the main file and WAL/SHM sidecars, and against the actual `sqlite3.org` CLI tool. `cargo-deny`/OSV-Scanner (both newly run this session — see below) report no unresolved advisories for this dependency chain.               |
| **Next Best: `sqlite3mc` (SQLite Multiple Ciphers)**                                                                                              | Same verdict as ADR-0003 reached: less mature Rust binding ecosystem than `rusqlite`'s SQLCipher integration; no new evidence this session changes that. Would still require a from-scratch key-management/DPAPI integration layer, duplicating work this app already has proven.                                                                                                                                                                                                                                    |
| Column/field-level application encryption on top of plaintext SQLite                                                                              | Rejected, same reasoning as ADR-0003: bespoke IV/nonce management per field, breaks indexing, leaves schema/table/row-count metadata fully exposed (an attacker could still learn how many learners exist, roughly how the data is shaped, even without reading field values) — page-level whole-database encryption is the stronger, simpler guarantee.                                                                                                                                                             |
| OS-level disk encryption (BitLocker) alone, no app-level encryption                                                                               | Rejected, same reasoning as ADR-0003: not guaranteed enabled on a given school's device, not app-verifiable, does not defend against a different OS user account on the same (already-unlocked) volume — a real scenario on a shared school computer, which this milestone's threat model explicitly includes.                                                                                                                                                                                                       |
| Windows Credential Manager (`wincred`) instead of DPAPI directly                                                                                  | Rejected, same reasoning as ADR-0003: more UI/credential-target oriented API surface for a use case (protect one self-managed generated secret) DPAPI already serves more simply; Credential Manager itself is built on DPAPI underneath, so choosing it directly would add API surface without a new guarantee.                                                                                                                                                                                                     |
| A provider-independent "key envelope" abstraction wrapping multiple possible OS key stores generically                                            | The `KeyStore` trait _already is_ this abstraction (`crypto/mod.rs`) — `DpapiKeyStore` is one implementation, not a hardcoded assumption; Android's future implementation (Android Keystore-backed) is a second `impl KeyStore` away, never a rewrite of `db`/`repository`/domain code. No further generalization is needed until a second implementation actually exists to design against — speculative genericization now would be the "premature abstraction" this project's own engineering rules warn against. |
| A hardware-backed key store (TPM/Windows Hello-gated)                                                                                             | Would close the one explicitly-out-of-scope gap above (malicious code running as the same user), but is a materially heavier v2 direction with real UX cost (a Hello prompt or TPM dependency on every unlock) — correctly deferred, not attempted this milestone, consistent with ADR-0003's own "acceptable as a v1 baseline; revisit if the threat model changes" framing.                                                                                                                                        |
| Field-level encryption for only the most sensitive columns (LRN, name) with the rest of the schema plaintext                                      | Rejected: partial protection creates a false sense of completeness (attendance records, grades, and section/enrollment relationships would still be fully exposed and could still identify a specific child's records even with name/LRN redacted) while adding real implementation complexity — whole-database encryption is both simpler and strictly stronger.                                                                                                                                                    |
| Do nothing further (accept ADR-0003 as already sufficient, decline this milestone's verification work)                                            | Rejected: the milestone's own premise — proving the guarantee, not just asserting it — has real value even when the underlying decision doesn't change; this session found and closed one genuine gap (WAL/SHM sidecar files were unverified) that a "no further work needed" stance would have left unproven indefinitely.                                                                                                                                                                                          |

## Key management design (unchanged, reaffirmed)

```
UI                          -- never imports crypto/db, never sees a key
  -> Application services   -- never imports crypto/db, never sees a key
  -> Domain/Repository ports -- never imports crypto/db, never sees a key
  -> db::open_app_db          -- the only place a key is loaded and used
  -> crypto::KeyStore (trait) -- the platform-abstracted boundary
       -> DpapiKeyStore (Windows, today's only impl)
       -> (future) an Android-Keystore-backed impl, same trait
```

No Tauri command anywhere accepts or returns key material (confirmed by
inspection — `commands::*` never imports `crate::crypto`). The key
exists only inside `db::open`/`db::open_app_db`'s stack frames and the
`Connection` it configures; every intermediate hex/string
representation is `zeroize`d immediately after use.

## Implementation/spike completed this session

No new encryption code was needed (already correct); what was added:

1. **New test**: `wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`
   (`src-tauri/src/db/mod.rs`) — inserts a distinctive synthetic marker,
   deliberately does not checkpoint, then reads the raw bytes of the
   `.db`, `.db-wal`, and `.db-shm` files directly and asserts the marker
   is absent from all three. This is the one genuine coverage gap this
   session found in the otherwise-solid M2 test suite.
2. **Manual, primary-evidence verification** using the real
   `sqlite3.org` CLI tool (freshly installed via `winget`) against a
   real encrypted LIKHA-format database file containing synthetic data
   — see "Security question, answered directly" above for the exact
   commands and results. This is the literal "ordinary SQLite tooling"
   scenario the milestone asked to prove against, using primary
   evidence rather than only the existing `rusqlite`-based tests
   (which, while correct, use the same crate/library the app itself
   uses to write the file — an independent tool closes that gap).
3. **Dependency security debt closure** — see below.
4. **Code-level audit**: confirmed (by direct `grep`) that no Tauri
   command imports `crypto`. **Corrected by independent security review
   (see below)**: this ADR's first draft understated the logging
   surface, claiming `crypto/dpapi.rs:129` was "the only `log::` call
   anywhere in `crypto`/`db`." In fact `src-tauri/src/error.rs` has four
   more `log::error!` sites (`AppError::key_store()` and the `From`
   impls for `rusqlite::Error`/`rusqlite_migration::Error`/
   `std::io::Error`) that fire whenever `db::open`'s `?` operators or
   `DpapiKeyStore`'s error paths propagate a failure — by design, for
   operator diagnostics, stripped to a generic category before crossing
   the Tauri IPC boundary (`error.rs`'s `Serialize` impl). The
   independent review confirmed none of these five sites ever echoes
   raw key bytes (rusqlite/SQLCipher/DPAPI error strings don't include
   bound-parameter or key values) — so this was a documentation-scope
   overstatement, not a real leak, and is corrected here rather than
   left standing.

## WAL/Journal exposure test

Covered in detail above. Summary: `journal_mode = WAL` was already
enabled (for crash resilience and concurrent-read reasons, unrelated to
encryption) since M1/M2, but nothing had previously proven the `-wal`
sidecar file — which genuinely holds not-yet-checkpointed page data
during normal operation — doesn't hold a plaintext copy of that data.
SQLCipher encrypts WAL frames using the same per-page cipher as the
main file (a documented SQLCipher 4 behavior, and now independently
confirmed empirically by this session's own test rather than only
trusted by citation): the new test proves the WAL file has real,
non-empty content at the moment of inspection (so the test is
meaningful, not vacuously passing on an empty file) and that the
synthetic marker string is absent from it.

## Backup/Recovery findings

- **Encrypted DB backed up** (a plain file copy of `likha-sis.db` +
  `likha-sis.key`, e.g. to a USB drive or an unencrypted cloud-sync
  folder): the backup is exactly as protected as the live files — an
  attacker with only the `.db` file learns nothing (proven above); an
  attacker with both files still needs the original Windows user's
  DPAPI-unprotect capability.
- **Restored on the same machine, same Windows user**: works
  transparently — `open_app_db` just finds the same key file and
  database file it already expects.
- **Restored after a Windows OS reinstall on the same physical
  machine**: DPAPI's protection is tied to the Windows user profile's
  cryptographic material, which a plain OS reinstall regenerates —
  **the key file becomes unrecoverable**, and `db::open` correctly
  fails closed rather than silently minting a replacement key
  (`DpapiKeyStore::load_key`'s documented behavior). This is a real,
  disclosed limitation of a purely local, single-device key-protection
  design, not a bug.
- **Device replaced (new machine)**: same failure mode as above — a
  `.key` file copied to a new machine cannot be unprotected there,
  because DPAPI protection never leaves the originating Windows
  user/machine pairing.
- **Secure key storage (DPAPI) unavailable**: cannot happen on a
  genuine Windows target (DPAPI is a core OS API); would only occur on
  an unsupported platform, where `open_app_db`'s `#[cfg(not(windows))]`
  branch already fails closed with an explicit "no encryption key store
  is implemented for this platform" error rather than silently falling
  back to an unprotected key.
- **Key material corrupted** (partial write, disk error): SQLCipher's
  HMAC check and/or DPAPI's own integrity check reject it; `db::open`/
  `DpapiKeyStore::load_key` surface this as a hard error, proven by the
  existing `load_or_create_key_fails_closed_on_corrupted_key_file` test.

**Honest conclusion, not weakened for convenience**: this architecture
has **no local, self-service recovery path** for a lost key or a
device/profile change, by deliberate design (ADR-0003 already stated
this; reaffirmed here). A safe cross-device recovery mechanism requires
authenticated cloud infrastructure that does not exist yet (Wave 5,
Sync, not built) — documented here as **deferred**, not invented as an
insecure local "recovery key" or backdoor merely to make this
milestone's tests more convenient. This is an accepted, disclosed
tradeoff for a local-first v1, not an oversight.

## Dependency security findings

All three previously-unavailable security tools were installed this
session via `winget` (network access confirmed available) and actually
run — closing debt that had been carried since M6:

- **`gitleaks` v8.30.1**: `gitleaks detect --source . --config
.gitleaks.toml --verbose --redact` — **55 commits scanned, ~6.43 MB,
  no leaks found.**
- **`cargo-deny` v0.20.2** (built from source via `cargo install
cargo-deny --locked`, ~2 minutes): `cargo deny check` (using the
  repository's existing `src-tauri/deny.toml`) — **`advisories ok, bans
ok, licenses ok, sources ok`, exit code 0.** This directly covers
  `calamine` and `tauri-plugin-dialog`, the two dependencies Wave 2B/2C
  left as open debt — both pass cleanly against this project's actual
  license/advisory/source policy.
- **`osv-scanner` v2.4.0**: `osv-scanner scan source --config
osv-scanner.toml -r .` — scanned 340 npm packages + 504 crates.io
  packages; the 17 known advisories (all pre-existing, unmaintained
  GTK3-binding/`unic-*`/`proc-macro-error` transitive dependencies of
  Tauri's Linux backend, already documented and accepted in this
  repository's own `osv-scanner.toml`/`deny.toml`) were correctly
  filtered by the existing ignore config; **result: "No issues
  found."** `calamine` and `tauri-plugin-dialog` are not flagged at
  all.
- `node scripts/check-security.mjs` (this project's own canonical
  three-tool runner): **`Summary: 3 ok, 0 failed, 0 missing.`**

**Important scope caveat, stated honestly**: these tools are now
confirmed _installable and runnable_ in an environment with `winget`
network access (this session's environment) and were actually run here
— but they are not yet wired into this project's CI workflow
(`.github/workflows/quality.yml` still only runs `npm run
quality:full`). This closes the debt for the purpose of this session's
verification, and proves these tools genuinely work against this
repository's actual dependency graph — but does not make them a
standing, repeated CI gate. Recommended follow-up (not implemented this
session, to keep this milestone's scope narrow): add a CI step
installing these three tools (GitHub-hosted Windows/Ubuntu runners both
have `winget`/package-manager access) and running
`scripts/check-security.mjs` as part of `quality:full` or a dedicated
security job.

## Verification debt closed

- WAL/SHM plaintext-exposure proof (was entirely unverified before this
  session).
- `gitleaks`/`cargo-deny`/`osv-scanner` unavailability — all three now
  proven installable and clean-running in this environment, including
  against `calamine` and `tauri-plugin-dialog` specifically.

## Independent security review

Dispatched with 9 numbered angles (stolen device, copied backup,
compromised local files/another Windows account, key extraction/
zeroize placement, logs/temp files, cross-school conflation, session/
key lifecycle, the `AlreadyExists` race in `DpapiKeyStore`, plus a
sanity check on this ADR's own CLI/grep claim). Standard notification
channel hit this project's recurring reviewer-retrieval bug again;
recovered in full from the agent's raw transcript, and the reviewer
independently re-verified its own claims against the actual file
contents (not merely trusting a first pass) before finalizing.

**Result: no blocking findings.** All 8 adversarial angles FALSE-
POSITIVE, each confirmed against real code with line citations —
`PRAGMA key` genuinely runs as the first statement on every connection
before any other pragma/read (`db/mod.rs:24-39`); `zeroize()` calls in
both `db::open` and `DpapiKeyStore::load_key` run before their
function's error-propagating return, so error paths still wipe key
material; `DpapiKeyStore` has no unprotected-mode fallback and the
non-Windows build fails closed; the `AlreadyExists` race is guarded by
an atomic `create_new(true)` claim, so a losing racer fails closed
rather than diverging keys; no `school_id`/tenant logic exists in
`crypto`/`db`; `auth::logout` never touches `crypto`/`db`. **One
should-fix, corrected above**: this ADR's first draft understated the
logging surface (see "Implementation/spike completed" item 4).

## Independent architecture review

Dispatched with 7 questions (UI/frontend crypto references, Tauri
commands exposing key material, whether `KeyStore` is a genuine
trait-based platform abstraction, repository/domain/auth/import-layer
crypto knowledge, premature sync coupling, whether the "recommended
architecture" avoids speculative generalization, other boundary
violations). Same retrieval-bug recovery as above.

**Result: GOOD across all 7 checks, no NEEDS-FIX items.** Notably
rigorous: the reviewer's own first pass sampled only one of ~20
`crate::crypto::generate_key()` references in `repository::*`/`auth`/
`import` to confirm they're all test-fixture-only usage; it then
caught its own thin evidence, went back, and verified **every**
occurrence individually — confirming all ~24 sit inside `#[cfg(test)]`
blocks, with the only non-test `crate::crypto` usage anywhere outside
`src-tauri/src/crypto/` itself being the legitimate call site in
`db/mod.rs`. Also confirmed: zero `crypto`/`key`/`dpapi`/`cipher`
references anywhere in `src/` (the TypeScript frontend) beyond one test
string and one unrelated code comment; zero `crypto` imports in
`src-tauri/src/commands/`; `KeyStore`'s single-method trait shape means
a future Android implementation would need only a new module plus a
new `#[cfg(...)]` branch in `open_app_db`, no change to `db::open`'s
already-platform-agnostic signature; no `sync` module exists yet, so
no premature coupling is even possible; this ADR's own "Recommended
encryption architecture" table correctly declines to build a new
generic key-envelope abstraction, citing `KeyStore` as already
sufficient.

## Verification debt remaining

- These three security tools are not yet a standing CI gate (see
  caveat above).
- Malicious-code-as-same-Windows-user is explicitly out of scope (DPAPI's
  own known limitation, unchanged from ADR-0003).
- A full-codebase audit for accidental PII-in-logs beyond the
  `crypto`/`db` modules specifically was not attempted this session.
- Windows-account-password-change behavior was reasoned about from
  documented DPAPI semantics, not independently reproduced by actually
  resetting a Windows password in this environment.
- No safe cross-device/cross-profile key recovery exists — deliberately
  deferred to future authenticated sync infrastructure, not solved
  here.
- Android key-store implementation remains unimplemented (no Android
  build target exists in this repository yet — same standing gap Wave
  2C already documented); the `KeyStore` trait is ready for it, but
  that readiness itself is unverified against a real Android target.
