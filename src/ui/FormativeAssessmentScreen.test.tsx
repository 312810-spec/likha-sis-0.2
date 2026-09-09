import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FormativeAssessmentApplicationService } from "../application/formative-assessment-service";
import { GradingApplicationService } from "../application/grading-service";
import { SectionApplicationService } from "../application/section-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  FormativeAssessmentLog,
  FormativeAssessmentLogInput,
} from "../domain/formative-assessment";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type { FormativeAssessmentRepository } from "../domain/ports/formative-assessment-repository";
import type { GradingRepository } from "../domain/ports/grading-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { SectionRosterMember } from "../domain/section";
import type { TeachingAssignmentSummary } from "../domain/subject-attendance";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { FormativeAssessmentScreen } from "./FormativeAssessmentScreen";
import { ModeProvider } from "./theme/ModeContext";

const ASSIGNMENTS: TeachingAssignmentSummary[] = [
  {
    id: "ta-1",
    sectionId: "sec-1",
    sectionName: "Mabini",
    schoolYear: "2026-2027",
    subjectId: "sub-1",
    subjectName: "Mathematics",
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

const GRADING_PERIODS: GradingPeriod[] = [
  {
    id: "gp-1",
    schoolId: "s1",
    schoolYear: "2026-2027",
    policyPeriodId: "pp-1",
    label: "Quarter 1",
    startsOn: "2026-06-01",
    endsOn: "2026-08-31",
    createdAt: "now",
  },
];

const LOG: FormativeAssessmentLog = {
  id: "f-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  learnerId: "l-1",
  gradingPeriodId: "gp-1",
  activityName: "Quiz 1",
  esruRating: "E",
  notes: null,
  createdByUserId: "u1",
  updatedByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine() {
    return ASSIGNMENTS;
  }
  async listMeetings() {
    return [];
  }
  async listBySection() {
    return [];
  }
  async create(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async remove(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async createMeeting(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async removeMeeting(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async getLoad(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
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
    throw new Error("not used by FormativeAssessmentScreen");
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
    return [];
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
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async enroll(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async roster() {
    return ROSTER;
  }
  async transferMembership(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async endMembership(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async listEnrollableLearners() {
    return [];
  }
  async enrollMembership(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
  async correctSameDayPlacement(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
}

class FakeGradingRepository implements GradingRepository {
  async listPolicies(): Promise<GradingPolicy[]> {
    return [];
  }
  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    return [];
  }
  async listPeriodsBySchoolYear() {
    return GRADING_PERIODS;
  }
  async createPeriod(): Promise<never> {
    throw new Error("not used by FormativeAssessmentScreen");
  }
}

class FakeFormativeAssessmentRepository implements FormativeAssessmentRepository {
  recordCalls: FormativeAssessmentLogInput[] = [];
  logsToReturn: FormativeAssessmentLog[] = [];

  async record(input: FormativeAssessmentLogInput): Promise<FormativeAssessmentLog> {
    this.recordCalls.push(input);
    return LOG;
  }

  async listForAssignment(): Promise<FormativeAssessmentLog[]> {
    return this.logsToReturn;
  }
}

function renderScreen(overrides?: { formativeAssessmentRepo?: FakeFormativeAssessmentRepository }) {
  const formativeAssessmentRepo =
    overrides?.formativeAssessmentRepo ?? new FakeFormativeAssessmentRepository();
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    new FakeSubjectAttendanceRepository(),
    new FakeTeachingAssignmentRepository(),
  );
  const sectionService = new SectionApplicationService(new FakeSectionRepository());
  const gradingService = new GradingApplicationService(new FakeGradingRepository());
  const formativeAssessmentService = new FormativeAssessmentApplicationService(
    formativeAssessmentRepo,
  );

  render(
    <ModeProvider>
      <FormativeAssessmentScreen
        formativeAssessmentService={formativeAssessmentService}
        subjectAttendanceService={subjectAttendanceService}
        sectionService={sectionService}
        gradingService={gradingService}
        teacherUserId="teacher-1"
      />
    </ModeProvider>,
  );

  return { formativeAssessmentRepo };
}

describe("FormativeAssessmentScreen", () => {
  it("loads the class, quarter, and roster pickers", async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: /Mathematics/ })).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });
    expect(screen.getByRole("option", { name: "Quarter 1" })).toBeInTheDocument();
  });

  it("always shows the ESRU rating with an explicit unverified flag", async () => {
    renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    const group = screen.getByRole("group", { name: "ESRU rating" });
    expect(within(group).getByRole("button", { name: "E" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "S" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "R" })).toBeInTheDocument();
    expect(within(group).getByRole("button", { name: "U" })).toBeInTheDocument();

    expect(screen.getByText(/meaning unverified/i)).toBeInTheDocument();
  });

  it("records a log with the bare letter rating, never the gloss word", async () => {
    const user = userEvent.setup();
    const { formativeAssessmentRepo } = renderScreen();

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    await user.type(screen.getByLabelText("Activity name"), "Quiz 1");
    await user.click(screen.getByRole("button", { name: "S" }));
    await user.click(screen.getByRole("button", { name: "Save ESRU log" }));

    await waitFor(() => expect(formativeAssessmentRepo.recordCalls).toHaveLength(1));
    const recorded = formativeAssessmentRepo.recordCalls.at(0);
    expect(recorded?.esruRating).toBe("S");
    expect(recorded?.esruRating).not.toBe("Structured practice");
    expect(screen.getByText("ESRU log saved.")).toBeInTheDocument();
  });

  it("has no obvious accessibility violations", async () => {
    const { container } = render(
      <ModeProvider>
        <FormativeAssessmentScreen
          formativeAssessmentService={
            new FormativeAssessmentApplicationService(new FakeFormativeAssessmentRepository())
          }
          subjectAttendanceService={
            new SubjectAttendanceApplicationService(
              new FakeSubjectAttendanceRepository(),
              new FakeTeachingAssignmentRepository(),
            )
          }
          sectionService={new SectionApplicationService(new FakeSectionRepository())}
          gradingService={new GradingApplicationService(new FakeGradingRepository())}
          teacherUserId="teacher-1"
        />
      </ModeProvider>,
    );

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Cruz, Ana" })).toBeInTheDocument();
    });

    await expectNoAccessibilityViolations(container);
  });
});
