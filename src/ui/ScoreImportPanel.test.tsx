import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { LearnerScoreApplicationService } from "../application/learner-score-service";
import { ScoreImportPanel } from "./ScoreImportPanel";

describe("ScoreImportPanel", () => {
  it("requires an unchanged preview and reason before saving, then refreshes the roster", async () => {
    const user = userEvent.setup();
    const commitImport = vi.fn().mockResolvedValue(1);
    const previewImport = vi
      .fn()
      .mockResolvedValue({
        rows: [{ learnerId: "learner-1", status: "scored", score: 0 }],
        issues: [],
        snapshot: "snapshot-1",
        contentHash: "hash-1",
        alreadyImported: false,
      });
    const service = {
      previewImport,
      commitImport,
      history: vi.fn().mockResolvedValue([]),
    } as unknown as LearnerScoreApplicationService;
    const refreshed = vi.fn();
    render(
      <ScoreImportPanel
        service={service}
        itemId="item-1"
        roster={[
          {
            learnerId: "learner-1",
            familyName: "Cruz",
            givenName: "Ana",
            status: null,
            score: null,
            updatedAt: null,
          },
        ]}
        onImported={refreshed}
      />,
    );
    await user.click(screen.getByText("Import scores and view correction history"));
    await user.type(
      screen.getByLabelText("Score rows"),
      "learner_id,status,score\nlearner-1,scored,0",
    );
    await user.click(screen.getByRole("button", { name: "Preview scores" }));
    expect(commitImport).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Save reviewed scores" })).toBeDisabled();
    await user.type(
      screen.getByLabelText("Reason for this import"),
      "Recorded zero from checked quiz",
    );
    await user.click(screen.getByRole("button", { name: "Save reviewed scores" }));
    expect(commitImport).toHaveBeenCalledWith(
      "item-1",
      "learner_id,status,score\nlearner-1,scored,0",
      "snapshot-1",
      "Recorded zero from checked quiz",
    );
    expect(refreshed).toHaveBeenCalledOnce();
    expect(screen.getByRole("status")).toHaveTextContent("1 scores saved on this device.");
  });

  it("invalidates the reviewed proposal when CSV changes", async () => {
    const user = userEvent.setup();
    const service = {
      previewImport: vi
        .fn()
        .mockResolvedValue({
          rows: [],
          issues: [],
          snapshot: "old",
          contentHash: "hash",
          alreadyImported: false,
        }),
      commitImport: vi.fn(),
      history: vi.fn(),
    } as unknown as LearnerScoreApplicationService;
    render(<ScoreImportPanel service={service} itemId="item-1" roster={[]} onImported={vi.fn()} />);
    await user.click(screen.getByText("Import scores and view correction history"));
    await user.type(screen.getByLabelText("Score rows"), "learner_id,status,score");
    await user.click(screen.getByRole("button", { name: "Preview scores" }));
    expect(screen.getByRole("button", { name: "Save reviewed scores" })).toBeInTheDocument();
    await user.type(screen.getByLabelText("Score rows"), "\nchanged");
    expect(screen.queryByRole("button", { name: "Save reviewed scores" })).not.toBeInTheDocument();
  });
});
