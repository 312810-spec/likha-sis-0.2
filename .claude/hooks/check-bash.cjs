#!/usr/bin/env node
// PreToolUse hook for Bash. Requires explicit approval for destructive /
// remote-modifying commands. Must not interfere with normal compiler,
// test, or package-manager commands.

let input = "";
process.stdin.on("data", (d) => (input += d));
process.stdin.on("end", () => {
  let payload;
  try {
    payload = JSON.parse(input || "{}");
  } catch {
    process.exit(0);
  }

  const command = (payload.tool_input || {}).command ?? "";
  if (!command) process.exit(0);

  // Order matters: check narrow/safe patterns are not accidentally
  // caught by a broader one below them. Plain `git commit`/`git push`/
  // `git merge`/`git fetch`/`git pull` are NOT gated here — the user has
  // explicitly and durably authorized auto-commit/push/merge for this
  // project (see .claude/settings.json's permissions.allow and
  // docs/CURRENT-HANDOFF.md). Only genuinely irreversible/destructive
  // operations still require confirmation.
  const destructive = [
    [/\bgit\s+push\s+.*--force\b/, "git push --force (can overwrite upstream)"],
    [/\bgit\s+reset\s+--hard\b/, "git reset --hard (discards uncommitted work irreversibly)"],
    [/\bgit\s+clean\s+-[a-z]*f/, "git clean -f (irreversibly deletes untracked files)"],
    [/\bgit\s+branch\s+-D\b/, "git branch -D (force-deletes a branch)"],
    [/\brm\s+-rf\b/, "rm -rf (recursive forced delete)"],
    [/\bRemove-Item\b.*-Recurse.*-Force\b/i, "Remove-Item -Recurse -Force"],
    [/\btauri\s+build\b.*(--target|publish)/i, "a Tauri release/publish build"],
    [/\bnpm\s+publish\b/, "npm publish"],
    [/\bcargo\s+publish\b/, "cargo publish"],
  ];

  for (const [re, label] of destructive) {
    if (re.test(command)) {
      console.log(
        JSON.stringify({
          hookSpecificOutput: {
            hookEventName: "PreToolUse",
            permissionDecision: "ask",
            permissionDecisionReason: `Command matches a destructive/remote-modifying pattern (${label}). Blocked from auto-running by .claude/hooks/check-bash.js — confirm this is actually intended before approving.`,
          },
        }),
      );
      return;
    }
  }

  process.exit(0);
});
