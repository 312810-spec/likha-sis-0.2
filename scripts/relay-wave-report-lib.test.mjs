import { describe, expect, it } from "vitest";
import {
  MARKER,
  buildCommentBody,
  buildHeader,
  ciIsGreen,
  containsClaudeMention,
  isDuplicate,
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
    expect(validateReport(huge, 50).ok).toBe(false);
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

describe("ciIsGreen", () => {
  it("is green when all check runs completed successfully", () => {
    const runs = [
      { name: "build", status: "completed", conclusion: "success" },
      { name: "test", status: "completed", conclusion: "skipped" },
    ];
    expect(ciIsGreen(runs, null).green).toBe(true);
  });

  it("is not green when a check run is still in progress", () => {
    const runs = [{ name: "build", status: "in_progress", conclusion: null }];
    expect(ciIsGreen(runs, null).green).toBe(false);
  });

  it("is not green when a check run failed", () => {
    const runs = [{ name: "build", status: "completed", conclusion: "failure" }];
    expect(ciIsGreen(runs, null).green).toBe(false);
  });

  it("falls back to combined status success when there are no check runs", () => {
    expect(ciIsGreen([], { state: "success" }).green).toBe(true);
  });

  it("falls back to combined status failure when there are no check runs", () => {
    expect(ciIsGreen([], { state: "failure" }).green).toBe(false);
  });

  it("is not green when there is no signal at all", () => {
    expect(ciIsGreen([], null).green).toBe(false);
  });
});
