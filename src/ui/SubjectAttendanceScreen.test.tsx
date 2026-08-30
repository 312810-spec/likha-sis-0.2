import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type {
  EntryStatus,
  RecordEntryOutcome,
  SubjectAttendanceRosterRow,
  SubjectAttendanceSession,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { SubjectAttendanceScreen } from "./SubjectAttendanceScreen";

const ASSIGNMENT: TeachingAssignmentSummary = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const FIXED_TODAY = "2026-08-29";

function makeSession(overrides: Partial<SubjectAttendanceSession> = {}): SubjectAttendanceSession {
  return {
    id: "session-1",
    schoolId: "s1",
    teachingAssignmentId: "ta-1",
    sectionId: "sec-1",
    subjectId: "sub-1",
    sessionDate: FIXED_TODAY,
    status: "held",
    createdByUserId: "teacher-1",
    createdAt: "now",
    updatedAt: "now",
    ...overrides,
  };
}

/** Mutable in-memory fake standing in for the real backend -- session
 * creation and roster state evolve exactly the way the real
 * `repository::subject_attendance` module's tests already proved,
 * without re-testing that logic here (UI tests exercise the UI, not
 * the domain). */
class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  sessions: SubjectAttendanceSession[];
  rosterBySessionId: Record<string, SubjectAttendanceRosterRow[]>;
  nextId = 2;

  constructor(
    sessions: SubjectAttendanceSession[] = [],
    rosterBySessionId: Record<string, SubjectAttendanceRosterRow[]> = {},
  ) {
    this.sessions = sessions;
    this.rosterBySessionId = rosterBySessionId;
  }

  private findOrCreate(
    teachingAssignmentId: string,
    sessionDate: string,
    status: "held" | "no_class",
  ): SubjectAttendanceSession {
    const existing = this.sessions.find(
      (s) => s.teachingAssignmentId === teachingAssignmentId && s.sessionDate === sessionDate,
    );
    if (existing) return existing;
    const created = makeSession({
      id: `session-${this.nextId++}`,
      teachingAssignmentId,
      sessionDate,
      status,
    });
    this.sessions.push(created);
    if (!(created.id in this.rosterBySessionId)) this.rosterBySessionId[created.id] = [];
    return created;
  }

  async openSession(teachingAssignmentId: string, sessionDate: string) {
    return this.findOrCreate(teachingAssignmentId, sessionDate, "held");
  }

  async markNoClass(teachingAssignmentId: string, sessionDate: string) {
    return this.findOrCreate(teachingAssignmentId, sessionDate, "no_class");
  }

  async recordEntry(
    _teachingAssignmentId: string,
    sessionId: string,
    membershipId: string,
    status: EntryStatus,
  ): Promise<RecordEntryOutcome> {
    const roster = this.rosterBySessionId[sessionId] ?? [];
    const existing = roster.find((row) => row.membershipId === membershipId);
    if (!existing) return { kind: "membershipNotInSession" };
    const updated = { ...existing, entryStatus: status };
    this.rosterBySessionId[sessionId] = roster.map((row) =>
      row.membershipId === membershipId ? updated : row,
    );
    return {
      kind: "recorded",
      entry: {
        id: "entry-1",
        sessionId,
        membershipId,
        learnerId: updated.learnerId,
        status,
        note: null,
        updatedAt: "now",
      },
    };
  }

  async markAllPresent(_teachingAssignmentId: string, sessionId: string) {
    const roster = this.rosterBySessionId[sessionId] ?? [];
    this.rosterBySessionId[sessionId] = roster.map((row) =>
      row.entryStatus === null ? { ...row, entryStatus: "present" } : row,
    );
    return this.rosterBySessionId[sessionId];
  }

  async rosterForSession(_teachingAssignmentId: string, sessionId: string) {
    return this.rosterBySessionId[sessionId] ?? null;
  }

  async listSessions(teachingAssignmentId: string) {
    return this.sessions.filter((s) => s.teachingAssignmentId === teachingAssignmentId);
  }
  async monitor() {
    return null;
  }
  async adviserSectionMonitor() {
    return [];
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
    sessions?: SubjectAttendanceSession[];
    rosterBySessionId?: Record<string, SubjectAttendanceRosterRow[]>;
  } = {},
) {
  const subjectAttendance = new FakeSubjectAttendanceRepository(
    options.sessions ?? [],
    options.rosterBySessionId ?? {},
  );
  const teachingAssignments = new FakeTeachingAssignmentRepository(
    options.assignments ?? [ASSIGNMENT],
  );
  const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
  const result = render(
    <ModeProvider>
      <SubjectAttendanceScreen subjectAttendanceService={service} teacherUserId="teacher-1" />
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

describe("SubjectAttendanceScreen", () => {
  it("shows a message when the teacher has no teaching assignments", async () => {
    renderScreen({ assignments: [] });

    expect(await screen.findByText("You have no teaching assignments yet.")).toBeInTheDocument();
  });

  it("shows the not-checked-yet actions when no session exists for today", async () => {
    renderScreen();

    expect(await screen.findByText(/no attendance has been checked/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Check attendance" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "No class today" })).toBeInTheDocument();
  });

  it("opens a session and shows the roster after Check attendance", async () => {
    const user = userEvent.setup();
    renderScreen({
      rosterBySessionId: {
        "session-2": [
          {
            membershipId: "mem-1",
            learnerId: "l-1",
            givenName: "Ana",
            familyName: "Cruz",
            entryStatus: null,
          },
        ],
      },
    });
    await screen.findByRole("button", { name: "Check attendance" });

    await user.click(screen.getByRole("button", { name: "Check attendance" }));

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("shows an already-open session's roster directly, without a Check attendance step", async () => {
    renderScreen({
      sessions: [makeSession()],
      rosterBySessionId: {
        "session-1": [
          {
            membershipId: "mem-1",
            learnerId: "l-1",
            givenName: "Ana",
            familyName: "Cruz",
            entryStatus: "present",
          },
        ],
      },
    });

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Present" })).toHaveAttribute("aria-pressed", "true");
  });

  it("marks a learner's status and reflects the change immediately", async () => {
    const user = userEvent.setup();
    renderScreen({
      sessions: [makeSession()],
      rosterBySessionId: {
        "session-1": [
          {
            membershipId: "mem-1",
            learnerId: "l-1",
            givenName: "Ana",
            familyName: "Cruz",
            entryStatus: null,
          },
        ],
      },
    });
    await screen.findByText("Ana Cruz");

    await user.click(screen.getByRole("button", { name: "Late" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Late" })).toHaveAttribute("aria-pressed", "true"),
    );
  });

  it("marks all unmarked learners present without touching an existing mark", async () => {
    const user = userEvent.setup();
    renderScreen({
      sessions: [makeSession()],
      rosterBySessionId: {
        "session-1": [
          {
            membershipId: "mem-1",
            learnerId: "l-1",
            givenName: "Ana",
            familyName: "Cruz",
            entryStatus: null,
          },
          {
            membershipId: "mem-2",
            learnerId: "l-2",
            givenName: "Bo",
            familyName: "Reyes",
            entryStatus: "absent",
          },
        ],
      },
    });
    await screen.findByText("Ana Cruz");

    await user.click(screen.getByRole("button", { name: "Mark all present" }));

    await waitFor(() => {
      const anaRow = screen.getByText("Ana Cruz").closest("tr");
      expect(anaRow).not.toBeNull();
    });
    const boRow = screen.getByText("Bo Reyes").closest("tr");
    expect(boRow).not.toBeNull();
    // Bo already had an Absent mark -- Mark all present must not touch it.
    const boAbsentButton = Array.from(boRow!.querySelectorAll("button")).find(
      (button) => button.textContent === "Absent",
    );
    expect(boAbsentButton).toHaveAttribute("aria-pressed", "true");
  });

  it("shows a no-class day without any roster or status controls", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: "No class today" });

    await user.click(screen.getByRole("button", { name: "No class today" }));

    expect(
      await screen.findByText("This day is marked no class. No attendance to check."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations with a populated roster", async () => {
    const { container } = renderScreen({
      sessions: [makeSession()],
      rosterBySessionId: {
        "session-1": [
          {
            membershipId: "mem-1",
            learnerId: "l-1",
            givenName: "Ana",
            familyName: "Cruz",
            entryStatus: null,
          },
        ],
      },
    });
    await screen.findByText("Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });

  it("has no detectable accessibility violations on the not-checked-yet state", async () => {
    const { container } = renderScreen();
    await screen.findByRole("button", { name: "Check attendance" });

    await expectNoAccessibilityViolations(container);
  });

  it("preselects the class passed as initialAssignmentId when it exists", async () => {
    const other: TeachingAssignmentSummary = {
      id: "ta-2",
      sectionId: "sec-2",
      sectionName: "Rizal",
      schoolYear: "2026-2027",
      subjectId: "sub-2",
      subjectName: "Science",
    };
    const subjectAttendance = new FakeSubjectAttendanceRepository();
    const teachingAssignments = new FakeTeachingAssignmentRepository([ASSIGNMENT, other]);
    const service = new SubjectAttendanceApplicationService(subjectAttendance, teachingAssignments);
    render(
      <ModeProvider>
        <SubjectAttendanceScreen
          subjectAttendanceService={service}
          teacherUserId="teacher-1"
          initialAssignmentId="ta-2"
        />
      </ModeProvider>,
    );

    await screen.findByRole("button", { name: "Check attendance" });

    expect(screen.getByRole("combobox", { name: "Class" })).toHaveValue("ta-2");
  });
});
