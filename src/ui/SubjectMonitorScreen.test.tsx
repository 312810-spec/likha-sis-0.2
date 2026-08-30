import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type {
  SubjectAttendanceMonitor,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SubjectMonitorScreen } from "./SubjectMonitorScreen";

const ASSIGNMENT: TeachingAssignmentSummary = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const MONITOR: SubjectAttendanceMonitor = {
  heldSessionCount: 3,
  rows: [
    {
      membershipId: "mem-1",
      learnerId: "l-1",
      givenName: "Ana",
      familyName: "Cruz",
      presentCount: 2,
      absentCount: 1,
      lateCount: 0,
      excusedCount: 0,
      currentConsecutiveAbsences: 1,
    },
  ],
};

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  monitorCalls: Array<[string, string]> = [];

  constructor(private monitorResult: SubjectAttendanceMonitor | null = MONITOR) {}

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
  async monitor(teachingAssignmentId: string, asOfDate: string) {
    this.monitorCalls.push([teachingAssignmentId, asOfDate]);
    return this.monitorResult;
  }
  async listAdviserViewSections() {
    return [];
  }
  async adviserOverview() {
    return null;
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  constructor(private assignments: TeachingAssignmentSummary[] = [ASSIGNMENT]) {}
  async listMine(): Promise<TeachingAssignmentSummary[]> {
    return this.assignments;
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

function renderScreen(
  options: {
    assignments?: TeachingAssignmentSummary[];
    monitorResult?: SubjectAttendanceMonitor | null;
  } = {},
) {
  const subjectAttendance = new FakeSubjectAttendanceRepository(options.monitorResult ?? MONITOR);
  const teachingAssignments = new FakeTeachingAssignmentRepository(
    options.assignments ?? [ASSIGNMENT],
  );
  const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
  const result = render(
    <ModeProvider>
      <SubjectMonitorScreen subjectAttendanceService={service} teacherUserId="teacher-1" />
    </ModeProvider>,
  );
  return { ...result, subjectAttendance };
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 7, 29, 12));
});

afterEach(() => {
  vi.useRealTimers();
});

describe("SubjectMonitorScreen", () => {
  it("shows a message when the teacher has no teaching assignments", async () => {
    renderScreen({ assignments: [] });

    expect(await screen.findByText("You have no teaching assignments yet.")).toBeInTheDocument();
  });

  it("shows each learner's counts and current absence streak", async () => {
    renderScreen();

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText(/sessions held so far/)).toHaveTextContent("3 sessions held so far");
    const row = screen.getByRole("row", { name: /Ana Cruz/ });
    expect(row).toHaveTextContent("2");
    expect(row).toHaveTextContent("1");
  });

  it("shows an empty state when the roster is empty", async () => {
    renderScreen({ monitorResult: { heldSessionCount: 0, rows: [] } });

    expect(
      await screen.findByText("No learners enrolled in this section on this date."),
    ).toBeInTheDocument();
  });

  it("reloads the monitor when the class or date changes", async () => {
    const user = userEvent.setup();
    const { subjectAttendance } = renderScreen();
    await screen.findByText("Ana Cruz");
    expect(subjectAttendance.monitorCalls).toEqual([["ta-1", "2026-08-29"]]);

    await user.clear(screen.getByLabelText("As of"));
    await user.type(screen.getByLabelText("As of"), "2026-08-20");

    expect(subjectAttendance.monitorCalls).toContainEqual(["ta-1", "2026-08-20"]);
  });

  it("shows a retryable error when the monitor fails to load", async () => {
    class FailingRepository extends FakeSubjectAttendanceRepository {
      async monitor(): Promise<SubjectAttendanceMonitor | null> {
        throw new Error("boom");
      }
    }
    const subjectAttendance = new FailingRepository();
    const teachingAssignments = new FakeTeachingAssignmentRepository([ASSIGNMENT]);
    const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
    render(
      <ModeProvider>
        <SubjectMonitorScreen subjectAttendanceService={service} teacherUserId="teacher-1" />
      </ModeProvider>,
    );

    expect(
      await screen.findByText("Could not load the attendance monitor for this class."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });
});
