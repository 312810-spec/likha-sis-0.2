# ADR-0046: Security Tool CI Gate

Status: Accepted
Date: 2026-08-26

## Context

Wave 2D installed `gitleaks`/`cargo-deny`/`osv-scanner` and ran them
locally against this repository; Wave 2E re-confirmed them clean
against a changed dependency graph. Both waves deliberately left them
unwired from CI, recording a concrete follow-up plan (a separate
SHA-pinned job) rather than a repeated deferral. This milestone (Wave
2F) implements that plan — closing the last piece of Wave 2E's own
recorded verification debt. No SF1 import behavior, encryption
architecture, or any other product contract was touched.

## Threat model (selected scenarios actually driving design choices)

Full 20-scenario list evaluated internally; the ones that changed a
concrete decision:

- **Compromised third-party action tag** (#2) → every third-party
  action is pinned to an exact commit SHA, verified against GitHub's
  API for that repository/tag at write time (not invented), not a
  floating major-version tag.
- **Secrets exposed to a fork PR job** (#4) → the workflow uses
  `pull_request` (not `pull_request_target`), which GitHub
  automatically runs with a read-only, low-privilege `GITHUB_TOKEN` for
  fork PRs — the classic fork-PR-secret-exposure class this scenario
  describes requires `pull_request_target` specifically, which this
  workflow never uses. `gitleaks-action`'s optional PR-commenting
  feature (which would want `pull-requests: write`) is explicitly
  disabled (`GITLEAKS_ENABLE_COMMENTS: false`) so every job in this
  workflow stays at `contents: read` only, no exceptions.
- **Action silently succeeds after scanner crash** (#17) → this is the
  specific reason `osv-scanner` is NOT wired via
  `google/osv-scanner-action`'s reusable workflow: that workflow's own
  source (fetched and read directly from GitHub, not assumed) runs the
  scan step with `continue-on-error: true` ahead of the pass/fail
  reporter step — if the scanner itself crashes before writing its
  results file, the job could plausibly continue past that failure
  rather than failing closed. Verified officially-published static
  binary + `sha256sum -c` verification does not have this shape: the
  scan command itself is the step that must exit non-zero on any
  problem, with no `continue-on-error` anywhere in this workflow.
- **False negative from wrong scan path** (#8) / **lockfile not
  scanned** (#10) → every tool invocation uses this repository's own
  already-verified-correct config/paths (`.gitleaks.toml`,
  `src-tauri/deny.toml` via `manifest-path`, `osv-scanner.toml` with
  `-r .` recursive scan covering both `package-lock.json` and
  `src-tauri/Cargo.lock`). **Correction (found by independent
  architecture/reliability review)**: the `osv-scanner` CI invocation
  (`security.yml`'s online `scan source --config osv-scanner.toml -r
.`) is not actually the same command `scripts/check-security.mjs` runs
  locally (`--offline --download-offline-databases`) — a materially
  different command that had not itself run anywhere before this
  workflow was written, not "already proven" as an earlier draft of
  this ADR claimed. The CI form is arguably better (a live vulnerability
  database rather than a locally-cached snapshot), but the two are not
  identical, and this ADR should not have implied they were.
- **Cache poisoning / generated files masking secrets** (#12, #11) →
  this workflow itself authors no cache (no `actions/cache` step
  anywhere in `security.yml`); `gitleaks` scans git history directly
  from a full-depth checkout, not a build artifact. **Correction (found
  by independent security review, which read the pinned
  `gitleaks-action` commit's actual bundled source)**: `gitleaks-action`
  itself internally calls `cache.restoreCache()`/`cache.saveCache()`
  (keyed `gitleaks-cache-<version>-<platform>-<arch>`) to persist the
  `gitleaks` scanner binary it downloads across runs — an
  implementation detail of that action, outside this workflow's
  authorship or control, not something this ADR's "no cache" framing
  should have implied didn't exist anywhere in the dependency chain.
- **Workflow permission escalation** (#19) → top-level workflow
  permission is `contents: read`; every job explicitly restates
  `contents: read` at the job level too (defense in depth against a
  future edit accidentally adding a job without its own explicit
  block); no job requests `security-events: write`, `pull-requests:
write`, or any elevated scope.
- **Windows-only dependency missed / Rust workspace member omitted /
  npm lockfile omitted** (#14, #15, #16) — this repository has exactly
  one Rust workspace member (`src-tauri/`, passed explicitly via
  `manifest-path`) and one npm lockfile (root `package-lock.json`,
  covered by `osv-scanner`'s recursive `-r .` scan) — verified by
  reading `src-tauri/Cargo.toml`'s absence of a `[workspace]` member
  list beyond itself and `package.json`'s single lockfile, not assumed.
- **Free-tier/external-service billing surprise** (#20) → `gitleaks`
  requires no license for a personal GitHub account (verified: this
  repository's owner, `312810-spec`, is a `User`-type account via `gh
api users/312810-spec`, not an `Organization` — `gitleaks-action`'s own
  docs only require a paid `GITLEAKS_LICENSE` for organizations).
  `cargo-deny-action` and the direct `osv-scanner` binary download
  require no account/API key at all.

Remaining scenarios (malicious dependency introduced, security tool
unavailable, advisory-database outage, false positive blocking
development, secret-detection gap in git history, git-history scan
depth) are each covered by the tools' own existing, already-verified
design (full `fetch-depth: 0` checkout for gitleaks; each tool's own
exit-code semantics genuinely fails the job; a false positive is
addressed the same way this repository already handles one — an
explicit, documented ignore entry in the tool's own config file,
reviewed in a PR, never a silent bypass) rather than a new mechanism
built for this milestone.

## Decision: separate workflow, not a step folded into `quality:full`

`.github/workflows/security.yml` is a new, independent workflow file —
not a step added to `.github/workflows/quality.yml`. Three separate
jobs (`gitleaks`, `cargo-deny`, `osv-scanner`), each `runs-on:
ubuntu-latest` with its own `contents: read`-only permission block.
Job-per-tool, not step-per-tool inside one job: a crash or timeout in
one tool's job can never prevent the other two from running and
reporting independently, and a genuine failure in any one job fails
that job specifically (visible per-tool in the Checks UI) rather than
being buried inside a large `npm run quality:full` log. Same
`push`/`pull_request`/`workflow_dispatch` triggers as `quality.yml`,
for consistency; no `schedule` trigger added (out of this milestone's
narrow scope — revisit only if a real value case for scheduled-only
scanning emerges). Windows is deliberately not duplicated for this
gate: `ubuntu-latest` is sufficient for all three tools (none of them
have Windows-specific behavior this repository's product code would
need verified — `gitleaks` scans git objects, `cargo-deny` evaluates
`Cargo.lock` metadata, `osv-scanner` reads lockfiles — none execute
LIKHA's own Windows-only Rust code path).

## Decision: `gitleaks`/`cargo-deny` via official marketplace actions; `osv-scanner` via a verified direct binary, not `google/osv-scanner-action`

`gitleaks/gitleaks-action` and `EmbarkStudios/cargo-deny-action` are
both simple, single-step actions with no reusable-workflow permission
inflation — used directly, pinned to their release commit SHA
(verified via `gh api repos/<owner>/<repo>/tags` and cross-confirmed
via `gh api repos/<owner>/<repo>/commits/<sha>` resolving to the same
SHA, not invented):

- `gitleaks/gitleaks-action@e0c47f4f8be36e29cdc102c57e68cb5cbf0e8d1e`
  (tag `v3.0.0`). v3 only changes the Actions runtime (Node 20 → Node
  24, ahead of GitHub's documented Sept 16, 2026 removal of Node 20
  from hosted runners) — confirmed by reading the action's own README
  migration section directly; no input/behavior change from v2.
- `EmbarkStudios/cargo-deny-action@3c6349835b2b7b196a839186cb8b78e02f7b5f25`
  (tag `v2.1.1`), with `manifest-path: src-tauri/Cargo.toml` (this
  repository's Rust manifest is not at the repo root).

`osv-scanner` is handled differently, by deliberate choice, not
default convenience: `google/osv-scanner-action`'s own `action.yml`
(fetched and read directly) states "Not intended to be used directly,
see the reusable workflow instead," and that reusable workflow
(`osv-scanner-reusable.yml`, also fetched and read directly) requires
`security-events: write` for SARIF upload to Code Scanning, plus a
`continue-on-error: true` scan step ahead of its pass/fail reporter —
both add permission surface and the scanner-crash-masking risk
threat-modeled above. Instead: `osv-scanner`'s own official static
Linux binary (from `google/osv-scanner`'s own releases, not the
`-action` wrapper repository), pinned to the same `v2.5.1` release tag
already used by the action wrapper, downloaded and verified against
Google's own published `osv-scanner_SHA256SUMS` file before execution
(`f9f25499a2c8cc367b3af45df2ea7eeca7fbccceab9c35079968f4b3652194be`,
confirmed both via the published checksums file and by an independent
local `sha256sum -c` of the actual downloaded binary in this session).
This is a real supply-chain check, not merely a version pin, and it
keeps this job at `contents: read` only — no SARIF upload, no
Code-Scanning integration attempted this milestone (a reasonable
future addition once the security posture around `security-events:
write` for this repository has been separately considered, not bundled
into this narrow closure wave).

**Disclosed asymmetry (found by independent security review, which
read the pinned `gitleaks-action` commit's actual bundled source)**:
this explicit checksum verification is not uniform across all three
tools. `gitleaks-action` itself downloads the actual `gitleaks` scanner
binary internally via `tc.downloadTool()`, with no checksum or
signature verification anywhere in that code path — unlike
`osv-scanner`'s explicit `sha256sum -c` above. That gap is inside
`gitleaks-action`'s own implementation, not something this workflow
can add without re-implementing the action's install step; it is
recorded here so this ADR doesn't imply a uniform supply-chain
guarantee it doesn't actually have.

**Disclosed limitation — this is currently an advisory gate, not an
enforced one**: no branch protection or ruleset exists on `main` in
this repository requiring `security.yml`'s three jobs to pass before a
merge (`gh api repos/.../branches/main/protection` → `404 Branch not
protected`; `gh api repos/.../rulesets` → `[]`, confirmed by
independent security review). This workflow reports pass/fail on every
push/PR, but nothing currently blocks a merge on a red result.
Configuring required status checks is a reasonable follow-up, out of
scope for this narrow closure wave.

## Verification

- `.github/workflows/security.yml` parsed successfully as valid YAML
  (Python `yaml.safe_load`); confirmed all three jobs carry
  `permissions: {contents: read}` explicitly.
- The exact `osv-scanner_linux_amd64` v2.5.1 binary was downloaded and
  checksum-verified in this session (`sha256sum -c`: `OK`) before being
  embedded in the workflow, not assumed correct.
- All three tools re-run locally, immediately before wiring CI, via the
  project's own canonical `scripts/check-security.mjs` runner (not a
  hand-rolled invocation): `gitleaks` — 60 commits scanned, no leaks;
  `cargo-deny` — advisories/bans/licenses/sources all ok; `osv-scanner`
  — no issues found (18 pre-documented/accepted advisories correctly
  filtered per `osv-scanner.toml`). Summary line: `3 ok, 0 failed, 0
missing`.
- Full regression suite re-run before and unaffected by this milestone:
  `cargo nextest run` 501/501, plain `cargo test` (incl. doctests)
  green, `cargo fmt --check`/`cargo clippy --all-targets -D warnings`
  clean, `npm run quality` 438/438 with `tsc`/`eslint`/`prettier`/
  `check:architecture` all clean, `npm run build` (production) PASS —
  see `docs/ACTIVE-PLAN.md` for the exact Wave 2F verification record.
- `actionlint` was not available in this environment and was not
  installed for a one-time check — this gap is now recorded explicitly
  in `docs/VERIFICATION-DEBT.md`'s Wave 2F entry (an earlier draft of
  this ADR cited that file for the gap before the entry actually
  existed there — independent review caught the dangling citation).
  YAML validity and action-reference correctness were instead verified
  by direct GitHub API cross-checks of every pinned SHA, and the
  workflow's actual behavior will be confirmed by its own real CI run
  once pushed.

## Independent review

Both dispatched fresh (not the same context that wrote this workflow),
both hit this project's recurring reviewer-notification-channel stall
bug on the first reply and recovered in full on one retry — see
`docs/VERIFICATION-DEBT.md`'s Wave 2F security-CI entry for the full
outcome summary. Security review: no blocking findings across all 8
requested angles, each independently re-verified against live evidence
rather than accepted on the workflow's own claims; three should-fix doc
corrections, applied above (the cache-claim correction, the
checksum-verification-asymmetry disclosure, and the advisory-only-gate
disclosure both earlier in this document). Architecture/reliability
review: **one blocking finding, fixed** —
`concurrency: cancel-in-progress: true` combined with
`gitleaks-action`'s commit-delta-only automatic scan path could let a
superseded push's own commits go permanently unscanned; the
`concurrency` block was removed from `security.yml` entirely. Three
further non-blocking findings, all fixed (a dangling
`docs/VERIFICATION-DEBT.md` citation, an "already proven locally"
overclaim about the `osv-scanner` CI invocation, a stale file path in
an older `docs/VERIFICATION-DEBT.md` entry) and one minor legibility
nit fixed (`curl -fsSL` instead of `-sL` on the `osv-scanner` binary
download, so a failed download reports clearly rather than surfacing as
a confusing checksum mismatch).

## Non-goals

No SARIF/Code-Scanning integration this milestone (would need
`security-events: write`, a deliberately separate decision). No
scheduled/cron scanning. No change to `quality.yml`. No change to any
SF1 import contract, encryption architecture, or other product
behavior — this ADR is infrastructure-only. No branch-protection/
required-status-check configuration this milestone — `security.yml` is
currently advisory only (disclosed above), enforcing it is a reasonable
separate follow-up.
