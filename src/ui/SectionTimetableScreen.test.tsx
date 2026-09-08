import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import type { TeachingAssignmentDetail } from "../domain/teaching-assignment";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SectionTimetableScreen } from "./SectionTimetableScreen";

const ASSIGNMENTS: TeachingAssignmentDetail[] = [
  {
    id: "ta-1",
    teacherUserId: "teacher-1",
    sectionId: "section-1",
    sectionName: "Grade 7 - Faith",
    schoolYear: "2026-2027",
    subjectId: "subject-1",
    subjectName: "Mathematics",
  },
  {
    id: "ta-2",
    teacherUserId: "teacher-2",
    sectionId: "section-1",
    sectionName: "Grade 7 - Faith",
    schoolYear: "2026-2027",
    subjectId: "subject-2",
    subjectName: "Science",
  },
];

class FakeRepo implements TeachingAssignmentRepository {
  meetings: ScheduleMeeting[] = [];
  nextId = 1;

  async listMine() {
    return [];
  }
  async listMeetings(teachingAssignmentId: string) {
    return this.meetings.filter((m) => m.teachingAssignmentId === teachingAssignmentId);
  }
  async listBySection() {
    return ASSIGNMENTS;
  }
  async create() {
    return null;
  }
  async remove() {
    return false;
  }
  async createMeeting(
    teachingAssignmentId: string,
    weekday: number,
    startsAt: string,
    endsAt: string,
    room: string | null,
  ): Promise<CreateMeetingOutcome> {
    const candidate = { teachingAssignmentId, weekday, startsAt, endsAt };
    const conflict = this.meetings.find((m) => {
      if (m.weekday !== weekday) return false;
      return m.startsAt < candidate.endsAt && startsAt < m.endsAt;
    });
    if (conflict) {
      const conflictingAssignment = ASSIGNMENTS.find((a) => a.id === conflict.teachingAssignmentId);
      const thisAssignment = ASSIGNMENTS.find((a) => a.id === teachingAssignmentId);
      if (conflictingAssignment?.teacherUserId === thisAssignment?.teacherUserId) {
        return { outcome: "teacherConflict" };
      }
      return { outcome: "sectionConflict" };
    }
    const created: ScheduleMeeting = {
      id: `meeting-${this.nextId++}`,
      teachingAssignmentId,
      weekday,
      startsAt,
      endsAt,
      room,
    };
    this.meetings.push(created);
    return { outcome: "created", meeting: created };
  }
  async removeMeeting(id: string) {
    const before = this.meetings.length;
    this.meetings = this.meetings.filter((m) => m.id !== id);
    return this.meetings.length < before;
  }
  async getLoad() {
    return { assignmentCount: 0, distinctSubjectCount: 0, weeklyInstructionalMinutes: 0 };
  }
}

function renderScreen(repo = new FakeRepo()) {
  const service = new TeachingAssignmentApplicationService(repo);
  return {
    repo,
    ...render(
      <ModeProvider>
        <SectionTimetableScreen
          teachingAssignmentService={service}
          sectionId="section-1"
          sectionName="Grade 7 - Faith"
          onBack={vi.fn()}
        />
      </ModeProvider>,
    ),
  };
}

describe("SectionTimetableScreen", () => {
  it("renders the weekly grid with every teaching assignment listed for placement", async () => {
    renderScreen();
    await waitFor(() => expect(screen.getByText("Mathematics")).toBeInTheDocument());
    expect(screen.getByText("Science")).toBeInTheDocument();
    expect(screen.getByRole("table", { name: /weekly timetable grid/i })).toBeInTheDocument();
  });

  it("places an armed class onto an open grid cell", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    await waitFor(() => expect(screen.getByText("Mathematics")).toBeInTheDocument());

    const placeButtons = screen.getAllByRole("button", { name: "Place on grid" });
    await user.click(placeButtons[0]!);

    const cell = screen.getByRole("button", { name: /Place armed class on Monday at 7:00/i });
    await user.click(cell);

    await waitFor(() => expect(repo.meetings).toHaveLength(1));
    expect(screen.getByText("Class placed on the timetable.")).toBeInTheDocument();
  });

  it("shows a conflict warning on a cell whose time overlaps an existing meeting in a different hour cell", async () => {
    const user = userEvent.setup();
    const repo = new FakeRepo();
    // A 90-minute meeting starting at 07:00 spills into the 08:00 grid
    // cell without occupying it directly (the grid renders one meeting
    // per exact starting hour) -- the 08:00 cell must still preview a
    // conflict, since the server's own overlap rule is time-based, not
    // cell-based.
    repo.meetings.push({
      id: "meeting-existing",
      teachingAssignmentId: "ta-1",
      weekday: 1,
      startsAt: "07:00",
      endsAt: "08:30",
      room: "Room 1",
    });
    renderScreen(repo);
    await waitFor(() => expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0));

    // Arm the SAME assignment (ta-1) again.
    const placeButtons = screen.getAllByRole("button", { name: "Place on grid" });
    await user.click(placeButtons[0]!);

    expect(
      screen.getByRole("button", { name: /Place armed class on Monday at 8:00.*conflict/i }),
    ).toBeInTheDocument();
  });

  it("removes a placed class from the grid", async () => {
    const user = userEvent.setup();
    const repo = new FakeRepo();
    repo.meetings.push({
      id: "meeting-existing",
      teachingAssignmentId: "ta-1",
      weekday: 1,
      startsAt: "07:00",
      endsAt: "08:00",
      room: "Room 1",
    });
    renderScreen(repo);
    await waitFor(() => expect(screen.getAllByText("Mathematics").length).toBeGreaterThan(0));

    await user.click(screen.getByRole("button", { name: /Remove Mathematics from Monday/i }));

    await waitFor(() => expect(repo.meetings).toHaveLength(0));
    expect(screen.getByText("Class removed from the timetable.")).toBeInTheDocument();
  });

  it("has no axe violations once loaded", async () => {
    const { container } = renderScreen();
    await waitFor(() => expect(screen.getByText("Mathematics")).toBeInTheDocument());
    await expectNoAccessibilityViolations(container);
  });
});
