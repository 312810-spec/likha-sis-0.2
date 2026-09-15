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

const learner = {
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

function fakeService(): SubjectAttendanceApplicationService {
  return {
    listMyAssignments: vi.fn().mockResolvedValue([assignment]),
    listSessions: vi.fn().mockResolvedValue([]),
    monitor: vi.fn().mockResolvedValue({ heldSessionCount: 11, rows: [learner] }),
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

  it("opens assignment-scoped learners without losing the class journey", async () => {
    const user = userEvent.setup();
    const service = fakeService();

    render(
      <ModeProvider>
        <SubjectAttendanceJourneyScreen
          subjectAttendanceService={service}
          teacherUserId="teacher-1"
          initialAssignmentId="ta-1"
          classContext={context}
          onBackToClass={vi.fn()}
        />
      </ModeProvider>,
    );

    await user.click(await screen.findByRole("button", { name: "View Mathematics learners" }));

    expect(await screen.findByText("Santos, Maya")).toBeInTheDocument();
    expect(service.monitor).toHaveBeenCalledWith("ta-1", expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/));
    expect(screen.getByRole("button", { name: "Back to Mathematics — Mabini" })).toBeInTheDocument();
  });

  it("does not offer class return or learner access when the preserved context differs", async () => {
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
    expect(
      screen.queryByRole("button", { name: "View Mathematics learners" }),
    ).not.toBeInTheDocument();
  });
});
