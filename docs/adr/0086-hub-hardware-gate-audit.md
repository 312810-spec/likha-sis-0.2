# ADR-0086: Hub Hardware Gate Audit Script

Status: Accepted
Date: 2026-09-09

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s Tier 1.2 listed "Hub Hardware
Gates: Operational validation of BitLocker, firewall rules, and patch
management on the physical hub machine" as blocked purely on real
hardware. That conflated two different things: the SCRIPT that performs
the audit (fully codable, testable, and reviewable without touching a
real Windows machine) and the ACT of running it against a live hub
laptop (genuinely hardware-only).

## Decision

Added `ops/hub-hardware-gate-audit.ps1`: a read-only, non-destructive
PowerShell script that checks BitLocker status, an inbound firewall rule
for the hub's sync port (7878), and Windows Update pending-patch age,
producing a pass/fail/warn report and a non-zero exit code on any FAIL.

**Decision logic is deliberately separated from live data-fetching.**
Each gate has a pure `Get-*GateResult` function that takes already-fetched
data (a real cmdlet's output, or a synthetic fixture) and returns a
verdict; a thin `Get-RealOrFixture*` layer is the only part of the script
that ever calls a real Windows API (`Get-BitLockerVolume`,
`Get-NetFirewallRule`, the Windows Update API / `PSWindowsUpdate`
module), or, under `-DryRun`, returns a synthetic fixture instead. This
mirrors the same fetch/decide split this codebase already uses elsewhere
(e.g. `hub_server::select_bindable_addresses` is pure and unit-tested
separately from `hub_server::enumerate_local_addresses`, which is the
only part that touches real interface enumeration).

`ops/hub-hardware-gate-audit.Tests.ps1` is a Pester suite asserting every
PASS/WARN/FAIL branch of the four decision functions against fixture
inputs. Pester ships built into Windows 10 (1809+) and Windows 11 — no
new project dependency.

**Firewall gate detail**: passes only for an ENABLED, INBOUND, ALLOW rule
whose port range actually includes 7878 (handles the `Any`/single-port/
comma-list/range shapes `Get-NetFirewallPortFilter` returns); a matching
rule scoped to `RemoteAddress = "Any"` still passes but is flagged in the
detail text, since ADR-0067 expects LAN/Tailscale reachability specifically,
not an internet-wide opening.

**Patch gate detail**: FAILs only once an individual pending update has
sat unapplied longer than `-MaxPendingUpdateAgeDays` (default 30); any
pending update within the grace window is a WARN, not a FAIL, so a
machine mid-patch-cycle isn't treated the same as one that's been
neglected for months.

## Honest verification status

This script and its Pester suite have never executed — no
`pwsh`/PowerShell exists in this project's Linux development sandbox.
Reviewed line-by-line for correctness against documented cmdlet
contracts, not observed against real Windows APIs. See
`ops/hub-hardware-gate-audit-runbook.md` for the human-executable
verification steps and `docs/VERIFICATION-DEBT.md` for the honest split
between what's tested-by-review and what needs a human on real hardware.

## Consequences

- A school IT admin now has a concrete, repeatable, documented script to
  run instead of an ad hoc manual checklist for these three gates.
- No new dependency: `Get-BitLockerVolume`/`Get-NetFirewallRule`/`Get-Date`
  are built into Windows PowerShell; `PSWindowsUpdate` is used only if
  already present, with a graceful empty-result fallback if it is not
  (never a hard failure of the whole audit for a missing optional
  module).
