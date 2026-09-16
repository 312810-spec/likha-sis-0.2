import { render, screen, waitFor } from "@testing-library/react";
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

function renderScreen(
  repository = new FakeSubjectAttendanceRepository(),
  initialContext: AdvisoryWorkContext | null = null,
  onContextChange?: (context: AdvisoryWorkContext | null) => void,
) {
  const service = new SubjectAttendanceApplicationService(
    repository,
    new FakeTeachingAssignmentRepository(),
  );
  const result = render(
    <ModeProvider>
      <AdviserViewScreen
        subjectAttendanceService={service}
        initialContext={initialContext}
        onContextChange={onContextChange}
      />
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
  it("shows the trusted advisory roster alongside read-only Subject Attendance signals", async () => {
    renderScreen();

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "My Advisory" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Advisory roster" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 learner enrolled in Mabini as of 2026-08-29.",
    );
    expect(screen.getByRole("heading", { name: "Subject Attendance signals" })).toBeInTheDocument();
    expect(
      screen.getByText("Advisory roster + Subject Attendance signals — not SF2."),
    ).toBeInTheDocument();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /edit|save|convert/i })).not.toBeInTheDocument();
  });

  it("keeps an enrolled advisory learner visible when no subject session has been held", async () => {
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

    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 learner enrolled in Mabini as of 2026-08-29.",
    );
    expect(screen.getByText(/0 subject sessions held across/)).toBeInTheDocument();
  });

  it("restores an initial advisory context only after that section is authorized", async () => {
    const onContextChange = vi.fn();
    const repository = new FakeSubjectAttendanceRepository([SECTION, SECOND_SECTION]);
    renderScreen(repository, { sectionId: SECOND_SECTION.id }, onContextChange);

    await screen.findByText("Ana Cruz");
    expect(screen.getByLabelText("Advisory section")).toHaveValue(SECOND_SECTION.id);
    expect(repository.overviewCalls).toContainEqual([SECOND_SECTION.id, "2026-08-29"]);
    expect(onContextChange).not.toHaveBeenCalledWith(null);
  });

  it("never queries a stale advisory context and falls back to an authorized section", async () => {
    const onContextChange = vi.fn();
    const repository = new FakeSubjectAttendanceRepository([SECTION]);
    renderScreen(repository, { sectionId: "stale-section" }, onContextChange);

    await screen.findByText("Ana Cruz");
    expect(repository.overviewCalls.some(([sectionId]) => sectionId === "stale-section")).toBe(
      false,
    );
    expect(repository.overviewCalls).toContainEqual([SECTION.id, "2026-08-29"]);
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
    await screen.findByText("Ana Cruz");

    await user.selectOptions(screen.getByLabelText("Advisory section"), SECOND_SECTION.id);

    await waitFor(() =>
      expect(onContextChange).toHaveBeenCalledWith({ sectionId: SECOND_SECTION.id }),
    );
  });

  it("shows a calm empty state and clears stale context when no advisory section is active", async () => {
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
