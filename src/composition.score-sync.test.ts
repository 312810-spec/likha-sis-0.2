import { invoke } from "@tauri-apps/api/core";
import { afterEach, expect, it, vi } from "vitest";
import * as composition from "./composition";

vi.mock("@tauri-apps/api/core", () => ({ invoke: vi.fn() }));

afterEach(() => vi.mocked(invoke).mockReset());

it("wires score evidence through the assignment-authorized native adapter", async () => {
  vi.mocked(invoke).mockResolvedValueOnce("waitingToSync");
  await expect(
    composition.learnerScoreSyncStatusService.getStatus(" assignment-1 ", "item-1", "learner-1"),
  ).resolves.toBe("waitingToSync");
  expect(invoke).toHaveBeenCalledExactlyOnceWith("get_learner_score_sync_status", {
    teachingAssignmentId: "assignment-1",
    assessmentItemId: "item-1",
    learnerId: "learner-1",
  });
});

it("does not replace missing evidence with a synchronization claim", async () => {
  vi.mocked(invoke).mockResolvedValueOnce(null);
  await expect(
    composition.learnerScoreSyncStatusService.getStatus("assignment-1", "item-1", "learner-1"),
  ).resolves.toBeNull();
});

it("propagates denied access through the composed service", async () => {
  vi.mocked(invoke).mockRejectedValueOnce("unauthorized");
  await expect(
    composition.learnerScoreSyncStatusService.getStatus("assignment-1", "item-1", "learner-1"),
  ).rejects.toBe("unauthorized");
});
