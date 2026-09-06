import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { LessonPlan, LessonPlanFields } from "../../domain/lesson-plan";
import { TauriLessonPlanRepository } from "./lesson-plan-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const FIELDS: LessonPlanFields = {
  learningCompetency: "Add and subtract fractions",
  learningCompetencyCode: "M7NS-Ig-1",
  learningObjectives: "Objective 1\nObjective 2",
  connectionToPreviousLearning: "Prior lesson",
  learningExperiences: "Group activity",
  assessment: "Exit ticket",
  waysForward: "Reteach if needed",
};

const PLAN: LessonPlan = {
  id: "lp-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  planDate: "2026-09-07",
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
  ...FIELDS,
};

describe("TauriLessonPlanRepository", () => {
  it("create invokes create_lesson_plan with the assignment, date, and every field", async () => {
    mockInvoke.mockResolvedValueOnce(PLAN);

    const returned = await new TauriLessonPlanRepository().create("ta-1", "2026-09-07", FIELDS);

    expect(mockInvoke).toHaveBeenCalledWith("create_lesson_plan", {
      teachingAssignmentId: "ta-1",
      planDate: "2026-09-07",
      ...FIELDS,
    });
    expect(returned).toEqual(PLAN);
  });

  it("create returns null when the backend rejects it", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriLessonPlanRepository().create("ta-1", "2026-09-07", FIELDS);

    expect(result).toBeNull();
  });

  it("update invokes update_lesson_plan with the plan id, assignment, and every field", async () => {
    mockInvoke.mockResolvedValueOnce(PLAN);

    const returned = await new TauriLessonPlanRepository().update("lp-1", "ta-1", FIELDS);

    expect(mockInvoke).toHaveBeenCalledWith("update_lesson_plan", {
      id: "lp-1",
      teachingAssignmentId: "ta-1",
      ...FIELDS,
    });
    expect(returned).toEqual(PLAN);
  });

  it("listByAssignment invokes list_lesson_plans_by_assignment with the assignment id", async () => {
    mockInvoke.mockResolvedValueOnce([PLAN]);

    const returned = await new TauriLessonPlanRepository().listByAssignment("ta-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_lesson_plans_by_assignment", {
      teachingAssignmentId: "ta-1",
    });
    expect(returned).toEqual([PLAN]);
  });
});
