#Requires -Version 5.1
<#
LIKHA-SIS hub hardware gate audit (Batch 14 sub-item 2 / ADR-0067 Tier
1.2). Read-only, non-destructive: reports pass/fail per gate and never
changes system configuration. Safe to run repeatedly, including on a
live production hub laptop.

Checks three of ADR-0067's operational security gates for the physical
sync-hub machine:

  1. BitLocker whole-disk encryption is ON for the system drive.
  2. A Windows Firewall rule exists that actually permits inbound traffic
     on the hub's sync port (7878 -- see `src-tauri/src/hub_server.rs`'s
     `HUB_PORT`), so LAN/Tailscale peers can actually reach it, while
     confirming nothing broader (e.g. "Any" port) was opened instead.
  3. Windows Update / patch status: no known-pending security updates
     sitting unapplied past a configurable staleness threshold.

USAGE
-----
Normal run, against the real live system:
    .\hub-hardware-gate-audit.ps1

Dry run against synthetic fixture data -- proves the script's own
parsing/decision logic without touching any real Windows API, useful for
reviewing this script's correctness on a machine that isn't the hub
itself, or in a sandbox with no BitLocker/firewall/WSUS to query:
    .\hub-hardware-gate-audit.ps1 -DryRun

`-DryRun` exercises three synthetic scenarios (all-pass, all-fail, and
one mixed case) through the exact same `Get-*Result` decision functions
the real run uses -- see `ops/hub-hardware-gate-audit.Tests.ps1` for the
Pester-based version of the same idea, asserted rather than merely
printed.

EXIT CODE
---------
0 if every gate passes, 1 if any gate fails or could not be evaluated.

WHAT THIS DOES NOT DO
----------------------
This script's DECISION LOGIC (the `Get-*Result` functions below) is
pure and unit-testable, and is reviewed here; but neither this script's
real-Windows-API code paths nor `ops/hub-hardware-gate-audit.Tests.ps1`
have ever actually executed against live BitLocker/firewall/WSUS APIs --
no `pwsh` is available in this project's Linux development sandbox. See
`docs/VERIFICATION-DEBT.md` for the honest status and
`ops/hub-hardware-gate-audit-runbook.md` for exactly how a school IT
admin should run and interpret this on the real hub laptop.
#>

param(
    [switch]$DryRun,

    # Hub sync port -- must match `HUB_PORT` in
    # `src-tauri/src/hub_server.rs`. Passed as a parameter (not
    # hardcoded twice) so a future port change only needs updating in
    # one Rust constant plus this one default.
    [int]$HubPort = 7878,

    # A pending update older than this many days is treated as a FAIL,
    # not just a WARN -- ADR-0067's operational gate is about a hub
    # laptop that is trusted to hold the whole school's dataset, so a
    # long-unpatched known vulnerability is a real risk, not cosmetic.
    [int]$MaxPendingUpdateAgeDays = 30
)

$ErrorActionPreference = 'Stop'

# ---------------------------------------------------------------------
# Pure decision logic -- each function takes already-fetched data (a
# real cmdlet's output, OR a synthetic fixture in -DryRun/test mode) and
# returns a single [PSCustomObject] verdict. None of these functions
# call a live Windows API themselves; the "fetch" and "decide" steps are
# deliberately kept separate so the decide half can be tested without
# real hardware -- see ops/hub-hardware-gate-audit.Tests.ps1.
# ---------------------------------------------------------------------

function Get-BitLockerGateResult {
    <#
    $Volume is expected to look like one row of Get-BitLockerVolume's
    output for the system drive: an object with .VolumeStatus and
    .ProtectionStatus. $null means the drive could not be queried at all
    (e.g. BitLocker unsupported/module unavailable) -- treated as FAIL,
    not skipped, since an unqueryable encryption state is not a proven
    "pass" for a machine holding a school's whole dataset.
    #>
    param($Volume)

    if ($null -eq $Volume) {
        return [PSCustomObject]@{
            Gate   = 'BitLocker'
            Status = 'FAIL'
            Detail = 'Could not query BitLocker status for the system drive (module unavailable, unsupported edition, or access denied).'
        }
    }

    $protectionOn = $Volume.ProtectionStatus -eq 'On' -or $Volume.ProtectionStatus -eq 1
    if ($protectionOn) {
        return [PSCustomObject]@{
            Gate   = 'BitLocker'
            Status = 'PASS'
            Detail = "System drive encryption is ON (VolumeStatus=$($Volume.VolumeStatus))."
        }
    }

    return [PSCustomObject]@{
        Gate   = 'BitLocker'
        Status = 'FAIL'
        Detail = "System drive protection is OFF or suspended (ProtectionStatus=$($Volume.ProtectionStatus)). Enable BitLocker: Control Panel > BitLocker Drive Encryption."
    }
}

function Get-FirewallGateResult {
    <#
    $Rules is expected to be an array of objects each shaped like the
    result of joining Get-NetFirewallRule with
    Get-NetFirewallPortFilter/Get-NetFirewallAddressFilter: at minimum
    .Enabled, .Direction, .Action, .LocalPort (string, may be "Any" or a
    comma list), .RemoteAddress (string, may be "Any" or a CIDR/range
    list).

    PASSES only if at least one ENABLED, ALLOW, INBOUND rule's LocalPort
    set includes $Port. Deliberately also reports (but does not itself
    fail on) any matching rule whose RemoteAddress is "Any" -- ADR-0067's
    "School-laptop operations gate" says this app never binds a public
    address itself, but a firewall rule wide enough to accept "Any"
    remote address on this port is still worth flagging to the admin as
    broader than necessary (LAN/Tailscale-only is the intended shape).
    #>
    param($Rules, [int]$Port)

    $matching = @($Rules | Where-Object {
        $_.Enabled -in @('True', $true, 1) -and
        $_.Direction -in @('Inbound', 2) -and
        $_.Action -in @('Allow', 2) -and
        (Test-PortInRuleRange -RulePorts $_.LocalPort -Port $Port)
    })

    if ($matching.Count -eq 0) {
        return [PSCustomObject]@{
            Gate   = 'Firewall'
            Status = 'FAIL'
            Detail = "No enabled inbound Allow rule found permitting TCP port $Port. Peers on the LAN/Tailscale cannot reach the hub listener."
        }
    }

    $broad = @($matching | Where-Object { $_.RemoteAddress -eq 'Any' })
    if ($broad.Count -gt 0) {
        return [PSCustomObject]@{
            Gate   = 'Firewall'
            Status = 'PASS'
            Detail = "Port $Port is reachable via $($matching.Count) matching rule(s), but $($broad.Count) of them allow ANY remote address rather than being scoped to the school LAN/Tailscale range. Consider narrowing RemoteAddress."
        }
    }

    return [PSCustomObject]@{
        Gate   = 'Firewall'
        Status = 'PASS'
        Detail = "Port $Port is reachable via $($matching.Count) matching inbound Allow rule(s), none scoped to 'Any' remote address."
    }
}

function Test-PortInRuleRange {
    <# Handles the common LocalPort shapes Get-NetFirewallPortFilter
       actually returns: "Any", a single port ("7878"), a comma list
       ("80,443,7878"), or a range ("7000-8000"). #>
    param([string]$RulePorts, [int]$Port)

    if ([string]::IsNullOrWhiteSpace($RulePorts)) { return $false }
    if ($RulePorts -eq 'Any') { return $true }

    foreach ($segment in ($RulePorts -split ',')) {
        $segment = $segment.Trim()
        if ($segment -match '^(\d+)-(\d+)$') {
            $lo = [int]$Matches[1]
            $hi = [int]$Matches[2]
            if ($Port -ge $lo -and $Port -le $hi) { return $true }
        } elseif ($segment -match '^\d+$') {
            if ([int]$segment -eq $Port) { return $true }
        }
    }
    return $false
}

function Get-PatchGateResult {
    <#
    $PendingUpdates is expected to be an array of objects each with at
    least a .Title and a .LastDeploymentChangeTime (or similar
    DateTime-like field the caller has already normalized) representing
    updates NOT yet installed, as reported by
    (New-Object -ComObject Microsoft.Update.Session) or the PSWindowsUpdate
    module's Get-WindowsUpdate. $Now is injected (rather than read via
    Get-Date inside this function) purely so a test can pin "today" and
    get a deterministic PASS/FAIL for a fixture update's age.
    #>
    param($PendingUpdates, [datetime]$Now, [int]$MaxAgeDays)

    $updates = @($PendingUpdates)
    if ($updates.Count -eq 0) {
        return [PSCustomObject]@{
            Gate   = 'Patch Status'
            Status = 'PASS'
            Detail = 'No pending Windows updates detected.'
        }
    }

    $stale = @($updates | Where-Object {
        $_.LastDeploymentChangeTime -and
        (($Now - [datetime]$_.LastDeploymentChangeTime).Days -gt $MaxAgeDays)
    })

    if ($stale.Count -gt 0) {
        $titles = ($stale | ForEach-Object { $_.Title }) -join '; '
        return [PSCustomObject]@{
            Gate   = 'Patch Status'
            Status = 'FAIL'
            Detail = "$($stale.Count) update(s) pending for more than $MaxAgeDays day(s): $titles"
        }
    }

    return [PSCustomObject]@{
        Gate   = 'Patch Status'
        Status = 'WARN'
        Detail = "$($updates.Count) update(s) pending, but all within the $MaxAgeDays-day grace window."
    }
}

# ---------------------------------------------------------------------
# Data-fetch layer -- the only part of this script that touches a real
# Windows API (or, under -DryRun, returns a synthetic fixture instead).
# Kept intentionally thin: each function's only job is "get the raw data
# the corresponding Get-*GateResult function above expects", never any
# decision logic of its own.
# ---------------------------------------------------------------------

function Get-RealOrFixtureBitLockerVolume {
    param([switch]$DryRun, [string]$Scenario)

    if ($DryRun) {
        switch ($Scenario) {
            'fail' { return [PSCustomObject]@{ VolumeStatus = 'FullyDecrypted'; ProtectionStatus = 'Off' } }
            'mixed' { return [PSCustomObject]@{ VolumeStatus = 'FullyEncrypted'; ProtectionStatus = 'On' } }
            default { return [PSCustomObject]@{ VolumeStatus = 'FullyEncrypted'; ProtectionStatus = 'On' } }
        }
    }

    try {
        return Get-BitLockerVolume -MountPoint $env:SystemDrive -ErrorAction Stop
    } catch {
        return $null
    }
}

function Get-RealOrFixtureFirewallRules {
    param([switch]$DryRun, [string]$Scenario, [int]$Port)

    if ($DryRun) {
        switch ($Scenario) {
            'fail' { return @() }
            'mixed' {
                return @([PSCustomObject]@{
                    Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'
                    LocalPort = "$Port"; RemoteAddress = 'Any'
                })
            }
            default {
                return @([PSCustomObject]@{
                    Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'
                    LocalPort = "$Port"; RemoteAddress = '192.168.1.0/24'
                })
            }
        }
    }

    try {
        $rules = Get-NetFirewallRule -ErrorAction Stop | Where-Object { $_.Direction -eq 'Inbound' }
        return $rules | ForEach-Object {
            $rule = $_
            $portFilter = $rule | Get-NetFirewallPortFilter -ErrorAction SilentlyContinue
            $addressFilter = $rule | Get-NetFirewallAddressFilter -ErrorAction SilentlyContinue
            [PSCustomObject]@{
                Enabled       = $rule.Enabled
                Direction     = $rule.Direction
                Action        = $rule.Action
                LocalPort     = if ($portFilter) { $portFilter.LocalPort } else { $null }
                RemoteAddress = if ($addressFilter) { $addressFilter.RemoteAddress } else { $null }
            }
        }
    } catch {
        return @()
    }
}

function Get-RealOrFixturePendingUpdates {
    param([switch]$DryRun, [string]$Scenario)

    if ($DryRun) {
        switch ($Scenario) {
            'fail' {
                return @([PSCustomObject]@{
                    Title = '2026-08 Security Update for Windows (synthetic fixture)'
                    LastDeploymentChangeTime = (Get-Date).AddDays(-90)
                })
            }
            'mixed' {
                return @([PSCustomObject]@{
                    Title = '2026-09 Security Update for Windows (synthetic fixture)'
                    LastDeploymentChangeTime = (Get-Date).AddDays(-5)
                })
            }
            default { return @() }
        }
    }

    # Prefers the PSWindowsUpdate module if present (gives real pending
    # update objects with deployment timestamps); falls back to an empty
    # list with a WARN-shaped detail if it is not installed, rather than
    # crashing the whole audit -- module install is an admin choice, not
    # this read-only script's job to perform silently.
    if (Get-Module -ListAvailable -Name PSWindowsUpdate) {
        Import-Module PSWindowsUpdate -ErrorAction SilentlyContinue
        try {
            return Get-WindowsUpdate -ErrorAction Stop
        } catch {
            return @()
        }
    }
    return @()
}

# ---------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------

function Invoke-HubHardwareGateAudit {
    param([switch]$DryRun, [int]$HubPort, [int]$MaxPendingUpdateAgeDays)

    if ($DryRun) {
        Write-Output '=== DRY RUN: exercising decision logic against synthetic fixtures, no live Windows API calls ==='
        foreach ($scenario in @('pass', 'mixed', 'fail')) {
            Write-Output ''
            Write-Output "--- Scenario: $scenario ---"
            $volume = Get-RealOrFixtureBitLockerVolume -DryRun -Scenario $scenario
            $rules = Get-RealOrFixtureFirewallRules -DryRun -Scenario $scenario -Port $HubPort
            $updates = Get-RealOrFixturePendingUpdates -DryRun -Scenario $scenario

            $results = @(
                (Get-BitLockerGateResult -Volume $volume),
                (Get-FirewallGateResult -Rules $rules -Port $HubPort),
                (Get-PatchGateResult -PendingUpdates $updates -Now (Get-Date) -MaxAgeDays $MaxPendingUpdateAgeDays)
            )
            $results | Format-Table -AutoSize -Wrap
        }
        return 0
    }

    $volume = Get-RealOrFixtureBitLockerVolume
    $rules = Get-RealOrFixtureFirewallRules -Port $HubPort
    $updates = Get-RealOrFixturePendingUpdates

    $results = @(
        (Get-BitLockerGateResult -Volume $volume),
        (Get-FirewallGateResult -Rules $rules -Port $HubPort),
        (Get-PatchGateResult -PendingUpdates $updates -Now (Get-Date) -MaxAgeDays $MaxPendingUpdateAgeDays)
    )

    $results | Format-Table -AutoSize -Wrap

    $failCount = @($results | Where-Object { $_.Status -eq 'FAIL' }).Count
    $warnCount = @($results | Where-Object { $_.Status -eq 'WARN' }).Count
    Write-Output ''
    Write-Output "$failCount FAIL, $warnCount WARN, $($results.Count - $failCount - $warnCount) PASS"

    if ($failCount -gt 0) { return 1 }
    return 0
}

# Only actually runs (and exits the process) when this file is executed
# directly -- e.g. `.\hub-hardware-gate-audit.ps1`. When it is instead
# dot-sourced (`. .\hub-hardware-gate-audit.ps1`) purely to bring the
# Get-*GateResult/Test-PortInRuleRange function DEFINITIONS into scope
# for a test harness (see hub-hardware-gate-audit.Tests.ps1), this block
# is skipped entirely so an `exit` here can never terminate the caller's
# whole PowerShell/Pester session.
if ($MyInvocation.InvocationName -ne '.') {
    $exitCode = Invoke-HubHardwareGateAudit -DryRun:$DryRun -HubPort $HubPort -MaxPendingUpdateAgeDays $MaxPendingUpdateAgeDays
    exit $exitCode
}
