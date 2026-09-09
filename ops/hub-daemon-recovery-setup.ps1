#Requires -Version 5.1
<#
LIKHA-SIS hub daemon whole-process recovery setup (Batch 14 sub-item 1).

WHAT THIS DOES
---------------
LIKHA-SIS ships as a normal user-launched Tauri desktop application (see
`src-tauri/tauri.conf.json`'s `bundle.targets: "all"` -- there is no
Windows Service Control Manager wrapper anywhere in this codebase's
packaging, and ADR-0067 describes the sync hub as "one supervised,
always-on laptop" running this same app, not a background service). The
app's OWN in-process resilience (restart-on-failure backoff for the hub
HTTP listener task itself, see `src-tauri/src/hub_server.rs`'s
`supervisor` module) only covers that ONE listener task failing while the
process is still alive. It cannot help if the whole `LIKHA-SIS.exe`
process crashes, is killed, or the machine reboots -- that is inherently
an OS-level scheduling concern outside any one process's control.

This script closes that gap the way that fits how this app is actually
packaged: it registers a Windows Scheduled Task that (a) launches
LIKHA-SIS automatically when the hub laptop's designated user account
logs on, and (b) uses the Task Scheduler's own restart-on-failure
settings (`-RestartCount` / `-RestartInterval`) to relaunch it if the
process exits unexpectedly, without needing to rewrite this app as a
Windows Service.

WHAT THIS SCRIPT DOES NOT DO
------------------------------
- It does not install or modify LIKHA-SIS itself -- run the normal
  installer first.
- It is not a substitute for `ops/hub-hardware-gate-audit.ps1` (BitLocker
  / firewall / patch checks) -- run that separately.
- It cannot be executed or verified from this project's Linux development
  sandbox. Everything below this comment block is REVIEWED-BUT-NOT-RUN in
  CI; see `docs/VERIFICATION-DEBT.md` for the honest status and the
  runbook in this same directory (`ops/DR-DRILL-RUNBOOK.md`'s sibling,
  `ops/hub-daemon-recovery-runbook.md`) for the exact manual steps a
  school IT admin/ICT coordinator must witness once on the real hub
  laptop.

USAGE (on the hub laptop, as an administrator)
-----------------------------------------------
    .\hub-daemon-recovery-setup.ps1 -ExePath "C:\Program Files\LIKHA-SIS\LIKHA-SIS.exe"

Re-run any time to update the registered task (e.g. after moving the
install path) -- it replaces any existing task of the same name rather
than erroring on one already present.
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath,

    [string]$TaskName = 'LIKHA-SIS Hub Daemon',

    # How many times Task Scheduler will restart the process after an
    # unexpected exit within one run instance, and how long it waits
    # between restarts. Windows Task Scheduler caps -RestartCount at 999
    # and treats this as "restart attempts", not "give up forever after
    # this many crashes across the machine's whole uptime" -- each fresh
    # logon-triggered run instance gets its own budget.
    [int]$RestartCount = 999,
    [int]$RestartIntervalMinutes = 1
)

$ErrorActionPreference = 'Stop'

if (-not (Test-Path $ExePath)) {
    throw "ExePath '$ExePath' does not exist. Install LIKHA-SIS first, or pass the correct path."
}

# Idempotent: replace an existing registration of the same name rather
# than failing, so re-running this script after moving the install path
# (or bumping the restart tuning) is safe.
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Output "Existing task '$TaskName' found -- unregistering before re-creating."
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
}

$action = New-ScheduledTaskAction -Execute $ExePath

# Fires at logon for ANY user on this machine (the hub laptop is expected
# to run under one dedicated ICT-coordinator account per ADR-0067's
# "named custodian" model) and also at system startup, so the daemon
# comes back both after a normal logon and after an unattended reboot
# where auto-logon is configured.
$logonTrigger = New-ScheduledTaskTrigger -AtLogOn
$startupTrigger = New-ScheduledTaskTrigger -AtStartup

$settings = New-ScheduledTaskSettingsSet `
    -RestartCount $RestartCount `
    -RestartInterval (New-TimeSpan -Minutes $RestartIntervalMinutes) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -DontStopOnIdleEnd `
    -StartWhenAvailable `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger @($logonTrigger, $startupTrigger) `
    -Settings $settings `
    -Description 'Batch 14 sub-item 1: restarts LIKHA-SIS on this school-laptop sync hub after an unexpected exit or reboot. See ops/hub-daemon-recovery-setup.ps1.' `
    | Out-Null

Write-Output "Registered scheduled task '$TaskName' for '$ExePath'."
Write-Output "Restart policy: up to $RestartCount restarts, $RestartIntervalMinutes minute(s) apart."
Write-Output ''
Write-Output 'This registration itself is NOT proof the recovery actually fires.'
Write-Output 'A human must still witness one real crash-and-restart cycle on this'
Write-Output 'machine -- see ops/hub-daemon-recovery-runbook.md for the exact steps.'
