import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MyDayApplicationService } from "../application/my-day-service";
import type { MyDayRepository } from "../domain/ports/my-day-repository";
import type { MyDaySummary } from "../domain/my-day";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { MyDayScreen } from "./MyDayScreen";

const SUMMARY: MyDaySummary = {
  schedule: [
    {
      teachingAssignmentId: "ta-1",
      subjectName: "Mathematics",
      sectionName: "Mabini",
      startsAt: "08:00",
      endsAt: "08:50",
      room: "Room 101",
    },
  ],
  pendingAttendance: [
    { teachingAssignmentId: "ta-1", subjectName: "Mathematics", sectionName: "Mabini" },
  ],
  pendingConflicts: [{ id: "c-1", entityKind: "learner" }],
};

const EMPTY_SUMMARY: MyDaySummary = {
  schedule: [],
  pendingAttendance: [],
  pendingConflicts: [],
};

class FakeMyDayRepository implements MyDayRepository {
  calls: Array<[number, string]> = [];
  constructor(private result: MyDaySummary | "reject" = SUMMARY) {}

  async getSummary(todayWeekday: number, todayDate: string): Promise<MyDaySummary> {
    this.calls.push([todayWeekday, todayDate]);
    if (this.result === "reject") {
      throw new Error("boom");
    }
    return this.result;
  }
}

function renderScreen(result: MyDaySummary | "reject" = SUMMARY) {
  const repo = new FakeMyDayRepository(result);
  const service = new MyDayApplicationService(repo);
  const onCheckAttendance = vi.fn();
  const onReviewConflicts = vi.fn();
  const rendered = render(
    <ModeProvider>
      <MyDayScreen
        myDayService={service}
        onCheckAttendance={onCheckAttendance}
        onReviewConflicts={onReviewConflicts}
      />
    </ModeProvider>,
  );
  return { ...rendered, repo, onCheckAttendance, onReviewConflicts };
}

describe("MyDayScreen", () => {
  it("shows today's schedule and pending tasks", async () => {
    renderScreen();

    expect((await screen.findAllByText(/Mathematics — Mabini/)).length).toBeGreaterThan(0);
    expect(screen.getByText("attendance not yet checked")).toBeInTheDocument();
    expect(screen.getByText(/1 sync\s*conflict/)).toBeInTheDocument();
  });

  it("shows an empty state when there is nothing scheduled or pending", async () => {
    renderScreen(EMPTY_SUMMARY);

    expect(await screen.findByText("No classes scheduled for you today.")).toBeInTheDocument();
    expect(screen.getByText(/Nothing pending/)).toBeInTheDocument();
  });

  it("calls onCheckAttendance with the assignment id when its button is clicked", async () => {
    const user = userEvent.setup();
    const { onCheckAttendance } = renderScreen();

    await user.click(await screen.findByRole("button", { name: "Check attendance" }));

    expect(onCheckAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("calls onReviewConflicts when the review-conflicts button is clicked", async () => {
    const user = userEvent.setup();
    const { onReviewConflicts } = renderScreen();

    await user.click(await screen.findByRole("button", { name: "Review conflicts" }));

    expect(onReviewConflicts).toHaveBeenCalled();
  });

  it("shows a retryable error when loading fails", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen("reject");

    expect(await screen.findByText("Could not load My Day.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(repo.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findAllByText(/Mathematics — Mabini/);

    await expectNoAccessibilityViolations(container);
  });
});
