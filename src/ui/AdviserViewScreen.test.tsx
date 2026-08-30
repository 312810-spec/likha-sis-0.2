import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SectionApplicationService } from "../application/section-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type {
  AdviserAssignmentMonitor,
  TeachingAssignmentSummary,
} from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { AdviserViewScreen } from "./AdviserViewScreen";
import { ModeProvider } from "./theme/ModeContext";

const SECTION: Section = {
  id: "sec-1",
  schoolId: "school-1",
  schoolYear: "2026-2027",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const ADVISER_MONITOR: AdviserAssignmentMonitor[] = [
  {
    teachingAssignmentId: "ta-1",
    subjectId: "sub-1",
    subjectName: "Mathematics",
    teacherUserId: "teacher-1",
    monitor: {
      heldSessionCount: 2,
      rows: [
        {
          membershipId: "mem-1",
          learnerId: "l-1",
          givenName: "Ana",
          familyName: "Cruz",
          presentCount: 1,
          absentCount: 1,
          lateCount: 0,
          excusedCount: 0,
          currentConsecutiveAbsences: 1,
        },
      ],
    },
  },
];

class FakeSectionRepository implements SectionRepository {
  constructor(private sections: Section[] = [SECTION]) {}

  async list(): Promise<Section[]> {
    return this.sections;
  }
  async create(): Promise<Section> {
    throw new Error("not used in this test");
  }
  async enroll(): Promise<SectionMembership | null> {
    throw new Error("not used in this test");
  }
  async transferMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async endMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async listEnrollableLearners(): Promise<never> {
    throw new Error("not used in this test");
  }
  async enrollMembership(): Promise<never> {
    throw new Error("not used in this test");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error("not used in this test");
  }
  async roster(): Promise<SectionRosterMember[]> {
    return [];
  }
}

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  adviserCalls: Array<[string, string]> = [];

  constructor(private result: AdviserAssignmentMonitor[] | Error = ADVISER_MONITOR) {}

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
  async adviserSectionMonitor(sectionId: string, asOfDate: string) {
    this.adviserCalls.push([sectionId, asOfDate]);
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine(): Promise<TeachingAssignmentSummary[]> {
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
  options: {
    sections?: Section[];
    adviserResult?: AdviserAssignmentMonitor[] | Error;
  } = {},
) {
  const sectionRepository = new FakeSectionRepository(options.sections ?? [SECTION]);
  const sectionService = new SectionApplicationService(sectionRepository);
  const subjectAttendance = new FakeSubjectAttendanceRepository(
    options.adviserResult ?? ADVISER_MONITOR,
  );
  const teachingAssignments = new FakeTeachingAssignmentRepository();
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    subjectAttendance,
    teachingAssignments,
  );
  const result = render(
    <ModeProvider>
      <AdviserViewScreen
        subjectAttendanceService={subjectAttendanceService}
        sectionService={sectionService}
      />
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

describe("AdviserViewScreen", () => {
  it("shows a message when no sections exist", async () => {
    renderScreen({ sections: [] });

    expect(await screen.findByText("No sections exist yet.")).toBeInTheDocument();
  });

  it("shows each subject's monitor for the selected section", async () => {
    renderScreen();

    expect(await screen.findByRole("heading", { name: "Mathematics" })).toBeInTheDocument();
    expect(screen.getByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText(/sessions held so far/)).toHaveTextContent("2 sessions held so far");
  });

  it("shows an empty state when the section has no subjects taught", async () => {
    renderScreen({ adviserResult: [] });

    expect(
      await screen.findByText("No subjects are taught in this section yet."),
    ).toBeInTheDocument();
  });

  it("reloads when the section or date changes", async () => {
    const user = userEvent.setup();
    const { subjectAttendance } = renderScreen();
    await screen.findByText("Ana Cruz");
    expect(subjectAttendance.adviserCalls).toEqual([["sec-1", "2026-08-29"]]);

    await user.clear(screen.getByLabelText("As of"));
    await user.type(screen.getByLabelText("As of"), "2026-08-20");

    expect(subjectAttendance.adviserCalls).toContainEqual(["sec-1", "2026-08-20"]);
  });

  it("shows a permission-denial message when the backend refuses the view", async () => {
    renderScreen({ adviserResult: new Error("unauthorized") });

    expect(
      await screen.findByText(
        "Could not load this section's adviser view — you may not have permission to view it.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByText("Ana Cruz");

    await expectNoAccessibilityViolations(container);
  });
});
