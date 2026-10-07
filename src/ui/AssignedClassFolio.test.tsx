import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { AssignedClassFolio } from "./AssignedClassFolio";
import { ModeProvider } from "./theme/ModeContext";

const ASSIGNMENTS: TeachingAssignmentSummary[] = [
  {
    id: "ta-1",
    sectionId: "sec-1",
    sectionName: "Kindness",
    schoolYear: "2026–2027",
    subjectId: "math",
    subjectName: "Mathematics 10",
  },
  {
    id: "ta-2",
    sectionId: "sec-2",
    sectionName: "Compassion",
    schoolYear: "2026–2027",
    subjectId: "math",
    subjectName: "Mathematics 10",
  },
];

function setup(
  listMyAssignments = vi.fn().mockResolvedValue(ASSIGNMENTS),
  monitor = vi.fn().mockResolvedValue({ heldSessionCount: 0, rows: [] }),
  listMeetings = vi.fn().mockResolvedValue([]),
) {
  const callbacks = {
    onCheckAttendance: vi.fn(),
    onOpenClassRecord: vi.fn(),
    onOpenAdvisory: vi.fn(),
    onOpenForms: vi.fn(),
  };
  const service = {
    listMyAssignments,
    monitor,
    listMeetings,
  } as unknown as SubjectAttendanceApplicationService;
  const view = (teacherUserId = "teacher-1") => (
    <ModeProvider>
      <AssignedClassFolio
        teacherUserId={teacherUserId}
        subjectAttendanceService={service}
        {...callbacks}
      />
    </ModeProvider>
  );
  return { ...render(view()), view, listMyAssignments, ...callbacks };
}

describe("AssignedClassFolio", () => {
  it("lists assigned classes beyond today's schedule and carries selected context into attendance", async () => {
    const user = userEvent.setup();
    const result = setup();
    await user.click(await screen.findByRole("button", { name: "Mathematics 10 · Compassion" }));
    expect(screen.getByRole("heading", { name: "Compassion" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "Selected class: Mathematics 10, Compassion.",
    );
    expect(screen.getByRole("button", { name: "Mathematics 10 · Kindness" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    await user.click(screen.getByRole("button", { name: "Check attendance" }));
    expect(result.listMyAssignments).toHaveBeenCalledWith("teacher-1");
    expect(result.onCheckAttendance).toHaveBeenCalledWith({
      teachingAssignmentId: "ta-2",
      subjectName: "Mathematics 10",
      sectionName: "Compassion",
    });
  });

  it("supports keyboard tabs and keeps advisory forms separate from selected subject context", async () => {
    const user = userEvent.setup();
    const result = setup();
    const overview = await screen.findByRole("tab", { name: "Overview" });
    overview.focus();
    await user.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Forms" })).toHaveFocus();
    expect(screen.getByRole("tab", { name: "Forms" })).toHaveAttribute("aria-selected", "true");
    await user.click(screen.getByRole("button", { name: "Open My Advisory" }));
    expect(result.onOpenAdvisory).toHaveBeenCalledWith();
    await user.click(screen.getByRole("button", { name: "Review grades" }));
    await user.click(screen.getByRole("button", { name: "Open class record" }));
    expect(result.onOpenClassRecord).toHaveBeenCalledWith({
      teachingAssignmentId: "ta-1",
      subjectName: "Mathematics 10",
      sectionName: "Kindness",
    });
  });

  it("recovers from unavailable assignment loading without fake content", async () => {
    const user = userEvent.setup();
    setup(vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce([]));
    await screen.findByText("Could not load your classes.");
    expect(screen.queryByRole("tab")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("No teaching assignments yet.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Check attendance" })).not.toBeInTheDocument();
  });

  it("hides the previous user's assignments and ignores late responses after an identity change", async () => {
    let finishOld!: (value: TeachingAssignmentSummary[]) => void;
    const list = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<TeachingAssignmentSummary[]>((resolve) => {
            finishOld = resolve;
          }),
      )
      .mockResolvedValueOnce([]);
    const result = setup(list);
    result.rerender(result.view("teacher-2"));
    await screen.findByText("No teaching assignments yet.");
    finishOld(ASSIGNMENTS);
    await Promise.resolve();
    expect(
      screen.queryByRole("button", { name: "Mathematics 10 · Kindness" }),
    ).not.toBeInTheDocument();
  });

  it("ignores the previous class's late roster after selecting another assignment", async () => {
    let resolveFirst!: (value: { heldSessionCount: number; rows: [] }) => void;
    const monitor = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          }),
      )
      .mockResolvedValueOnce({ heldSessionCount: 0, rows: [] });
    const user = userEvent.setup();
    setup(vi.fn().mockResolvedValue(ASSIGNMENTS), monitor);
    await user.click(await screen.findByRole("button", { name: "Mathematics 10 · Compassion" }));
    await screen.findByText("No learners are currently in this class roster.");
    await act(async () => {
      resolveFirst({ heldSessionCount: 0, rows: [] });
    });
    expect(screen.getByRole("heading", { name: "Compassion" })).toBeInTheDocument();
    expect(monitor.mock.calls.map((call) => call[0])).toEqual(["ta-1", "ta-2"]);
  });

  it("validates an external selected context against current authorized assignments", async () => {
    const callbacks = {
      onCheckAttendance: vi.fn(),
      onOpenClassRecord: vi.fn(),
      onOpenAdvisory: vi.fn(),
      onOpenForms: vi.fn(),
      onSelectClass: vi.fn(),
    };
    const service = {
      listMyAssignments: vi.fn().mockResolvedValue(ASSIGNMENTS),
      monitor: vi.fn().mockResolvedValue(null),
      listMeetings: vi.fn().mockResolvedValue([]),
    } as unknown as SubjectAttendanceApplicationService;
    render(
      <ModeProvider>
        <AssignedClassFolio
          teacherUserId="teacher-1"
          subjectAttendanceService={service}
          selectedClassContext={{
            teachingAssignmentId: "not-authorized",
            subjectName: "Untrusted",
            sectionName: "Untrusted",
          }}
          {...callbacks}
        />
      </ModeProvider>,
    );
    await screen.findByRole("heading", { name: "Kindness" });
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Mathematics 10 · Compassion" }));
    expect(callbacks.onSelectClass).toHaveBeenCalledWith({
      teachingAssignmentId: "ta-2",
      subjectName: "Mathematics 10",
      sectionName: "Compassion",
    });
    await user.click(screen.getByRole("button", { name: "Check attendance" }));
    expect(callbacks.onCheckAttendance).toHaveBeenCalledWith({
      teachingAssignmentId: "ta-1",
      subjectName: "Mathematics 10",
      sectionName: "Kindness",
    });
  });

  it("surfaces schedule, attention, and attendance insight from real read models", async () => {
    const monitor = vi.fn().mockResolvedValue({
      heldSessionCount: 4,
      rows: [
        {
          membershipId: "m1",
          learnerId: "l1",
          givenName: "Ana",
          familyName: "Cruz",
          presentCount: 3,
          absentCount: 1,
          lateCount: 0,
          excusedCount: 0,
          currentConsecutiveAbsences: 1,
        },
      ],
    });
    const listMeetings = vi.fn().mockResolvedValue([
      {
        id: "meeting-1",
        teachingAssignmentId: "ta-1",
        weekday: 1,
        startsAt: "08:00",
        endsAt: "09:00",
        room: "Room 10",
      },
    ]);

    setup(vi.fn().mockResolvedValue(ASSIGNMENTS), monitor, listMeetings);

    expect(await screen.findByText(/1 learner with an active absence streak/)).toBeInTheDocument();
    expect(screen.getByText(/4 held sessions · 1 learner/)).toBeInTheDocument();
    const snapshot = screen.getByRole("figure", { name: /Attendance snapshot/ });
    expect(within(snapshot).getByText("Present")).toBeInTheDocument();
    expect(within(snapshot).getByText("Absent")).toBeInTheDocument();
    expect(listMeetings).toHaveBeenCalledWith("ta-1");
  });

  it("has accessible class selection, tabs, and connected actions", async () => {
    const { container } = setup();
    await screen.findByRole("tab", { name: "Overview" });
    await expectNoAccessibilityViolations(container);
  });
});

it("preserves a score draft across worksheet tabs and returns to Overview locally", async () => {
  const user = userEvent.setup();
  const service = {
    listMyAssignments: vi.fn().mockResolvedValue(ASSIGNMENTS),
    monitor: vi.fn().mockResolvedValue({ heldSessionCount: 0, rows: [] }),
    listMeetings: vi.fn().mockResolvedValue([]),
  } as unknown as SubjectAttendanceApplicationService;
  render(
    <ModeProvider>
      <AssignedClassFolio
        teacherUserId="teacher"
        subjectAttendanceService={service}
        onCheckAttendance={vi.fn()}
        onOpenClassRecord={vi.fn()}
        onOpenAdvisory={vi.fn()}
        onOpenForms={vi.fn()}
        renderScores={(_context, back) => (
          <>
            <input aria-label="Score draft" />
            <button type="button" onClick={back}>
              Return to worksheet
            </button>
          </>
        )}
      />
    </ModeProvider>,
  );
  await screen.findByRole("heading", { name: "Kindness" });
  await user.click(screen.getByRole("tab", { name: "Scores" }));
  await user.type(screen.getByLabelText("Score draft"), "18");
  await user.click(screen.getByRole("tab", { name: "Forms" }));
  expect(screen.getByLabelText("Score draft")).not.toBeVisible();
  await user.click(screen.getByRole("tab", { name: "Scores" }));
  expect(screen.getByLabelText("Score draft")).toHaveValue("18");
  await user.click(screen.getByRole("button", { name: "Return to worksheet" }));
  expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
});
