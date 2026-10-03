#!/usr/bin/env node

// Usability checks only. No scored/frozen state or prescribed workflow shape.
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const failures = [];
const required = ["AGENTS.md", "HARNESS.md", "TASK.md", "docs/ACTIVE-PLAN.md"];

for (const path of required) {
  const fullPath = resolve(root, path);
  if (!existsSync(fullPath) || !readFileSync(fullPath, "utf8").trim()) {
    failures.push(`Missing or empty continuation document: ${path}`);
  }
}

let pkg;
try {
  pkg = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8"));
} catch (error) {
  failures.push(`Cannot read package scripts: ${error.message}`);
}

// Catch dangling local script references after a harness edit without installing
// dependencies or imposing a fixed list of tools or mandatory test commands.
for (const [name, command] of Object.entries(pkg?.scripts ?? {})) {
  for (const match of command.matchAll(/(?:^|\s)node\s+(scripts\/[^\s;&]+\.[cm]?js)/g)) {
    if (!existsSync(resolve(root, match[1]))) {
      failures.push(`Script ${name} points to missing file: ${match[1]}`);
    }
  }
}

if (failures.length) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log("Development documents and local script references are usable.");
}
