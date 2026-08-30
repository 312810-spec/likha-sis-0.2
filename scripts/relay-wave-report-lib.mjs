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
      error: `report is ${reportBody.length} chars, exceeds the ${maxChars}-char relay limit (GitHub comment cap is 65536 chars) — split the report or link it instead of inlining`,
    };
  }
  return { ok: true, error: null };
}

/** Refuses to post a body that would mention/invoke @claude, to avoid automation loops. */
export function containsClaudeMention(body) {
  return /@claude\b/i.test(body);
}

/**
 * Decide whether a commit's CI is confirmed green from GitHub Checks API
 * check-runs and/or the legacy combined-status API. Requires at least one
 * signal and no non-passing conclusion/state.
 */
export function ciIsGreen(checkRuns, combinedStatus) {
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  const passingConclusions = new Set(["success", "skipped", "neutral"]);

  if (runs.length > 0) {
    const notDone = runs.filter((r) => r.status !== "completed");
    if (notDone.length > 0) {
      return { green: false, detail: `${notDone.length} check run(s) not yet completed` };
    }
    const failing = runs.filter((r) => !passingConclusions.has(r.conclusion));
    if (failing.length > 0) {
      return {
        green: false,
        detail: `failing check run(s): ${failing.map((r) => `${r.name}=${r.conclusion}`).join(", ")}`,
      };
    }
    return { green: true, detail: `${runs.length} check run(s) passing` };
  }

  if (combinedStatus && typeof combinedStatus.state === "string") {
    if (combinedStatus.state === "success") {
      return { green: true, detail: "combined commit status = success" };
    }
    return { green: false, detail: `combined commit status = ${combinedStatus.state}` };
  }

  return { green: false, detail: "no check runs or commit status found for this SHA" };
}
