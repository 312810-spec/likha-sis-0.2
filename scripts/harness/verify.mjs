#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const read = (path) => readFileSync(join(root, path), "utf8");
const json = (path) => JSON.parse(read(path));
const present = (path) => existsSync(join(root, path));
const names = (path, suffix = "") =>
  readdirSync(join(root, path), { withFileTypes: true })
    .filter((entry) =>
      suffix ? entry.isFile() && entry.name.endsWith(suffix) : entry.isDirectory(),
    )
    .map((entry) => entry.name.replace(suffix, ""))
    .sort();
const same = (left, right) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());

const state = json(".harness/state.json");
const inventory = json(".harness/inventory.json");
const scorecard = json(".harness/scorecard.json");
const pkg = json("package.json");
const settings = json(".claude/settings.json");
const qualityWorkflow = read(".github/workflows/quality.yml");
const securityWorkflow = read(".github/workflows/security.yml");
const claude = read("CLAUDE.md");
const failures = [];
const proof = (condition, message) => {
  if (!condition) failures.push(message);
  return condition;
};

const expectedWeights = {
  security: 18,
  correctness: 15,
  productivity: 15,
  determinism: 10,
  "context-token": 10,
  maintainability: 8,
  "local-offline": 6,
  "supply-chain": 5,
  "zero-cost": 5,
  native: 3,
  "ui-verify": 3,
  "provider-independence": 2,
};
proof(
  same(
    scorecard.criteria.map(({ id, weight }) => `${id}:${weight}`),
    Object.entries(expectedWeights).map(([id, weight]) => `${id}:${weight}`),
  ),
  "scorecard weights drifted from ADR-0052",
);
proof(
  Object.values(expectedWeights).reduce((sum, value) => sum + value, 0) === 100,
  "rubric is not 100 points",
);

const currentAgents = names(".claude/agents", ".md");
const currentSkills = names(".claude/skills");
const currentHooks = names(".claude/hooks", ".cjs").map((name) => `${name}.cjs`);
const currentWorkflows = readdirSync(join(root, ".github/workflows"))
  .filter((name) => name.endsWith(".yml"))
  .sort();
const currentPlugins = Object.entries(settings.enabledPlugins)
  .filter(([, enabled]) => enabled)
  .map(([name]) => name)
  .sort();
proof(
  same(currentAgents, inventory.components.agents),
  "agent inventory is stale or a file is missing",
);
proof(
  same(currentSkills, inventory.components.skills),
  "skill inventory is stale or a directory is missing",
);
proof(
  same(currentHooks, inventory.components.hooks),
  "hook inventory is stale or a file is missing",
);
proof(
  same(currentPlugins, inventory.components.plugins),
  "plugin inventory is stale or configuration drifted",
);
proof(
  same(currentWorkflows, inventory.components.workflows),
  "workflow inventory is stale or a workflow is missing",
);
for (const agent of currentAgents)
  proof(statSync(join(root, ".claude/agents", `${agent}.md`)).size > 0, `agent ${agent} is empty`);
for (const skill of currentSkills)
  proof(
    present(`.claude/skills/${skill}/SKILL.md`),
    `skill ${skill} has no readable SKILL.md entry point`,
  );
for (const hook of currentHooks)
  proof(statSync(join(root, ".claude/hooks", hook)).size > 0, `hook ${hook} is empty`);
proof(
  !present(".mcp.json") && inventory.components.projectMcps.length === 0,
  "project MCP surface is undeclared",
);

const ageDays = Math.floor(
  (Date.now() - Date.parse(`${inventory.reviewedOn}T00:00:00Z`)) / 86_400_000,
);
proof(
  ageDays >= 0 && ageDays <= inventory.reviewIntervalDays,
  "harness metadata is older than the 14-day review interval",
);
proof(state.reviewedOn === inventory.reviewedOn, "state and inventory review dates disagree");
proof(
  Array.isArray(state.fatalOverrides) && state.fatalOverrides.length === 0,
  "a fatal rubric override is active",
);
const forbiddenRootArtifacts = ["B", "C", "tatus --short .claude"];
proof(
  forbiddenRootArtifacts.every((path) => !present(path)),
  "tracked root command-output artifacts remain",
);
proof(
  claude.split("\n").length <= 140,
  "always-loaded CLAUDE.md exceeds the 140-line context budget",
);
proof(statSync(join(root, "package-lock.json")).size > 0, "package lock is missing or empty");

const checks = {
  security:
    present(".claude/hooks/check-write-edit.cjs") &&
    present(".claude/hooks/check-bash.cjs") &&
    securityWorkflow.includes("gitleaks") &&
    securityWorkflow.includes("cargo deny") &&
    securityWorkflow.includes("osv-scanner"),
  correctness:
    pkg.scripts.quality?.includes("typecheck") &&
    pkg.scripts.quality?.includes("check:architecture") &&
    pkg.scripts["quality:full"]?.includes("cargo test") &&
    pkg.scripts["quality:full"]?.includes("cargo clippy"),
  productivity:
    currentAgents.length === 8 &&
    currentSkills.length >= 20 &&
    currentPlugins.includes("typescript-lsp@claude-plugins-official") &&
    currentPlugins.includes("rust-analyzer-lsp@claude-plugins-official"),
  determinism:
    pkg.scripts["harness:verify"] === "node scripts/harness/verify.mjs" &&
    pkg.scripts["quality:full"]?.includes("npm run harness:verify") &&
    qualityWorkflow.includes("npm run quality:full"),
  "context-token": claude.split("\n").length <= 140 && currentSkills.length >= 20,
  maintainability:
    same(currentAgents, inventory.components.agents) &&
    same(currentSkills, inventory.components.skills) &&
    same(currentWorkflows, inventory.components.workflows) &&
    present(".github/workflows/harness-health.yml") &&
    ageDays <= inventory.reviewIntervalDays &&
    forbiddenRootArtifacts.every((path) => !present(path)),
  "local-offline":
    !present(".mcp.json") &&
    present("docs/PROJECT-MEMORY.md") &&
    present("docs/CURRENT-HANDOFF.md"),
  "supply-chain":
    present("package-lock.json") &&
    present("src-tauri/deny.toml") &&
    present(".gitleaks.toml") &&
    securityWorkflow.includes("sha256sum"),
  "zero-cost":
    !present(".mcp.json") &&
    !securityWorkflow.includes("api-key") &&
    !qualityWorkflow.includes("api-key"),
  native:
    qualityWorkflow.includes("runs-on: windows-latest") &&
    qualityWorkflow.includes("npm run tauri build -- --debug"),
  "ui-verify":
    pkg.scripts["quality:ui"] === "node scripts/ui-smoke.mjs" &&
    present("scripts/ui-smoke.mjs") &&
    qualityWorkflow.includes("playwright install --with-deps chromium") &&
    qualityWorkflow.includes("npm run quality:ui"),
  "provider-independence": present("docs/harness/HARNESS-MEMORY.md") && !present(".mcp.json"),
};

let score = state.fatalOverrides.length === 0 ? 0 : -100;
for (const criterion of scorecard.criteria) {
  const passed = proof(
    Boolean(checks[criterion.id]),
    `${criterion.id}: required evidence is missing`,
  );
  if (passed) score += criterion.weight;
  console.log(
    `${passed ? "PASS" : "FAIL"} ${criterion.id} (${passed ? criterion.weight : 0}/${criterion.weight})`,
  );
}
const status =
  state.state === "locked" && state.certification === "certified" ? "certified" : "candidate";
console.log(`\nHarness score: ${score}/100 (${status}); metadata age: ${ageDays} day(s).`);
if (state.state === "locked")
  proof(
    state.score === 100 && state.certification === "certified",
    "locked state must be certified at 100/100",
  );
if (failures.length) {
  console.error("\nHarness verification failed:");
  for (const failure of [...new Set(failures)]) console.error(`- ${failure}`);
  process.exit(1);
}
if (score !== 100) process.exit(1);
