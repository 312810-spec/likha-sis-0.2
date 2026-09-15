import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ClassWorkspaceScreen } from "./ClassWorkspaceScreen";

const CONTEXT = {
  teachingAssignmentId: "ta-1",
  subjectName: "Filipino",
  sectionName: "Grade 8 – Joy",
  startsAt: "09:00",
  endsAt: "09:50",
  room: "Room 8",
};

function renderScreen() {
  const onCheckAttendance = vi.fn();
  const onBackToToday = vi.fn();
  const rendered = render(
    <ModeProvider>
      <ClassWorkspaceScreen
        context={CONTEXT}
        onCheckAttendance={onCheckAttendance}
        onBackToToday={onBackToToday}
      />
    </ModeProvider>,
  );
  return { ...rendered, onCheckAttendance, onBackToToday };
}

describe("ClassWorkspaceScreen", () => {
  it("keeps the selected class and schedule visible", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "Filipino — Grade 8 – Joy" })).toBeInTheDocument();
    expect(screen.getByLabelText("Selected class schedule")).toHaveTextContent(
      "09:00–09:50 · Room 8",
    );
  });

  it("opens subject attendance for the selected teaching assignment", async () => {
    const user = userEvent.setup();
    const { onCheckAttendance } = renderScreen();
    await user.click(screen.getByRole("button", { name: "Check attendance" }));
    expect(onCheckAttendance).toHaveBeenCalledWith("ta-1");
  });

  it("returns to Today without losing control to a placeholder route", async () => {
    const user = userEvent.setup();
    const { onBackToToday } = renderScreen();
    await user.click(screen.getByRole("button", { name: "Back to Today" }));
    expect(onBackToToday).toHaveBeenCalledTimes(1);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await expectNoAccessibilityViolations(container);
  });
});
