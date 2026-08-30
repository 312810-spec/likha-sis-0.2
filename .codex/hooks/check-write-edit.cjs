#!/usr/bin/env node
// PreToolUse hook for Write|Edit. Defense-in-depth only, not a secret
// scanner (that's Gitleaks, run separately via npm run quality:security).
// Deliberately narrow/low-false-positive: known secret token shapes are
// denied outright; a small set of Philippine government-ID-number shapes
// (more likely to indicate real data pasted by mistake than a casual
// synthetic fixture) trigger an "ask" so a human confirms, not a hard
// block, since this project's own synthetic fixtures may legitimately
// contain digit sequences of similar length.

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0); // can't parse -> don't block
  }

  const toolInput = payload.tool_input || {};
  const content = toolInput.content ?? toolInput.new_string ?? "";
  const filePath = toolInput.file_path ?? "";

  if (!content) process.exit(0);

  const secretPatterns = [
    /AKIA[0-9A-Z]{16}/, // AWS access key id
    /gh[pousr]_[A-Za-z0-9]{36,}/, // GitHub tokens
    /xox[baprs]-[0-9A-Za-z-]{10,}/, // Slack tokens
    /-----BEGIN (RSA |EC |OPENSSH |DSA |)PRIVATE KEY-----/, // PEM private key
  ];

  for (const re of secretPatterns) {
    if (re.test(content)) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "deny",
            permissionDecisionReason: `Write to ${filePath} appears to contain a credential-shaped string (${re}). Blocked by .claude/hooks/check-write-edit.js — remove the secret. This is a pattern check, not a full scan; run 'gitleaks detect' for real secret scanning.`,
          },
        }),
      );
      return;
    }
  }

  // Philippine government-ID-shaped patterns: SSS (XX-XXXXXXX-X),
  // PhilHealth (XX-XXXXXXXXX-X), TIN (XXX-XXX-XXX-XXX). Low-frequency
  // shapes unlikely to appear in typical UI/test code by accident.
  const idPatterns = [
    /\b\d{2}-\d{7}-\d\b/, // SSS
    /\b\d{2}-\d{9}-\d\b/, // PhilHealth
    /\b\d{3}-\d{3}-\d{3}-\d{3}\b/, // TIN
  ];

  for (const re of idPatterns) {
    if (re.test(content)) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: `Write to ${filePath} contains a Philippine government-ID-number-shaped value. LIKHA-SIS uses synthetic data only, everywhere. Confirm this is a synthetic/fixture value, not real learner/teacher data, before proceeding.`,
          },
        }),
      );
      return;
    }
  }

  process.exit(0);
});
