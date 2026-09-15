import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ClassLearnersPanel } from "./ClassLearnersPanel";
import { ModeProvider } from "./theme/ModeContext";

const row = {
  membershipId: "m-1",
  learnerId: "l-1",
  givenName: "Maya",
  familyName: "Santos",
  presentCount: 8,
  absentCount: 1,
  lateCount: 2,
  excusedCount: 0,
  currentConsecutiveAbsences: 1,
};

function serviceWith(result: unknown): SubjectAttendanceApplicationService {
  return {
    monitor: vi.fn().mockResolvedValue(result),
  } as unknown as SubjectAttendanceApplicationService;
}

function renderPanel(service = serviceWith({ heldSessionCount: 11, rows: [row] })) {
  const rendered = render(
    <ModeProvider>
      <ClassLearnersPanel subjectAttendanceService={service} teachingAssignmentId="ta-1" />
    </ModeProvider>,
  );
  return { ...rendered, service };
}

describe("ClassLearnersPanel", () => {
  it("loads learners through the assignment-scoped monitor", async () => {
    const { service } = renderPanel();

    expect(await screen.findByText("Santos, Maya")).toBeInTheDocument();
    expect(service.monitor).toHaveBeenCalledTimes(1);
    expect(service.monitor).toHaveBeenCalledWith(
      "ta-1",
      expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    );
  });

  it("opens class-relevant learner details and returns to the same roster", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(await screen.findByRole("button", { name: "Open learner" }));

    expect(screen.getByRole("heading", { name: "Maya Santos" })).toBeInTheDocument();
    expect(screen.getByText("Current consecutive absences")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back to learners" }));
    expect(screen.getByText("Santos, Maya")).toBeInTheDocument();
  });

  it("shows the class-roster empty state", async () => {
    renderPanel(serviceWith({ heldSessionCount: 0, rows: [] }));
    expect(
      await screen.findByText("No learners are currently in this class roster."),
    ).toBeInTheDocument();
  });

  it("shows a retryable error when the authorized roster read fails", async () => {
    const service = {
      monitor: vi.fn().mockRejectedValue(new Error("boom")),
    } as unknown as SubjectAttendanceApplicationService;
    const user = userEvent.setup();
    renderPanel(service);

    expect(await screen.findByText("Could not load this class's learners.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(service.monitor).toHaveBeenCalledTimes(2);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderPanel();
    await screen.findByText("Santos, Maya");
    await expectNoAccessibilityViolations(container);
  });
});
