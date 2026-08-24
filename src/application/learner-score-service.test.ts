import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import { LearnerScoreApplicationService } from "./learner-score-service";

class FakeLearnerScoreRepository implements LearnerScoreRepository {
  recordCalls: Array<{
    assessmentItemId: string;
    learnerId: string;
    status: LearnerScoreStatus;
    score: number | null;
  }> = [];
  recordResult: LearnerScore | null = {
    id: "ls-1",
    schoolId: "s1",
    assessmentItemId: "ai-1",
    learnerId: "l1",
    status: "scored",
    score: 18,
    recordedByUserId: "u1",
    recordedAt: "now",
    updatedAt: "now",
  };
  rosterToReturn: LearnerScoreRosterEntry[] | null = [];

  async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
    return this.rosterToReturn;
  }

  async record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
  ): Promise<LearnerScore | null> {
    this.recordCalls.push({ assessmentItemId, learnerId, status, score });
    return this.recordResult;
  }

  computeTermGradeCalls: Array<{ classRecordId: string; learnerId: string }> = [];
  computeTermGradeResult: ComputedTermGrade | null = {
    initialGrade: 85.8,
    termGrade: 88,
    wasTransmuted: true,
    wasFloored: false,
  };

  async computeTermGrade(
    classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    this.computeTermGradeCalls.push({ classRecordId, learnerId });
    return this.computeTermGradeResult;
  }
}

describe("LearnerScoreApplicationService", () => {
  it("records a scored entry within range", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    const result = await service.recordScore(" ai-1 ", " l1 ", "scored", 18, 20);

    expect(result).toEqual(repo.recordResult);
    expect(repo.recordCalls).toEqual([
      { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 18 },
    ]);
  });

  it("records an excused entry with no score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await service.recordScore("ai-1", "l1", "excused", null, 20);

    expect(repo.recordCalls).toEqual([
      { assessmentItemId: "ai-1", learnerId: "l1", status: "excused", score: null },
    ]);
  });

  it("rejects an empty assessment item id without calling the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("  ", "l1", "scored", 10, 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects an empty learner id without calling the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "  ", "scored", 10, 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a scored status with no score value", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", null, 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a score above the max score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", 25, 20)).rejects.toThrow(
      /between 0 and 20/,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a negative score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", -1, 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects an excused status that carries a score value", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "excused", 5, 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rosterForItem delegates to the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    repo.rosterToReturn = [
      {
        learnerId: "l1",
        givenName: "Ana",
        familyName: "Cruz",
        status: null,
        score: null,
        updatedAt: null,
      },
    ];
    const service = new LearnerScoreApplicationService(repo);

    const roster = await service.rosterForItem("ai-1");

    expect(roster).toBe(repo.rosterToReturn);
  });

  it("computeTermGrade delegates to the repository with trimmed ids", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    const result = await service.computeTermGrade(" cr-1 ", " l1 ");

    expect(result).toEqual(repo.computeTermGradeResult);
    expect(repo.computeTermGradeCalls).toEqual([{ classRecordId: "cr-1", learnerId: "l1" }]);
  });

  it("computeTermGrade rejects an empty class record id", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.computeTermGrade("  ", "l1")).rejects.toBeInstanceOf(ValidationError);
  });

  it("computeTermGrade rejects an empty learner id", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.computeTermGrade("cr-1", "  ")).rejects.toBeInstanceOf(ValidationError);
  });
});
