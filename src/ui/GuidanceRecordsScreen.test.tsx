import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { AnecdotalRecordApplicationService } from "../application/anecdotal-record-service";
import { SectionApplicationService } from "../application/section-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  AnecdotalRecord,
  AnecdotalRecordFollowup,
  AnecdotalRecordFollowupInput,
  AnecdotalRecordInput,
} from "../domain/anecdotal-record";
import type { AnecdotalRecordRepository } from "../domain/ports/anecdotal-record-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { Section, SectionRosterMember } from "../domain/section";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { GuidanceRecordsScreen } from "./GuidanceRecordsScreen";
import { ModeProvider } from "./theme/ModeContext";

const SECTIONS: Section[] = [
  {
    id: "sec-1",
    schoolId: "s1",
    schoolYear: "2026-2027",
    gradeLevel: "5",
    name: "Mabini",
    createdAt: "now",
  },
];

const ROSTER: SectionRosterMember[] = [
  {
    membershipId: "m-1",
    learnerId: "l-1",
    givenName: "Ana",
    familyName: "Cruz",
    lrn: null,
    startsOn: "2026-06-01",
  },
];

const RECORD: AnecdotalRecord = {
  id: "ar-1",
  schoolId: "s1",
  learnerId: "l-1",
  sectionId: "sec-1",
  authoredByUserId: "u1",
  category: "positive",
  entryDate: "2026-09-01",
  narrative: "Helped a classmate with a reading exercise.",
  createdAt: "now",
};

const FOLLOWUP: AnecdotalRecordFollowup = {
  id: "f-1",
  anecdotalRecordId: "ar-1",
  authorUserId: "u1",
  note: "Brief check-in the following week.",
  createdAt: "now",
};

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
  async create(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async remove(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async createMeeting(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async removeMeeting(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async getLoad(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
}

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  async openSession() {
    return null;
  }
  async markNoClass() {
    return null;
  }
  async recordEntry(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
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
  async listAdviserViewSections() {
    return SECTIONS;
  }
  async adviserOverview() {
    return null;
  }
}

class FakeSectionRepository implements SectionRepository {
  async list() {
    return [];
  }
  async create(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async enroll(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async roster() {
    return ROSTER;
  }
  async transferMembership(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async endMembership(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async listEnrollableLearners() {
    return [];
  }
  async enrollMembership(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error("not used by GuidanceRecordsScreen");
  }
}

class FakeAnecdotalRecordRepository implements AnecdotalRecordRepository {
  recordCalls: AnecdotalRecordInput[] = [];
  addFollowupCalls: AnecdotalRecordFollowupInput[] = [];
  recordsToReturn: AnecdotalRecord[] = [];
  followupsToReturn: AnecdotalRecordFollowup[] = [];

  async record(input: AnecdotalRecordInput): Promise<AnecdotalRecord> {
    this.recordCalls.push(input);
    return RECORD;
  }

  async listForSection(): Promise<AnecdotalRecord[]> {
    return this.recordsToReturn;
  }

  async addFollowup(input: AnecdotalRecordFollowupInput): Promise<AnecdotalRecordFollowup> {
    this.addFollowupCalls.push(input);
    return FOLLOWUP;
  }

  async listFollowups(): Promise<AnecdotalRecordFollowup[]> {
    return this.followupsToReturn;
  }
}

function renderScreen(overrides?: { anecdotalRepo?: FakeAnecdotalRecordRepository }) {
  const anecdotalRepo = overrides?.anecdotalRepo ?? new FakeAnecdotalRecordRepository();
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    new FakeSubjectAttendanceRepository(),
    new FakeTeachingAssignmentRepository(),
  );
  const sectionService = new SectionApplicationService(new FakeSectionRepository());
  const anecdotalRecordService = new AnecdotalRecordApplicationService(anecdotalRepo);

  render(
    <ModeProvider>
      <GuidanceRecordsScreen
        anecdotalRecordService={anecdotalRecordService}
        subjectAttendanceService={subjectAttendanceService}
        sectionService={sectionService}
      />
    </ModeProvider>,
  );

  return { anecdotalRepo };
}

describe("GuidanceRecordsScreen", () => {
  it("loads the section and roster pickers", async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Mabini/ })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });
  });

  it("shows the three generic categories, never a disciplinary-only label", async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    const group = screen.getByRole("group", { name: "Category" });
    expect(screen.getByText("Category")).toBeInTheDocument();
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Positive" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Negative" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Neutral" })).toBeInTheDocument();
    expect(screen.queryByText(/disciplinary/i)).not.toBeInTheDocument();
  });

  it("records a guidance entry for the selected learner", async () => {
    const user = userEvent.setup();
    const { anecdotalRepo } = renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Narrative"), "Helped a classmate.");
    await user.click(screen.getByRole("button", { name: "Positive" }));
    await user.click(screen.getByRole("button", { name: "Save guidance record" }));

    await waitFor(() => expect(anecdotalRepo.recordCalls).toHaveLength(1));
    const recorded = anecdotalRepo.recordCalls.at(0);
    expect(recorded?.category).toBe("positive");
    expect(recorded?.narrative).toBe("Helped a classmate.");
    expect(screen.getByText("Guidance record saved.")).toBeInTheDocument();
  });

  it("selecting a record loads its follow-up history and can add a follow-up", async () => {
    const user = userEvent.setup();
    const anecdotalRepo = new FakeAnecdotalRecordRepository();
    anecdotalRepo.recordsToReturn = [RECORD];
    anecdotalRepo.followupsToReturn = [FOLLOWUP];
    renderScreen({ anecdotalRepo });

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /Cruz, Ana — Positive/ })).toBeInTheDocument();
    });
    await user.click(screen.getByRole("button", { name: /Cruz, Ana — Positive/ }));

    await waitFor(() => {
      expect(screen.getByText(FOLLOWUP.note)).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Add a follow-up"), "A new synthetic follow-up.");
    await user.click(screen.getByRole("button", { name: "Save follow-up" }));

    await waitFor(() => expect(anecdotalRepo.addFollowupCalls).toHaveLength(1));
    expect(anecdotalRepo.addFollowupCalls.at(0)?.note).toBe("A new synthetic follow-up.");
  });

  it("has no obvious accessibility violations", async () => {
    const anecdotalRepo = new FakeAnecdotalRecordRepository();
    anecdotalRepo.recordsToReturn = [RECORD];
    const { container } = render(
      <ModeProvider>
        <GuidanceRecordsScreen
          anecdotalRecordService={new AnecdotalRecordApplicationService(anecdotalRepo)}
          subjectAttendanceService={
            new SubjectAttendanceApplicationService(
              new FakeSubjectAttendanceRepository(),
              new FakeTeachingAssignmentRepository(),
            )
          }
          sectionService={new SectionApplicationService(new FakeSectionRepository())}
        />
      </ModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    await expectNoAccessibilityViolations(container);
  });
});
