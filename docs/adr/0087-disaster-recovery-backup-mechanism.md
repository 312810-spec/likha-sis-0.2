# ADR-0087: Disaster Recovery Backup Mechanism

Status: Accepted
Date: 2026-09-09

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s Tier 1.2 listed "Disaster
Recovery Drill: Two-copy encrypted backup creation and a witnessed
restoration drill not yet executed" as blocked on real hardware. No
backup/export mechanism for the encrypted database file existed anywhere
in this codebase before this batch (`export::*` only ever produces
already-visible, per-report CSV/XLSX artifacts — `export::sf10`,
`export::learner_roster`, etc. — never a database/encryption-key backup;
see `commands::export::export_learner_roster`'s own doc comment
explicitly disclaiming that). The create-and-round-trip half of a
disaster-recovery mechanism is pure file I/O and SQLCipher operations —
fully buildable and testable without any Windows hardware; only the
"a human actually loses/restores the real hub laptop once" half is
genuinely hardware-only.

## Decision

### Mechanism: SQLCipher's own `sqlcipher_export()`, never a raw file copy

`src-tauri/src/backup.rs`'s `create_two_copy_backup` produces two
independent encrypted copies of the live database via SQLCipher's
documented export mechanism:

```sql
ATTACH DATABASE ?1 AS likha_backup_target KEY "x'<hex>'";
SELECT sqlcipher_export('likha_backup_target');
DETACH DATABASE likha_backup_target;
```

**Rejected: a raw filesystem copy of `likha-sis.db`.** The live database
runs in WAL mode (`db::open`'s `journal_mode = WAL`), so a plain file
copy risks capturing a torn/inconsistent snapshot mid-write, and could
not be independently re-keyed or integrity-checked the way an
`ATTACH ... KEY` target can. `sqlcipher_export` is SQLCipher's own
documented, consistency-safe mechanism for producing a second encrypted
database from a live connection.

Each of the two copies runs its own complete attach/export/detach cycle
directly against the live connection — neither copy is derived from the
other, so a failure or corruption affecting one can never take down the
other (verified by
`deleting_one_backup_copy_never_affects_the_others_verifiability`).

### Encryption guarantee: identical to the live database, never weakened

A backup copy is keyed with the exact same key the live database uses —
this is a backup, not a re-keying operation — and is pinned to the same
`cipher_compatibility = 4` bundle via `PRAGMA cipher_default_compatibility
= 4` before the ATTACH (see the code's own doc comment for why this must
be a session-wide default set _before_ attach, not a per-schema pragma
set after — the on-disk KDF/page-size parameters of a brand-new SQLCipher
database are fixed at creation time). Proven, not assumed:

- `backup_files_on_disk_never_contain_plaintext_data` — mirrors
  `db`'s own `wal_and_shm_sidecar_files_never_contain_plaintext_learner_data`
  test: a distinctive marker string is never found in the raw backup file
  bytes.
- `a_backup_copy_is_unreadable_with_no_key_or_the_wrong_key` — an unkeyed
  connection cannot read `sqlite_master`; the wrong key fails
  `verify_backup_copy`'s integrity check.
- No new code path bypasses `crypto::key_to_sqlcipher_literal`/DPAPI —
  `commands::backup::create_disaster_recovery_backup` reuses
  `db::load_encryption_key` (a new thin accessor added alongside
  `load_or_mint_sspk`, reusing the same already-adopted `DpapiKeyStore`)
  rather than inventing a second key-handling path.

### Two real subtleties `sqlcipher_export` does NOT handle for free

Both found by this module's own round-trip test failing first (the TDD
loop this task required), not by inspection alone:

1. **`PRAGMA user_version` is not copied.** `sqlcipher_export` copies
   table schema and rows, but `user_version` is page-1 header metadata.
   `rusqlite_migration` (`db::migrations`) stores the applied-migration
   count exactly there, so without manually copying it after export,
   every backup file would look like an unmigrated, schema-version-0
   database to a later `db::open` call, which would then try to re-run
   migration 1's `CREATE TABLE` statements against tables that already
   exist and fail loudly. Fixed by reading `PRAGMA main.user_version` and
   writing it into the attached schema before detaching.
2. **The KEY clause's quoting matters.** `ATTACH ... KEY x'...'`
   (unquoted BLOB literal) silently takes a different SQLCipher code path
   than `ATTACH ... KEY "x'...'"` (a TEXT value SQLCipher's key-parsing
   code specifically pattern-matches as "raw hex key, skip PBKDF2") — the
   unquoted form encrypts without error but produces a key that fails an
   HMAC check on reopen via the normal (quoted) `db::open` path. Fixed by
   matching `db::open`'s exact quoting.

### Authorization

New `Capability::CreateDisasterRecoveryBackup`, School-Head-only —
conservatively scoped like `ManageStructuralLock`/`ManageSchoolMembership`
(a whole-installation administrative action, not a per-section teaching
duty; there is exactly one school per installation in this single-hub
architecture today, but the backup mechanism backs up the whole SQLCipher
file, which is not itself a per-school-scoped operation).

### What is proven vs. what still needs a human on real hardware

**Proven by `cargo test` in this session**: the full create → verify →
restore round trip (11 tests in `backup.rs` + `commands/backup.rs`),
including the encryption-guarantee tests above. This is real evidence a
backup created by this mechanism restores correctly — not merely that
the code compiles.

**Not proven, and cannot be proven, in this sandbox**: that a School Head
can actually invoke this command from the real running app on Windows,
write to a real `%APPDATA%` path, and that a human can carry out a
genuine loss-and-restore drill on the real hub laptop (delete/corrupt the
live `likha-sis.db`, replace it with a backup copy, relaunch the app,
confirm data integrity). See `ops/DR-DRILL-RUNBOOK.md` for that
executable, step-by-step remainder and `docs/VERIFICATION-DEBT.md` for
the honest status split.

## Consequences

- No new dependency: `rusqlite`/SQLCipher (already bundled) provide
  everything this mechanism needs.
- `docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`'s earlier
  disclosed gap ("not a database/encryption-key backup" for
  `export_learner_roster`) is now closed by a purpose-built mechanism,
  not silently left open.
- Restoration for this single-file architecture is, by design, simple:
  replace the live `likha-sis.db` file with a verified backup copy and
  relaunch the app — no separate "import" command was built, since none
  is needed (this is not a schema-migrating cross-version import, just a
  same-format file swap). This is documented explicitly in
  `ops/DR-DRILL-RUNBOOK.md`.
