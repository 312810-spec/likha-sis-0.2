#!/usr/bin/env node
// Deterministic architecture-boundary check (.claude/rules/architecture.md).
// UI/domain/application code must not import concrete infrastructure or
// a provider SDK directly — only src/composition.ts may. Run via
// `npm run check:architecture` (part of `npm run quality`).

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";
import { pathToFileURL } from "node:url";

// process.cwd() rather than a path derived from import.meta.url: this
// module gets imported through non-file:// URLs when run under Vitest's
// transform pipeline, where a URL-based "../" join throws. npm scripts
// and vitest both run from the repository root, so cwd is reliable here.
const REPO_ROOT = process.cwd();

// Directories whose files may not import infrastructure/provider code
// directly. src/composition.ts itself lives outside these and is the
// designated exception.
const RESTRICTED_DIRS = ["src/ui", "src/domain", "src/application"];

const IMPORT_RE = /^\s*import\s[^;]*?\bfrom\s+["']([^"']+)["']/gm;

/**
 * @param {string} filePath path relative to repo root, forward slashes
 * @param {string} content file contents
 * @returns {string[]} violation descriptions, empty if none
 */
export function findViolations(filePath, content) {
  const violations = [];
  let match;
  IMPORT_RE.lastIndex = 0;
  while ((match = IMPORT_RE.exec(content))) {
    const spec = match[1];
    const isTauriSdk = spec.startsWith("@tauri-apps/");
    const isInfrastructure =
      spec.includes("/infrastructure/") || spec.startsWith("infrastructure/");
    if (isTauriSdk || isInfrastructure) {
      violations.push(
        `${filePath}: imports "${spec}" — UI/domain/application code must not import Tauri or infrastructure directly (only src/composition.ts may). See .claude/rules/architecture.md.`,
      );
    }
  }
  return violations;
}

function walk(dir) {
  /** @type {string[]} */
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walk(full));
    } else if ([".ts", ".tsx"].includes(extname(full))) {
      files.push(full);
    }
  }
  return files;
}

export function run() {
  const allViolations = [];
  for (const dir of RESTRICTED_DIRS) {
    const abs = join(REPO_ROOT, dir);
    let files;
    try {
      files = walk(abs);
    } catch {
      continue; // directory may not exist yet
    }
    for (const file of files) {
      const rel = relative(REPO_ROOT, file).replace(/\\/g, "/");
      const content = readFileSync(file, "utf8");
      allViolations.push(...findViolations(rel, content));
    }
  }
  return allViolations;
}

// Only run as CLI when executed directly, not when imported by the test.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const violations = run();
  if (violations.length > 0) {
    console.error("Architecture boundary violations found:\n");
    for (const v of violations) console.error(`  - ${v}`);
    console.error(`\n${violations.length} violation(s).`);
    process.exit(1);
  }
  console.log("Architecture check passed: no restricted imports found.");
  process.exit(0);
}
