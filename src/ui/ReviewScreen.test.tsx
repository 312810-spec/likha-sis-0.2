import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MyDayApplicationService } from "../application/my-day-service";
import type { MyDaySummary } from "../domain/my-day";
import { ReviewScreen } from "./ReviewScreen";
import { expectNoAccessibilityViolations } from "../test/a11y";
const empty: MyDaySummary = {
  schedule: [],
  next: null,
  pendingAttendance: [],
  pendingScoring: [],
  pendingFollowups: [],
  pendingConflicts: [],
  pendingAssignments: [],
  hasAnyAssignments: true,
};
function props(service: MyDayApplicationService) {
  return {
    myDayService: service,
    onOpenAttendance: vi.fn(),
    onOpenClassRecord: vi.fn(),
    onOpenFollowup: vi.fn(),
    onOpenConflicts: vi.fn(),
    onOpenTeachingLoad: vi.fn(),
    onOpenForms: vi.fn(),
  };
}
describe("Review source projection", () => {
  it("routes an incomplete score to the exact record and preserves class context", async () => {
    const row = {
      teachingAssignmentId: "ta",
      classRecordId: "record-2",
      subjectName: "Math",
      sectionName: "Kindness",
      gradingPeriodLabel: "Quarter 2",
      recordedCount: 1,
      totalCount: 4,
    };
    const p = props(
      new MyDayApplicationService({
        getSummary: async () => ({ ...empty, pendingScoring: [row] }),
      }),
    );
    const { container } = render(<ReviewScreen {...p} />);
    await userEvent
      .setup()
      .click(await screen.findByRole("button", { name: "Review this record" }));
    expect(p.onOpenClassRecord).toHaveBeenCalledWith("ta", "record-2", row);
    expect(screen.getByText(/1 of 4 scores recorded/)).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);
  });
  it("shows a failed read as unavailable, retries, and qualifies the zero state", async () => {
    const getSummary = vi
      .fn()
      .mockRejectedValueOnce(new Error("read failed"))
      .mockResolvedValue(empty);
    const p = props(new MyDayApplicationService({ getSummary }));
    render(<ReviewScreen {...p} />);
    await screen.findByRole("alert");
    expect(screen.queryByText("No pending items in these checks")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Retry review" }));
    await screen.findByText("No pending items in these checks");
    expect(
      screen.getByText(/does not verify all school reporting requirements/),
    ).toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Open School Forms" }));
    expect(p.onOpenForms).toHaveBeenCalledOnce();
  });
});
