import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
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
    correctionReason: string | null;
  }> = [];
  correctionHistoryResult: LearnerScoreCorrection[] = [];
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
    correctionReason: string | null,
  ): Promise<LearnerScore | null> {
    this.recordCalls.push({ assessmentItemId, learnerId, status, score, correctionReason });
    return this.recordResult;
  }

  async correctionHistory(): Promise<LearnerScoreCorrection[]> {
    return this.correctionHistoryResult;
  }

  computeTermGradeCalls: Array<{ classRecordId: string; learnerId: string }> = [];
  computeTermGradeResult: ComputedTermGrade | null = {
    initialGrade: 85.8,
    termGrade: 88,
    wasTransmuted: true,
    wasFloored: false,
    complete: true,
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

    const result = await service.recordScore(" ai-1 ", " l1 ", "scored", 18, 20, null);

    expect(result).toEqual(repo.recordResult);
    expect(repo.recordCalls).toEqual([
      {
        assessmentItemId: "ai-1",
        learnerId: "l1",
        status: "scored",
        score: 18,
        correctionReason: null,
      },
    ]);
  });

  it("records an excused entry with no score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await service.recordScore("ai-1", "l1", "excused", null, 20, null);

    expect(repo.recordCalls).toEqual([
      {
        assessmentItemId: "ai-1",
        learnerId: "l1",
        status: "excused",
        score: null,
        correctionReason: null,
      },
    ]);
  });

  it("rejects an empty assessment item id without calling the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("  ", "l1", "scored", 10, 20, null)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects an empty learner id without calling the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "  ", "scored", 10, 20, null)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a scored status with no score value", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(
      service.recordScore("ai-1", "l1", "scored", null, 20, null),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a score above the max score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", 25, 20, null)).rejects.toThrow(
      /between 0 and 20/,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects a negative score", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", -1, 20, null)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("rejects an excused status that carries a score value", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "excused", 5, 20, null)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("forwards a correction reason through to the repository, trimmed", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await service.recordScore("ai-1", "l1", "scored", 19, 20, "  Rechecked the paper  ");

    expect(repo.recordCalls).toEqual([
      {
        assessmentItemId: "ai-1",
        learnerId: "l1",
        status: "scored",
        score: 19,
        correctionReason: "Rechecked the paper",
      },
    ]);
  });

  it("rejects a blank correction reason without calling the repository", async () => {
    const repo = new FakeLearnerScoreRepository();
    const service = new LearnerScoreApplicationService(repo);

    await expect(service.recordScore("ai-1", "l1", "scored", 19, 20, "   ")).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.recordCalls).toEqual([]);
  });

  it("correctionHistory delegates to the repository with trimmed ids", async () => {
    const repo = new FakeLearnerScoreRepository();
    repo.correctionHistoryResult = [
      {
        id: "corr-1",
        assessmentItemId: "ai-1",
        learnerId: "l1",
        previousStatus: "scored",
        previousScore: 15,
        previousRecordedByUserId: "u1",
        previousRecordedAt: "2026-10-01T00:00:00Z",
        newStatus: "scored",
        newScore: 19,
        correctedByUserId: "u1",
        reason: "Rechecked the paper",
        correctedAt: "2026-10-06T00:00:00Z",
      },
    ];
    const service = new LearnerScoreApplicationService(repo);

    const history = await service.correctionHistory(" ai-1 ", " l1 ");

    expect(history).toBe(repo.correctionHistoryResult);
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
