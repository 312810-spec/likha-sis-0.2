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
    (payload.tool_response || {}).filePath ??
    (payload.tool_input || {}).file_path ??
    "";
  if (!filePath) process.exit(0);

  const formattable = [".ts", ".tsx", ".js", ".jsx", ".json", ".css", ".md"];
  if (!formattable.includes(path.extname(filePath))) process.exit(0);

  try {
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
