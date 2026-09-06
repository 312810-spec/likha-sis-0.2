import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { LessonPlan, LessonPlanFields } from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";
import { LessonPlanApplicationService } from "./lesson-plan-service";

const VALID_FIELDS: LessonPlanFields = {
  learningCompetency: "Add and subtract fractions with unlike denominators",
  learningCompetencyCode: "M7NS-Ig-1",
  learningObjectives: "Add fractions\nSubtract fractions",
  connectionToPreviousLearning: "Builds on like denominators",
  learningExperiences: "Group activity with fraction strips",
  assessment: "3-item exit ticket",
  waysForward: "Reteach if accuracy is low",
};

const PLAN: LessonPlan = {
  id: "lp-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  planDate: "2026-09-07",
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
  ...VALID_FIELDS,
};

class FakeLessonPlanRepository implements LessonPlanRepository {
  createCalls: Array<{
    teachingAssignmentId: string;
    planDate: string;
    fields: LessonPlanFields;
  }> = [];
  updateCalls: Array<{
    id: string;
    teachingAssignmentId: string;
    fields: LessonPlanFields;
  }> = [];
  createResult: LessonPlan | null = PLAN;
  updateResult: LessonPlan | null = PLAN;
  plansToReturn: LessonPlan[] = [];

  async create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    this.createCalls.push({ teachingAssignmentId, planDate, fields });
    return this.createResult;
  }

  async update(
    id: string,
    teachingAssignmentId: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    this.updateCalls.push({ id, teachingAssignmentId, fields });
    return this.updateResult;
  }

  async listByAssignment(): Promise<LessonPlan[]> {
    return this.plansToReturn;
  }
}

describe("LessonPlanApplicationService", () => {
  it("trims and forwards fields to create", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.create("  ta-1  ", "2026-09-07", {
      ...VALID_FIELDS,
      learningCompetency: "  Add and subtract fractions  ",
    });

    expect(repo.createCalls).toHaveLength(1);
    const call = repo.createCalls.at(0);
    expect(call?.teachingAssignmentId).toBe("ta-1");
    expect(call?.fields.learningCompetency).toBe("Add and subtract fractions");
  });

  it("rejects a blank learning competency", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningCompetency: "   " }),
    ).rejects.toThrow(ValidationError);
    expect(repo.createCalls).toHaveLength(0);
  });

  it("rejects blank learning objectives", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningObjectives: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects blank learning experiences", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, learningExperiences: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("rejects blank assessment", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(
      service.create("ta-1", "2026-09-07", { ...VALID_FIELDS, assessment: "" }),
    ).rejects.toThrow(ValidationError);
  });

  it("allows a blank competency code, connection, and ways forward", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.create("ta-1", "2026-09-07", {
      ...VALID_FIELDS,
      learningCompetencyCode: "",
      connectionToPreviousLearning: "",
      waysForward: "",
    });

    expect(repo.createCalls).toHaveLength(1);
  });

  it("rejects an empty teaching assignment id", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(service.create("  ", "2026-09-07", VALID_FIELDS)).rejects.toThrow(ValidationError);
  });

  it("rejects an empty plan date", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await expect(service.create("ta-1", "  ", VALID_FIELDS)).rejects.toThrow(ValidationError);
  });

  it("forwards update calls with trimmed ids", async () => {
    const repo = new FakeLessonPlanRepository();
    const service = new LessonPlanApplicationService(repo);

    await service.update("  lp-1  ", "  ta-1  ", VALID_FIELDS);

    expect(repo.updateCalls).toHaveLength(1);
    const call = repo.updateCalls.at(0);
    expect(call?.id).toBe("lp-1");
    expect(call?.teachingAssignmentId).toBe("ta-1");
  });

  it("forwards listByAssignment with a trimmed id", async () => {
    const repo = new FakeLessonPlanRepository();
    repo.plansToReturn = [PLAN];
    const service = new LessonPlanApplicationService(repo);

    const result = await service.listByAssignment("  ta-1  ");

    expect(result).toEqual([PLAN]);
  });
});
