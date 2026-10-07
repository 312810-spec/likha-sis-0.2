param([switch]$NoFetch)

$ErrorActionPreference = 'Stop'

function Exec([string]$Command) {
  $output = Invoke-Expression $Command 2>&1
  if ($LASTEXITCODE -ne 0) { throw "Command failed ($LASTEXITCODE): $Command`n$output" }
  return ($output | Out-String).Trim()
}

$root = Exec 'git rev-parse --show-toplevel'
Set-Location $root

if (-not $NoFetch) {
  Exec 'git fetch --prune origin' | Out-Null
}

$branch = Exec 'git branch --show-current'
$head = Exec 'git rev-parse HEAD'
$status = git status --short
if ($LASTEXITCODE -ne 0) { throw 'Unable to read git status.' }

Write-Host 'CTOS resume'
Write-Host "Branch: $branch"
Write-Host "HEAD:   $head"

if (Test-Path 'CTOS-STATE.md') {
  Write-Host "`n--- CTOS-STATE.md ---"
  Get-Content 'CTOS-STATE.md'
} else {
  Write-Warning 'CTOS-STATE.md not found.'
}

$checkpoints = Get-ChildItem 'docs/ctos/checkpoints' -Filter '*.md' -ErrorAction SilentlyContinue | Sort-Object LastWriteTime -Descending
if ($checkpoints) {
  Write-Host "`n--- Latest checkpoint ---"
  Write-Host $checkpoints[0].FullName
  Get-Content $checkpoints[0].FullName
}

if ($status) {
  Write-Host "`n--- Working tree changes ---"
  $status
} else {
  Write-Host "`nWorking tree: clean"
}

if ($branch -eq 'main') {
  Write-Warning 'You are on main. Create/switch to the CTOS integration branch before feature milestone work.'
}

Write-Host "`nResume complete. Continue from the exact next action in CTOS-STATE.md; do not repeat already durable work."