import { describe, expect, it } from "vitest";
import {
  MARKER,
  REQUIRED_WORKFLOWS,
  buildCommentBody,
  buildHeader,
  containsClaudeMention,
  isDuplicate,
  isValidCommitSha,
  latestRunByName,
  requiredWorkflowsGreen,
  validateReport,
} from "./relay-wave-report-lib.mjs";

describe("buildHeader / buildCommentBody", () => {
  it("includes the marker, SHA, and branch in a machine-readable header", () => {
    const body = buildCommentBody("abc123", "chore/relay", "# Wave X report\n\nDone.");
    expect(body.startsWith(`${MARKER}\n`)).toBe(true);
    expect(body).toContain(buildHeader("abc123", "chore/relay"));
    expect(body).toContain("sha=abc123");
    expect(body).toContain("branch=chore/relay");
    expect(body).toContain("# Wave X report");
  });
});

describe("isDuplicate", () => {
  it("detects an existing relay comment for the same SHA", () => {
    const comments = [
      { body: "unrelated comment" },
      { body: buildCommentBody("abc123", "chore/relay", "report") },
    ];
    expect(isDuplicate(comments, "abc123")).toBe(true);
  });

  it("does not flag a relay comment for a different SHA as duplicate", () => {
    const comments = [{ body: buildCommentBody("deadbeef", "chore/relay", "report") }];
    expect(isDuplicate(comments, "abc123")).toBe(false);
  });

  it("returns false when there are no comments", () => {
    expect(isDuplicate([], "abc123")).toBe(false);
  });
});

describe("validateReport", () => {
  it("rejects an empty report", () => {
    expect(validateReport("").ok).toBe(false);
    expect(validateReport("   \n  ").ok).toBe(false);
  });

  it("rejects a report larger than the configured limit", () => {
    const huge = "x".repeat(100);
    const result = validateReport(huge, 50);
    expect(result.ok).toBe(false);
    expect(result.error).toContain("complete and self-contained");
    expect(result.error).not.toContain("link");
  });

  it("accepts a normal report", () => {
    const result = validateReport("# Wave report\n\nAll good.");
    expect(result.ok).toBe(true);
    expect(result.error).toBeNull();
  });
});

describe("containsClaudeMention", () => {
  it("flags an @claude mention", () => {
    expect(containsClaudeMention("please review @claude")).toBe(true);
    expect(containsClaudeMention("@Claude take a look")).toBe(true);
  });

  it("does not flag unrelated text mentioning claude without @", () => {
    expect(containsClaudeMention("Claude Code produced this report")).toBe(false);
  });
});

describe("isValidCommitSha", () => {
  it("accepts a full 40-character hex SHA", () => {
    expect(isValidCommitSha("a".repeat(40))).toBe(true);
    expect(isValidCommitSha("944b988ffcfc786747164cdc7fe553ae57b5f2a3")).toBe(true);
  });

  it("rejects a short SHA, non-hex characters, or non-strings", () => {
    expect(isValidCommitSha("944b988")).toBe(false);
    expect(isValidCommitSha("g".repeat(40))).toBe(false);
    expect(isValidCommitSha("")).toBe(false);
    expect(isValidCommitSha(undefined)).toBe(false);
    expect(isValidCommitSha(123)).toBe(false);
  });
});

describe("latestRunByName", () => {
  it("returns the most recently started run matching the name", () => {
    const runs = [
      { name: "Quality Gate", run_started_at: "2026-08-30T10:00:00Z", status: "completed" },
      { name: "Quality Gate", run_started_at: "2026-08-30T12:00:00Z", status: "in_progress" },
      { name: "Security Gate", run_started_at: "2026-08-30T11:00:00Z", status: "completed" },
    ];
    expect(latestRunByName(runs, "Quality Gate").status).toBe("in_progress");
  });

  it("returns null when no run matches the name", () => {
    expect(latestRunByName([{ name: "Other" }], "Quality Gate")).toBeNull();
  });
});

describe("requiredWorkflowsGreen", () => {
  const passing = (name) => ({
    name,
    status: "completed",
    conclusion: "success",
    run_started_at: "2026-08-30T10:00:00Z",
  });

  it("is green when both required workflows completed successfully", () => {
    const runs = REQUIRED_WORKFLOWS.map(passing);
    const result = requiredWorkflowsGreen(runs);
    expect(result.green).toBe(true);
    expect(result.detail).toContain("Quality Gate=success");
    expect(result.detail).toContain("Security Gate=success");
  });

  it("refuses when a required workflow has no run for the commit", () => {
    const result = requiredWorkflowsGreen([passing("Quality Gate")]);
    expect(result.green).toBe(false);
    expect(result.detail).toContain('required workflow "Security Gate" has no run');
  });

  it("refuses when a required workflow is still pending", () => {
    const runs = [
      { ...passing("Quality Gate"), status: "in_progress", conclusion: null },
      passing("Security Gate"),
    ];
    const result = requiredWorkflowsGreen(runs);
    expect(result.green).toBe(false);
    expect(result.detail).toContain("is not completed");
  });

  it.each(["cancelled", "neutral", "skipped", "failure"])(
    "refuses when a required workflow's conclusion is %s",
    (conclusion) => {
      const runs = [{ ...passing("Quality Gate"), conclusion }, passing("Security Gate")];
      const result = requiredWorkflowsGreen(runs);
      expect(result.green).toBe(false);
      expect(result.detail).toContain("did not succeed");
    },
  );

  it("uses the latest run per workflow, not an earlier failing one", () => {
    const runs = [
      {
        name: "Quality Gate",
        status: "completed",
        conclusion: "failure",
        run_started_at: "2026-08-30T09:00:00Z",
      },
      {
        name: "Quality Gate",
        status: "completed",
        conclusion: "success",
        run_started_at: "2026-08-30T11:00:00Z",
      },
      passing("Security Gate"),
    ];
    expect(requiredWorkflowsGreen(runs).green).toBe(true);
  });
});
