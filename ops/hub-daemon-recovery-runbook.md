# Hub Daemon Recovery — Manual Verification Runbook

Batch 14 sub-item 1's hardware-only remainder. Everything up to "Setup"
below is scripted and reviewable; everything from "Witness the recovery"
onward requires a human physically at (or remoted into) the real hub
laptop — it cannot be exercised in this project's Linux CI sandbox.

## What is already proven without hardware

- `src-tauri/src/hub_server.rs`'s `supervisor::backoff_for_attempt` — the
  in-process listener's restart-on-failure backoff schedule — is unit
  tested (`cargo test --lib hub_server::`): never zero, doubles up to a
  60s cap, resets after a healthy bind. This proves the _decision logic_
  is correct; it does not by itself prove a real crashed listener
  actually gets rebound on real Windows.
- `ops/hub-daemon-recovery-setup.ps1` is reviewed for syntax/logic but has
  never executed against a real Windows Task Scheduler (no `pwsh` in this
  sandbox).

## Setup (one time, on the hub laptop)

1. Install LIKHA-SIS normally.
2. As an administrator, run:
   ```powershell
   .\ops\hub-daemon-recovery-setup.ps1 -ExePath "C:\Program Files\LIKHA-SIS\LIKHA-SIS.exe"
   ```
3. Confirm the task exists: `Get-ScheduledTask -TaskName 'LIKHA-SIS Hub Daemon'`.

## Witness the recovery (requires the real hub laptop)

1. **Logon-launch check**: log off and back on as the hub's designated
   account. Confirm the LIKHA-SIS window appears without manual action.
2. **Crash-restart check**: with LIKHA-SIS running, open Task Manager and
   forcibly end the `LIKHA-SIS.exe` process (simulating a crash). Within
   `RestartIntervalMinutes` (default 1 minute), confirm Task Scheduler
   relaunches it — check `Get-ScheduledTaskInfo -TaskName 'LIKHA-SIS Hub
Daemon'` for `LastRunTime`/`LastTaskResult`, and confirm the app window
   reappears.
3. **In-process listener recovery check**: with LIKHA-SIS running and
   enrolled for a school (so the hub listener is actually bound — see
   `hub_server::should_listen`), use a tool on another machine on the
   same LAN (or `netstat` locally) to confirm port 7878 is listening.
   Then, on the hub laptop, run something that occupies port 7878 briefly
   (e.g. `netsh` port-proxy or a throwaway `python -m http.server 7878`)
   right as the app is (re)starting to force a bind failure, and confirm
   in the app's log output (`%APPDATA%\...\logs` or the debug console)
   that a `hub sync listener failed to bind` message appears followed by
   a successful bind once the port frees up — proving the backoff loop
   actually recovers on real Windows, not just in the unit test.
4. **Reboot check**: reboot the hub laptop. Confirm LIKHA-SIS relaunches
   automatically once the designated account's auto-logon (if configured)
   or manual logon completes.

## Recording the result

Once witnessed, update `docs/VERIFICATION-DEBT.md`'s Batch 14 entry to
move this checklist from "needs a human on hardware" to "witnessed
<date>, by <name>", and note any deviation from the expected behavior
above.
