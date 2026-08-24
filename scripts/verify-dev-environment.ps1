#Requires -Version 5.1
<#
Diagnoses (does not install) the Windows prerequisites this repository has
proven necessary. Read-only: reports pass/fail/warn per check and exits
non-zero if anything required is missing. Safe to run repeatedly.
#>

$ErrorActionPreference = 'Stop'
$results = @()

function Test-Command {
    param([string]$Name, [string]$Command, [string]$Hint)
    $cmd = Get-Command $Command -ErrorAction SilentlyContinue
    if ($cmd) {
        try { $version = & $Command --version 2>&1 | Select-Object -First 1 } catch { $version = '(found, --version failed)' }
        [PSCustomObject]@{ Check = $Name; Status = 'PASS'; Detail = "$($cmd.Source)  - $version" }
    } else {
        [PSCustomObject]@{ Check = $Name; Status = 'FAIL'; Detail = $Hint }
    }
}

# Git
$results += Test-Command -Name 'Git' -Command 'git' -Hint 'Install from https://git-scm.com/download/win'

# Node / npm
$results += Test-Command -Name 'Node.js' -Command 'node' -Hint 'Install Node.js LTS from https://nodejs.org'
$results += Test-Command -Name 'npm' -Command 'npm' -Hint 'Bundled with Node.js  - reinstall Node.js'

# Rust toolchain  - these live in %USERPROFILE%\.cargo\bin, which a fresh
# shell may not have on PATH yet even after a successful winget install.
$cargoBin = Join-Path $env:USERPROFILE '.cargo\bin'
if ((Get-Command cargo -ErrorAction SilentlyContinue) -or (Test-Path (Join-Path $cargoBin 'cargo.exe'))) {
    $cargoExe = if (Get-Command cargo -ErrorAction SilentlyContinue) { (Get-Command cargo).Source } else { Join-Path $cargoBin 'cargo.exe' }
    $version = & $cargoExe --version 2>&1
    $onPath = [bool](Get-Command cargo -ErrorAction SilentlyContinue)
    $status = if ($onPath) { 'PASS' } else { 'WARN' }
    $detail = if ($onPath) { "$cargoExe  - $version" } else { "Installed at $cargoExe but NOT on this shell's PATH. Open a fresh terminal, or the current session must add '$cargoBin' to PATH manually." }
    $results += [PSCustomObject]@{ Check = 'Rust/Cargo'; Status = $status; Detail = $detail }
} else {
    $results += [PSCustomObject]@{ Check = 'Rust/Cargo'; Status = 'FAIL'; Detail = 'Install via: winget install Rustlang.Rustup' }
}

# MSVC Build Tools (link.exe/cl.exe live under a versioned VS path, not
# normally on PATH  - detect via vswhere instead of `where.exe`).
$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
if (Test-Path $vswhere) {
    $vsPath = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath 2>$null
    if ($vsPath) {
        $results += [PSCustomObject]@{ Check = 'MSVC Build Tools (C++ workload)'; Status = 'PASS'; Detail = $vsPath }
    } else {
        $results += [PSCustomObject]@{ Check = 'MSVC Build Tools (C++ workload)'; Status = 'FAIL'; Detail = 'vswhere found but no C++ workload  - install "Desktop development with C++" via Visual Studio Installer or: winget install Microsoft.VisualStudio.2022.BuildTools' }
    }
} else {
    $results += [PSCustomObject]@{ Check = 'MSVC Build Tools (C++ workload)'; Status = 'FAIL'; Detail = 'Not found. Install: winget install Microsoft.VisualStudio.2022.BuildTools (then add the C++ workload)' }
}

# Windows SDK (bundled with the VS C++ workload above; spot-check for a
# recent version's headers as a best-effort signal, not authoritative).
$sdkRoot = "${env:ProgramFiles(x86)}\Windows Kits\10\Include"
if (Test-Path $sdkRoot) {
    $sdkVersions = Get-ChildItem $sdkRoot -Directory -ErrorAction SilentlyContinue | Sort-Object Name -Descending | Select-Object -First 1
    $results += [PSCustomObject]@{ Check = 'Windows SDK'; Status = 'PASS'; Detail = "Found: $($sdkVersions.Name)" }
} else {
    $results += [PSCustomObject]@{ Check = 'Windows SDK'; Status = 'WARN'; Detail = 'Not detected at the usual path  - usually bundled with the MSVC Build Tools C++ workload; verify manually if builds fail.' }
}

# Strawberry Perl  - required to compile vendored OpenSSL for SQLCipher.
$perlPath = 'C:\Strawberry\perl\bin\perl.exe'
if ((Get-Command perl -ErrorAction SilentlyContinue) -or (Test-Path $perlPath)) {
    $onPath = [bool](Get-Command perl -ErrorAction SilentlyContinue)
    $status = if ($onPath) { 'PASS' } else { 'WARN' }
    $detail = if ($onPath) { (Get-Command perl).Source } else { "Installed at $perlPath but NOT on this shell's PATH. Open a fresh terminal, or add 'C:\Strawberry\perl\bin', 'C:\Strawberry\perl\site\bin', 'C:\Strawberry\c\bin' to PATH." }
    $results += [PSCustomObject]@{ Check = 'Strawberry Perl (vendored OpenSSL)'; Status = $status; Detail = $detail }
} else {
    $results += [PSCustomObject]@{ Check = 'Strawberry Perl (vendored OpenSSL)'; Status = 'FAIL'; Detail = 'Install: winget install StrawberryPerl.StrawberryPerl' }
}

# Repository line-ending policy  - .gitattributes must exist and actually
# be normalizing checked-out files to LF (see .gitattributes for why).
$repoRoot = (& git rev-parse --show-toplevel 2>$null)
if ($repoRoot) {
    $repoRoot = $repoRoot -replace '/', '\'
    $gitattributes = Join-Path $repoRoot '.gitattributes'
    if (Test-Path $gitattributes) {
        Push-Location $repoRoot
        $eolSample = & git ls-files --eol -- CLAUDE.md package.json 2>$null
        Pop-Location
        $badEol = $eolSample | Where-Object { $_ -match 'w/crlf' }
        if ($badEol) {
            $results += [PSCustomObject]@{ Check = 'Line-ending policy'; Status = 'FAIL'; Detail = "`.gitattributes` exists but checked-out files still show CRLF  - re-run: git add --renormalize . " }
        } else {
            $results += [PSCustomObject]@{ Check = 'Line-ending policy'; Status = 'PASS'; Detail = '.gitattributes present; sampled files check out as LF.' }
        }
    } else {
        $results += [PSCustomObject]@{ Check = 'Line-ending policy'; Status = 'FAIL'; Detail = '.gitattributes missing  - a Windows clone with the common core.autocrlf=true default will convert LF source to CRLF and fail `npm run quality` (prettier).' }
    }
} else {
    $results += [PSCustomObject]@{ Check = 'Line-ending policy'; Status = 'WARN'; Detail = 'Not inside a git repository  - cannot check.' }
}

# Stale/foreign absolute-path build cache  - this repo has been affected
# by a target/ directory whose cached build-script output baked in a
# different clone's absolute path (e.g. a sibling "-lf" directory used
# during a line-ending migration), causing cryptic OUT_DIR-not-found
# build failures that `cargo clean` / deleting target/ does not fix by
# itself if the stale directory still exists.
if ($repoRoot) {
    $targetDir = Join-Path $repoRoot 'src-tauri\target'
    if (Test-Path $targetDir) {
        $outputGlob = Join-Path $targetDir 'debug\build\*\output'
        $outputFiles = Get-Item $outputGlob -ErrorAction SilentlyContinue
        $foreignHits = @()
        foreach ($f in $outputFiles) {
            # C/C++ build tool output (e.g. OpenSSL's cl.exe invocations) embeds
            # paths with C-escaped double backslashes, so normalize those to
            # single backslashes before comparing against repoRoot.
            $hits = Select-String -Path $f.FullName -Pattern '[A-Za-z]:\\{1,2}[^\r\n"]*\\{1,2}src-tauri\\{1,2}' -ErrorAction SilentlyContinue |
                Where-Object { ($_.Line -replace '\\\\', '\') -notmatch [Regex]::Escape($repoRoot) }
            if ($hits) { $foreignHits += $f.FullName }
        }
        if ($foreignHits.Count -gt 0) {
            $results += [PSCustomObject]@{ Check = 'Build cache (src-tauri/target)'; Status = 'FAIL'; Detail = "Found $($foreignHits.Count) cached build-script output file(s) referencing a src-tauri path outside this repo (e.g. a stale sibling clone). Run: Remove-Item -Recurse -Force src-tauri\target  - then rebuild." }
        } else {
            $results += [PSCustomObject]@{ Check = 'Build cache (src-tauri/target)'; Status = 'PASS'; Detail = 'Present, no foreign absolute paths detected in cached build-script output.' }
        }
    } else {
        $results += [PSCustomObject]@{ Check = 'Build cache (src-tauri/target)'; Status = 'PASS'; Detail = 'Not present  - first build will create it fresh.' }
    }
}

$results | Format-Table -AutoSize -Wrap

$failCount = ($results | Where-Object { $_.Status -eq 'FAIL' }).Count
$warnCount = ($results | Where-Object { $_.Status -eq 'WARN' }).Count
Write-Output ""
Write-Output "$failCount FAIL, $warnCount WARN, $($results.Count - $failCount - $warnCount) PASS"

if ($failCount -gt 0) { exit 1 } else { exit 0 }
