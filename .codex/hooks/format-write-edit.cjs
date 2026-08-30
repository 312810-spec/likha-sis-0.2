#!/usr/bin/env node
// PostToolUse hook for Write|Edit. Cheap, targeted formatting only — runs
// prettier on the single file that changed, never the full quality suite.

const { spawnSync } = require("node:child_process");
const path = require("node:path");

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }

  const filePath =
    (payload.tool_response || {}).filePath ?? (payload.tool_input || {}).file_path ?? "";
  if (!filePath) process.exit(0);

  // Defense against Windows' `shell: true` argv-joining behavior below:
  // reject anything that isn't a plain relative path inside the repo
  // before it ever reaches a shell, even though filePath currently only
  // originates from this same trusted session's own tool_input.
  const repoRoot = process.cwd();
  const resolved = path.resolve(repoRoot, filePath);
  const isInsideRepo = resolved === repoRoot || resolved.startsWith(repoRoot + path.sep);
  const isSafeChars = /^[\w./\\-]+$/.test(filePath);
  if (!isInsideRepo || !isSafeChars) process.exit(0);

  const formattable = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"];
  if (!formattable.includes(path.extname(filePath))) process.exit(0);

  try {
    // shell: true is required on Windows to resolve the npx.cmd shim;
    // the filePath validation above closes the argv-injection surface
    // that shell:true would otherwise open on an untrusted path.
    spawnSync("npx", ["--no-install", "prettier", "--write", filePath], {
      stdio: "ignore",
      shell: true,
      timeout: 15000,
    });
  } catch {
    // best-effort only; never block on a formatting failure
  }
  process.exit(0);
});
