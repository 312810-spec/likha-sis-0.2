import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { LessonPlanApplicationService } from "../application/lesson-plan-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type { LessonPlan, LessonPlanFields } from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { RecordEntryOutcome, TeachingAssignmentSummary } from "../domain/subject-attendance";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { LessonPlanScreen } from "./LessonPlanScreen";
import { ModeProvider } from "./theme/ModeContext";

const ASSIGNMENT: TeachingAssignmentSummary = {
  id: "ta-1",
  sectionId: "sec-1",
  sectionName: "Mabini",
  schoolYear: "2026-2027",
  subjectId: "sub-1",
  subjectName: "Mathematics",
};

const PLAN: LessonPlan = {
  id: "lp-1",
  schoolId: "s1",
  teachingAssignmentId: "ta-1",
  planDate: "2026-09-07",
  learningCompetency: "Add and subtract fractions with unlike denominators",
  learningCompetencyCode: "M7NS-Ig-1",
  learningObjectives: "Add fractions\nSubtract fractions",
  connectionToPreviousLearning: "Builds on like denominators",
  learningExperiences: "Group activity with fraction strips",
  assessment: "3-item exit ticket",
  waysForward: "Reteach if accuracy is low",
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

class FakeLessonPlanRepository implements LessonPlanRepository {
  createCalls: Array<{
    teachingAssignmentId: string;
    planDate: string;
    fields: LessonPlanFields;
  }> = [];
  createResult: LessonPlan | null = PLAN;

  constructor(private plans: LessonPlan[] = []) {}

  async create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
  ): Promise<LessonPlan | null> {
    this.createCalls.push({ teachingAssignmentId, planDate, fields });
    if (this.createResult) this.plans = [...this.plans, this.createResult];
    return this.createResult;
  }

  async update(): Promise<LessonPlan | null> {
    return PLAN;
  }

  async listByAssignment(): Promise<LessonPlan[]> {
    return this.plans;
  }
}

class FakeSubjectAttendanceRepository implements SubjectAttendanceRepository {
  async listMine(): Promise<TeachingAssignmentSummary[]> {
    return [ASSIGNMENT];
  }
  async openSession() {
    return null;
  }
  async markNoClass() {
    return null;
  }
  async recordEntry(): Promise<RecordEntryOutcome> {
    return { kind: "sessionNotFound" };
  }
  async markAllPresent() {
    return [];
  }
  async rosterForSession() {
    return [];
  }
  async listSessions() {
    return [];
  }
  async monitor() {
    return null;
  }
  async adviserOverview() {
    return null;
  }
  async listAdviserViewSections() {
    return [];
  }
}

class FakeTeachingAssignmentRepository implements TeachingAssignmentRepository {
  async listMine() {
    return [ASSIGNMENT];
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
  async listMeetings() {
    return [];
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

function renderScreen(lessonPlanRepo: FakeLessonPlanRepository) {
  const lessonPlanService = new LessonPlanApplicationService(lessonPlanRepo);
  const subjectAttendanceService = new SubjectAttendanceApplicationService(
    new FakeSubjectAttendanceRepository(),
    new FakeTeachingAssignmentRepository(),
  );
  return render(
    <ModeProvider>
      <LessonPlanScreen
        lessonPlanService={lessonPlanService}
        subjectAttendanceService={subjectAttendanceService}
        teacherUserId="u1"
      />
    </ModeProvider>,
  );
}

describe("LessonPlanScreen", () => {
  it("renders all four ILAW sections", async () => {
    renderScreen(new FakeLessonPlanRepository());

    await waitFor(() => expect(screen.getByLabelText(/class/i)).toBeInTheDocument());

    expect(screen.getByRole("heading", { name: "Intentions" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Learning Experiences" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Assessment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ways Forward" })).toBeInTheDocument();
  });

  it("saves calls the application service's create method with the entered fields", async () => {
    const repo = new FakeLessonPlanRepository();
    renderScreen(repo);
    const user = userEvent.setup();

    await waitFor(() => expect(screen.getByLabelText(/class/i)).toBeInTheDocument());

    await user.type(screen.getByLabelText("Learning competency"), "Add and subtract fractions");
    await user.type(screen.getByLabelText(/Learning objectives/), "Objective 1");
    await user.type(screen.getByLabelText("Planned activities"), "Group activity");
    await user.type(screen.getByLabelText("How learning will be checked"), "Exit ticket");

    await user.click(screen.getByRole("button", { name: /save lesson plan/i }));

    await waitFor(() => expect(repo.createCalls).toHaveLength(1));
    const call = repo.createCalls.at(0);
    expect(call?.teachingAssignmentId).toBe("ta-1");
    expect(call?.fields.learningCompetency).toBe("Add and subtract fractions");
    expect(call?.fields.learningExperiences).toBe("Group activity");
    expect(call?.fields.assessment).toBe("Exit ticket");
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen(new FakeLessonPlanRepository());
    await waitFor(() => expect(screen.getByLabelText(/class/i)).toBeInTheDocument());
    await expectNoAccessibilityViolations(container);
  });
});
