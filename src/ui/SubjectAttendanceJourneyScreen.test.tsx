import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { ModeProvider } from "./theme/ModeContext";
import { SubjectAttendanceJourneyScreen } from "./SubjectAttendanceJourneyScreen";
import type { TeacherClassWorkContext } from "./work-context";

const assignment = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const context: TeacherClassWorkContext = {
  teachingAssignmentId: "ta-1",
  subjectName: "Mathematics",
  sectionName: "Mabini",
};

function fakeService(): SubjectAttendanceApplicationService {
  return {
    listMyAssignments: vi.fn().mockResolvedValue([assignment]),
    listSessions: vi.fn().mockResolvedValue([]),
  } as unknown as SubjectAttendanceApplicationService;
}

describe("SubjectAttendanceJourneyScreen", () => {
  it("offers a return to the class workspace when the bounded context matches", async () => {
    const user = userEvent.setup();
    const onBackToClass = vi.fn();

    render(
      <ModeProvider>
        <SubjectAttendanceJourneyScreen
          subjectAttendanceService={fakeService()}
          teacherUserId="teacher-1"
          initialAssignmentId="ta-1"
          classContext={context}
          onBackToClass={onBackToClass}
        />
      </ModeProvider>,
    );

    const button = await screen.findByRole("button", {
      name: "Back to Mathematics — Mabini",
    });
    await user.click(button);

    expect(onBackToClass).toHaveBeenCalledOnce();
  });

  it("does not offer a class return when the attendance assignment differs", async () => {
    render(
      <ModeProvider>
        <SubjectAttendanceJourneyScreen
          subjectAttendanceService={fakeService()}
          teacherUserId="teacher-1"
          initialAssignmentId="ta-other"
          classContext={context}
          onBackToClass={vi.fn()}
        />
      </ModeProvider>,
    );

    expect(
      screen.queryByRole("button", { name: "Back to Mathematics — Mabini" }),
    ).not.toBeInTheDocument();
  });
});
