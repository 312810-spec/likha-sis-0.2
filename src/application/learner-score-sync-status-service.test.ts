import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { LearnerScoreSyncStatus } from "../domain/learner-score-sync-status";
import type { LearnerScoreSyncStatusRepository } from "../domain/ports/learner-score-sync-status-repository";
import { LearnerScoreSyncStatusApplicationService } from "./learner-score-sync-status-service";

class FakeRepository implements LearnerScoreSyncStatusRepository {
  calls: string[][] = [];
  result: LearnerScoreSyncStatus | null = "waitingToSync";

  async getStatus(assignmentId: string, itemId: string, learnerId: string) {
    this.calls.push([assignmentId, itemId, learnerId]);
    return this.result;
  }
}

describe("LearnerScoreSyncStatusApplicationService", () => {
  it("trims identifiers and delegates the authorized read", async () => {
    const repository = new FakeRepository();
    const service = new LearnerScoreSyncStatusApplicationService(repository);

    await expect(service.getStatus(" assignment-1 ", " item-1 ", " learner-1 ")).resolves.toBe(
      "waitingToSync",
    );
    expect(repository.calls).toEqual([["assignment-1", "item-1", "learner-1"]]);
  });

  it.each([
    ["", "item-1", "learner-1"],
    ["assignment-1", " ", "learner-1"],
    ["assignment-1", "item-1", " "],
  ])("rejects missing context before crossing the port", (assignmentId, itemId, learnerId) => {
    const repository = new FakeRepository();
    const service = new LearnerScoreSyncStatusApplicationService(repository);

    expect(() => service.getStatus(assignmentId, itemId, learnerId)).toThrow(ValidationError);
    expect(repository.calls).toEqual([]);
  });
});
