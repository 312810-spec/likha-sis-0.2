#Requires -Version 5.1
<#
Runs the repeatable, non-destructive portion of LIKHA-SIS's Windows P0
security/recovery checkpoint. It uses synthetic test fixtures only and writes
sanitized evidence outside the repository by default.

This script does NOT copy, delete, replace, or restore an application database,
change a Windows account, or weaken BitLocker/firewall settings. Follow the
separate witnessed drill in docs/runbooks/WINDOWS-P0-SECURITY-RECOVERY.md for
those hardware-dependent checks, using a disposable Windows profile/VM only.
#>

[CmdletBinding()]
param(
    [string]$EvidenceRoot = (Join-Path $env:TEMP ("likha-windows-p0-" + (Get-Date -Format 'yyyyMMdd-HHmmss'))),
    [switch]$SkipBuild,
    [switch]$SkipUi
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$results = [System.Collections.Generic.List[object]]::new()
New-Item -ItemType Directory -Path $EvidenceRoot -Force | Out-Null

function Protect-EvidenceText {
    param([AllowEmptyString()][string]$Text)

    $redacted = $Text
    foreach ($sensitive in @($env:USERPROFILE, $env:USERNAME, $env:COMPUTERNAME)) {
        if (-not [string]::IsNullOrWhiteSpace($sensitive)) {
            $redacted = $redacted.Replace($sensitive, '<redacted>')
        }
    }
    return $redacted
}

function Invoke-EvidenceCommand {
    param(
        [Parameter(Mandatory)][string]$Name,
        [Parameter(Mandatory)][string]$Command,
        [Parameter(Mandatory)][string[]]$Arguments
    )

    $started = (Get-Date).ToUniversalTime()
    $output = & $Command @Arguments 2>&1 | Out-String
    $exitCode = $LASTEXITCODE
    $safeName = $Name -replace '[^A-Za-z0-9._-]', '-'
    Protect-EvidenceText $output | Set-Content -LiteralPath (Join-Path $EvidenceRoot "$safeName.log") -Encoding utf8
    $results.Add([PSCustomObject]@{
        check = $Name
        status = if ($exitCode -eq 0) { 'PASS' } else { 'FAIL' }
        exitCode = $exitCode
        startedUtc = $started.ToString('o')
        finishedUtc = (Get-Date).ToUniversalTime().ToString('o')
    })
}

if ($env:OS -ne 'Windows_NT') {
    throw 'This checkpoint must run on Windows. No checks were executed.'
}

Push-Location $repoRoot
try {
    $gitStatus = & git status --porcelain
    if ($LASTEXITCODE -ne 0) { throw 'git status failed.' }
    if ($gitStatus) { throw 'Working tree must be clean before verification.' }

    $commit = [string](& git rev-parse HEAD)
    $commit = $commit.Trim()
    $branch = [string](& git branch --show-current)
    $branch = if ([string]::IsNullOrWhiteSpace($branch)) { 'DETACHED' } else { $branch.Trim() }

    $secureBoot = 'UNAVAILABLE'
    try {
        $secureBoot = Confirm-SecureBootUEFI -ErrorAction Stop
    } catch {
        $secureBoot = 'UNAVAILABLE'
    }
    $firewallProfiles = @([PSCustomObject]@{ status = 'UNAVAILABLE' })
    try {
        $firewallProfiles = @(Get-NetFirewallProfile | Select-Object Name, Enabled, DefaultInboundAction, DefaultOutboundAction)
    } catch {
        $firewallProfiles = @([PSCustomObject]@{ status = 'UNAVAILABLE' })
    }
    $systemVolumeBitLocker = [PSCustomObject]@{ status = 'UNAVAILABLE' }
    try {
        $systemVolumeBitLocker = Get-BitLockerVolume -MountPoint $env:SystemDrive |
            Select-Object MountPoint, VolumeStatus, ProtectionStatus, EncryptionMethod
    } catch {
        $systemVolumeBitLocker = [PSCustomObject]@{ status = 'UNAVAILABLE' }
    }
    $windowsUpdateService = [PSCustomObject]@{ status = 'UNAVAILABLE' }
    try {
        $windowsUpdateService = Get-Service -Name wuauserv | Select-Object Status, StartType
    } catch {
        $windowsUpdateService = [PSCustomObject]@{ status = 'UNAVAILABLE' }
    }

    $posture = [ordered]@{
        capturedUtc = (Get-Date).ToUniversalTime().ToString('o')
        os = [Environment]::OSVersion.VersionString
        architecture = $env:PROCESSOR_ARCHITECTURE
        secureBoot = $secureBoot
        firewallProfiles = $firewallProfiles
        systemVolumeBitLocker = $systemVolumeBitLocker
        windowsUpdateService = $windowsUpdateService
    }
    $posture | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'windows-security-posture.json') -Encoding utf8

    Invoke-EvidenceCommand 'environment' 'powershell' @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', 'scripts/verify-dev-environment.ps1')
    Invoke-EvidenceCommand 'grade12-migration-30' 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', 'migration_30', '--lib')
    Invoke-EvidenceCommand 'grade12-transition-computation' 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', 'compute_term_grade_applies_grade12_do8_weights_with_adjusted_transmutation', '--lib')
    Invoke-EvidenceCommand 'sqlcipher-unkeyed-rejection' 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', 'the_database_file_is_not_readable_without_the_key', '--lib')
    Invoke-EvidenceCommand 'sqlcipher-sidecar-privacy' 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', 'wal_and_shm_sidecar_files_never_contain_plaintext_learner_data', '--lib')
    Invoke-EvidenceCommand 'dpapi-corrupt-key-fail-closed' 'cargo' @('test', '--manifest-path', 'src-tauri/Cargo.toml', 'load_or_create_key_fails_closed_on_corrupted_key_file', '--lib')
    Invoke-EvidenceCommand 'quality-full' 'npm.cmd' @('run', 'quality:full')
    Invoke-EvidenceCommand 'quality-security' 'npm.cmd' @('run', 'quality:security')
    if (-not $SkipUi) {
        Invoke-EvidenceCommand 'quality-ui' 'npm.cmd' @('run', 'quality:ui')
    }
    if (-not $SkipBuild) {
        Invoke-EvidenceCommand 'tauri-build' 'npm.cmd' @('run', 'tauri', '--', 'build')
    }

    $manifest = [ordered]@{
        checkpoint = 'Windows P0 security/recovery automated verification'
        commit = $commit
        branch = $branch
        syntheticDataOnly = $true
        evidenceContainsRealPii = $false
        results = $results
        manualDrillRequired = $true
        manualDrill = 'docs/runbooks/WINDOWS-P0-SECURITY-RECOVERY.md'
    }
    $manifest | ConvertTo-Json -Depth 6 | Set-Content -LiteralPath (Join-Path $EvidenceRoot 'manifest.json') -Encoding utf8

    $results | Format-Table -AutoSize
    Write-Output "Evidence: $EvidenceRoot"

    if (($results | Where-Object { $_.status -eq 'FAIL' }).Count -gt 0) { exit 1 }
} finally {
    Pop-Location
}
