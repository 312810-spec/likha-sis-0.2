import { describe, expect, it } from "vitest";
import { reviewStageFor, type GradeSubmission } from "./grade-submission";

function submission(overrides: Partial<GradeSubmission> = {}): GradeSubmission {
  return {
    id: "gs-1",
    schoolId: "school-1",
    classRecordId: "cr-1",
    submittedByUserId: "teacher-1",
    status: "submitted",
    submittedAt: "2026-08-01T00:00:00.000Z",
    decidedByUserId: null,
    decidedAt: null,
    masterTeacherDecision: null,
    masterTeacherDecidedByUserId: null,
    masterTeacherDecidedAt: null,
    ...overrides,
  };
}

describe("reviewStageFor", () => {
  it("is awaiting_master_teacher when submitted, undecided, and a Master Teacher is assigned", () => {
    expect(reviewStageFor(submission(), true)).toBe("awaiting_master_teacher");
  });

  it("is awaiting_school_head (the fallback) when submitted, undecided, and no Master Teacher is assigned", () => {
    expect(reviewStageFor(submission(), false)).toBe("awaiting_school_head");
  });

  it("is awaiting_school_head after the Master Teacher tier approves, regardless of assignment flag", () => {
    const s = submission({ masterTeacherDecision: "approved" });
    expect(reviewStageFor(s, true)).toBe("awaiting_school_head");
    expect(reviewStageFor(s, false)).toBe("awaiting_school_head");
  });

  it("is approved once status is approved", () => {
    const s = submission({ status: "approved", masterTeacherDecision: "approved" });
    expect(reviewStageFor(s, true)).toBe("approved");
  });

  it("is rejected_by_master_teacher when the Master Teacher tier itself rejected", () => {
    const s = submission({ status: "rejected", masterTeacherDecision: "rejected" });
    expect(reviewStageFor(s, true)).toBe("rejected_by_master_teacher");
  });

  it("is rejected_by_school_head when School Head rejected (fallback or final lock)", () => {
    const s = submission({ status: "rejected", masterTeacherDecision: null });
    expect(reviewStageFor(s, false)).toBe("rejected_by_school_head");

    const afterMtApproval = submission({
      status: "rejected",
      masterTeacherDecision: "approved",
    });
    expect(reviewStageFor(afterMtApproval, true)).toBe("rejected_by_school_head");
  });
});
