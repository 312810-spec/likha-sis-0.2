import { describe, expect, it } from "vitest";
import type { SyncStatus } from "../domain/sync-status";
import type { SyncStatusRepository } from "../domain/ports/sync-status-repository";
import { SyncStatusApplicationService } from "./sync-status-service";

const STATUS: SyncStatus = {
  enrolled: true,
  lastPullAt: "2026-09-05T08:00:00.000Z",
  pendingChangeCount: 3,
  hasPendingSyncTrouble: false,
  openConflictCount: 2,
};

class FakeSyncStatusRepository implements SyncStatusRepository {
  calls = 0;
  result: SyncStatus | "reject" = STATUS;

  async getStatus(): Promise<SyncStatus> {
    this.calls += 1;
    if (this.result === "reject") {
      throw new Error("could not load sync status");
    }
    return this.result;
  }
}

describe("SyncStatusApplicationService", () => {
  it("reads this device's own sync status for its own school", async () => {
    const repo = new FakeSyncStatusRepository();
    const service = new SyncStatusApplicationService(repo);

    const result = await service.getStatus();

    expect(repo.calls).toBe(1);
    expect(result).toEqual(STATUS);
  });

  it("propagates a thrown rejection from the repository", async () => {
    const repo = new FakeSyncStatusRepository();
    repo.result = "reject";
    const service = new SyncStatusApplicationService(repo);

    await expect(service.getStatus()).rejects.toThrow("could not load sync status");
  });
});
