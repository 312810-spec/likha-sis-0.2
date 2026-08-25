#!/usr/bin/env node
// Proves the built production bundle (dist/) contains no trace of the
// development-only visual fixture (src/dev-preview/) -- run this AFTER
// `npm run build`, not instead of it. See
// docs/adr/0032-teacher-workspace-polish.md for the full safety
// contract this complements (src/dev-preview/isolation.test.ts covers
// the fast, source-text-level half of the same guarantee and runs in
// every `npm test`).
//
// Usage: npm run build && node scripts/check-dev-preview-isolation.mjs

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";
import { pathToFileURL } from "node:url";

const REPO_ROOT = process.cwd();
const DIST_DIR = join(REPO_ROOT, "dist");
const FORBIDDEN_PATTERN = /dev-preview|DevPreviewApp|FixtureAuthRepository/;
const SCANNABLE_EXTENSIONS = [".html", ".js", ".css", ".map"];

function walk(dir) {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      files.push(...walk(full));
    } else {
      files.push(full);
    }
  }
  return files;
}

export function run() {
  if (!existsSync(DIST_DIR)) {
    return {
      ok: false,
      reason: `${DIST_DIR} does not exist -- run "npm run build" first, then re-run this check.`,
    };
  }

  const files = walk(DIST_DIR);
  const distFileNames = files.map((f) => f.replace(/\\/g, "/"));

  // 1. The fixture's own HTML entry must not have been emitted at all.
  const emittedFixtureEntry = distFileNames.find((f) => f.endsWith("dev-preview.html"));
  if (emittedFixtureEntry) {
    return { ok: false, reason: `dev-preview.html was emitted into dist/: ${emittedFixtureEntry}` };
  }

  // 2. No shipped file's *content* references the fixture by name.
  for (const file of files) {
    if (!SCANNABLE_EXTENSIONS.includes(extname(file))) continue;
    const content = readFileSync(file, "utf8");
    if (FORBIDDEN_PATTERN.test(content)) {
      return {
        ok: false,
        reason: `${file.replace(/\\/g, "/")} contains a reference to the dev-preview fixture.`,
      };
    }
  }

  return { ok: true, filesScanned: distFileNames.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = run();
  if (!result.ok) {
    console.error(`dev-preview isolation check FAILED: ${result.reason}`);
    process.exit(1);
  }
  console.log(
    `dev-preview isolation check passed: ${result.filesScanned} file(s) in dist/ scanned, no trace of the fixture found.`,
  );
  process.exit(0);
}
