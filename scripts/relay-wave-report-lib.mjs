// Pure helper functions for the ChatGPT-to-Claude wave-report relay
// (scripts/relay-wave-report.mjs). Kept dependency-free and side-effect-free
// so they can be unit tested without invoking `gh` or touching the network.

export const MARKER = "[LIKHA_WAVE_REPORT]";

// GitHub issue/PR comment bodies are capped at 65536 characters. Leave
// headroom for the header this script adds on top of the report body.
export const MAX_COMMENT_CHARS = 60000;

/** Machine-readable header line the duplicate check greps for. */
export function buildHeader(sha, branch) {
  return `<!-- likha-relay: sha=${sha}; branch=${branch} -->`;
}

export function buildCommentBody(sha, branch, reportBody) {
  return `${MARKER}\n${buildHeader(sha, branch)}\n\n${reportBody.trimEnd()}\n`;
}

/**
 * True if `existingComments` (array of { body: string }) already contains a
 * relay comment for this exact checkpoint SHA — prevents duplicate posting.
 */
export function isDuplicate(existingComments, sha) {
  const needle = `sha=${sha};`;
  return existingComments.some(
    (c) => typeof c.body === "string" && c.body.includes(MARKER) && c.body.includes(needle),
  );
}

/** Refuses empty, missing (handled by caller), or oversized report content. */
export function validateReport(reportBody, maxChars = MAX_COMMENT_CHARS) {
  if (typeof reportBody !== "string" || reportBody.trim().length === 0) {
    return { ok: false, error: "report file is empty" };
  }
  if (reportBody.length > maxChars) {
    return {
      ok: false,
      error: `report is ${reportBody.length} chars, exceeds the ${maxChars}-char relay limit (GitHub comment cap is 65536 chars) — shorten or condense the report while keeping it complete and self-contained`,
    };
  }
  return { ok: true, error: null };
}

/** Refuses to post a body that would mention/invoke @claude, to avoid automation loops. */
export function containsClaudeMention(body) {
  return /@claude\b/i.test(body);
}

/** Full 40-character hex commit SHA, matching the checkpoint commit exactly. */
export function isValidCommitSha(sha) {
  return typeof sha === "string" && /^[0-9a-f]{40}$/i.test(sha);
}

/**
 * The exact GitHub Actions workflow names (as declared by their `name:` key
 * in .github/workflows/*.yml) that must both be green for a checkpoint SHA
 * before its wave report may be relayed.
 */
export const REQUIRED_WORKFLOWS = ["Quality Gate", "Security Gate"];

/**
 * Among `workflowRuns` (objects with at least `name`, `status`,
 * `conclusion`, and a timestamp field), returns the most recently started
 * run matching `name`, or null if there is none.
 */
export function latestRunByName(workflowRuns, name) {
  const matches = (Array.isArray(workflowRuns) ? workflowRuns : []).filter((r) => r.name === name);
  if (matches.length === 0) return null;
  return matches.reduce((latest, run) => {
    const latestKey = latest.run_started_at ?? latest.created_at ?? "";
    const key = run.run_started_at ?? run.created_at ?? "";
    return key > latestKey ? run : latest;
  });
}

/**
 * Requires the latest run of every workflow in `requiredNames` (already
 * filtered to the checkpoint SHA by the caller's API query) to be
 * status=completed and conclusion=success. Missing, pending, cancelled,
 * neutral, skipped, or failed required workflows are all refused — there is
 * no generic combined-status fallback.
 */
export function requiredWorkflowsGreen(workflowRuns, requiredNames = REQUIRED_WORKFLOWS) {
  const details = [];
  for (const name of requiredNames) {
    const run = latestRunByName(workflowRuns, name);
    if (!run) {
      return { green: false, detail: `required workflow "${name}" has no run for this commit` };
    }
    if (run.status !== "completed") {
      return {
        green: false,
        detail: `required workflow "${name}" is not completed (status=${run.status})`,
      };
    }
    if (run.conclusion !== "success") {
      return {
        green: false,
        detail: `required workflow "${name}" did not succeed (conclusion=${run.conclusion})`,
      };
    }
    details.push(`${name}=success`);
  }
  return { green: true, detail: details.join(", ") };
}
