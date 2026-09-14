# ADR-0060: Affected-Work Quality Gates and Harness Contract

- Status: Accepted
- Date: 2026-09-15

## Context

LIKHA-SIS uses a native-first, local-first architecture with React/TypeScript and Tauri/Rust. The previous Quality Gate ran the same `quality:full` command on Ubuntu and Windows for every pull request, then also ran UI verification on Ubuntu and a Windows Tauri build on Windows.

The previous harness also used a locked 100-point certification model. That model was useful while establishing the first production harness, but it became counterproductive once the project deliberately moved to an evolving, Minimum Sufficient Harness. New CI improvements could fail because they no longer matched the old workflow shape even when they preserved or improved safety.

Golden Journey work exposed both problems: narrow UI changes inherited nearly the same CI duration as broad native changes, and an affected-work CI improvement was rejected because the legacy harness verifier still required the monolithic `quality:full` pattern.

The governing principle is now:

> Verify the affected boundary, fail conservative on uncertainty, and keep the harness evolving.

## Decision

Replace the old locked-score harness rules with a contract model and use a deterministic, dependency-free changed-path classifier in `scripts/ci/classify-changes.mjs`.

The previous locked certification, immutable weighted score requirement, and historical workflow-shape checks are superseded by this ADR. They are retained only as historical evidence in earlier ADRs and must not be used as current merge criteria.

The harness is no longer considered correct because it preserves a historical score or workflow shape. It is correct when its current invariants are directly proven from repository evidence.

### New harness rules

1. **Affected work, not habitual work.** A pull request runs checks for the boundaries it can affect.
2. **Conservative fallback.** CI-control changes, package-manifest changes, unknown paths, empty classifications, and manual full checks select the full path.
3. **Normal product PRs do not run the harness audit.** UI and ordinary JavaScript/TypeScript changes run product checks, not the harness self-certification routine.
4. **Harness changes verify the harness contract.** Changes to harness policy, CI control, or harness implementation run `harness:verify`.
5. **UI changes prove UI behavior.** UI-only changes run JavaScript/TypeScript quality plus browser/accessibility verification.
6. **Native changes prove native behavior.** Rust/Tauri/native changes run Rust formatting, tests, Clippy, and a Windows-native Tauri build.
7. **Security stays independent and fail-closed.** Secret, dependency, and vulnerability scanning remains a separate workflow and is not weakened by affected-work routing.
8. **Windows does not duplicate the full suite.** The Windows job verifies the Windows-native boundary instead of rerunning the complete JavaScript and Rust suite.
9. **Full verification remains available.** `quality:full` stays available for release, checkpoint, manual, and high-risk verification even though normal PRs do not invoke it automatically.
10. **Harness health is periodic, not a merge tax.** The full harness contract health check runs on a scheduled/manual workflow and when harness-affecting files change.
11. **No numeric lock state.** The harness remains `evolving`; a historical 100/100 score is not a release or merge prerequisite.
12. **No safety reduction by omission.** Expensive checks are skipped only when the classifier proves their boundary is unaffected.

## Routing contract

The classifier exposes these categories:

- documentation-only;
- harness-policy;
- JavaScript/TypeScript;
- UI/browser;
- native/Rust;
- Windows-native;
- full verification.

The default routes are:

- **UI-only:** JS/TS quality + UI/accessibility; no Rust or Windows build.
- **JS/TS non-UI:** JS/TS quality only.
- **Native:** Rust verification + Windows-native build, plus any affected JS/TS work.
- **Docs-only:** formatting only, except harness-policy documentation also runs the harness contract verifier.
- **Harness/CI-control:** harness contract + full affected verification.
- **Unknown/manual full:** conservative full verification.

## Harness contract verifier

`scripts/harness/verify.mjs` is now a pass/fail invariant checker rather than a 100-point scorer. It verifies, among other things, that:

- the harness state is evolving rather than locked;
- the affected-work classifier and its tests exist;
- UI-only, docs-only, native, unknown, and manual scenarios route correctly;
- normal product PRs do not invoke the harness audit;
- JS/TS, UI, Rust, and Windows checks remain present on their appropriate routes;
- the Windows job does not duplicate the full suite;
- Security Gate remains separate and fail-closed;
- scheduled/manual harness health remains available;
- `quality:full` remains available for complete checkpoints;
- CI does not depend on paid API credentials.

The verifier must evolve when the architecture evolves. It must not preserve obsolete implementation shapes merely because they were once certified.

## Why this approach

This keeps the existing toolchain and avoids another orchestration framework, paid service, or path-filter dependency. The routing logic is small, reviewable, unit-tested, and provider-neutral in concept. It reduces repeated work while retaining strong verification for affected boundaries.

It also changes the role of the harness from **gatekeeper of its own historical shape** to **guardian of current product-delivery invariants**.

## Alternatives considered

### Keep full CI and 100-point harness certification on every pull request

Rejected. It creates unnecessary latency and makes harness evolution harder by turning historical implementation details into permanent requirements.

### Remove harness verification entirely

Rejected. The harness still needs self-verification when its own rules or implementation change and at periodic health checkpoints.

### Add Nx or another task-graph framework

Deferred. A larger orchestration layer is not justified until native GitHub Actions routing proves insufficient.

### Use a third-party path-filter action

Not chosen. The repository can classify its own paths with a small Node script, avoiding another supply-chain dependency.

### Remove expensive checks entirely

Rejected. The goal is to skip irrelevant checks, not reduce verification coverage for affected boundaries.

## Safety behavior

The classifier prefers false positives over false negatives. Any unrecognized path activates full verification. CI-control and package-manifest changes also activate full verification so changes to the routing mechanism prove themselves through the conservative path.

Security scanning remains independent and fail-closed.

## Expected effect

For a normal Golden Journey UI-only pull request, the expected path becomes:

`classify -> JS/TS quality -> UI/accessibility -> done`

It should not run the harness audit, Rust verification, Linux Tauri dependency installation, or the Windows-native build.

Native, security-sensitive, dependency, CI-control, and release/checkpoint work continue to receive heavier verification.

## Follow-up

Measure median feedback duration over several UI-only and native pull requests. If the fast path does not materially reduce feedback time, profile the remaining expensive steps before adopting any new CI framework.
