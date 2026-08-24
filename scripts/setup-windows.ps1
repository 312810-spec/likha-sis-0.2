#Requires -Version 5.1
<#
One-time-ish helper for a fresh Windows dev machine: installs the
prerequisites this repository has actually proven necessary, via winget.
Idempotent - winget skips anything already installed. Never touches
machine-wide security settings and never installs anything beyond what's
listed here. Does not itself verify the result - run
verify-dev-environment.ps1 afterward (from a fresh terminal, so newly
installed tools are on PATH).
#>

$ErrorActionPreference = 'Stop'

if (-not (Get-Command winget -ErrorAction SilentlyContinue)) {
    Write-Error "winget is not available. Install 'App Installer' from the Microsoft Store, then re-run this script."
    exit 1
}

$packages = @(
    @{ Id = 'Git.Git'; Name = 'Git' },
    @{ Id = 'OpenJS.NodeJS.LTS'; Name = 'Node.js LTS' },
    @{ Id = 'Rustlang.Rustup'; Name = 'Rust (via rustup)' },
    @{ Id = 'Microsoft.VisualStudio.2022.BuildTools'; Name = 'Visual Studio 2022 Build Tools'; Override = '--add Microsoft.VisualStudio.Workload.VCTools --includeRecommended' },
    @{ Id = 'StrawberryPerl.StrawberryPerl'; Name = 'Strawberry Perl (vendored OpenSSL for SQLCipher)' }
)

foreach ($pkg in $packages) {
    Write-Output "==> $($pkg.Name) ($($pkg.Id))"
    $wingetArgs = @('install', '--id', $pkg.Id, '--exact', '--source', 'winget', '--accept-source-agreements', '--accept-package-agreements', '--disable-interactivity')
    if ($pkg.Override) { $wingetArgs += @('--override', $pkg.Override) }
    & winget @wingetArgs
    if ($LASTEXITCODE -ne 0 -and $LASTEXITCODE -ne -1978335189) {
        # -1978335189 = APPINSTALLER_CLI_ERROR_NO_APPLICABLE_UPDATE_FOUND (already installed/up to date) - not a failure.
        Write-Warning "$($pkg.Name) install returned exit code $LASTEXITCODE - see output above."
        $script:hadFailure = $true
    }
}

Write-Output ""
Write-Output "Installs requested. cargo/perl will not be on THIS shell's PATH until a new terminal is opened."
Write-Output "Open a fresh terminal, then run: powershell -File scripts\verify-dev-environment.ps1"
if ($script:hadFailure) { exit 1 } else { exit 0 }
