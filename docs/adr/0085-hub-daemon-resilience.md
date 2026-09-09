# ADR-0085: School-Laptop Hub Daemon Resilience

Status: Accepted
Date: 2026-09-09

## Context

`docs/product/MASTER-TASK-INVENTORY.md`'s Tier 1.2 and
`docs/VERIFICATION-DEBT.md`'s 2026-09-08 entry recorded "School-Laptop
hub daemon/service resilience (Windows service relaunch/reboot
persistence)" as blocked on real Windows hardware. That is only half
true: the hub daemon is not a separate process at all — it is
`src-tauri/src/hub_server.rs`'s HTTP listener, spawned in-process inside
the same `LIKHA-SIS.exe` every desktop user runs (see
`lib.rs::run`'s `setup` closure calling
`hub_server::maybe_spawn_listener`). ADR-0067 describes the hub as "one
supervised, always-on laptop" running this app — never a background
Windows Service. `src-tauri/tauri.conf.json`'s `bundle.targets: "all"`
confirms there is no Windows Service Control Manager (SCM) packaging
anywhere in this codebase today.

That leaves two genuinely different resilience gaps, previously
conflated as one "needs real hardware" item:

1. **The listener task itself failing while the app process stays
   alive** (a transient bind conflict, a brief interface hiccup, an
   unexpected `axum::serve` error) — this is entirely in-process Rust
   logic, fully codable and testable without any Windows hardware.
2. **The whole `LIKHA-SIS.exe` process crashing, being killed, or the
   machine rebooting** — this is inherently an OS-level scheduling
   concern. It genuinely cannot be exercised from a Linux sandbox and
   genuinely needs a human to witness it once on the real hub laptop.

## Decision

### In-process listener supervisor (codable, done, tested)

`hub_server::spawn` now retries forever on bind/serve failure using a new
`hub_server::supervisor::backoff_for_attempt` schedule: exponential,
starting at 1s, doubling per consecutive failure, capped at 60s, reset to
zero after any successful bind. Previously a bind or serve failure was
logged once and that address was permanently abandoned for the rest of
the process's life — a real regression risk ADR-0067's "always-on"
framing did not actually guarantee. `backoff_for_attempt` is a pure
function (no I/O, no sleeping) so its schedule is proven by `cargo test
--lib hub_server::` alone: never zero (no busy-loop), monotonically
non-decreasing, capped, and matches the exact doubling sequence.

### Whole-process recovery: a Scheduled Task, not a Windows Service rewrite

**Rejected: converting LIKHA-SIS into a Windows Service.** This would
require a second packaging target (services cannot show a normal WebView2
UI window the same way, and Tauri has no first-party Windows Service
mode), diverging the hub install from every teacher laptop's install for
a benefit only the hub machine needs. Not worth the packaging-architecture
change for one deployment role, especially given ADR-0067 already
describes the hub as a supervised laptop a human logs into, not a
headless server.

**Chosen: `ops/hub-daemon-recovery-setup.ps1`**, a script an ICT
coordinator runs once on the hub laptop to register a Windows Scheduled
Task that launches `LIKHA-SIS.exe` at logon and at system startup, with
the Task Scheduler's own `-RestartCount`/`-RestartInterval` recovery
settings so it relaunches automatically after an unexpected exit. This
reuses an OS mechanism every supported Windows version already ships,
adds no new dependency, and matches how this app is actually packaged
(a normal per-user desktop install) rather than inventing a service
architecture the rest of the product doesn't have.

This script is reviewed for correctness but has never executed against a
real Windows Task Scheduler — no `pwsh` is available in this project's
Linux development sandbox. `ops/hub-daemon-recovery-runbook.md` is the
executable, step-by-step manual verification a human must perform once on
the real hub laptop (logon-launch, crash-restart, listener-rebind, and
reboot checks) before this item can be marked witnessed rather than
merely scripted.

## Consequences

- The in-process listener is now measurably more resilient than before
  this change, verified by real automated tests — a genuine correctness
  improvement, not just documentation.
- The whole-process recovery story is now concrete and executable (a
  script + a runbook) instead of an inert "needs real hardware" note, but
  its actual effectiveness on Windows remains unverified until a human
  runs the runbook once. See `docs/VERIFICATION-DEBT.md` for the honest
  split.
- No new dependency: `axum`/`tokio` (already adopted, ADR-0067) provide
  everything the supervisor needs; the Scheduled Task mechanism is
  built into Windows.
