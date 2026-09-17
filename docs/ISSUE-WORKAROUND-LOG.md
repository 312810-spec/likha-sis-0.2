# Issue → Workaround → Record Log

Purpose: durable troubleshooting memory for LIKHA-SIS 0.2. Before repeating investigation of a known failure, check this log and reuse the verified workaround when its preconditions still match.

Rules:

- Diagnose from concrete evidence before changing code or CI.
- Prefer the smallest reversible workaround that preserves privacy, security, correctness, branch protections, and required gates.
- Verify the workaround on the new exact head.
- Record the issue, evidence, workaround, verification, and reuse condition here.
- A workaround never converts blocked hardware-only evidence into software proof and never weakens required gates.

## 2026-09-17 — PR #96 native Quality stopped at rustfmt

**Issue**

Quality Gate #841 failed on Ubuntu at `Run native Rust quality gate` for PR #96 head `524bca2c364c2f7214064202d489aa5c5c4d983f`. The Windows native Tauri build and independent Security Gate succeeded. Inspection of the native gate evidence showed `cargo fmt --check` reported formatting-only diffs in `src-tauri/src/commands/adviser_monthly_attendance.rs`; compilation/tests had not yet run because formatting stopped the gate first.

**Workaround**

Apply the exact rustfmt-prescribed formatting only. Do not change authorization, export behavior, schema, tests, CI configuration, or branch protections merely to make the gate green. Push the formatter-only correction to the same canonical PR branch and require fresh exact-head gates.

**Verification**

The formatter-only correction produced head `f38eb7bbc2b92e0bd5dcbdbc1cc06ee74eada910`. Quality Gate #842 and independent Security Gate #1000 both completed successfully on that exact head. PR #96 remained non-draft, mergeable, and without review blockers, then merged using `expected_head_sha` as main commit `69474fc341004dcfc6d791114f481daf0539b0fa`.

**Reuse condition**

When a future native Quality failure stops specifically at `cargo fmt --check` and the evidence is formatting-only, apply the exact formatter output first, then rerun the complete required exact-head gates. Do not spend time debugging compilation/runtime behavior until formatting passes and later stages actually run.

## 2026-09-17 — Connector code search unavailable for Adviser Room discovery

**Issue**

Repository code search did not return usable results while locating the live Adviser Room screen and its application/infrastructure seams. Guessing a feature-directory path produced a 404.

**Workaround**

Traverse the repository through GitHub Contents (`src` → `src/ui`, `src/application`, `src/infrastructure/tauri`) and fetch exact discovered paths instead of retrying guessed paths or treating search failure as missing code.

**Verification**

The traversal located `src/ui/AdviserViewScreen.tsx`, the existing daily adviser service/adapter, and confirmed there was no TypeScript monthly adviser service/adapter before the current slice. It also exposed the session-expiry exemption list that monthly adviser commands must join because their trusted Rust boundary can return action-specific `Unauthorized` for a still-valid session.

**Reuse condition**

When connector code search is unavailable or inconclusive, use directory/contents traversal and exact returned paths. Do not repeatedly guess file locations.

## 2026-09-17 — PR #98 JavaScript/TypeScript Quality stopped at Prettier

**Issue**

Quality Gate #846 and then #850 failed at `Run JavaScript and TypeScript quality gate` for PR #98 while independent Security succeeded. Raw Quality #850 evidence narrowed the composite failure: typecheck passed and ESLint completed with only the existing warning; Prettier failed on `src/application/adviser-monthly-attendance-service.ts`, `src/composition.ts`, `src/infrastructure/tauri/adviser-monthly-attendance-repository.ts`, and `src/infrastructure/tauri/invoke.ts`. Later architecture, dead-code, Vitest, UI, and native stages did not run because formatting stopped the gate.

**Workaround**

Treat the repository's actual Prettier output as authoritative instead of approximating `printWidth: 100` by hand. Format every changed JS/TS file named by `format:check`, including composition and shared invoke files, without changing authorization, data flow, CI, or protections. If the local runtime cannot obtain repository dependencies because outbound DNS/network access is unavailable, use the CI file list plus Prettier's deterministic layout rules and require fresh exact-head CI; do not claim local formatter verification.

**Verification**

The first hand-formatting attempt was insufficient: exact head `55b89bea25a5a1f01502deeac0bcb14de2d8ffc4` still failed Quality #850 while Security #1025 passed. The second correction covers all four files explicitly named by Prettier and is pending fresh exact-head Quality and Security. It is not verified until both required gates succeed on the same unchanged head.

**Reuse condition**

For composite JS/TS Quality failures, inspect raw job logs before changing code. If Prettier names files, format all named files with the repository formatter and run `format:check` before push when dependencies are available. Do not infer success from line length or formatter configuration alone, and do not debug later quality stages until Prettier passes and those stages actually execute.

## Template

### YYYY-MM-DD — Short issue name

**Issue** — concrete symptom and evidence.

**Workaround** — smallest safe action taken.

**Verification** — exact evidence that the workaround worked or did not work.

**Reuse condition** — when a future worker should reuse this workaround, plus any limits.
