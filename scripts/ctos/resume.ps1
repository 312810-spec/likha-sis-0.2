<#
.SYNOPSIS
  CTOS resume — reconstruct exact continuation state without discarding work.

.DESCRIPTION
  Implements the CTOS v3 resume contract (CTOS.md section 18).

  Never discards dirty work. Never switches branches over uncommitted work.
  Stops if state is ambiguous enough to risk data loss.

  Steps:
    1. fetch remotes
    2. show current branch / HEAD
    3. read CTOS-STATE
    4. identify latest completed milestone tag
    5. identify latest checkpoint
    6. show dirty / unpushed state
    7. show exact next action
    8. never discard dirty work
    9. never switch branches over uncommitted work
   10. stop if state is ambiguous enough to risk data loss

.EXAMPLE
  .\scripts\ctos\resume.ps1
#>

[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')
Set-Location $repoRoot

function Show([string]$label, [string]$value) { Write-Host "  $label : $value" }

Write-Host '===== CTOS RESUME =====' -ForegroundColor Cyan

# 1. fetch remotes
git fetch --all --tags 2>&1 | Out-Null
Write-Host '[ctos:resume] remotes fetched'

# 2. current branch / HEAD
$branch = git rev-parse --abbrev-ref HEAD
$head = git rev-parse HEAD
Show 'branch' $branch
Show 'HEAD' $head
$originMain = $null
try { $originMain = git rev-parse origin/main 2>$null } catch { $originMain = $null }
Show 'main (remote)' $originMain

# 3. read CTOS-STATE
$statePath = Join-Path $repoRoot 'CTOS-STATE.md'
if (Test-Path $statePath) {
    Write-Host ''
    Write-Host '--- CTOS-STATE ---' -ForegroundColor Cyan
    Get-Content -Path $statePath -Encoding utf8 | Where-Object { $_ -match '^- ' } | ForEach-Object { Write-Host $_ }
} else {
    Write-Host '[ctos:resume] CTOS-STATE.md is MISSING — state is ambiguous' -ForegroundColor Red
}

# 4. latest completed milestone tag
$tags = @()
try { $tags = @(git tag --list 'ctos-m*-complete' 2>$null) } catch { $tags = @() }
if ($tags.Count -gt 0) {
    $latestTag = ($tags | Sort-Object -Descending | Select-Object -First 1)
    Show 'latest complete tag' $latestTag
} else {
    Show 'latest complete tag' 'none'
}

# 5. latest checkpoint document
$checkpointDir = Join-Path $repoRoot 'docs\ctos\checkpoints'
if (Test-Path $checkpointDir) {
    $latestCheckpoint = Get-ChildItem -Path $checkpointDir -Filter 'm*.md' |
        Sort-Object Name -Descending | Select-Object -First 1
    if ($latestCheckpoint) { Show 'latest checkpoint' $latestCheckpoint.Name }
    else { Show 'latest checkpoint' 'none' }
} else {
    Show 'latest checkpoint' 'directory missing'
}

# 6. dirty / unpushed state
$dirty = git status --porcelain
$dirtyCount = ($dirty | Where-Object { $_ } | Measure-Object).Count
Show 'uncommitted files' $dirtyCount

$upstream = $null
try { $upstream = git rev-parse --abbrev-ref '@{u}' 2>$null } catch { $upstream = $null }
if ($upstream) {
    $unpushed = git rev-list "$upstream..HEAD" 2>$null
    $unpushedCount = ($unpushed | Where-Object { $_ } | Measure-Object).Count
    Show 'unpushed commits' $unpushedCount
} else {
    Show 'unpushed commits' 'no upstream set'
}

if ($dirtyCount -gt 0) {
    Write-Host ''
    Write-Host '[ctos:resume] DIRTY WORK DETECTED — preserved, not discarded:' -ForegroundColor Yellow
    $dirty | Select-Object -First 40 | ForEach-Object { Write-Host "    $_" }
}

# 8/9. never discard dirty work; never switch over uncommitted work
if ($dirtyCount -gt 0) {
    Write-Host ''
    Write-Host '[ctos:resume] Refusing any branch switch while work is uncommitted.' -ForegroundColor Yellow
}

# 10. stop if state is ambiguous enough to risk data loss
if (-not (Test-Path $statePath) -and $dirtyCount -gt 0) {
    Write-Host ''
    Write-Host '[ctos:resume] STOP: CTOS-STATE is missing AND work is uncommitted.' -ForegroundColor Red
    Write-Host '          This is ambiguous enough to risk data loss. Inspect manually.' -ForegroundColor Red
    exit 2
}

$conflicts = git diff --name-only --diff-filter=U
if ($conflicts) {
    Write-Host ''
    Write-Host '[ctos:resume] STOP: unresolved merge conflicts:' -ForegroundColor Red
    $conflicts | ForEach-Object { Write-Host "    $_" }
    exit 3
}

# 7. exact next action
Write-Host ''
Write-Host '===== EXACT NEXT ACTION =====' -ForegroundColor Green
$firstLine = if (Test-Path $statePath) {
    (Get-Content -Path $statePath -Encoding utf8 |
        Select-String -Pattern '^- Next action: ' | Select-Object -First 1).Line
} else { $null }
if ($firstLine) {
    Write-Host "  $firstLine" -ForegroundColor Green
} else {
    Write-Host '  No recorded next action — continue from the first incomplete CTOS milestone.' -ForegroundColor Green
}
Write-Host '============================' -ForegroundColor Green
