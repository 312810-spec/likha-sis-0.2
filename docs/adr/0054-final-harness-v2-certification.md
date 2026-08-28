# ADR-0054 — Final LIKHA Production Harness v2 certification

- Status: Candidate (owner-authorized update window open)
- Date: 2026-08-28
- Extends: ADR-0052

## Decision

The owner authorized a final harness update on 2026-08-28. The ADR-0052 weights and fatal overrides remain immutable. This update adds a small, repository-local control plane under `.harness/`, a deterministic certifier, a real Playwright UI/accessibility smoke gate, and a Windows-native Tauri build gate.

No new agent, MCP, standing credential, paid service, or inference dependency is introduced. The existing eight agents remain the smallest distinct roster found by ADR-0052. Skills remain task-triggered. The update also removes three tracked root command-output artifacts (`B`, `C`, and `tatus --short .claude`) and makes their absence a certification invariant.

## Certification rule

`npm run harness:verify` computes all 100 points from repository evidence. A missing component, stale inventory, metadata older than 14 days, altered weight, placeholder UI command, absent Windows build gate, or fatal override prevents certification. A repository score is a **candidate** until the unlocked commit passes both remote Quality and Security workflows. Only then may this ADR and `.harness/state.json` be changed to locked/certified.

The scheduled metadata-health workflow runs on the 1st and 15th (GitHub cron cannot express an exact every-14-days interval). It detects entries that are missing, empty, weak through missing entry points, drifted from inventory, or older than the authoritative 14-day limit. It deliberately does not refresh `reviewedOn`: only a real review may advance evidence freshness.

## Scope boundary

This certifies harness capability, not release readiness. Native NVDA/Narrator verification and all items in `docs/VERIFICATION-DEBT.md` remain open until separately evidenced.

## Evidence

Pending unlocked-candidate CI. Final workflow run identifiers and the locked commit will be recorded here before the harness is relocked.
