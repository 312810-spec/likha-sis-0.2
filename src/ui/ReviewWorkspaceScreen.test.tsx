import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ReviewWorkflowApplicationService } from "../application/review-workflow-service";
import type { ReviewPacket } from "../domain/review-workflow";
import { emptyReviewContent, indicatorDisplay } from "../domain/review-workflow";
import { ReviewWorkspaceScreen } from "./ReviewWorkspaceScreen";
const packet: ReviewPacket = {
  id: "packet",
  schoolId: "school",
  ownerUserId: "owner",
  reviewerUserId: "reviewer",
  sectionId: "section",
  revision: 3,
  status: "submitted",
  content: { ...emptyReviewContent(), title: "SF1 check" },
  contentHash: "fingerprint",
  parentPacketId: null,
  updatedAt: "2026-10-04",
};
function fixture(rows: ReviewPacket[] = [packet]) {
  const repository = {
    list: vi.fn().mockResolvedValue(rows),
    act: vi.fn().mockResolvedValue(packet),
    history: vi.fn().mockResolvedValue([]),
    exportSample: vi.fn().mockResolvedValue("{}"),
    importSample: vi.fn().mockResolvedValue(packet),
  };
  const service = new ReviewWorkflowApplicationService(repository);
  return { repository, service };
}
const sections = [
  {
    id: "section",
    schoolId: "school",
    schoolYear: "2026-2027",
    gradeLevel: "7",
    name: "Test",
    createdAt: "2026-01-01",
  },
];
describe("forms and TANAW review", () => {
  it("requires a review reason and submits the exact displayed version", async () => {
    const user = userEvent.setup();
    const { service, repository } = fixture();
    render(
      <ReviewWorkspaceScreen
        service={service}
        sections={sections}
        members={[]}
        userId="reviewer"
        isSchoolHead={false}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /SF1 check/ }));
    const approve = screen.getByRole("button", { name: "Approve school review" });
    expect(approve).toBeDisabled();
    await user.type(
      screen.getByLabelText("Reason or review note"),
      "Checked the roster and source cutoff",
    );
    await user.click(approve);
    await waitFor(() =>
      expect(repository.act).toHaveBeenCalledWith(
        expect.objectContaining({
          action: "approve",
          id: "packet",
          expectedRevision: 3,
          reason: "Checked the roster and source cutoff",
        }),
      ),
    );
  });
  it("never offers approval to the preparing teacher and preserves draft after failure", async () => {
    const user = userEvent.setup();
    const draft = { ...packet, status: "draft" as const };
    const { service, repository } = fixture([draft]);
    repository.act.mockRejectedValue(new Error("Source records changed"));
    render(
      <ReviewWorkspaceScreen
        service={service}
        sections={sections}
        members={[]}
        userId="owner"
        isSchoolHead={false}
      />,
    );
    await user.click(await screen.findByRole("button", { name: /SF1 check/ }));
    expect(screen.queryByRole("button", { name: "Approve school review" })).not.toBeInTheDocument();
    await user.clear(screen.getByLabelText("Title"));
    await user.type(screen.getByLabelText("Title"), "Still working");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    expect(await screen.findByText("Source records changed")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Still working");
  });
  it("keeps zero population missing rather than reporting zero percent", () => {
    expect(
      indicatorDisplay({
        kind: "percentage",
        name: "Participation",
        numerator: 0,
        denominator: 0,
        provenance: "Not entered",
      }),
    ).toBe("Missing population");
    expect(
      indicatorDisplay({
        kind: "percentage",
        name: "Participation",
        numerator: 0,
        denominator: 5,
        provenance: "Roster",
      }),
    ).toBe("0.00%");
  });
});
