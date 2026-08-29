import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TeachingAssignmentApplicationService } from "../application/teaching-assignment-service";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { ScheduleMeetingsScreen } from "./ScheduleMeetingsScreen";

const MEETING: ScheduleMeeting = {
  id: "meeting-1",
  teachingAssignmentId: "ta-1",
  weekday: 1,
  startsAt: "08:00",
  endsAt: "08:50",
  room: "Room 3",
};

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  meetings: ScheduleMeeting[];
  createOutcome: CreateMeetingOutcome | "auto" = "auto";
  nextId = 2;

  constructor(meetings: ScheduleMeeting[] = []) {
    this.meetings = meetings;
  }

  async listMine() {
    return [];
  }
  async listMeetings(teachingAssignmentId: string) {
    return this.meetings.filter((m) => m.teachingAssignmentId === teachingAssignmentId);
  }
  async listBySection() {
    return [];
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
    if (this.createOutcome !== "auto") return this.createOutcome;
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
}

function renderScreen(options: { meetings?: ScheduleMeeting[]; onBack?: () => void } = {}) {
  const repo = new FakeTeachingAssignmentRepository(options.meetings ?? []);
  const service = new TeachingAssignmentApplicationService(repo);
  const result = render(
    <ModeProvider>
      <ScheduleMeetingsScreen
        teachingAssignmentService={service}
        teachingAssignmentId="ta-1"
        subjectName="Mathematics"
        sectionName="Mabini"
        onBack={options.onBack ?? (() => {})}
      />
    </ModeProvider>,
  );
  return { ...result, repo };
}

describe("ScheduleMeetingsScreen", () => {
  it("shows an empty state when no meetings are scheduled yet", async () => {
    renderScreen();

    expect(
      await screen.findByText("No meetings scheduled for this class yet."),
    ).toBeInTheDocument();
  });

  it("lists an existing meeting with its weekday label", async () => {
    renderScreen({ meetings: [MEETING] });

    expect(await screen.findByRole("rowheader", { name: "Monday" })).toBeInTheDocument();
    expect(screen.getByText("08:00–08:50")).toBeInTheDocument();
    expect(screen.getByText("Room 3")).toBeInTheDocument();
  });

  it("schedules a new meeting", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("combobox", { name: "Day" });

    await user.selectOptions(screen.getByRole("combobox", { name: "Day" }), "1");
    await user.type(screen.getByLabelText("Start time"), "08:00");
    await user.type(screen.getByLabelText("End time"), "08:50");
    await user.click(screen.getByRole("button", { name: "Schedule meeting" }));

    expect(await screen.findByText("Meeting scheduled.")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("rowheader", { name: "Monday" })).toBeInTheDocument(),
    );
  });

  it("shows a specific message for a teacher conflict", async () => {
    const user = userEvent.setup();
    const { repo } = renderScreen();
    repo.createOutcome = { outcome: "teacherConflict" };
    await screen.findByRole("combobox", { name: "Day" });

    await user.type(screen.getByLabelText("Start time"), "08:00");
    await user.type(screen.getByLabelText("End time"), "08:50");
    await user.click(screen.getByRole("button", { name: "Schedule meeting" }));

    expect(
      await screen.findByText("This teacher already has another class scheduled at this time."),
    ).toBeInTheDocument();
  });

  it("removes a meeting", async () => {
    const user = userEvent.setup();
    renderScreen({ meetings: [MEETING] });
    await screen.findByRole("rowheader", { name: "Monday" });

    await user.click(screen.getByRole("button", { name: "Remove the Monday 08:00 meeting" }));

    await waitFor(() =>
      expect(screen.getByText("No meetings scheduled for this class yet.")).toBeInTheDocument(),
    );
  });

  it("calls onBack when Back to teaching assignments is selected", async () => {
    const user = userEvent.setup();
    const onBack = vi.fn();
    renderScreen({ onBack });
    await screen.findByText("No meetings scheduled for this class yet.");

    await user.click(screen.getByRole("button", { name: "Back to teaching assignments" }));

    expect(onBack).toHaveBeenCalled();
  });

  it("has no detectable accessibility violations with a meeting listed", async () => {
    const { container } = renderScreen({ meetings: [MEETING] });
    await screen.findByRole("rowheader", { name: "Monday" });

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the empty state", async () => {
    const { container } = renderScreen();
    await screen.findByText("No meetings scheduled for this class yet.");

    await expectNoAccessibilityViolations(container);
  });
});
