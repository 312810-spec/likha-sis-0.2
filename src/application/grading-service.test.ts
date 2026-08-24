import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { GradingRepository } from "../domain/ports/grading-repository";
import { GradingApplicationService } from "./grading-service";

class FakeGradingRepository implements GradingRepository {
  policiesToReturn: GradingPolicy[] = [];
  policyPeriodsToReturn: GradingPolicyPeriod[] = [];
  periodsToReturn: GradingPeriod[] = [];
  createCalls: Array<{
    schoolYear: string;
    policyPeriodId: string;
    startsOn: string;
    endsOn: string;
  }> = [];
  createResult: GradingPeriod | null = null;

  async listPolicies(): Promise<GradingPolicy[]> {
    return this.policiesToReturn;
  }

  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    return this.policyPeriodsToReturn;
  }

  async listPeriodsBySchoolYear(): Promise<GradingPeriod[]> {
    return this.periodsToReturn;
  }

  async createPeriod(
    schoolYear: string,
    policyPeriodId: string,
    startsOn: string,
    endsOn: string,
  ): Promise<GradingPeriod | null> {
    this.createCalls.push({ schoolYear, policyPeriodId, startsOn, endsOn });
    return this.createResult;
  }
}

describe("GradingApplicationService", () => {
  it("lists policies by delegating to the repository", async () => {
    const repo = new FakeGradingRepository();
    repo.policiesToReturn = [
      { id: "p1", name: "Three-Term", sourceCitation: "cite", isDefault: true, createdAt: "now" },
    ];
    const service = new GradingApplicationService(repo);

    const policies = await service.listPolicies();

    expect(policies).toBe(repo.policiesToReturn);
  });

  it("rejects an empty policy id when listing policy periods", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(service.listPolicyPeriods("  ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("rejects an empty school year when listing periods", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(service.listPeriodsBySchoolYear("  ")).rejects.toBeInstanceOf(ValidationError);
  });

  it("creates a period with trimmed ids and well-formed dates", async () => {
    const repo = new FakeGradingRepository();
    repo.createResult = {
      id: "gp1",
      schoolId: "s1",
      schoolYear: "2026-2027",
      policyPeriodId: "pp1",
      label: "1st Term",
      startsOn: "2026-06-08",
      endsOn: "2026-09-15",
      createdAt: "now",
    };
    const service = new GradingApplicationService(repo);

    const result = await service.createPeriod(" 2026-2027 ", " pp1 ", "2026-06-08", "2026-09-15");

    expect(result).toBe(repo.createResult);
    expect(repo.createCalls).toEqual([
      {
        schoolYear: "2026-2027",
        policyPeriodId: "pp1",
        startsOn: "2026-06-08",
        endsOn: "2026-09-15",
      },
    ]);
  });

  it("rejects an empty school year without calling the repository", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(
      service.createPeriod("  ", "pp1", "2026-06-08", "2026-09-15"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty policy period id without calling the repository", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(
      service.createPeriod("2026-2027", "  ", "2026-06-08", "2026-09-15"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a malformed date without calling the repository", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(
      service.createPeriod("2026-2027", "pp1", "06/08/2026", "2026-09-15"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an end date before the start date without calling the repository", async () => {
    const repo = new FakeGradingRepository();
    const service = new GradingApplicationService(repo);

    await expect(
      service.createPeriod("2026-2027", "pp1", "2026-09-15", "2026-06-08"),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.createCalls).toEqual([]);
  });

  it("returns null when the policy period could not be resolved", async () => {
    const repo = new FakeGradingRepository();
    repo.createResult = null;
    const service = new GradingApplicationService(repo);

    const result = await service.createPeriod("2026-2027", "pp1", "2026-06-08", "2026-09-15");

    expect(result).toBeNull();
  });
});
