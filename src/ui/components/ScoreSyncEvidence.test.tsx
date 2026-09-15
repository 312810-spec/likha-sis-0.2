import { act, render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { LearnerScoreSyncStatusApplicationService } from "../../application/learner-score-sync-status-service";
import type { LearnerScoreSyncStatus } from "../../domain/learner-score-sync-status";
import { ScoreSyncEvidence } from "./ScoreSyncEvidence";

const context = { teachingAssignmentId: "ta-1", assessmentItemId: "ai-1", learnerId: "l-1" };

it.each([
  ["synced", "Synced"],
  ["waitingToSync", "Waiting to sync"],
  ["needsReview", "Needs review"],
  ["notYetSynced", "Not yet synced"],
] as const)("renders only persisted %s evidence", async (status, label) => {
  const getStatus = vi.fn().mockResolvedValue(status);
  render(
    <ScoreSyncEvidence
      {...context}
      service={new LearnerScoreSyncStatusApplicationService({ getStatus })}
    />,
  );
  expect(await screen.findByText(`Last sync check: ${label}`)).toBeInTheDocument();
  expect(getStatus).toHaveBeenCalledExactlyOnceWith("ta-1", "ai-1", "l-1");
});

it.each([null, "unauthorized"])("does not invent evidence for %s", async (result) => {
  const getStatus =
    result === null ? vi.fn().mockResolvedValue(null) : vi.fn().mockRejectedValue(result);
  render(
    <ScoreSyncEvidence
      {...context}
      service={new LearnerScoreSyncStatusApplicationService({ getStatus })}
    />,
  );
  await act(async () => {});
  expect(screen.queryByText(/Last sync check:/)).not.toBeInTheDocument();
});

it("discards a late response after the saved-row instance is replaced", async () => {
  let resolve!: (status: LearnerScoreSyncStatus) => void;
  const getStatus = vi
    .fn()
    .mockImplementationOnce(
      () =>
        new Promise<LearnerScoreSyncStatus>((r) => {
          resolve = r;
        }),
    )
    .mockResolvedValueOnce("waitingToSync");
  const service = new LearnerScoreSyncStatusApplicationService({ getStatus });
  const { rerender } = render(<ScoreSyncEvidence key="old" {...context} service={service} />);
  rerender(<ScoreSyncEvidence key="new" {...context} assessmentItemId="ai-2" service={service} />);
  expect(await screen.findByText("Last sync check: Waiting to sync")).toBeInTheDocument();
  await act(async () => resolve("synced"));
  expect(screen.queryByText("Last sync check: Synced")).not.toBeInTheDocument();
});

it("hides the old snapshot immediately when its service is replaced", async () => {
  const first = new LearnerScoreSyncStatusApplicationService({
    getStatus: vi.fn().mockResolvedValue("synced"),
  });
  const next = new LearnerScoreSyncStatusApplicationService({
    getStatus: vi.fn().mockImplementation(() => new Promise(() => {})),
  });
  const { rerender } = render(<ScoreSyncEvidence {...context} service={first} />);
  await screen.findByText("Last sync check: Synced");
  rerender(<ScoreSyncEvidence {...context} service={next} />);
  expect(screen.queryByText(/Last sync check:/)).not.toBeInTheDocument();
});
