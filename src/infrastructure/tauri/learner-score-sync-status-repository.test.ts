import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import { TauriLearnerScoreSyncStatusRepository } from "./learner-score-sync-status-repository";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));
const mockInvoke = vi.mocked(invoke);

describe("TauriLearnerScoreSyncStatusRepository", () => {
  it("passes assignment-owned Class Record context to the native command", async () => {
    mockInvoke.mockResolvedValueOnce("needsReview");

    const result = await new TauriLearnerScoreSyncStatusRepository().getStatus(
      "assignment-1",
      "item-1",
      "learner-1",
    );

    expect(mockInvoke).toHaveBeenCalledWith("get_learner_score_sync_status", {
      teachingAssignmentId: "assignment-1",
      assessmentItemId: "item-1",
      learnerId: "learner-1",
    });
    expect(result).toBe("needsReview");
  });

  it("preserves null when no persisted score entity exists", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    await expect(
      new TauriLearnerScoreSyncStatusRepository().getStatus(
        "assignment-1",
        "item-1",
        "learner-1",
      ),
    ).resolves.toBeNull();
  });
});
