param(
  [Parameter(Mandatory=$true)][ValidatePattern('^M\d{2}$')][string]$Milestone,
  [Parameter(Mandatory=$true)][ValidateSet('partial','complete')][string]$Status,
  [string[]]$Validators = @(),
  [string[]]$Parked = @(),
  [string]$Message = ''
)

$ErrorActionPreference = 'Stop'

function Exec([string]$Command) {
  $output = Invoke-Expression $Command 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Command`n$output" }
  return ($output | Out-String).Trim()
}

$root = Exec 'git rev-parse --show-toplevel'
Set-Location $root
$branch = Exec 'git branch --show-current'
if ([string]::IsNullOrWhiteSpace($branch)) { throw 'Detached HEAD is not allowed for CTOS checkpointing.' }
if ($branch -eq 'main') { throw 'Refusing CTOS milestone checkpoint directly on main.' }

$conflicts = git diff --name-only --diff-filter=U
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect merge-conflict state.' }
if ($conflicts) { throw "Unresolved merge conflicts:`n$($conflicts -join "`n")" }

$headBefore = Exec 'git rev-parse HEAD'
$statusBefore = git status --short
if ($LASTEXITCODE -ne 0) { throw 'Unable to read git status.' }

$checkpointDir = Join-Path $root 'docs/ctos/checkpoints'
New-Item -ItemType Directory -Force -Path $checkpointDir | Out-Null
$statePath = Join-Path $root 'CTOS-STATE.md'
if (-not (Test-Path $statePath)) { throw 'CTOS-STATE.md is required before checkpointing.' }

$stamp = Get-Date -Format 'yyyy-MM-ddTHH:mm:ssK'
$validatorText = if ($Validators.Count) { ($Validators | ForEach-Object { "- $_" }) -join "`n" } else { '- none recorded' }
$parkedText = if ($Parked.Count) { ($Parked | ForEach-Object { "- $_" }) -join "`n" } else { '- none recorded' }
$shortStatus = if ($statusBefore) { ($statusBefore -join "`n") } else { '(clean before checkpoint metadata)' }

$checkpointPath = Join-Path $checkpointDir "$Milestone-runtime.md"
$body = @(
  "# $Milestone Runtime Checkpoint",
  '',
  "- Recorded: $stamp",
  "- Branch: $branch",
  "- HEAD before checkpoint commit: $headBefore",
  "- Requested status: $Status",
  '',
  '## Validators recorded',
  $validatorText,
  '',
  '## Parked dependencies',
  $parkedText,
  '',
  '## Pre-checkpoint git status',
  '```',
  $shortStatus,
  '```',
  '',
  '## Note',
  $Message
) -join "`n"
Set-Content -Path $checkpointPath -Value $body -Encoding utf8

$state = Get-Content $statePath -Raw
$state = [regex]::Replace($state, '(?m)^- Current milestone:.*$', "- Current milestone: $Milestone")
$state += "`n`n## Last runtime checkpoint`n- Recorded: $stamp`n- Branch: $branch`n- Milestone: $Milestone`n- Status: $Status`n"
Set-Content -Path $statePath -Value $state -Encoding utf8

git add -- CTOS-STATE.md docs/ctos/checkpoints
if ($LASTEXITCODE -ne 0) { throw 'git add failed.' }

$staged = git diff --cached --name-only
if ($LASTEXITCODE -ne 0) { throw 'Unable to inspect staged checkpoint.' }
if (-not $staged) { throw 'Checkpoint produced no staged changes.' }

$commitMessage = if ($Message) { "ctos($($Milestone.ToLower())): $Message" } else { "ctos($($Milestone.ToLower())): $Status checkpoint" }
git commit -m $commitMessage
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint commit failed.' }
$checkpointHead = Exec 'git rev-parse HEAD'

git push origin $branch
if ($LASTEXITCODE -ne 0) { throw 'Checkpoint push failed.' }

$remoteHead = Exec "git ls-remote origin refs/heads/$branch"
if (-not $remoteHead.StartsWith($checkpointHead)) {
  throw "Remote durability check failed. Local=$checkpointHead Remote=$remoteHead"
}

if ($Status -eq 'complete') {
  $tag = "ctos-$($Milestone.ToLower())-complete"
  if (git tag --list $tag) { throw "Tag already exists locally: $tag" }
  git tag -a $tag -m "$Milestone complete at $checkpointHead"
  if ($LASTEXITCODE -ne 0) { throw 'Tag creation failed.' }
  git push origin $tag
  if ($LASTEXITCODE -ne 0) { throw 'Tag push failed.' }
  $remoteTag = Exec "git ls-remote origin refs/tags/$tag"
  if (-not $remoteTag) { throw "Remote tag verification failed: $tag" }
}

Write-Host "CTOS checkpoint durable: $checkpointHead"
Clear-Host