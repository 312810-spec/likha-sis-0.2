import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AdviserDailyAttendanceApplicationService } from "../application/adviser-daily-attendance-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  AttendanceRecord,
  AttendanceRosterEntry,
  AttendanceStatus,
} from "../domain/attendance";
import type { AdviserDailyAttendanceRepository } from "../domain/ports/adviser-daily-attendance-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type { Section } from "../domain/section";
import type { AdviserAttendanceOverview } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { AdviserViewScreen } from "./AdviserViewScreen";
import type { AdvisoryWorkContext } from "./work-context";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "school-1",
  schoolYear: "2026-2027",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const SECOND_SECTION: Section = {
  id: "sec-2",
  schoolId: "school-1",
  schoolYear: "2026-2027",
  gradeLevel: "8",
  name: "Rizal",
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

const DAILY_ROSTER: AttendanceRosterEntry[] = [
  {
    learnerId: "learner-1",
    givenName: "Ana",
    familyName: "Cruz",
    status: null,
    recordedAt: null,
  },
];

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

class FakeAdviserDailyAttendanceRepository implements AdviserDailyAttendanceRepository {
  rosterCalls: Array<[string, string]> = [];
  recordCalls: Array<[string, string, string, AttendanceStatus]> = [];
  bulkCalls: Array<[string, string]> = [];

  constructor(private roster: AttendanceRosterEntry[] = DAILY_ROSTER.map((row) => ({ ...row }))) {}

  async rosterForDate(sectionId: string, attendanceDate: string) {
    this.rosterCalls.push([sectionId, attendanceDate]);
    return this.roster.map((row) => ({ ...row }));
  }

  async record(
    sectionId: string,
    learnerId: string,
    attendanceDate: string,
    status: AttendanceStatus,
  ): Promise<AttendanceRecord | null> {
    this.recordCalls.push([sectionId, learnerId, attendanceDate, status]);
    const row = this.roster.find((candidate) => candidate.learnerId === learnerId);
    if (!row) return null;
    row.status = status;
    row.recordedAt = "now";
    return {
      id: "attendance-1",
      schoolId: "school-1",
      sectionId,
      learnerId,
      attendanceDate,
      status,
      recordedAt: "now",
    };
  }

  async bulkMarkPresent(sectionId: string, attendanceDate: string) {
    this.bulkCalls.push([sectionId, attendanceDate]);
    this.roster = this.roster.map((row) =>
      row.status === null ? { ...row, status: "present", recordedAt: "now" } : row,
    );
    return this.roster.map((row) => ({ ...row }));
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

function renderScreen(
  repository = new FakeSubjectAttendanceRepository(),
  initialContext: AdvisoryWorkContext | null = null,
  onContextChange?: (context: AdvisoryWorkContext | null) => void,
  dailyRepository = new FakeAdviserDailyAttendanceRepository(),
) {
  const service = new SubjectAttendanceApplicationService(
    repository,
    new FakeTeachingAssignmentRepository(),
  );
  const dailyService = new AdviserDailyAttendanceApplicationService(dailyRepository);
  const result = render(
    <ModeProvider>
      <AdviserViewScreen
        subjectAttendanceService={service}
        adviserDailyAttendanceService={dailyService}
        initialContext={initialContext}
        onContextChange={onContextChange}
      />
    </ModeProvider>,
  );
  return { ...result, repository, dailyRepository };
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
  it("separates official daily attendance from read-only Subject Attendance signals", async () => {
    renderScreen();

    expect((await screen.findAllByText("Ana Cruz")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("heading", { name: "My Advisory" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advisory roster" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 learner enrolled in Mabini as of 2026-08-29.",
    );
    expect(screen.getByRole("heading", { name: "Official daily attendance" })).toBeInTheDocument();
    expect(screen.getByLabelText("Official attendance for Ana Cruz")).toHaveValue("");
    expect(screen.getByRole("heading", { name: "Subject Attendance signals" })).toBeInTheDocument();
    expect(
      screen.getByText(/Official daily attendance and Subject Attendance are separate records/),
    ).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|save|convert/i })).not.toBeInTheDocument();
  });

  it("records an official mark through the adviser-only daily service", async () => {
    const user = userEvent.setup();
    const dailyRepository = new FakeAdviserDailyAttendanceRepository();
    renderScreen(new FakeSubjectAttendanceRepository(), null, undefined, dailyRepository);

    const select = await screen.findByLabelText("Official attendance for Ana Cruz");
    await user.selectOptions(select, "absent");

    await waitFor(() =>
      expect(dailyRepository.recordCalls).toContainEqual([
        "sec-1",
        "learner-1",
        "2026-08-29",
        "absent",
      ]),
    );
    await waitFor(() => expect(select).toHaveValue("absent"));
  });

  it("bulk-marks only unrecorded official attendance Present", async () => {
    const user = userEvent.setup();
    const dailyRepository = new FakeAdviserDailyAttendanceRepository([
      { ...DAILY_ROSTER[0]!, status: "absent", recordedAt: "earlier" },
      {
        learnerId: "learner-2",
        givenName: "Ben",
        familyName: "Santos",
        status: null,
        recordedAt: null,
      },
    ]);
    renderScreen(new FakeSubjectAttendanceRepository(), null, undefined, dailyRepository);

    await screen.findByLabelText("Official attendance for Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Mark unmarked Present" }));

    await waitFor(() => expect(dailyRepository.bulkCalls).toContainEqual(["sec-1", "2026-08-29"]));
    expect(screen.getByLabelText("Official attendance for Ana Cruz")).toHaveValue("absent");
    expect(screen.getByLabelText("Official attendance for Ben Santos")).toHaveValue("present");
  });

  it("keeps enrolled learners visible without subject sessions", async () => {
    renderScreen(
      new FakeSubjectAttendanceRepository([SECTION], {
        ...OVERVIEW,
        subjectCount: 0,
        heldSessionCount: 0,
        rows: [
          {
            ...OVERVIEW.rows[0]!,
            presentCount: 0,
            absentCount: 0,
            lateCount: 0,
            excusedCount: 0,
            subjectsWithAbsences: [],
            highestCurrentSubjectAbsenceStreak: 0,
          },
        ],
      }),
    );

    expect((await screen.findAllByText("Ana Cruz")).length).toBeGreaterThanOrEqual(2);
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 learner enrolled in Mabini as of 2026-08-29.",
    );
    expect(
      screen.getByRole("heading", { name: "Subject Attendance signals" }).parentElement,
    ).toHaveTextContent("0 subject sessions held across 0 subjects");
  });

  it("restores an initial advisory context only after that section is authorized", async () => {
    const onContextChange = vi.fn();
    const repository = new FakeSubjectAttendanceRepository([SECTION, SECOND_SECTION]);
    const dailyRepository = new FakeAdviserDailyAttendanceRepository();
    renderScreen(repository, { sectionId: SECOND_SECTION.id }, onContextChange, dailyRepository);

    await screen.findByLabelText("Official attendance for Ana Cruz");
    expect(screen.getByLabelText("Advisory section")).toHaveValue(SECOND_SECTION.id);
    expect(repository.overviewCalls).toContainEqual([SECOND_SECTION.id, "2026-08-29"]);
    expect(dailyRepository.rosterCalls).toContainEqual([SECOND_SECTION.id, "2026-08-29"]);
    expect(onContextChange).not.toHaveBeenCalledWith(null);
  });

  it("never queries a stale advisory context and falls back to an authorized section", async () => {
    const onContextChange = vi.fn();
    const repository = new FakeSubjectAttendanceRepository([SECTION]);
    const dailyRepository = new FakeAdviserDailyAttendanceRepository();
    renderScreen(repository, { sectionId: "stale-section" }, onContextChange, dailyRepository);

    await screen.findByLabelText("Official attendance for Ana Cruz");
    const queriedStaleOverview = repository.overviewCalls.some(
      ([selectedSectionId]) => selectedSectionId === "stale-section",
    );
    const queriedStaleDailyRoster = dailyRepository.rosterCalls.some(
      ([selectedSectionId]) => selectedSectionId === "stale-section",
    );
    expect(queriedStaleOverview).toBe(false);
    expect(queriedStaleDailyRoster).toBe(false);
    expect(repository.overviewCalls).toContainEqual([SECTION.id, "2026-08-29"]);
    expect(dailyRepository.rosterCalls).toContainEqual([SECTION.id, "2026-08-29"]);
    await waitFor(() => expect(onContextChange).toHaveBeenCalledWith({ sectionId: SECTION.id }));
  });

  it("updates advisory context when the authorized picker changes", async () => {
    const user = userEvent.setup();
    const onContextChange = vi.fn();
    renderScreen(
      new FakeSubjectAttendanceRepository([SECTION, SECOND_SECTION]),
      { sectionId: SECTION.id },
      onContextChange,
    );
    await screen.findByLabelText("Official attendance for Ana Cruz");

    await user.selectOptions(screen.getByLabelText("Advisory section"), SECOND_SECTION.id);

    await waitFor(() =>
      expect(onContextChange).toHaveBeenCalledWith({ sectionId: SECOND_SECTION.id }),
    );
  });

  it("clears stale context when no advisory section is active", async () => {
    const onContextChange = vi.fn();
    renderScreen(
      new FakeSubjectAttendanceRepository([], null),
      { sectionId: SECTION.id },
      onContextChange,
    );

    expect(
      await screen.findByText(/No advisory section is assigned to you for this date/),
    ).toBeInTheDocument();
    await waitFor(() => expect(onContextChange).toHaveBeenCalledWith(null));
  });

  it("reloads advisory data when the date changes", async () => {
    const user = userEvent.setup();
    const dailyRepository = new FakeAdviserDailyAttendanceRepository();
    const { repository } = renderScreen(
      new FakeSubjectAttendanceRepository(),
      null,
      undefined,
      dailyRepository,
    );
    await screen.findByLabelText("Official attendance for Ana Cruz");

    await user.clear(screen.getByLabelText("As of"));
    await user.type(screen.getByLabelText("As of"), "2026-08-20");

    expect(repository.sectionDates).toContain("2026-08-20");
    expect(repository.overviewCalls).toContainEqual(["sec-1", "2026-08-20"]);
    expect(dailyRepository.rosterCalls).toContainEqual(["sec-1", "2026-08-20"]);
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByLabelText("Official attendance for Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });
});
