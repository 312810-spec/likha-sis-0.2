# ADR-0041: Minimal CI Foundation

Status: Accepted (2026-08-26)

## Context

Every prior LIKHA-SIS milestone verified `npm run quality:full` by hand,
on a single machine, in a single session. Nothing proves the same
contract holds on a clean checkout, on the actual Windows target, or
before a change reaches `main`. This ADR records the first automated
CI layer — a verification foundation only, not a release/deployment
pipeline.

Repository truth at decision time: branch
`claude/likha-sis-ux03-plan-plv80c`, HEAD `62e0948`, working tree
clean, no `.github/` directory existed. Repository is **public**
(`312810-spec/likha-sis-0.2`, confirmed via `gh repo view`).

## GitHub Actions billing research (current, not assumed)

Fetched directly from GitHub's own billing documentation
(`docs.github.com/en/billing/managing-billing-for-github-actions/about-billing-for-github-actions`),
2026-08-26:

- **"GitHub Actions usage is free for public repositories that use
  standard GitHub-hosted runners."** This repo is public, so standard
  `ubuntu-latest`/`windows-latest`/`macos-latest` runners cost nothing
  and are unmetered — no minute cap, no spending risk from ordinary
  workflow runs.
- Private repositories draw from a per-plan monthly minute quota and
  are billed beyond it (irrelevant here, but recorded for if the repo
  is ever made private).
- **Larger runners are never free**, public or private — this decision
  deliberately uses only standard 2-core runners, never opts into a
  "larger runner" label.
- `GITHUB_TOKEN` permissions default per repository/org/enterprise
  setting and can be restricted explicitly in the workflow file
  (`docs.github.com`, workflow-syntax reference, fetched same session).
  This workflow sets `permissions: contents: read` at the top level —
  no write scope anywhere.
- Fork PR safety: this workflow uses plain `pull_request` (never
  `pull_request_target`), so a fork PR's workflow run gets a
  read-only token with no repository secrets — standard, safe default.
- Windows-target build prerequisites confirmed via Tauri's own
  prerequisites documentation and community CI writeups: `windows-latest`
  ships MSVC Build Tools and WebView2 pre-installed (WebView2 has
  shipped with Windows 10 1803+ and all supported Windows Server
  images since); `x86_64-pc-windows-msvc` is the default host target on
  that runner, so no extra `rustup target add` step is needed.

**Zero-billing gate: PASSED.** No spending-limit configuration was
needed because the workflow structurally cannot generate a charge —
public repo, standard runners only, no artifact uploads.

## Decision

### 10 scenarios evaluated

1. No hosted CI, local-only verification — rejected: nothing catches a
   "works on this machine only" regression before it reaches `main`;
   the repeated `windows-future` saga this project already lived
   through is exactly the failure mode CI exists to catch early.
2. Windows-only single job — rejected: slower feedback than Ubuntu for
   the TS-heavy majority of changes; no reason to accept that latency
   once Windows minutes are proven free.
3. Ubuntu-only single job — rejected: gives zero native Windows
   compiler signal, the one thing this milestone's own directing
   brief calls out as most important (`#[cfg(windows)]` DPAPI code,
   the actual shipping target).
4. **Split Ubuntu + Windows jobs, both running the full canonical
   contract** — selected (see "Why Recommended Won").
5. Ubuntu on every PR, Windows only on selected events — rejected as
   unnecessary complexity: since both are free on this public repo,
   asymmetric triggers only add configuration surface for no billing
   benefit, and would leave Windows-target regressions undetected on
   ordinary pushes.
6. Windows manual `workflow_dispatch` only — rejected: silently opts
   out of Windows coverage unless a human remembers to click a button;
   defeats the point of continuous verification for the primary
   shipping target.
7. PR-only CI — rejected: this is a long-lived feature branch with no
   PR yet open against it; PR-only would give zero signal on ordinary
   pushes to this branch, and the brief explicitly requires "a safe
   way to run CI on it before touching main."
8. Push + PR CI — closer, but push-to-every-branch plus PR both firing
   for the same commit wastes a duplicate run; solved by adding
   `workflow_dispatch` and a `concurrency` cancel-in-progress group
   instead of dropping either trigger.
9. Reusable quality **workflow pattern** (shared composite/called
   workflow) — rejected for this milestone: one workflow, two jobs is
   already the entire surface; a reusable-workflow abstraction adds
   YAML indirection with no consumer other than this one workflow.
   Revisit only if a second workflow is ever added that needs the same
   steps.
10. `push` (all branches) + `pull_request` + `workflow_dispatch`, two
    jobs (Ubuntu, Windows), each running `npm run quality:full`
    verbatim — **selected**, see below.

### Recommended

Option 10: two jobs (`quality-ubuntu`, `quality-windows`), triggered on
`push` (any branch — this branch needs a way to prove itself before
touching `main`, and free minutes remove the reason to narrow this),
`pull_request` (for whenever a PR against `main` opens), and
`workflow_dispatch` (manual re-run on demand). Each job runs exactly
`npm run quality:full` — the same command a developer runs locally,
so "local checks != CI checks" cannot happen by construction. A
`concurrency` group keyed on workflow+ref with `cancel-in-progress:
true` cancels a superseded run when a newer commit lands on the same
branch/PR before the prior run finishes.

### Next Best

Option 5 (Ubuntu on every event, Windows only on `pull_request`/
`workflow_dispatch`) — would still catch Windows-target regressions
before merge, at slightly less Windows coverage on ordinary pushes.
Not chosen because the billing research removed the only reason to
accept that gap: Windows minutes are exactly as free as Ubuntu's on
this repo, so trading Windows signal for a billing benefit that
doesn't exist is a pure loss.

### Why Recommended Won

- **Zero-billing gate is satisfied unconditionally** (public repo,
  standard runners, no larger-runner opt-in), so there is no cost
  argument for narrowing triggers or dropping the Windows job — the
  usual private-repo CI trade-off (Windows minutes are expensive,
  spend them sparingly) simply does not apply here.
- **Meaningful Windows signal**, directly answering this milestone's
  own priority: `cargo test` and `cargo clippy --all-targets` on
  `windows-latest` compile and exercise the `#[cfg(windows)]` DPAPI
  module and the `[target.'cfg(windows)'.dependencies]` `windows`
  crate for real, on the actual shipping target — the exact class of
  defect ADR-0040's `windows-future` saga revealed only existed
  because no CI had ever compiled this crate on any platform.
- **One canonical quality contract, reused, not reimplemented**: both
  jobs call `npm run quality:full` verbatim — no CI-only duplicate
  logic to drift out of sync with what a developer runs locally.
- **Least-privilege, secret-free, fork-safe**: `permissions:
contents: read` only; no `GITHUB_TOKEN` write scope; no repository
  secrets referenced anywhere in the workflow; plain `pull_request`
  (not `_target`), so a malicious fork PR gets a read-only token and
  no secrets regardless.
- **Minimal supply chain**: only `actions/checkout@v5` and
  `actions/setup-node@v5` — both official, GitHubActions-maintained.
  No third-party Rust-toolchain action was added: `ubuntu-latest` and
  `windows-latest` GitHub-hosted runner images ship Rust via `rustup`
  with `rustfmt`/`clippy` already installed, confirmed directly in
  each job with an explicit `rustc --version && cargo --version &&
cargo fmt --version && cargo clippy --version` step before running the
  gate — if a runner image ever drops that default, this step fails
  loudly and specifically, rather than clippy silently not running.
- **No duplicate verification work**: `cargo test` (not `cargo
nextest`) is deliberately kept as the CI runner, matching
  `.claude/rules/testing.md`'s own stable-checkpoint-gate guidance —
  nextest is for the fast local inner loop, `cargo test` is the one
  command proven to cover doctests too. A separate `cargo build`/
  `cargo check --lib` step was deliberately **not** added: `cargo
test` already compiles the lib, bins, and every integration test
  binary, and `cargo clippy --all-targets` already type-checks every
  target including `main.rs` — an extra `cargo build` would recompile
  the same crate a third time for no new signal.
- **No installer/bundle build**: a full `tauri build` (WiX/NSIS
  installer) was evaluated and deferred — high runtime cost for a
  verification-foundation milestone whose job is proving the code
  compiles and passes tests/lints, not producing a distributable
  artifact. Belongs to a future, explicitly-scoped release/build
  workflow.

### Risks / Switch Condition

- If the repository is ever made **private**, this workflow's
  zero-billing reasoning no longer holds automatically — re-run the
  billing research and likely narrow triggers (e.g. PR-only, or drop
  the Windows job to `pull_request`-only) before the private quota is
  silently consumed.
- If `npm run quality:full`'s own runtime grows materially (e.g. a
  future full `tauri build` gets folded in), reconsider caching
  (`actions/cache` for `~/.cargo` and `node_modules`, or
  `actions/setup-node`'s built-in `cache: npm`, already used here) or
  splitting Windows onto a narrower trigger.
- If GitHub ever changes the public-repo free-minutes policy (the
  research above cites the policy as of 2026-08-26), re-verify before
  assuming continued zero cost.

## Consequences

- New file: `.github/workflows/quality.yml` — the only CI-related
  change this milestone. No other file was touched to make this work,
  per the "one canonical quality contract" goal.
- `npm run quality:full` is now exercised on every push/PR/manual
  dispatch on two operating systems, closing the "nothing proves this
  compiles anywhere but one developer's machine" gap this project
  carried since M0.
- Android CI is explicitly out of scope (deferred, recorded in
  `docs/VERIFICATION-DEBT.md` as a future extension, not a current
  gap).
- `main` was not touched, fast-forwarded, or merged as part of this
  milestone — CI was proven on the feature branch first, per explicit
  instruction. The next milestone (not started here) is Integration
  Review + `main` Fast-Forward Decision.
