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

The first hand-formatting attempt was insufficient: exact head `55b89bea25a5a1f01502deeac0bcb14de2d8ffc4` still failed Quality #850 while Security #1025 passed. Later Quality #856 progressed past Prettier and architecture, proving the formatter correction worked; the gate then exposed a separate dead-code issue.

**Reuse condition**

For composite JS/TS Quality failures, inspect raw job logs before changing code. If Prettier names files, format all named files with the repository formatter and run `format:check` before push when dependencies are available. Do not infer success from line length or formatter configuration alone, and do not debug later quality stages until Prettier passes and those stages actually execute.

## 2026-09-18 — PR #98 staged composition export rejected by dead-code gate

**Issue**

After Prettier and architecture passed, the JS/TS Quality gate reached `knip` and reported the newly staged `adviserMonthlyAttendanceService` composition export as unused. The visible My Advisory panel that will consume the service is intentionally the next bounded slice, so exporting a composed instance before a production consumer exists violates the repository's dead-code contract.

**Workaround**

Keep the tested application service, repository port, Tauri adapter, and authorization classification in this seam, but do not pre-compose/export an unused runtime instance. Remove the monthly service/adapter imports and unused composition export. The next My Advisory UI slice must compose the service when it introduces the first real runtime consumer. Do not add a `knip` exemption, dummy reference, or CI suppression.

**Verification**

The structural correction was applied after Quality #857 remained red on exact head `2b5e556b6d99d8f95c81afadd9480c88f2e3dfb5` while Security #1040 passed. Quality #859 on head `07fbba57e72cac42e55d220012ee4c1bb531b26b` did not reach `knip`: typecheck and ESLint passed, then Prettier stopped on `src/composition.ts`. Inspection of the PR patch exposed the concrete formatting defect introduced by the correction: the file had no final newline. A newline-only correction was committed on the same canonical branch. Fresh exact-head Quality and Security remain required before the dead-code workaround is considered verified.

**Reuse condition**

Do not stage exported composition instances ahead of their first production consumer. Land the seam without unused runtime composition, then compose it in the bounded UI slice that actually consumes it. Preserve the dead-code gate instead of suppressing it. After direct file rewrites, also verify the final newline/formatter contract before push; a semantically correct edit can still stop the composite quality gate before dead-code verification.

## 2026-09-18 — PR #98 validation escaped the promised async service boundary

**Issue**

Quality Gate #862 reached Vitest after typecheck, ESLint, Prettier, architecture, and dead-code all passed. One new test failed: `rejects an invalid month before native invocation`. The service methods were typed to return `Promise`, but argument validation ran while constructing the repository call, before a Promise was returned. `ValidationError: Month must be from 1 to 12.` therefore escaped synchronously instead of becoming the rejected Promise expected by the async application boundary. The repository was not invoked, so the fail-before-native behavior itself was correct.

**Workaround**

Make `summary` and `exportSf2` explicit `async` methods and await their repository calls. This keeps local validation before IPC while making validation failures obey the service's Promise contract. Do not weaken the validation, change the trusted Rust authorization boundary, or rewrite the test to accept an inconsistent synchronous throw.

**Verification**

The correction was committed to the same canonical PR branch. Fresh exact-head Quality and independent Security are required before this workaround is considered verified.

**Reuse condition**

When an application-service method advertises a Promise contract but performs synchronous validation before returning a repository Promise, keep validation inside an explicit async method so callers consistently receive rejection semantics. Tests should continue to prove invalid input never reaches the repository/native boundary.

## Template

### YYYY-MM-DD — Short issue name

**Issue** — concrete symptom and evidence.

**Workaround** — smallest safe action taken.

**Verification** — exact evidence that the workaround worked or did not work.

**Reuse condition** — when a future worker should reuse this workaround, plus any limits.
