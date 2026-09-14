#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { classifyChanges } from "../ci/classify-changes.mjs";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const present = (path) => existsSync(join(root, path));

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

rule(
  "evolving-state",
  state.state === "evolving" && state.assurance === "contract" && state.score === null,
  "the harness must remain evolving and must not restore a locked numeric certification",
);
rule(
  "contract-mode",
  contract.mode === "contract" && Array.isArray(contract.rules) && contract.rules.length >= 8,
  "the harness rule file must use contract mode with explicit invariants",
);
rule(
  "classifier-present",
  present("scripts/ci/classify-changes.mjs") && present("scripts/ci/classify-changes.test.mjs"),
  "affected-work routing and its tests are required",
);
rule(
  "ui-fast-path",
  !ui.full && ui.javascript && ui.ui && !ui.native && !ui.windows,
  "UI-only work must run JS/UI checks without native or Windows verification",
);
rule(
  "docs-fast-path",
  !docs.full && docs.docsOnly && !docs.javascript && !docs.ui && !docs.native && !docs.windows,
  "ordinary documentation must stay on the documentation-only path",
);
rule(
  "native-path",
  !native.full && native.native && native.windows,
  "native changes must activate Rust and Windows verification",
);
rule(
  "conservative-fallback",
  workflow.full && workflow.native && workflow.windows && unknown.full && manual.full,
  "CI-control, unknown, and manual full checks must fail conservative",
);
rule(
  "classifier-tested-in-ci",
  quality.includes("node --test scripts/ci/classify-changes.test.mjs") &&
    quality.includes("node scripts/ci/classify-changes.mjs"),
  "the PR workflow must test and execute the classifier",
);
rule(
  "normal-pr-skips-harness-audit",
  quality.includes("if: needs.classify.outputs.harness == 'true'") &&
    quality.includes("run: npm run harness:verify") &&
    !quality.includes("npm run harness:verify && npm run quality"),
  "harness verification must be isolated from the normal JS/TS product gate",
);
rule(
  "product-quality-preserved",
  quality.includes("run: npm run quality") &&
    pkg.scripts.quality?.includes("typecheck") &&
    pkg.scripts.quality?.includes("check:architecture") &&
    pkg.scripts.quality?.includes("check:deadcode") &&
    pkg.scripts.quality?.includes("test"),
  "affected JS/TS work must retain type, lint, architecture, dead-code, format, and unit checks",
);
rule(
  "ui-verification-preserved",
  quality.includes("playwright install --with-deps chromium") && quality.includes("npm run quality:ui"),
  "affected UI work must retain browser and accessibility verification",
);
rule(
  "native-verification-preserved",
  quality.includes("cargo fmt --check && cargo test && cargo clippy --all-targets -- -D warnings") &&
    quality.includes("npm run tauri build -- --debug"),
  "affected native work must retain Rust checks and the Windows-native build",
);
rule(
  "no-duplicate-full-suite",
  !quality.includes("npm run quality:full") &&
    !windowsJob.includes("run: npm run quality") &&
    !windowsJob.includes("cargo test") &&
    !windowsJob.includes("cargo clippy"),
  "the Windows job must not duplicate the JS/TS or Rust quality suite",
);
rule(
  "full-checkpoint-command-available",
  typeof pkg.scripts["quality:full"] === "string" &&
    pkg.scripts["quality:full"].includes("cargo test") &&
    pkg.scripts["quality:full"].includes("cargo clippy"),
  "a complete local/manual checkpoint command must remain available",
);
rule(
  "security-independent",
  security.includes("pull_request:") &&
    security.includes("gitleaks") &&
    security.includes("cargo-deny") &&
    security.includes("osv-scanner") &&
    !quality.includes("gitleaks") &&
    !quality.includes("osv-scanner"),
  "security scanning must remain a separate fail-closed workflow",
);
rule(
  "scheduled-harness-health",
  health.includes("schedule:") && health.includes("workflow_dispatch:") && !health.includes("pull_request:"),
  "full harness health belongs on scheduled/manual checks, not every product PR",
);
rule(
  "zero-billing-ci",
  !quality.includes("api-key") && !security.includes("api-key"),
  "quality and security workflows must not depend on paid API credentials",
);

if (failures.length) {
  console.error("\nHarness contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("\nHarness contract satisfied. No numeric score or locked certification is used.");
