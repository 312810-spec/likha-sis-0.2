#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyChanges } from "../ci/classify-changes.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const present = (path) => existsSync(join(root, path));
const hasAll = (text, needles) => needles.every((needle) => text.includes(needle));

const state = json(".harness/state.json");
const contract = json(".harness/scorecard.json");
const pkg = json("package.json");
const quality = read(".github/workflows/quality.yml");
const security = read(".github/workflows/security.yml");
const health = read(".github/workflows/harness-health.yml");
const windowsJob = quality.split("  quality-windows:")[1] ?? "";
const failures = [];

function rule(id, ok, detail) {
  if (!ok) failures.push(`${id}: ${detail}`);
  console.log(`${ok ? "PASS" : "FAIL"} ${id}`);
}

const ui = classifyChanges(["src/ui/MyDayScreen.tsx"]);
const docs = classifyChanges(["docs/product/GOLDEN-JOURNEY.md"]);
const native = classifyChanges(["src-tauri/src/lib.rs"]);
const workflow = classifyChanges([".github/workflows/quality.yml"]);
const unknown = classifyChanges(["unclassified-boundary/example.bin"]);
const manual = classifyChanges([], { forceFull: true });

const evolvingState =
  state.state === "evolving" && state.assurance === "contract" && state.score === null;
const contractMode =
  contract.mode === "contract" && Array.isArray(contract.rules) && contract.rules.length >= 8;
const classifierPresent =
  present("scripts/ci/classify-changes.mjs") &&
  present("scripts/ci/classify-changes.node-test.mjs");
const uiFastPath = !ui.full && ui.javascript && ui.ui && !ui.native && !ui.windows;
const docsFastPath =
  !docs.full && docs.docsOnly && !docs.javascript && !docs.ui && !docs.native && !docs.windows;
const nativePath = !native.full && native.native && native.windows;
const conservativeFallback =
  workflow.full && workflow.native && workflow.windows && unknown.full && manual.full;
const classifierTestedInCi = hasAll(quality, [
  "node --test scripts/ci/classify-changes.node-test.mjs",
  "node scripts/ci/classify-changes.mjs",
]);
const normalPrSkipsHarnessAudit =
  hasAll(quality, [
    "if: needs.classify.outputs.harness == 'true'",
    "run: npm run harness:verify",
  ]) && !quality.includes("npm run harness:verify && npm run quality");
const productQualityPreserved =
  quality.includes("run: npm run quality") &&
  hasAll(pkg.scripts.quality ?? "", ["typecheck", "check:architecture", "check:deadcode", "test"]);
const uiVerificationPreserved = hasAll(quality, [
  "playwright install --with-deps chromium",
  "npm run quality:ui",
]);
const nativeVerificationPreserved = hasAll(quality, [
  "cargo fmt --check && cargo test && cargo clippy --all-targets -- -D warnings",
  "npm run tauri build -- --debug",
]);
const noDuplicateFullSuite =
  !quality.includes("npm run quality:full") &&
  !windowsJob.includes("run: npm run quality") &&
  !windowsJob.includes("cargo test") &&
  !windowsJob.includes("cargo clippy");
const fullCheckpointAvailable =
  typeof pkg.scripts["quality:full"] === "string" &&
  hasAll(pkg.scripts["quality:full"], ["cargo test", "cargo clippy"]);
const securityIndependent =
  hasAll(security, ["pull_request:", "gitleaks", "cargo-deny", "osv-scanner"]) &&
  !quality.includes("gitleaks") &&
  !quality.includes("osv-scanner");
const scheduledHarnessHealth =
  hasAll(health, ["schedule:", "workflow_dispatch:"]) && !health.includes("pull_request:");
const zeroBillingCi = !quality.includes("api-key") && !security.includes("api-key");

rule(
  "evolving-state",
  evolvingState,
  "the harness must remain evolving and must not restore a locked numeric certification",
);
rule(
  "contract-mode",
  contractMode,
  "the harness rule file must use contract mode with explicit invariants",
);
rule("classifier-present", classifierPresent, "affected-work routing and its tests are required");
rule(
  "ui-fast-path",
  uiFastPath,
  "UI-only work must run JS/UI checks without native or Windows verification",
);
rule(
  "docs-fast-path",
  docsFastPath,
  "ordinary documentation must stay on the documentation-only path",
);
rule("native-path", nativePath, "native changes must activate Rust and Windows verification");
rule(
  "conservative-fallback",
  conservativeFallback,
  "CI-control, unknown, and manual full checks must fail conservative",
);
rule(
  "classifier-tested-in-ci",
  classifierTestedInCi,
  "the PR workflow must test and execute the classifier",
);
rule(
  "normal-pr-skips-harness-audit",
  normalPrSkipsHarnessAudit,
  "harness verification must be isolated from the normal JS/TS product gate",
);
rule(
  "product-quality-preserved",
  productQualityPreserved,
  "affected JS/TS work must retain type, lint, architecture, dead-code, format, and unit checks",
);
rule(
  "ui-verification-preserved",
  uiVerificationPreserved,
  "affected UI work must retain browser and accessibility verification",
);
rule(
  "native-verification-preserved",
  nativeVerificationPreserved,
  "affected native work must retain Rust checks and the Windows-native build",
);
rule(
  "no-duplicate-full-suite",
  noDuplicateFullSuite,
  "the Windows job must not duplicate the JS/TS or Rust quality suite",
);
rule(
  "full-checkpoint-command-available",
  fullCheckpointAvailable,
  "a complete local/manual checkpoint command must remain available",
);
rule(
  "security-independent",
  securityIndependent,
  "security scanning must remain a separate fail-closed workflow",
);
rule(
  "scheduled-harness-health",
  scheduledHarnessHealth,
  "full harness health belongs on scheduled/manual checks, not every product PR",
);
rule(
  "zero-billing-ci",
  zeroBillingCi,
  "quality and security workflows must not depend on paid API credentials",
);

if (failures.length) {
  console.error("\nHarness contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nHarness contract satisfied. No numeric score or locked certification is used.");
