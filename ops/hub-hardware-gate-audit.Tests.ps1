#Requires -Version 5.1
<#
Pester unit tests for ops/hub-hardware-gate-audit.ps1's PURE decision
functions (Get-BitLockerGateResult, Get-FirewallGateResult,
Get-PatchGateResult, Test-PortInRuleRange). Every test feeds a synthetic
fixture object -- never a live BitLocker/firewall/WSUS call -- so these
prove the script's parsing/decision logic is correct independent of
whether it is ever run on real hardware.

HONEST STATUS: this file has never been executed. Pester ships built
into Windows 10/1809+ and Windows 11 (module "Pester"), so running it
requires no new project dependency -- but no `pwsh`/PowerShell is
available in this project's Linux development sandbox, so this suite is
reviewed-but-unexecuted, same as the script it tests. See
docs/VERIFICATION-DEBT.md.

RUN (on a Windows machine with Pester, e.g. the hub laptop or any dev
machine):
    Invoke-Pester -Path .\ops\hub-hardware-gate-audit.Tests.ps1 -Output Detailed
#>

BeforeAll {
    # Dot-sourcing brings the Get-*GateResult/Test-PortInRuleRange
    # function DEFINITIONS into this test session's scope without
    # actually running a real (or dry-run) audit -- the target script
    # guards its own bottom-of-file invoke-and-exit block behind
    # `$MyInvocation.InvocationName -ne '.'` specifically so a
    # dot-source like this one never calls `exit` and kills the whole
    # Pester session.
    . "$PSScriptRoot\hub-hardware-gate-audit.ps1"
}

Describe 'Get-BitLockerGateResult' {
    It 'passes when ProtectionStatus is On' {
        $volume = [PSCustomObject]@{ VolumeStatus = 'FullyEncrypted'; ProtectionStatus = 'On' }
        (Get-BitLockerGateResult -Volume $volume).Status | Should -Be 'PASS'
    }

    It 'fails when ProtectionStatus is Off' {
        $volume = [PSCustomObject]@{ VolumeStatus = 'FullyDecrypted'; ProtectionStatus = 'Off' }
        (Get-BitLockerGateResult -Volume $volume).Status | Should -Be 'FAIL'
    }

    It 'fails (not silently skips) when the volume could not be queried at all' {
        (Get-BitLockerGateResult -Volume $null).Status | Should -Be 'FAIL'
    }

    It 'accepts the numeric ProtectionStatus form some cmdlet versions return' {
        $volume = [PSCustomObject]@{ VolumeStatus = 'FullyEncrypted'; ProtectionStatus = 1 }
        (Get-BitLockerGateResult -Volume $volume).Status | Should -Be 'PASS'
    }
}

Describe 'Test-PortInRuleRange' {
    It 'matches "Any"' {
        Test-PortInRuleRange -RulePorts 'Any' -Port 7878 | Should -BeTrue
    }

    It 'matches an exact single port' {
        Test-PortInRuleRange -RulePorts '7878' -Port 7878 | Should -BeTrue
    }

    It 'matches within a comma list' {
        Test-PortInRuleRange -RulePorts '80,443,7878' -Port 7878 | Should -BeTrue
    }

    It 'matches within a numeric range' {
        Test-PortInRuleRange -RulePorts '7000-8000' -Port 7878 | Should -BeTrue
    }

    It 'does not match a port outside every listed value/range' {
        Test-PortInRuleRange -RulePorts '80,443' -Port 7878 | Should -BeFalse
        Test-PortInRuleRange -RulePorts '7000-7800' -Port 7878 | Should -BeFalse
    }

    It 'does not match an empty/whitespace LocalPort' {
        Test-PortInRuleRange -RulePorts '' -Port 7878 | Should -BeFalse
    }
}

Describe 'Get-FirewallGateResult' {
    It 'fails when no rule matches the port at all' {
        $rules = @()
        (Get-FirewallGateResult -Rules $rules -Port 7878).Status | Should -Be 'FAIL'
    }

    It 'fails when a rule exists for the port but is disabled' {
        $rules = @([PSCustomObject]@{ Enabled = 'False'; Direction = 'Inbound'; Action = 'Allow'; LocalPort = '7878'; RemoteAddress = '192.168.1.0/24' })
        (Get-FirewallGateResult -Rules $rules -Port 7878).Status | Should -Be 'FAIL'
    }

    It 'fails when the only matching rule is Outbound, not Inbound' {
        $rules = @([PSCustomObject]@{ Enabled = 'True'; Direction = 'Outbound'; Action = 'Allow'; LocalPort = '7878'; RemoteAddress = '192.168.1.0/24' })
        (Get-FirewallGateResult -Rules $rules -Port 7878).Status | Should -Be 'FAIL'
    }

    It 'fails when the only matching rule is Block, not Allow' {
        $rules = @([PSCustomObject]@{ Enabled = 'True'; Direction = 'Inbound'; Action = 'Block'; LocalPort = '7878'; RemoteAddress = '192.168.1.0/24' })
        (Get-FirewallGateResult -Rules $rules -Port 7878).Status | Should -Be 'FAIL'
    }

    It 'passes with a scoped-remote-address enabled inbound allow rule' {
        $rules = @([PSCustomObject]@{ Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'; LocalPort = '7878'; RemoteAddress = '192.168.1.0/24' })
        (Get-FirewallGateResult -Rules $rules -Port 7878).Status | Should -Be 'PASS'
    }

    It 'still passes but flags an overly-broad "Any" remote address rule' {
        $rules = @([PSCustomObject]@{ Enabled = 'True'; Direction = 'Inbound'; Action = 'Allow'; LocalPort = '7878'; RemoteAddress = 'Any' })
        $result = Get-FirewallGateResult -Rules $rules -Port 7878
        $result.Status | Should -Be 'PASS'
        $result.Detail | Should -Match 'ANY remote address'
    }
}

Describe 'Get-PatchGateResult' {
    It 'passes with zero pending updates' {
        (Get-PatchGateResult -PendingUpdates @() -Now (Get-Date) -MaxAgeDays 30).Status | Should -Be 'PASS'
    }

    It 'warns when updates are pending but within the grace window' {
        $now = Get-Date '2026-09-09'
        $updates = @([PSCustomObject]@{ Title = 'Fresh update'; LastDeploymentChangeTime = $now.AddDays(-5) })
        (Get-PatchGateResult -PendingUpdates $updates -Now $now -MaxAgeDays 30).Status | Should -Be 'WARN'
    }

    It 'fails when an update has been pending longer than the grace window' {
        $now = Get-Date '2026-09-09'
        $updates = @([PSCustomObject]@{ Title = 'Stale update'; LastDeploymentChangeTime = $now.AddDays(-90) })
        (Get-PatchGateResult -PendingUpdates $updates -Now $now -MaxAgeDays 30).Status | Should -Be 'FAIL'
    }

    It 'evaluates each pending update independently -- one stale update fails even alongside a fresh one' {
        $now = Get-Date '2026-09-09'
        $updates = @(
            [PSCustomObject]@{ Title = 'Fresh update'; LastDeploymentChangeTime = $now.AddDays(-1) },
            [PSCustomObject]@{ Title = 'Stale update'; LastDeploymentChangeTime = $now.AddDays(-90) }
        )
        (Get-PatchGateResult -PendingUpdates $updates -Now $now -MaxAgeDays 30).Status | Should -Be 'FAIL'
    }
}
