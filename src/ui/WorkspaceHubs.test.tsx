import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import { CalendarScreen, MoreScreen, SchoolFormsScreen } from "./WorkspaceHubs";
const assignment = {
  id: "a1",
  sectionId: "s1",
  sectionName: "Kindness",
  subjectId: "math",
  subjectName: "Mathematics",
  schoolYear: "2026-2027",
};
const meeting = {
  id: "m1",
  teachingAssignmentId: "a1",
  weekday: 1,
  startsAt: "08:00",
  endsAt: "09:00",
  room: "Room 3",
};
it("opens the selected date's authorized scheduled class with its context", async () => {
  const user = userEvent.setup();
  const open = vi.fn();
  const list = vi.fn().mockResolvedValue([assignment]);
  const service = {
    listMyAssignments: list,
    listMeetings: vi.fn().mockResolvedValue([meeting]),
  } as unknown as SubjectAttendanceApplicationService;
  render(
    <CalendarScreen
      subjectAttendanceService={service}
      teacherUserId="teacher"
      onOpenClass={open}
    />,
  );
  fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-10-05" } });
  await user.click(await screen.findByRole("button", { name: "Open class workspace" }));
  expect(list).toHaveBeenCalledWith("teacher");
  expect(open).toHaveBeenCalledWith({
    teachingAssignmentId: "a1",
    sectionName: "Kindness",
    subjectName: "Mathematics",
    startsAt: "08:00",
    endsAt: "09:00",
    room: "Room 3",
    scheduleDate: "2026-10-05",
  });
  await user.click(screen.getByRole("button", { name: "Next day" }));
  expect(await screen.findByText(/No scheduled classes for this day/)).toBeInTheDocument();
});
describe("Calendar recovery", () => {
  it("never keeps prior actor's classes after authorization changes", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce([assignment])
      .mockRejectedValueOnce(new Error("Denied"))
      .mockResolvedValueOnce([]);
    const service = {
      listMyAssignments: list,
      listMeetings: vi.fn().mockResolvedValue([meeting]),
    } as unknown as SubjectAttendanceApplicationService;
    const props = {
      subjectAttendanceService: service,
      teacherUserId: "first",
      onOpenClass: vi.fn(),
    };
    const view = render(<CalendarScreen {...props} />);
    await waitFor(() => expect(service.listMeetings).toHaveBeenCalled());
    view.rerender(<CalendarScreen {...props} teacherUserId="second" />);
    expect(await screen.findByText(/Could not load your class schedule/)).toBeInTheDocument();
    expect(screen.queryByText("Mathematics")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry schedule" }));
    expect(await screen.findByText(/No scheduled classes for this day/)).toBeInTheDocument();
    expect(list).toHaveBeenLastCalledWith("second");
  });
});

it("keeps ordinary teacher tasks and own device access while hiding admin setup", () => {
  render(<MoreScreen roles={["teacher"]} onNavigate={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Learners" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Import Learners (SF1)" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset a Password" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Devices" })).toBeInTheDocument();
});
it("gives registrars learner import but no school-head administration", () => {
  render(<MoreScreen roles={["registrar"]} onNavigate={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Learners" })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Reset a Password" })).not.toBeInTheDocument();
});
it("does not offer schoolwide import as a teacher's forms action", () => {
  render(<SchoolFormsScreen roles={["teacher"]} onNavigate={vi.fn()} />);
  expect(screen.queryByRole("button", { name: "Import learners" })).not.toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Open Class Record" })).toBeInTheDocument();
});
