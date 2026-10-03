# Release evidence, separate from development

This is a checklist for distributing a working app, not permission to prototype.
Development and synthetic testing do not wait for all release items to close.

- Install and launch a real Windows package and signed Android package.
- Open the encrypted database through each platform's key store.
- Verify local saves survive restart, process death and failed synchronization.
- Retry after lost acknowledgment without duplicate records.
- Demonstrate account/assignment scope and visible conflict resolution.
- Restore an encrypted backup on a clean second device with a recovery secret.
- Preserve records, migration metadata and pending operations through upgrades.
- Inspect native library alignment and actual embedded SQLite/SQLCipher versions.
- Validate the claimed report format, source rules and teacher fixture totals.
- Exercise keyboard/large-text Windows use and TalkBack/touch Android use.
- Confirm distribution/signing/update configuration for the selected channel.
- Before real-data deployment, resolve applicable school/data/distribution
  obligations separately; never claim a harness edit waives external requirements.

Record passed, failed, blocked or not run with the actual artifact/commit/device.
Do not convert an unavailable test into a pass or a prototype into an official form.
