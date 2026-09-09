# Hub Hardware Gate Audit — Admin Runbook

Batch 14 sub-item 2. Read-only, non-destructive script + tests reviewed
in this session; execution against a real Windows machine is the
hardware-only remainder — see "Honest status" below.

## What this checks

`ops/hub-hardware-gate-audit.ps1` audits three of ADR-0067's operational
security gates for the physical school-laptop sync hub:

1. **BitLocker** — is the system drive's whole-disk encryption on?
2. **Firewall** — is there an enabled, inbound, Allow rule that actually
   permits TCP port 7878 (the hub's sync listener port, `HUB_PORT` in
   `src-tauri/src/hub_server.rs`)? Also flags (without failing) a rule
   scoped to "Any" remote address, since ADR-0067 expects LAN/Tailscale
   reachability, not an open-to-the-internet rule.
3. **Patch status** — are there Windows updates pending for longer than
   30 days (configurable via `-MaxPendingUpdateAgeDays`)?

## How to run it (on the hub laptop, as an administrator)

```powershell
cd path\to\likha-sis-0.2
.\ops\hub-hardware-gate-audit.ps1
```

Sample output shape:

```
Gate         Status Detail
----         ------ ------
BitLocker    PASS   System drive encryption is ON (VolumeStatus=FullyEncrypted).
Firewall     PASS   Port 7878 is reachable via 1 matching inbound Allow rule(s)...
Patch Status WARN   1 update(s) pending, but all within the 30-day grace window.

0 FAIL, 1 WARN, 2 PASS
```

Exit code `0` means every gate passed (WARN does not fail the run); exit
code `1` means at least one gate FAILed — treat this as a blocking finding
for a hub machine holding a whole school's dataset, not a nice-to-fix.

## Interpreting a FAIL

| Gate         | FAIL means                                           | Fix                                                                                                                                                                                                                             |
| ------------ | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BitLocker    | Encryption is off, suspended, or couldn't be queried | Control Panel > BitLocker Drive Encryption > turn on for the system drive                                                                                                                                                       |
| Firewall     | No enabled inbound Allow rule reaches port 7878      | Add a firewall rule scoped to the school LAN/Tailscale range: `New-NetFirewallRule -DisplayName "LIKHA-SIS Hub Sync" -Direction Inbound -Protocol TCP -LocalPort 7878 -Action Allow -RemoteAddress <school LAN/Tailscale CIDR>` |
| Patch Status | An update has been pending > 30 days                 | Run Windows Update and install pending updates                                                                                                                                                                                  |

## Dry-run mode (no live Windows API calls)

```powershell
.\ops\hub-hardware-gate-audit.ps1 -DryRun
```

Runs the exact same decision functions against three synthetic scenarios
(all-pass, mixed, all-fail) so the script's report formatting and
decision logic can be sanity-checked on any machine — even one that
isn't the real hub, or has no BitLocker/firewall/WSUS to query.

## Automated tests

`ops/hub-hardware-gate-audit.Tests.ps1` is a Pester suite asserting the
same decision functions against fixture inputs (all four
`Get-*GateResult`/`Test-PortInRuleRange` functions, every PASS/WARN/FAIL
branch). Pester ships built into Windows 10 (1809+)/Windows 11 — no new
project dependency. Run with:

```powershell
Invoke-Pester -Path .\ops\hub-hardware-gate-audit.Tests.ps1 -Output Detailed
```

## Honest status (what's proven vs. not)

- **Proven in this session**: the script's structure, its decision
  functions' logic (reviewed line-by-line), and the `-DryRun` scenario
  output shape.
- **Not proven in this session**: this script and its Pester suite have
  never actually executed — no `pwsh`/PowerShell is available in this
  project's Linux development sandbox. Real `Get-BitLockerVolume` /
  `Get-NetFirewallRule` / Windows Update API behavior, and the exact
  object shapes those cmdlets return on a real Windows 10/11 machine,
  are assumed from documented cmdlet contracts, not observed directly.
- **What a human must do once**: run both the real audit and
  `Invoke-Pester` on an actual Windows machine (ideally the real hub
  laptop) and confirm the output matches this runbook's expectations;
  record the result and date in `docs/VERIFICATION-DEBT.md`.
