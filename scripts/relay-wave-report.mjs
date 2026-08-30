#!/usr/bin/env node
// Posts a completed LIKHA-SIS wave's external Markdown delivery report as a
// comment on the durable relay PR, so a ChatGPT collaborator watching that
// PR sees the report without Claude Code ever invoking @claude itself.
//
// Guardrails (see .claude/rules/autonomous-development.md and the wave
// completion report rule in CLAUDE.md):
//   - Only runs after the caller has a real report file and a real SHA/branch.
//   - Refuses to post unless GitHub confirms the checkpoint SHA's CI is green.
//   - Refuses to post a duplicate for a SHA already relayed to this PR.
//   - Refuses to post a body that would mention/invoke @claude.
//   - --dry-run performs no GitHub write; it only prints what would be sent.
//
// Usage:
//   node scripts/relay-wave-report.mjs --report <path> --sha <sha> --branch <branch> [--pr 1] [--repo owner/name] [--dry-run]

import { spawnSync } from "node:child_process";
import { readFileSync, existsSync, statSync, writeFileSync, unlinkSync } from "node:fs";
import {
  buildCommentBody,
  containsClaudeMention,
  isDuplicate,
  validateReport,
  ciIsGreen,
} from "./relay-wave-report-lib.mjs";

function fail(message) {
  console.error(`[relay-wave-report] FAILED: ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { pr: "1", dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--report") args.report = argv[++i];
    else if (a === "--sha") args.sha = argv[++i];
    else if (a === "--branch") args.branch = argv[++i];
    else if (a === "--pr") args.pr = argv[++i];
    else if (a === "--repo") args.repo = argv[++i];
    else fail(`unrecognized argument: ${a}`);
  }
  return args;
}

function haveGh() {
  const finder = process.platform === "win32" ? "where" : "which";
  return spawnSync(finder, ["gh"], { stdio: "ignore", shell: true }).status === 0;
}

function gh(args) {
  return spawnSync("gh", args, { encoding: "utf8", shell: true });
}

function ghJson(args, what) {
  const result = gh(args);
  if (result.status !== 0) {
    fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout || "").trim()}`);
  }
  try {
    return JSON.parse(result.stdout);
  } catch {
    fail(`could not parse gh output for ${what}`);
  }
}

function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!args.report) fail("--report <path> is required");
  if (!args.sha) fail("--sha <commit-sha> is required");
  if (!args.branch) fail("--branch <branch-name> is required");

  if (!haveGh()) {
    fail("GitHub CLI ('gh') is not on PATH — install it before running the relay");
  }
  const authCheck = gh(["auth", "status"]);
  if (authCheck.status !== 0) {
    fail(`'gh' is not authenticated: ${(authCheck.stderr || authCheck.stdout || "").trim()}`);
  }

  if (!existsSync(args.report)) {
    fail(`report file not found: ${args.report}`);
  }
  if (statSync(args.report).size === 0) {
    fail(`report file is empty: ${args.report}`);
  }
  const reportBody = readFileSync(args.report, "utf8");

  const validation = validateReport(reportBody);
  if (!validation.ok) fail(validation.error);

  const commentBody = buildCommentBody(args.sha, args.branch, reportBody);

  if (containsClaudeMention(commentBody)) {
    fail("report body mentions @claude — refusing to post to avoid triggering an automation loop");
  }

  const repo =
    args.repo ??
    (() => {
      const r = ghJson(["repo", "view", "--json", "nameWithOwner"], "repo name");
      return r.nameWithOwner;
    })();

  // 1. Confirm CI is green for the exact checkpoint SHA before doing anything else.
  const checkRunsResp = gh([
    "api",
    `repos/${repo}/commits/${args.sha}/check-runs`,
    "--jq",
    ".check_runs",
  ]);
  const checkRuns = checkRunsResp.status === 0 ? JSON.parse(checkRunsResp.stdout || "[]") : [];

  let combinedStatus = null;
  const statusResp = gh(["api", `repos/${repo}/commits/${args.sha}/status`]);
  if (statusResp.status === 0) {
    try {
      combinedStatus = JSON.parse(statusResp.stdout);
    } catch {
      combinedStatus = null;
    }
  }

  const ci = ciIsGreen(checkRuns, combinedStatus);
  if (!ci.green) {
    fail(`CI is not confirmed green for ${args.sha}: ${ci.detail}`);
  }
  console.log(`[relay-wave-report] CI confirmed green for ${args.sha}: ${ci.detail}`);

  // 2. Check for an existing relay comment for this SHA (idempotency).
  const existingComments = ghJson(
    ["api", `repos/${repo}/issues/${args.pr}/comments`, "--paginate"],
    "existing PR comments",
  );
  if (isDuplicate(existingComments, args.sha)) {
    console.log(
      `[relay-wave-report] a relay comment for SHA ${args.sha} already exists on PR #${args.pr} — skipping (idempotent no-op).`,
    );
    process.exit(0);
  }

  if (args.dryRun) {
    console.log(
      `[relay-wave-report] DRY RUN — would post to ${repo}#${args.pr} (no GitHub write performed):\n`,
    );
    console.log(commentBody);
    process.exit(0);
  }

  // gh pr comment reads the body from a file to avoid Windows/POSIX shell
  // quoting issues entirely.
  const tmpFile = `${args.report}.relay-comment.tmp`;
  writeFileSync(tmpFile, commentBody, "utf8");
  try {
    const post = gh(["pr", "comment", String(args.pr), "--repo", repo, "--body-file", tmpFile]);
    if (post.status !== 0) {
      fail(`GitHub rejected the comment: ${(post.stderr || post.stdout || "").trim()}`);
    }
    console.log(`[relay-wave-report] posted wave report for ${args.sha} to ${repo}#${args.pr}.`);
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch {
      // best-effort cleanup
    }
  }
}

main();
