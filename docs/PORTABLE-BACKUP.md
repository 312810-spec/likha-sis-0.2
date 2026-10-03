# Portable backup and recovery

## Create a backup

Open **Devices → Full installation backup**. Choose and repeat a strong recovery
password (12–1024 characters), then choose a NEW `.likhabak` filename. The app
reports success only after the encrypted archive is saved. Canceling the file
chooser creates no backup. A write failure leaves the current records intact.

The archive contains every school's database records, app accounts/password
hashes, attendance, grades, embedded school logos, pending changes and sync
review items. Because it includes all schools, the signed-in user must be a
School Head in **every** school on the installation. Advisory/subject scope alone
cannot authorize this installation-wide export. This is checked in native code.

Keep the backup file and its recovery password separately, away from the original
computer. The recovery password is separate from an app login password. It cannot
be reset; losing it makes the archive unusable. Exported spreadsheets and external
templates/generated files are not bundled into this database backup.

## Recover on a replacement Windows installation

1. Stop using the original installation for these records. Recovery is replacement,
   not a way to create a second simultaneous hub/client.
2. Before creating a school or account on the new installation, choose **Recover
   your records**, enter/repeat the original recovery password and select the
   archive. Confirm that this is the replacement installation.
3. Wait for **Recovery is ready**, close LIKHA-SIS completely, and reopen it.
4. Sign in using an original app account; inspect the roster, attendance, grades
   and pending/review records. Re-enroll client synchronization explicitly before
   transferring records. Retire the previous hub before running a recovered hub.

Recovery refuses an already initialized installation. It validates and rekeys the
snapshot in a NEW directory and protects the keys with the destination Windows
account's DPAPI. The old database is left in place. Only a successfully validated
recovery publishes a startup pointer. An ordinary error cleans up its newly
created directory; an interrupted staging directory is never selected without a
complete pointer. Failed key protection/reopening is never a success.

A restored client has its stored sync bearer credentials removed. Domain records,
pending outbox/review items, version cache and pull cursor are retained. An
available hub payload key is protected again on the destination device. Session
state starts empty and a fresh login is required, as with normal startup.

## Format and verification

Version 1 uses a fixed header `LIKHAB01`, a random 16-byte salt and 12-byte nonce.
Argon2id v19 derives a 32-byte key using 64 MiB memory, three passes and one lane.
AES-256-GCM authenticates the complete header and encrypts the snapshot key,
optional hub payload key and SQLCipher snapshot. No archive-supplied KDF parameter
can request unbounded work. Secrets use zeroizing buffers. Archives/databases are
bounded to a 256 MiB database size. Backup creation never replaces an existing
file, even if another writer creates it after the file chooser closes.

SQLCipher's `sqlcipher_export` captures a consistent snapshot, including committed
WAL records; simply copying the `.db` file would omit uncheckpointed changes.
The schema `user_version` is copied explicitly. Restore checks SQLite integrity
and foreign keys, migrates through the existing application path, rekeys with a
new random device key and proves it can reopen using the protected destination
key. Backup/recovery commands run on a blocking worker, away from the desktop UI.

Primary references checked October 3, 2026:

- [SQLCipher API: export, key/rekey and user_version caveat](https://www.zetetic.net/sqlcipher/sqlcipher-api/)
- [RustCrypto Argon2 0.6 API](https://docs.rs/argon2/0.6.0/argon2/)
- [RustCrypto AES-GCM API](https://docs.rs/aes-gcm/0.11.1/aes_gcm/)

Synthetic tests exercise live-WAL recovery, a different destination key store,
wrong passwords, altered header/ciphertext, truncation, oversized input,
non-overwrite, failed key protection, cross-school authorization and safe startup
selection. UI tests cover cancellation, errors, duplicate submission, password
confirmation and restart instructions. A Windows-only test checks DPAPI key
protection/reopening and refusal to overwrite a protected key.

Installed Windows recovery on a second Windows account/device, interrupted
startup, signed upgrades and Android Keystore recovery still require device
validation. This implementation does not establish Android support.
