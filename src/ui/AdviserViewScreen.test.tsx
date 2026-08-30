import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type { Section } from "../domain/section";
import type { AdviserAttendanceOverview } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { AdviserViewScreen } from "./AdviserViewScreen";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "school-1",
  schoolYear: "2026-2027",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const OVERVIEW: AdviserAttendanceOverview = {
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  asOfDate: "2026-08-29",
  subjectCount: 2,
  heldSessionCount: 5,
  rows: [
    {
      membershipId: "mem-1",
      learnerId: "learner-1",
      givenName: "Ana",
      familyName: "Cruz",
      presentCount: 3,
      absentCount: 1,
      lateCount: 1,
      excusedCount: 0,
      subjectsWithAbsences: ["Mathematics"],
      highestCurrentSubjectAbsenceStreak: 1,
    },
  ],
};

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  sectionDates: string[] = [];
  overviewCalls: Array<[string, string]> = [];

  constructor(
    private sections: Section[] = [SECTION],
    private overview: AdviserAttendanceOverview | null = OVERVIEW,
  ) {}

  async openSession() {
    return null;
  }
  async markNoClass() {
    return null;
  }
  async recordEntry() {
    return { kind: "sessionNotFound" as const };
  }
  async markAllPresent() {
    return null;
  }
  async rosterForSession() {
    return null;
  }
  async listSessions() {
    return [];
  }
  async monitor() {
    return null;
  }
  async listAdviserViewSections(asOfDate: string) {
    this.sectionDates.push(asOfDate);
    return this.sections;
  }
  async adviserOverview(sectionId: string, asOfDate: string) {
    this.overviewCalls.push([sectionId, asOfDate]);
    return this.overview;
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine() {
    return [];
  }
  async listMeetings() {
    return [];
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
  async createMeeting(): Promise<CreateMeetingOutcome> {
    return { outcome: "unknownAssignment" };
  }
  async removeMeeting() {
    return false;
  }
  async getLoad() {
    return { assignmentCount: 0, distinctSubjectCount: 0, weeklyInstructionalMinutes: 0 };
  }
}

function renderScreen(repository = new FakeSubjectAttendanceRepository()) {
  const service = new SubjectAttendanceApplicationService(
    repository,
    new FakeTeachingAssignmentRepository(),
  );
  const result = render(
    <ModeProvider>
      <AdviserViewScreen subjectAttendanceService={service} />
    </ModeProvider>,
  );
  return { ...result, repository };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 29, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("AdviserViewScreen", () => {
  it("shows only read-only signals and the Subject Attendance boundary", async () => {
    renderScreen();

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("Subject attendance — not SF2.")).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|save|convert/i })).not.toBeInTheDocument();
  });

  it("shows a calm empty state when no advisory section is active", async () => {
    renderScreen(new FakeSubjectAttendanceRepository([], null));

    expect(
      await screen.findByText(/No advisory section is assigned to you for this date/),
    ).toBeInTheDocument();
  });

  it("reloads authorized sections and the overview when the date changes", async () => {
    const user = userEvent.setup();
    const { repository } = renderScreen();
    await screen.findByText("Ana Cruz");

    await user.clear(screen.getByLabelText("As of"));
    await user.type(screen.getByLabelText("As of"), "2026-08-20");

    expect(repository.sectionDates).toContain("2026-08-20");
    expect(repository.overviewCalls).toContainEqual(["sec-1", "2026-08-20"]);
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });
});
