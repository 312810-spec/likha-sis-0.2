import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { CreateMeetingOutcome, ScheduleMeeting } from "../domain/schedule-meeting";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type {
  RecordEntryOutcome,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { TodaysClassesScreen } from "./TodaysClassesScreen";

const FIXED_TODAY_DATE = new Date(2026, 7, 29, 12);
const FIXED_TODAY_ISO = "2026-08-29";
const TODAYS_WEEKDAY = FIXED_TODAY_DATE.getDay();

const MATH: TeachingAssignmentSummary = {
  id: "ta-math",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-math",
  subjectName: "Mathematics",
};

const SCIENCE: TeachingAssignmentSummary = {
  id: "ta-science",
  sectionId: "sec-2",
  sectionName: "Rizal",
  schoolYear: "2026-2027",
  subjectId: "sub-science",
  subjectName: "Science",
};

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  constructor(private sessions: SubjectAttendanceSession[] = []) {}
  async openSession(): Promise<SubjectAttendanceSession> {
    throw new Error("not used by TodaysClassesScreen");
  }
  async markNoClass(): Promise<SubjectAttendanceSession> {
    throw new Error("not used by TodaysClassesScreen");
  }
  async recordEntry(): Promise<RecordEntryOutcome> {
    throw new Error("not used by TodaysClassesScreen");
  }
  async markAllPresent() {
    return null;
  }
  async rosterForSession() {
    return null;
  }
  async listSessions(teachingAssignmentId: string) {
    return this.sessions.filter((s) => s.teachingAssignmentId === teachingAssignmentId);
  }
  async monitor(): Promise<null> {
    throw new Error("not used by TodaysClassesScreen");
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  constructor(
    private assignments: TeachingAssignmentSummary[],
    private meetingsByAssignment: Record<string, ScheduleMeeting[]>,
  ) {}
  async listMine(): Promise<TeachingAssignmentSummary[]> {
    return this.assignments;
  }
  async listMeetings(teachingAssignmentId: string): Promise<ScheduleMeeting[]> {
    return this.meetingsByAssignment[teachingAssignmentId] ?? [];
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

function meeting(overrides: Partial<ScheduleMeeting> = {}): ScheduleMeeting {
  return {
    id: "meeting-1",
    teachingAssignmentId: "ta-math",
    weekday: TODAYS_WEEKDAY,
    startsAt: "08:00",
    endsAt: "09:00",
    room: "Room 3",
    ...overrides,
  };
}

function makeSession(overrides: Partial<SubjectAttendanceSession> = {}): SubjectAttendanceSession {
  return {
    id: "session-1",
    schoolId: "s1",
    teachingAssignmentId: "ta-math",
    sectionId: "sec-1",
    subjectId: "sub-math",
    sessionDate: FIXED_TODAY_ISO,
    status: "held",
    createdByUserId: "teacher-1",
    createdAt: "now",
    updatedAt: "now",
    ...overrides,
  };
}

function renderScreen(
  options: {
    assignments?: TeachingAssignmentSummary[];
    meetingsByAssignment?: Record<string, ScheduleMeeting[]>;
    sessions?: SubjectAttendanceSession[];
    onCheckAttendance?: (teachingAssignmentId: string) => void;
  } = {},
) {
  const subjectAttendance = new FakeSubjectAttendanceRepository(options.sessions ?? []);
  const teachingAssignments = new FakeTeachingAssignmentRepository(
    options.assignments ?? [MATH],
    options.meetingsByAssignment ?? { "ta-math": [meeting()] },
  );
  const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
  return render(
    <ModeProvider>
      <TodaysClassesScreen
        subjectAttendanceService={service}
        teacherUserId="teacher-1"
        onCheckAttendance={options.onCheckAttendance ?? (() => {})}
      />
    </ModeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(FIXED_TODAY_DATE);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("TodaysClassesScreen", () => {
  it("shows an empty state when nothing meets today", async () => {
    renderScreen({
      meetingsByAssignment: { "ta-math": [meeting({ weekday: (TODAYS_WEEKDAY + 1) % 7 })] },
    });

    expect(await screen.findByText("No classes scheduled for you today.")).toBeInTheDocument();
  });

  it("lists a class that meets today as not checked when no session exists", async () => {
    renderScreen();

    expect(await screen.findByText(/Mathematics/)).toBeInTheDocument();
    expect(screen.getByText("Not checked")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check attendance" })).toBeInTheDocument();
  });

  it("shows Checked when today's session was already held", async () => {
    renderScreen({ sessions: [makeSession({ status: "held" })] });

    await screen.findByText(/Mathematics/);
    expect(screen.getByText("Checked")).toBeInTheDocument();
  });

  it("shows No class when today's session was marked no class", async () => {
    renderScreen({ sessions: [makeSession({ status: "no_class" })] });

    await screen.findByText(/Mathematics/);
    expect(screen.getByText("No class")).toBeInTheDocument();
  });

  it("orders multiple classes by start time and only includes today's meetings", async () => {
    renderScreen({
      assignments: [MATH, SCIENCE],
      meetingsByAssignment: {
        "ta-math": [
          meeting({ teachingAssignmentId: "ta-math", startsAt: "10:00", endsAt: "11:00" }),
        ],
        "ta-science": [
          meeting({
            id: "meeting-2",
            teachingAssignmentId: "ta-science",
            startsAt: "08:00",
            endsAt: "09:00",
          }),
          meeting({
            id: "meeting-3",
            teachingAssignmentId: "ta-science",
            weekday: (TODAYS_WEEKDAY + 1) % 7,
            startsAt: "13:00",
            endsAt: "14:00",
          }),
        ],
      },
    });

    const rows = await screen.findAllByRole("row");
    // header row + Science (08:00) + Mathematics (10:00); the ta-science
    // meeting on a different weekday must not appear.
    expect(rows).toHaveLength(3);
    expect(rows[1]?.textContent).toContain("Science");
    expect(rows[2]?.textContent).toContain("Mathematics");
  });

  it("calls onCheckAttendance with the assignment id when Check attendance is selected", async () => {
    const user = userEvent.setup();
    const onCheckAttendance = vi.fn();
    renderScreen({ onCheckAttendance });
    await screen.findByRole("button", { name: "Check attendance" });

    await user.click(screen.getByRole("button", { name: "Check attendance" }));

    expect(onCheckAttendance).toHaveBeenCalledWith("ta-math");
  });

  it("has no detectable accessibility violations with classes listed", async () => {
    const { container } = renderScreen();
    await screen.findByText(/Mathematics/);

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the empty state", async () => {
    const { container } = renderScreen({ meetingsByAssignment: { "ta-math": [] } });
    await screen.findByText("No classes scheduled for you today.");

    await expectNoAccessibilityViolations(container);
  });
});
