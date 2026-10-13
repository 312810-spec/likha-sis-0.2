import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { LessonPlanApplicationService } from "../application/lesson-plan-service";
import { SubjectAttendanceApplicationService } from "../application/subject-attendance-service";
import type {
  LessonPlan,
  LessonPlanFields,
  LessonSourceArtifact,
  LessonSourceAmendment,
  LessonSourceReference,
} from "../domain/lesson-plan";
import type { LessonPlanRepository } from "../domain/ports/lesson-plan-repository";
import type { FilePicker } from "../domain/ports/file-picker";
import type { SubjectAttendanceRepository } from "../domain/ports/subject-attendance-repository";
import type { TeachingAssignmentRepository } from "../domain/ports/teaching-assignment-repository";
import type { RecordEntryOutcome, TeachingAssignmentSummary } from "../domain/subject-attendance";
import type { CreateMeetingOutcome } from "../domain/schedule-meeting";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { clearLessonDrafts } from "./lesson-draft-store";
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
  artifact: LessonSourceArtifact = {
    id: "artifact-1",
    fileName: "source.pdf",
    mediaType: "application/pdf",
    byteLength: 20,
    sha256: "a".repeat(64),
    ingestedByUserId: "u1",
    ingestedByName: "Teacher A",
    createdAt: "now",
    alreadyImported: false,
  };

  async ingestSourceFile(): Promise<LessonSourceArtifact> {
    return this.artifact;
  }

  async getSourceArtifact(): Promise<LessonSourceArtifact | null> {
    return null;
  }

  createCalls: Array<{
    teachingAssignmentId: string;
    planDate: string;
    fields: LessonPlanFields;
    sourceReference?: LessonSourceReference;
  }> = [];
  createResult: LessonPlan | null = PLAN;
  amendments: LessonSourceAmendment[] = [];
  historyFailure = false;

  constructor(private plans: LessonPlan[] = []) {}

  async create(
    teachingAssignmentId: string,
    planDate: string,
    fields: LessonPlanFields,
    sourceReference?: LessonSourceReference,
  ): Promise<LessonPlan | null> {
    this.createCalls.push({
      teachingAssignmentId,
      planDate,
      fields,
      ...(sourceReference ? { sourceReference } : {}),
    });
    if (this.createResult) this.plans = [...this.plans, this.createResult];
    return this.createResult;
  }

  async update(): Promise<LessonPlan | null> {
    return PLAN;
  }

  async listByAssignment(): Promise<LessonPlan[]> {
    return this.plans;
  }

  async amendSource(
    lessonPlanId: string,
    _teachingAssignmentId: string,
    sourceReference: LessonSourceReference,
    reason: string,
  ): Promise<LessonPlan | null> {
    const plan = this.plans.find((item) => item.id === lessonPlanId) ?? null;
    if (!plan) return null;
    this.amendments = [
      {
        id: `amend-${this.amendments.length + 1}`,
        lessonPlanId,
        previousSourceReference: plan.sourceReference,
        newSourceReference: sourceReference,
        reason,
        amendedByUserId: "u1",
        amendedByName: "Teacher A",
        createdAt: "now",
      },
      ...this.amendments,
    ];
    const amended = { ...plan, sourceReference };
    this.plans = this.plans.map((item) => (item.id === lessonPlanId ? amended : item));
    return amended;
  }

  async listSourceAmendments(): Promise<LessonSourceAmendment[]> {
    if (this.historyFailure) throw new Error("Synthetic history read failure");
    return this.amendments;
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

function renderScreen(
  lessonPlanRepo: FakeLessonPlanRepository,
  attendance = new FakeSubjectAttendanceRepository(),
  filePicker?: FilePicker,
) {
  const lessonPlanService = new LessonPlanApplicationService(lessonPlanRepo, filePicker);
  const assignments = new FakeTeachingAssignmentRepository();
  assignments.listMine = () => attendance.listMine();
  const subjectAttendanceService = new SubjectAttendanceApplicationService(attendance, assignments);
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
  beforeEach(() => clearLessonDrafts());
  it("links a selected exact source file without claiming official verification", async () => {
    const user = userEvent.setup();
    const repo = new FakeLessonPlanRepository();
    renderScreen(repo, new FakeSubjectAttendanceRepository(), {
      async pickSf1Workbook() {
        return null;
      },
      async pickLessonSourceFile() {
        return "/tmp/source.pdf";
      },
    });
    await screen.findByText("Curriculum / BOW source reference");
    await user.click(screen.getByText("Curriculum / BOW source reference"));
    await user.click(screen.getByRole("button", { name: "Attach exact source file" }));
    expect(await screen.findByText(/SHA-256 integrity record/)).toBeInTheDocument();
    expect(screen.getByText(/identifies exact bytes only/)).toHaveTextContent("artifact-1");
    expect(screen.getByText(/does not prove official approval/)).toBeInTheDocument();
  });

  it("retains declared source drafts and locks an existing plan's source", async () => {
    const source = {
      title: "Synthetic BOW",
      version: "v1",
      citation: "fixture:bow",
      curriculumName: "Synthetic curriculum",
      term: "Term A",
    };
    const repo = new FakeLessonPlanRepository([{ ...PLAN, sourceReference: source }]);
    const first = renderScreen(repo);
    const user = userEvent.setup();
    await user.click(await screen.findByText("Curriculum / BOW source reference"));
    await user.type(screen.getByLabelText("Source title"), "Draft reference");
    await user.click(
      screen.getByLabelText(
        "I confirm this reference applies to the selected subject and school year",
      ),
    );
    first.unmount();
    renderScreen(repo);
    await user.click(await screen.findByText("Curriculum / BOW source reference"));
    expect(screen.getByLabelText("Source title")).toHaveValue("Draft reference");
    expect(
      screen.getByLabelText(
        "I confirm this reference applies to the selected subject and school year",
      ),
    ).toBeChecked();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Source title")).toHaveValue("Synthetic BOW");
    expect(screen.getByLabelText("Source title")).toBeDisabled();
    expect(screen.getByLabelText("Applicable term")).toHaveValue("Term A");
    expect(
      screen.getByLabelText(
        "I confirm this reference applies to the selected subject and school year",
      ),
    ).not.toBeChecked();
    expect(
      screen.getByLabelText(
        "I confirm this reference applies to the selected subject and school year",
      ),
    ).toBeDisabled();
    expect(
      screen.getByText(/Declared source: Synthetic BOW.*Subject\/year scope unknown/),
    ).toBeInTheDocument();
  });
  it("records a reasoned source correction and exposes its lineage", async () => {
    const repo = new FakeLessonPlanRepository([
      {
        ...PLAN,
        sourceReference: {
          title: "Synthetic BOW",
          version: "v1",
          citation: "fixture:bow-v1",
          curriculumName: "Synthetic curriculum",
          term: "Term A",
        },
      },
    ]);
    const { container } = renderScreen(repo);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.click(screen.getByText("Curriculum / BOW source reference"));
    await user.click(screen.getByRole("button", { name: "Correct source reference" }));
    await user.clear(screen.getByLabelText("Source version / revision"));
    await user.type(screen.getByLabelText("Source version / revision"), "v2");
    await user.clear(screen.getByLabelText("Source citation / location"));
    await user.type(screen.getByLabelText("Source citation / location"), "fixture:bow-v2");
    await user.type(screen.getByLabelText("Reason for correction"), "Replaced an outdated copy");
    await user.click(screen.getByRole("button", { name: "Save source correction" }));

    await screen.findByText(/Source correction saved with an append-only reason and history/);
    expect(repo.amendments).toHaveLength(1);
    expect(repo.amendments[0]).toMatchObject({
      previousSourceReference: { version: "v1" },
      newSourceReference: { version: "v2", citation: "fixture:bow-v2" },
      reason: "Replaced an outdated copy",
    });
    expect(screen.getByText("v1 → v2")).toBeInTheDocument();
    expect(screen.getByText("Replaced an outdated copy")).toBeInTheDocument();
    expect(screen.getByText(/Teacher A/)).toBeInTheDocument();
    await expectNoAccessibilityViolations(container);

    repo.historyFailure = true;
    await user.click(screen.getByRole("button", { name: "Correct source reference" }));
    await user.clear(screen.getByLabelText("Source version / revision"));
    await user.type(screen.getByLabelText("Source version / revision"), "v3");
    await user.type(screen.getByLabelText("Reason for correction"), "Fixed another version label");
    await user.click(screen.getByRole("button", { name: "Save source correction" }));
    await waitFor(() => expect(repo.amendments).toHaveLength(2));
    expect(
      screen.getByText(/Source correction saved with an append-only reason and history/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Could not load source correction history/)).toBeInTheDocument();
  });
  it("submits the selected subject/year only after an explicit scope declaration", async () => {
    const repo = new FakeLessonPlanRepository();
    renderScreen(repo);
    const user = userEvent.setup();
    await screen.findByLabelText("Learning competency");
    for (const label of [
      "Learning competency",
      "Learning objectives (2–3, one per line)",
      "Planned activities",
      "How learning will be checked",
    ])
      await user.type(screen.getByLabelText(label), "Synthetic lesson content");
    await user.click(screen.getByText("Curriculum / BOW source reference"));
    for (const [label, value] of [
      ["Source title", "Synthetic BOW"],
      ["Source version / revision", "v1"],
      ["Source citation / location", "fixture:bow"],
      ["Curriculum name", "Synthetic curriculum"],
      ["Applicable term", "Term A"],
    ] as const)
      await user.type(screen.getByLabelText(label), value);
    await user.click(
      screen.getByLabelText(
        "I confirm this reference applies to the selected subject and school year",
      ),
    );
    await user.click(screen.getByRole("button", { name: "Save lesson plan" }));
    await screen.findByText(/Lesson plan saved on this device/);
    expect(repo.createCalls[0]?.sourceReference?.scope).toEqual({
      schoolYear: ASSIGNMENT.schoolYear,
      subjectId: ASSIGNMENT.subjectId,
    });
  });
  it("shows captured class context rather than the assignment's current values", async () => {
    renderScreen(
      new FakeLessonPlanRepository([
        {
          ...PLAN,
          teachingContext: {
            schoolYear: "2025-2026",
            gradeLevel: "6",
            sectionId: "old-section",
            sectionName: "Previous Section",
            subjectId: "old-subject",
            subjectName: "Previous Subject",
          },
        },
      ]),
    );
    expect(
      await screen.findByText(
        "Saved context: 2025-2026 · Grade 6 · Previous Section · Previous Subject",
      ),
    ).toBeInTheDocument();
  });
  it("labels legacy plans with unavailable historical context", async () => {
    renderScreen(new FakeLessonPlanRepository([PLAN]));
    expect(
      await screen.findByText("Saved class context unavailable for this earlier plan."),
    ).toBeInTheDocument();
  });
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

describe("lesson recovery", () => {
  beforeEach(() => clearLessonDrafts());
  async function fillRequired(user: ReturnType<typeof userEvent.setup>) {
    await user.type(await screen.findByLabelText("Learning competency"), "Fractions");
    await user.type(screen.getByLabelText(/Learning objectives/), "Compare fractions");
    await user.type(screen.getByLabelText("Planned activities"), "Use strips");
    await user.type(screen.getByLabelText("How learning will be checked"), "Exit ticket");
  }
  it("retains drafts across route remounts and dates", async () => {
    const repo = new FakeLessonPlanRepository();
    const user = userEvent.setup();
    const first = renderScreen(repo);
    const date = await screen.findByLabelText("Date");
    const original = (date as HTMLInputElement).value;
    await user.type(screen.getByLabelText("Learning competency"), "Original date draft");
    await user.clear(date);
    await user.type(date, "2026-11-02");
    await user.type(screen.getByLabelText("Learning competency"), "Second date draft");
    first.unmount();
    renderScreen(repo);
    expect(await screen.findByLabelText("Learning competency")).toHaveValue("Second date draft");
    await user.clear(screen.getByLabelText("Date"));
    await user.type(screen.getByLabelText("Date"), original);
    expect(screen.getByLabelText("Learning competency")).toHaveValue("Original date draft");
  });
  it("keeps each class draft and hides failed class results", async () => {
    const repo = new FakeLessonPlanRepository([PLAN]);
    repo.listByAssignment = async (id?: string) => {
      if (id === "ta-2") throw new Error("offline");
      return [PLAN];
    };
    const attendance = new FakeSubjectAttendanceRepository();
    attendance.listMine = async () => [
      ASSIGNMENT,
      { ...ASSIGNMENT, id: "ta-2", sectionName: "Rizal" },
    ];
    renderScreen(repo, attendance);
    const user = userEvent.setup();
    await screen.findByRole("button", { name: "Edit" });
    await user.type(screen.getByLabelText("Learning competency"), "Class one draft");
    await user.selectOptions(screen.getByLabelText("Class"), "ta-2");
    await screen.findByRole("button", { name: "Retry lesson plans" });
    expect(screen.queryByRole("button", { name: "Edit" })).not.toBeInTheDocument();
    await user.type(screen.getByLabelText("Learning competency"), "Class two draft");
    await user.selectOptions(screen.getByLabelText("Class"), "ta-1");
    expect(screen.getByLabelText("Learning competency")).toHaveValue("Class one draft");
  });
  it("shows confirmed save even when its list refresh fails without retaining submitted text", async () => {
    const repo = new FakeLessonPlanRepository();
    let reads = 0;
    repo.listByAssignment = async () => {
      reads += 1;
      if (reads === 2) throw new Error("offline");
      return [PLAN];
    };
    renderScreen(repo);
    const user = userEvent.setup();
    await fillRequired(user);
    await user.click(screen.getByRole("button", { name: "Save lesson plan" }));
    await screen.findByText(/Lesson plan saved on this device/);
    expect(screen.getByLabelText("Learning competency")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Retry lesson plans" }));
    await screen.findByRole("button", { name: "Edit" });
    expect(repo.createCalls).toHaveLength(1);
    expect(screen.getByText(/Lesson plan saved on this device/)).toBeInTheDocument();
  });
  it("requires an explicit discard choice and focuses keep working first", async () => {
    renderScreen(new FakeLessonPlanRepository());
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Learning competency"), "Keep my work");
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    expect(screen.getByRole("button", { name: "Keep working" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Keep working" }));
    expect(screen.getByLabelText("Learning competency")).toHaveValue("Keep my work");
    expect(screen.getByRole("button", { name: "Discard draft" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Discard draft" }));
    await user.click(screen.getByRole("button", { name: "Confirm discard" }));
    expect(screen.getByLabelText("Learning competency")).toHaveValue("");
  });
  it("shows a failed assignment load separately from empty and offers retry", async () => {
    const attendance = new FakeSubjectAttendanceRepository();
    let calls = 0;
    attendance.listMine = async () => {
      calls += 1;
      if (calls === 1) throw new Error("offline");
      return [ASSIGNMENT];
    };
    renderScreen(new FakeLessonPlanRepository(), attendance);
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Retry assignments" }));
    await screen.findByLabelText("Learning competency");
    expect(screen.queryByText("You have no teaching assignments yet.")).not.toBeInTheDocument();
  });
  it("restores an unfinished edit after opening a new draft", async () => {
    renderScreen(new FakeLessonPlanRepository([PLAN]));
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Edit" }));
    await user.clear(screen.getByLabelText("Learning competency"));
    await user.type(screen.getByLabelText("Learning competency"), "Edited draft");
    await user.click(screen.getByRole("button", { name: "New lesson plan" }));
    await user.click(screen.getByRole("button", { name: "Edit" }));
    expect(screen.getByLabelText("Learning competency")).toHaveValue("Edited draft");
  });
});

describe("lesson pending-save navigation", () => {
  beforeEach(() => clearLessonDrafts());
  it("clears a confirmed submission from retained drafts after its route unmounts", async () => {
    const repo = new FakeLessonPlanRepository();
    let finish!: (plan: LessonPlan) => void;
    repo.create = () =>
      new Promise((resolve) => {
        finish = resolve;
      });
    const first = renderScreen(repo);
    const user = userEvent.setup();
    await user.type(await screen.findByLabelText("Learning competency"), "Fractions");
    await user.type(screen.getByLabelText(/Learning objectives/), "Compare");
    await user.type(screen.getByLabelText("Planned activities"), "Strips");
    await user.type(screen.getByLabelText("How learning will be checked"), "Ticket");
    await user.click(screen.getByRole("button", { name: "Save lesson plan" }));
    first.unmount();
    renderScreen(repo);
    expect(await screen.findByLabelText("Learning competency")).toHaveValue("Fractions");
    await act(async () => {
      finish(PLAN);
    });
    expect(screen.getByLabelText("Learning competency")).toHaveValue("");
    expect(screen.getByText(/Lesson plan saved on this device/)).toBeInTheDocument();
  });
});
