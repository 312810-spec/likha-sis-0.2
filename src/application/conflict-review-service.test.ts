import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { ConflictReviewSummary } from "../domain/conflict-review";
import type { ConflictReviewRepository } from "../domain/ports/conflict-review-repository";
import { ConflictReviewApplicationService } from "./conflict-review-service";

const CONFLICTS: ConflictReviewSummary[] = [
  {
    id: "cr-1",
    entityKind: "learner",
    entityId: "l-1",
    deviceId: "d-1",
    createdAt: "2026-09-01T08:00:00.000Z",
    submittedBaseVersion: 1,
    currentHubVersion: 2,
    incoming: { kind: "learner", givenName: "Anna", familyName: "Cruz", lrn: null },
    incomingUnavailableReason: null,
    local: { kind: "learner", givenName: "Ana", familyName: "Cruz", lrn: null },
  },
];

class FakeConflictReviewRepository implements ConflictReviewRepository {
  calls = 0;
  resolveCalls: Array<{ conflictId: string; resolution: string }> = [];
  resolveResult: boolean | "reject" = true;

  async listConflicts() {
    this.calls += 1;
    return CONFLICTS;
  }

  async resolveConflict(conflictId: string, resolution: "keep_local" | "use_incoming") {
    this.resolveCalls.push({ conflictId, resolution });
    if (this.resolveResult === "reject") {
      throw new Error("unauthorized");
    }
    return this.resolveResult;
  }
}

describe("ConflictReviewApplicationService", () => {
  it("lists conflicts staged for the caller's own school", async () => {
    const repo = new FakeConflictReviewRepository();
    const service = new ConflictReviewApplicationService(repo);

    const result = await service.listConflicts();

    expect(repo.calls).toBe(1);
    expect(result).toEqual(CONFLICTS);
  });

  it("resolves a conflict, trimming the conflict id", async () => {
    const repo = new FakeConflictReviewRepository();
    const service = new ConflictReviewApplicationService(repo);

    const result = await service.resolveConflict(" cr-1 ", "keep_local");

    expect(result).toBe(true);
    expect(repo.resolveCalls).toEqual([{ conflictId: "cr-1", resolution: "keep_local" }]);
  });

  it("propagates a false result (already resolved or in a different school) without throwing", async () => {
    const repo = new FakeConflictReviewRepository();
    repo.resolveResult = false;
    const service = new ConflictReviewApplicationService(repo);

    const result = await service.resolveConflict("cr-1", "use_incoming");

    expect(result).toBe(false);
  });

  it("rejects an empty conflict id before ever calling the repository", async () => {
    const repo = new FakeConflictReviewRepository();
    const service = new ConflictReviewApplicationService(repo);

    await expect(service.resolveConflict("  ", "keep_local")).rejects.toThrow(ValidationError);
    expect(repo.resolveCalls).toHaveLength(0);
  });

  it("rejects an invalid resolution choice before ever calling the repository", async () => {
    const repo = new FakeConflictReviewRepository();
    const service = new ConflictReviewApplicationService(repo);

    // @ts-expect-error deliberately invalid at the boundary
    await expect(service.resolveConflict("cr-1", "something_else")).rejects.toThrow(
      ValidationError,
    );
    expect(repo.resolveCalls).toHaveLength(0);
  });

  it("propagates a thrown error from the repository", async () => {
    const repo = new FakeConflictReviewRepository();
    repo.resolveResult = "reject";
    const service = new ConflictReviewApplicationService(repo);

    await expect(service.resolveConflict("cr-1", "use_incoming")).rejects.toThrow("unauthorized");
  });
});
