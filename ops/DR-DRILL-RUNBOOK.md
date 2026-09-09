# Disaster Recovery Drill — Runbook

Batch 14 sub-item 3. This runbook references a mechanism that is fully
tested by CI (see "What CI already proves" below); the drill itself —
actually losing and restoring the real hub laptop's data once — is the
hardware-only remainder a human must witness.

## What CI already proves (no hardware needed)

`src-tauri/src/backup.rs` and `src-tauri/src/commands/backup.rs` carry 11
automated tests (`cargo test --lib backup::` /
`cargo test --lib commands::backup::`) proving, against real SQLCipher
connections and real temp files:

1. `create_disaster_recovery_backup` (via
   `backup::create_two_copy_backup`) produces two distinct, non-empty
   encrypted files.
2. Both files independently round-trip real data: each one, opened on
   its own with `db::open` and the correct key, contains the exact rows
   the live database had at backup time.
3. Deleting one backup copy never affects the other's readability — they
   are genuinely independent, not one-derived-from-the-other.
4. Neither backup file ever contains plaintext data on disk (grepped for
   a distinctive marker string in the raw bytes).
5. Neither backup file is readable with no key or the wrong key.
6. Re-running a backup at an already-used filename overwrites cleanly.

This is real, causal evidence the mechanism works — not merely that the
code compiles. See `docs/adr/0087-disaster-recovery-backup-mechanism.md`
for the full design record, including two real correctness bugs this
TDD loop caught and fixed before it passed.

## What still needs a human on the real hub laptop

Nothing above proves: that the Tauri command is actually reachable from
the running Windows app by a School-Head user, that it writes to the
real `%APPDATA%\...\backups\` directory correctly, or that a human can
carry out an actual loss-and-restore drill. That is this runbook.

### Step 1 — Create a backup (as a School Head, from the running app)

1. Launch LIKHA-SIS on the hub laptop, logged in as a School Head.
2. Trigger `create_disaster_recovery_backup` (via whatever UI entry point
   a future frontend slice adds — as of this batch, the command exists
   and is tested but has no dedicated UI button yet; it can be invoked
   via the Tauri devtools console during this drill:
   `window.__TAURI__.core.invoke('create_disaster_recovery_backup')`).
3. Confirm the result reports two file paths, both under
   `%APPDATA%\...\LIKHA-SIS\backups\`.
4. Confirm both files exist on disk and are non-trivial in size
   (`Get-Item` / File Explorer).

### Step 2 — Simulate loss

1. **Close LIKHA-SIS completely** (confirm no `LIKHA-SIS.exe` process
   remains — check Task Manager).
2. Rename (do NOT delete outright — keep it as a fallback in case
   something goes wrong) the live database file:
   `%APPDATA%\...\LIKHA-SIS\likha-sis.db` → `likha-sis.db.lost-simulation`.
   Also rename the `-wal`/`-shm` sidecar files if present.

### Step 3 — Restore

1. Copy one of the two backup files (either — that's the point of having
   two) from `backups\` back to
   `%APPDATA%\...\LIKHA-SIS\likha-sis.db`.
2. Launch LIKHA-SIS again.
3. Confirm the app opens normally (no corruption/key errors) and log in.

### Step 4 — Verify data integrity

1. Confirm the school/learner/section data visible after restore matches
   what existed at backup time in Step 1 (spot-check a few records —
   e.g. a learner name, a section roster count).
2. Confirm no data created AFTER the backup (if any was deliberately
   added between Step 1 and Step 2 for this drill) is present — this
   confirms the restore is really loading the OLD backup, not silently
   still using the live file.

### Step 5 — Clean up

1. Delete `likha-sis.db.lost-simulation` (and its sidecars) once restore
   is confirmed good, or keep it briefly as an extra safety net.
2. Record the drill's outcome and date below / in
   `docs/VERIFICATION-DEBT.md`.

## Recording the result

Once witnessed, update `docs/VERIFICATION-DEBT.md`'s Batch 14 entry to
move this drill from "needs a human on hardware" to "witnessed
<date>, by <name>, outcome: <pass/fail + notes>".

## Known deferred follow-up (not this batch)

- No dedicated UI screen/button for triggering a backup yet — Step 1
  above uses the devtools console as an interim path. A future slice
  should add a "Create Backup" action in a Settings/Admin screen.
- No automatic/scheduled backup (e.g. daily) — this batch only builds
  the on-demand mechanism a human or a future scheduler can call.
