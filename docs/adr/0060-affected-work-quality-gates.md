# ADR-0060: Affected-Work Quality Gates

- Status: Accepted
- Date: 2026-09-15

## Context

LIKHA-SIS uses a native-first, local-first architecture with React/TypeScript and Tauri/Rust. The existing Quality Gate ran the same `quality:full` command on both Ubuntu and Windows for every pull request, then also ran UI verification on Ubuntu and a Windows Tauri build on Windows.

That design was safe but wasteful. Small UI-only pull requests still installed Linux Tauri dependencies, ran Rust formatting/tests/Clippy twice, installed Chromium, and built the Windows application even when no native boundary changed. Golden Journey work therefore inherited roughly the same CI duration as earlier broad changes.

The project harness now follows the Minimum Sufficient Harness principle: verify what the change can break, not everything the repository can do.

## Decision

Use a deterministic, dependency-free changed-path classifier in `scripts/ci/classify-changes.mjs` and route quality work by affected area.

The classifier exposes these categories:

- documentation-only;
- harness-policy;
- JavaScript/TypeScript;
- UI/browser;
- native/Rust;
- Windows-native;
- full verification.

The default routes are:

1. UI-only changes run JavaScript/TypeScript quality plus UI/accessibility verification. They do not run Rust or Windows-native verification.
2. Native changes run Rust verification and the Windows-native build.
3. Documentation-only changes run formatting, plus harness verification when harness policy documentation changes.
4. Security remains a separate fail-closed workflow and is not weakened or folded into quality routing.
5. CI-control changes, package-manifest changes, manual workflow dispatches, empty classifications, and unknown paths fail conservative by selecting full verification.
6. The Windows job no longer duplicates the full JavaScript and Rust quality suite. It is responsible for the Windows-native build when that boundary is affected.
7. The Ubuntu job remains the primary deterministic quality runner and performs only the gates activated by the classifier.

## Why this approach

This keeps the existing toolchain and avoids another orchestration framework or paid service. The routing logic is small, reviewable, unit-tested, and provider-neutral. It reduces repeated work while preserving full verification for high-risk and unfamiliar changes.

## Alternatives considered

### Keep full CI on every pull request

Rejected because it duplicates work and makes narrow Golden Journey slices cost roughly the same as native or release-level changes.

### Add Nx or another task-graph framework

Deferred. A larger orchestration layer is not justified until native GitHub Actions routing proves insufficient.

### Use a third-party path-filter action

Not chosen. The repository can classify its own paths with a small Node script, avoiding another supply-chain dependency.

### Remove expensive checks entirely

Rejected. The goal is to skip irrelevant checks, not reduce verification coverage for affected boundaries.

## Safety behavior

The classifier must prefer false positives over false negatives. Any unrecognized path activates full verification. Changes to CI-control files or package manifests also activate full verification so the routing mechanism proves itself under the most conservative path.

The Security Gate remains independent and fail-closed.

## Expected effect

For a normal Golden Journey UI-only pull request, the expected path becomes:

`classify -> JS/TS quality -> UI/accessibility -> done`

Rust verification, Linux Tauri dependency installation, and Windows-native build are skipped unless their boundaries are affected.

Native, security-sensitive, dependency, CI-control, and release/checkpoint work continue to receive heavier verification.

## Follow-up

Measure median feedback duration over several UI-only and native pull requests. If the fast path does not materially reduce feedback time, profile the remaining expensive steps before adopting any new CI framework.
