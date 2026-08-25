import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import { ClassRecordApplicationService } from "./class-record-service";

class FakeClassRecordRepository implements ClassRecordRepository {
  createCalls: Array<{
    sectionId: string;
    subjectId: string;
    gradingPeriodId: string;
    weightPolicyId: string;
  }> = [];
  createResult: ClassRecord | null = {
    id: "cr-1",
    schoolId: "current-session-school",
    sectionId: "sec-1",
    subjectId: "sub-1",
    gradingPeriodId: "gp-1",
    weightPolicyId: "wp-1",
    createdAt: "now",
  };
  listToReturn: ClassRecordDetail[] = [];
  weightPoliciesToReturn: GradingWeightPolicy[] = [];

  async list(): Promise<ClassRecordDetail[]> {
    return this.listToReturn;
  }

  async create(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null> {
    this.createCalls.push({ sectionId, subjectId, gradingPeriodId, weightPolicyId });
    return this.createResult;
  }

  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return this.weightPoliciesToReturn;
  }
}

describe("ClassRecordApplicationService", () => {
  it("creates a class record with trimmed ids", async () => {
    const repo = new FakeClassRecordRepository();
    const service = new ClassRecordApplicationService(repo);

    const record = await service.createClassRecord(" sec-1 ", " sub-1 ", " gp-1 ", " wp-1 ");

    expect(record).toEqual(repo.createResult);
    expect(repo.createCalls).toEqual([
      { sectionId: "sec-1", subjectId: "sub-1", gradingPeriodId: "gp-1", weightPolicyId: "wp-1" },
    ]);
  });

  it("passes through a null result from the repository (invalid/foreign combination)", async () => {
    const repo = new FakeClassRecordRepository();
    repo.createResult = null;
    const service = new ClassRecordApplicationService(repo);

    const record = await service.createClassRecord("sec-1", "sub-1", "gp-1", "wp-1");

    expect(record).toBeNull();
  });

  it("rejects an empty section id without calling the repository", async () => {
    const repo = new FakeClassRecordRepository();
    const service = new ClassRecordApplicationService(repo);

    await expect(service.createClassRecord("  ", "sub-1", "gp-1", "wp-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty subject id without calling the repository", async () => {
    const repo = new FakeClassRecordRepository();
    const service = new ClassRecordApplicationService(repo);

    await expect(service.createClassRecord("sec-1", "  ", "gp-1", "wp-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty grading period id without calling the repository", async () => {
    const repo = new FakeClassRecordRepository();
    const service = new ClassRecordApplicationService(repo);

    await expect(service.createClassRecord("sec-1", "sub-1", "  ", "wp-1")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty weight policy id without calling the repository", async () => {
    const repo = new FakeClassRecordRepository();
    const service = new ClassRecordApplicationService(repo);

    await expect(service.createClassRecord("sec-1", "sub-1", "gp-1", "  ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("lists class records by delegating to the repository", async () => {
    const repo = new FakeClassRecordRepository();
    repo.listToReturn = [
      {
        id: "cr-1",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
        createdAt: "now",
        itemCount: 0,
        recordedCount: 0,
        totalEligible: 0,
      },
    ];
    const service = new ClassRecordApplicationService(repo);

    const records = await service.listClassRecords();

    expect(records).toBe(repo.listToReturn);
  });

  it("lists grading weight policies by delegating to the repository", async () => {
    const repo = new FakeClassRecordRepository();
    repo.weightPoliciesToReturn = [
      {
        id: "wp-1",
        name: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
        sourceCitation: "DepEd Order No. 015, s. 2026",
        isDefault: true,
      },
    ];
    const service = new ClassRecordApplicationService(repo);

    const policies = await service.listGradingWeightPolicies();

    expect(policies).toBe(repo.weightPoliciesToReturn);
  });
});
