#!/usr/bin/env node
// Runs the security tool tier (Gitleaks, cargo-deny, OSV-Scanner) with an
// explicit MISSING/FAIL/OK result per tool, so "not installed" can never
// be silently indistinguishable from "installed, ran, found nothing" —
// a plain `&&` chain of these three commands can't make that distinction
// (all three report exit code 1 for both cases). See
// .planning/harness-upgrade/progress.md Phase 9 reliability finding.

import { spawnSync } from "node:child_process";

function have(cmd) {
  const finder = process.platform === "win32" ? "where" : "which";
  const probe = spawnSync(finder, [cmd], { stdio: "ignore", shell: true });
  return probe.status === 0;
}

const checks = [
  {
    name: "gitleaks",
    probeCmd: "gitleaks",
    run: () =>
      spawnSync(
        "gitleaks",
        ["detect", "--source", ".", "--config", ".gitleaks.toml", "--verbose", "--redact"],
        { stdio: "inherit", shell: true },
      ),
  },
  {
    name: "cargo-deny",
    // `cargo deny` is invoked as a cargo subcommand, but cargo silently
    // fails with "no such subcommand" if the cargo-deny plugin binary
    // itself is missing (even though `cargo` exists) — probe the plugin
    // binary specifically, not just `cargo`.
    probeCmd: "cargo-deny",
    run: () =>
      spawnSync("cargo", ["deny", "--manifest-path", "src-tauri/Cargo.toml", "check"], {
        stdio: "inherit",
        shell: true,
      }),
  },
  {
    name: "osv-scanner",
    probeCmd: "osv-scanner",
    run: () =>
      spawnSync(
        "osv-scanner",
        [
          "scan",
          "source",
          "-r",
          ".",
          "--config",
          "osv-scanner.toml",
          "--offline",
          "--download-offline-databases",
        ],
        { stdio: "inherit", shell: true },
      ),
  },
];

let missing = 0;
let failed = 0;

for (const check of checks) {
  if (!have(check.probeCmd)) {
    console.error(
      `\n[check-security] MISSING: '${check.name}' is not on PATH — this check did NOT run. See docs/SOURCE-REGISTRY.md for install instructions.`,
    );
    missing++;
    continue;
  }
  console.log(`\n[check-security] Running ${check.name}...`);
  const result = check.run();
  if (result.status !== 0) {
    console.error(`[check-security] FAILED: ${check.name} exited ${result.status}`);
    failed++;
  } else {
    console.log(`[check-security] OK: ${check.name}`);
  }
}

console.log(
  `\n[check-security] Summary: ${checks.length - missing - failed} ok, ${failed} failed, ${missing} missing.`,
);
if (missing > 0) {
  console.error(
    "[check-security] One or more tools are missing — this is NOT a clean pass, it is an unverified one.",
  );
}
process.exit(missing > 0 || failed > 0 ? 1 : 0);
