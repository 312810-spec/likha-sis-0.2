# ADR-0058 — Gemini OAuth Blocked Upstream; Codex Delegation Reinstated

Status: Accepted

## Context

ADR-0057 (same day, 2026-09-01) replaced the Codex/ChatGPT delegation
PILOT with `gemini@gemini-plugin-cc`, authenticated via `oauth-personal`
(the user's Gemini Pro subscription login), after the user explicitly
accepted a disclosed account-risk (Google's Feb 2026 OAuth-automation
enforcement precedent).

When the user attempted to actually run `oauth-personal` login on their
own machine, it failed with:

```
Failed to sign in. Message: This client is no longer supported for Gemini
Code Assist for individuals. To continue using Gemini, please migrate to
the Antigravity suite of products: https://antigravity.google
```

## Research (verified, not assumed)

Fetched directly from GitHub (not a secondhand summary):

- **`google-gemini/gemini-cli` issue #28229** (open, `priority/p1`,
  `status/manual-triage`): a Google AI Pro subscriber reports the exact
  same error on `gemini-cli` v0.49.0. Browser-side OAuth completes
  ("Authentication successful"), but the CLI's token-exchange step fails
  — indicating Google deprecated the OAuth client individual
  subscribers' `oauth-personal` mode depends on, in favor of pushing
  users toward a separate "Antigravity" product. No maintainer fix or
  workaround is recorded in the thread; standard troubleshooting
  (reinstall, clear config, verify no API-key conflict) did not resolve
  it for the reporter.
- A related issue (#28717, referenced during research) reports that
  upgrading to `gemini-cli` 0.54.0+ does **not** fix this — newer
  versions silently fall back to API-key onboarding instead of
  completing real OAuth, which would silently and unexpectedly convert
  the user onto billed API usage without their explicit say-so if not
  caught.
- This confirms the failure is a genuine, current, upstream Google-side
  regression/deprecation — not a mistake in how ADR-0057's plan was
  executed, not something fixable by reinstalling or reconfiguring
  locally, and not specific to this user's account.

This is exactly the "retained component becoming insecure/obsolete/
incompatible" trigger `.claude/rules/autonomous-development.md`'s
harness-lock rule names as a legitimate reason to revisit a harness
decision same-day, without waiting for a scheduled review.

## Decision

Presented the user with three options (use `gemini-api-key` billed
mode; hold Gemini and fall back to Codex; do nothing and wait). **The
user chose: hold Gemini, fall back to Codex.**

- `codex-delegation` is **reinstated as the active delegation pattern**
  (its skill file and `docs/SOURCE-REGISTRY.md` entry are flipped back
  from "superseded" to active PILOT status). Nothing about Codex's own
  viability changed — ADR-0038's findings and blockers (no live
  credentialed run possible in this sandbox; hooks don't cover its
  external-process writes) still hold exactly as recorded.
- `gemini-delegation` moves to **ON HOLD**, not deleted and not
  re-superseded by Codex in the historical-record sense ADR-0057 used —
  the plugin (`gemini@gemini-plugin-cc`) stays installed, and the PILOT
  research/verification work from ADR-0057 remains valid and reusable
  the moment the upstream OAuth bug is fixed. Only the auth path is
  blocked.
- Not chosen: `gemini-api-key` (billed) mode — the user did not approve
  metered API billing when offered it as an option, so it stays
  unused, per this project's no-paid-infra-without-explicit-approval
  rule. Do not default to it silently if this recurs; ask again.

## Consequences

- `.claude/skills/codex-delegation/SKILL.md` — status flipped back to
  active PILOT, records the brief supersession-and-reinstatement in its
  own header for anyone reading it out of order.
- `.claude/skills/gemini-delegation/SKILL.md` — status flipped to ON
  HOLD, with the exact error, the GitHub issue reference, and the
  explicit resume conditions (upstream fix, or a fresh explicit
  API-key-billing approval) recorded so a future session doesn't have to
  redo this research.
- `docs/SOURCE-REGISTRY.md` — both entries' Status column updated to
  match (Codex: PILOT/active again; Gemini: ON HOLD, blocked upstream).
- `docs/PROJECT-MEMORY.md`, `docs/CURRENT-HANDOFF.md` — durable-facts
  and handoff entries updated to record this same-day reversal, so a
  future session reads the true current state rather than ADR-0057's
  now-superseded plan.
- `docs/VERIFICATION-DEBT.md` — the Gemini verification-debt entry
  updated: it is not merely "not yet run," it is currently blocked by an
  upstream bug outside this project's control, with the tracking issue
  linked for periodic re-check.
- No product code, schema, or existing verification/architecture script
  touched. Global (user-scope) Claude Code plugin state is unchanged
  from ADR-0057 — both plugins remain installed; only which one is the
  active delegation pattern changed.
