import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { FormativeAssessmentLog } from "../../domain/formative-assessment";
import { TauriFormativeAssessmentRepository } from "./formative-assessment-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const LOG: FormativeAssessmentLog = {
  id: "f1",
  schoolId: "s1",
  teachingAssignmentId: "ta1",
  learnerId: "l1",
  gradingPeriodId: "gp1",
  activityName: "Quiz 1",
  esruRating: "E",
  notes: "Great participation",
  createdByUserId: "u1",
  updatedByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

describe("TauriFormativeAssessmentRepository", () => {
  it("record invokes record_formative_assessment with every field, defaulting absent notes to null", async () => {
    mockInvoke.mockResolvedValueOnce(LOG);

    const returned = await new TauriFormativeAssessmentRepository().record({
      teachingAssignmentId: "ta1",
      learnerId: "l1",
      gradingPeriodId: "gp1",
      activityName: "Quiz 1",
      esruRating: "E",
    });

    expect(mockInvoke).toHaveBeenCalledWith("record_formative_assessment", {
      teachingAssignmentId: "ta1",
      learnerId: "l1",
      gradingPeriodId: "gp1",
      activityName: "Quiz 1",
      esruRating: "E",
      notes: null,
    });
    expect(returned).toEqual(LOG);
  });

  it("listForAssignment invokes list_formative_assessment_logs_for_assignment with the assignment id", async () => {
    mockInvoke.mockResolvedValueOnce([LOG]);

    const returned = await new TauriFormativeAssessmentRepository().listForAssignment("ta1");

    expect(mockInvoke).toHaveBeenCalledWith("list_formative_assessment_logs_for_assignment", {
      teachingAssignmentId: "ta1",
    });
    expect(returned).toEqual([LOG]);
  });
});
