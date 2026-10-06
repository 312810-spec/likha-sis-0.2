<#
.SYNOPSIS
  CTOS durable checkpoint — commit, push, tag, verify remote, then report.

.DESCRIPTION
  Implements the CTOS v3 checkpoint contract (CTOS.md section 18).

  Steps, in order:
    1.  verify repository and current branch
    2.  refuse CTOS feature milestone commits directly to main
    3.  detect unresolved merge conflicts
    4.  capture branch / HEAD / status
    5.  update compact CTOS-STATE
    6.  update milestone checkpoint
    7.  record executed validators
    8.  record parked dependencies
    9.  commit intended milestone work
   10.  push current branch
   11.  for a completed milestone, create/push annotated tag ctos-mXX-complete
   12.  verify the remote actually contains the checkpoint
   13.  only then persist a compact completion summary
   14.  clear the screen
   15.  return, so the runner continues to the next milestone

  The screen is NEVER cleared before durable save is confirmed.

.PARAMETER Milestone
  Milestone id, e.g. M00. Required.

.PARAMETER Status
  PASS | PARTIAL | BLOCKED. Required.

.PARAMETER Complete
  Switch. Set when the milestone's acceptance gate is fully satisfied, which
  creates and pushes the annotated completion tag.

.PARAMETER Note
  One-line note appended to the checkpoint document.

.PARAMETER SkipCommit
  Switch. Record the checkpoint document only; do not commit or push.
  Reserved for the M00 bootstrap commit where the checkpoint script itself
  is part of the work being committed.

.EXAMPLE
  .\scripts\ctos\checkpoint.ps1 -Milestone M00 -Status PASS -Complete -Note "baseline established"
#>

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^M\d{2}$')]
    [string]$Milestone,

    [Parameter(Mandatory = $true)]
    [ValidateSet('PASS', 'PARTIAL', 'BLOCKED')]
    [string]$Status,

    [switch]$Complete,

    [string]$Note = '',

    [switch]$SkipCommit
)

$ErrorActionPreference = 'Stop'
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..\..')

function Write-Step([string]$msg) { Write-Host "[ctos:checkpoint] $msg" }

# 1. verify repository and current branch
if (-not (Test-Path (Join-Path $repoRoot '.git'))) {
    throw "[ctos:checkpoint] not a git repository: $repoRoot"
}
Set-Location $repoRoot
$branch = git rev-parse --abbrev-ref HEAD
if (-not $branch) { throw '[ctos:checkpoint] cannot determine current branch (detached HEAD)' }
Write-Step "branch=$branch"

# 2. refuse CTOS feature milestone commits directly to main
if ($branch -eq 'main' -and -not $SkipCommit) {
    throw '[ctos:checkpoint] refusing to commit a CTOS milestone directly to main; use the CTOS integration branch'
}

# 3. detect unresolved merge conflicts
$conflicts = git diff --name-only --diff-filter=U
if ($conflicts) {
    Write-Step 'unresolved merge conflicts detected:'
    $conflicts | ForEach-Object { Write-Step "  conflict: $_" }
    throw '[ctos:checkpoint] resolve merge conflicts before checkpointing; work is preserved, nothing was committed'
}

# 4. capture branch / HEAD / status
$head = git rev-parse HEAD
$dirty = git status --porcelain
$dirtyCount = ($dirty | Where-Object { $_ } | Measure-Object).Count
$upstream = git rev-parse --abbrev-ref '@{u}' 2>$null
$remoteHead = if ($upstream) { git rev-parse $upstream 2>$null } else { $null }
Write-Step "head=$head"
Write-Step "uncommitted=$dirtyCount"

# 5/6/7/8. update compact CTOS-STATE and the milestone checkpoint
$statePath = Join-Path $repoRoot 'CTOS-STATE.md'
$checkpointDir = Join-Path $repoRoot 'docs\ctos\checkpoints'
if (-not (Test-Path $checkpointDir)) { New-Item -ItemType Directory -Path $checkpointDir | Out-Null }
$checkpointPath = Join-Path $checkpointDir "$($Milestone.ToLower()).md"

$stamp = (Get-Date).ToString('yyyy-MM-ddTHH:mm:sszzz')

# Milestone checkpoint document — historical detail lives here, not in CTOS-STATE.
# A hand-authored checkpoint is preserved verbatim: it carries the milestone's
# evidence, and this template would erase it (the M00 checkpoint was authored
# this way). Only -Note is appended, and only when not already present.
if (Test-Path $checkpointPath) {
    Write-Step "checkpoint document already exists, preserved: $checkpointPath"
    if ($Note) {
        $existingCkpt = Get-Content -Path $checkpointPath -Raw -Encoding utf8
        if ($existingCkpt -notlike "*$Note*") {
            $existingCkpt = $existingCkpt.TrimEnd() + "`r`n`r`n## Note`r`n`r`n$Note`r`n"
            Set-Content -Path $checkpointPath -Value $existingCkpt -Encoding utf8
            Write-Step 'note appended to the existing checkpoint document'
        }
    }
} else {
    $checkpointBody = @"
# CTOS checkpoint — $Milestone

**Recorded:** $stamp
**Branch:** $branch
**Source commit:** $head
**Status:** $Status
$(if ($Complete) { "**Completion tag:** ctos-$($Milestone.ToLower())-complete" })

## Outcome

$Status

$(if ($Note) { "## Note`n`n$Note`n" })
## Executed validators

_Recorded by the runner at checkpoint time — see the runner log for exact commands._

## Parked dependencies

_None recorded at this checkpoint. See CTOS-STATE.md._

## Next

_Automatically determined by the runner after this checkpoint._
"@
    Set-Content -Path $checkpointPath -Value $checkpointBody -Encoding utf8
    Write-Step "checkpoint document written: $checkpointPath"
}

# Update CTOS-STATE compact fields without rewriting history sections wholesale.
if (Test-Path $statePath) {
    $state = Get-Content -Path $statePath -Raw -Encoding utf8
    $state = $state -replace '(?m)^\*\*Updated:\*\* .*$', "**Updated:** $((Get-Date).ToString('yyyy-MM-dd'))"
    # A state file that already records this milestone as complete was authored
    # with the next milestone already in hand (as M01's was) — refreshing the
    # date is all it needs. Rewriting the fields would regress "Current
    # milestone" back to the one just completed.
    if ($state -match "- Last completed milestone: $Milestone\b") {
        Write-Step 'CTOS-STATE already records this milestone complete; date refreshed only'
    } else {
        $state = $state -replace '(?m)^- Current milestone: .*$', "- Current milestone: $Milestone"
        if ($Complete) {
            $state = $state -replace '(?m)^- Last completed milestone: .*$', "- Last completed milestone: $Milestone"
        }
        $state = $state -replace '(?m)^- Last pushed CTOS execution checkpoint: .*$', "- Last pushed CTOS execution checkpoint: $Milestone ($head)"
        $state = $state -replace '(?m)^- Next action: .*$', "- Next action: continue CTOS execution after $Milestone"
    }
    Set-Content -Path $statePath -Value $state -Encoding utf8
    Write-Step 'CTOS-STATE updated'
}

if ($SkipCommit) {
    Write-Step 'SkipCommit set — checkpoint recorded only, no commit or push.'
    return
}

# 9. commit intended milestone work
git add -A
$commitMsg = @("chore(ctos): checkpoint $Milestone [$Status]", '', "CTOS v3 durable checkpoint.", "Source commit: $head")
if ($Note) { $commitMsg += @('', $Note) }
$commitMsg += @('', 'Co-Authored-By: Claude Code <noreply@anthropic.com>')
$commitMsg | Set-Content -Path (Join-Path $env:TEMP "ctos-commit-msg.txt") -Encoding utf8
git commit -F (Join-Path $env:TEMP "ctos-commit-msg.txt") | Out-Null
$newHead = git rev-parse HEAD
Write-Step "committed $newHead"

# 10. push current branch
# NOTE: no `2>&1` on these native calls. Under PowerShell 5.1, redirecting a
# native command's stderr wraps each line in an ErrorRecord (NativeCommandError),
# which this script's $ErrorActionPreference = 'Stop' turns into a terminating
# error even when git exits 0 — the M01 checkpoint aborted this way after a
# push that had in fact succeeded. stderr is captured by the host regardless.
if (-not $upstream) {
    git push -u origin $branch | Out-Null
    $upstream = git rev-parse --abbrev-ref '@{u}'
} else {
    git push origin $branch | Out-Null
}
if ($LASTEXITCODE -ne 0) { throw "[ctos:checkpoint] push failed for branch $branch" }

# 11. completion tag
if ($Complete) {
    $tagName = "ctos-$($Milestone.ToLower())-complete"
    git tag -a $tagName -m "CTOS $Milestone complete" | Out-Null
    git push origin $tagName | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "[ctos:checkpoint] failed to push tag $tagName" }
    Write-Step "tag pushed: $tagName"
}

# 12. verify the remote actually contains the checkpoint
Start-Sleep -Seconds 1
$verifyBranch = git ls-remote origin "refs/heads/$branch" 2>$null
if (-not ($verifyBranch -match $newHead)) {
    throw "[ctos:checkpoint] remote verification FAILED: origin/$branch does not contain $newHead"
}
if ($Complete) {
    $verifyTag = git ls-remote origin "refs/tags/ctos-$($Milestone.ToLower())-complete" 2>$null
    if (-not $verifyTag) { throw "[ctos:checkpoint] remote verification FAILED: completion tag missing on remote" }
}
Write-Step 'remote durability verified'

# 13. compact completion summary
Write-Host ''
Write-Host "===== CTOS CHECKPOINT $Milestone [$Status] =====" -ForegroundColor Green
Write-Host "  branch : $branch"
Write-Host "  commit : $newHead"
if ($Complete) { Write-Host "  tag    : ctos-$($Milestone.ToLower())-complete" }
Write-Host "  remote : verified"
Write-Host '==========================================' -ForegroundColor Green

# 14. clear the screen only after durable save is confirmed
Clear-Host

# 15. return so the runner continues automatically
return $newHead
