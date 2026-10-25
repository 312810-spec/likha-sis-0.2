import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentApplicationService } from "../application/assessment-service";
import { ClassRecordApplicationService } from "../application/class-record-service";
import { ExportApplicationService } from "../application/export-service";
import { GradingApplicationService } from "../application/grading-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import { SectionApplicationService } from "../application/section-service";
import { SubjectApplicationService } from "../application/subject-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type { GradingPeriod, GradingPolicy, GradingPolicyPeriod } from "../domain/grading";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
  LearnerScoreRosterEntry,
} from "../domain/learner-score";
import type { AssessmentRepository } from "../domain/ports/assessment-repository";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { GradingRepository } from "../domain/ports/grading-repository";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import type { SectionRepository } from "../domain/ports/section-repository";
import type { SubjectRepository } from "../domain/ports/subject-repository";
import type { Section, SectionMembership, SectionRosterMember } from "../domain/section";
import type { Subject } from "../domain/subject";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ClassRecordsScreen } from "./ClassRecordsScreen";
import { ModeProvider } from "./theme/ModeContext";

class FakeAssessmentRepository implements AssessmentRepository {
  async listCategorySets(): Promise<AssessmentCategorySet[]> {
    return [];
  }
  async listCategoriesForSet(): Promise<AssessmentCategory[]> {
    return [];
  }
  async listItemsByClassRecord(): Promise<AssessmentItemDetail[]> {
    return [];
  }
  async createItem(): Promise<AssessmentItem | null> {
    throw new Error("not used in this test");
  }
  async renameItem(): Promise<AssessmentItem | null> {
    throw new Error("not used in this test");
  }
  async updateItem(): Promise<AssessmentItem | null> {
    throw new Error("not used in this test");
  }
  async deleteItem(): Promise<boolean> {
    throw new Error("not used in this test");
  }
}

class FakeExportRepository implements ExportRepository {
  async exportSectionMonthlySf2(): Promise<Sf2ExportResult | null> {
    throw new Error("not used in this test");
  }
  async exportSchoolMonthlyAttendanceSf4(): Promise<
    import("../domain/export").Sf4ExportResult | null
  > {
    throw new Error("not used in this test");
  }
  async exportSectionEosySf5(): Promise<Sf5ExportResult | null> {
    throw new Error("not used in this test");
  }
  async exportSchoolEosySf6(): Promise<Sf6ExportResult | null> {
    throw new Error("not used in this test");
  }
  async exportClassRecordReportCard(): Promise<ReportCardExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportClassRecordSummary(): Promise<
    import("../domain/export").ClassSummaryExportResult | null
  > {
    throw new Error("not used in this test");
  }
  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportLearnerPermanentRecordSf10(): Promise<
    import("../domain/export").Sf10ExportResult | null
  > {
    throw new Error("not used in this test");
  }

  async revealExportedFile(): Promise<void> {
    throw new Error("not used in this test");
  }
}

class FakeLearnerScoreRepository implements LearnerScoreRepository {
  async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
    return [];
  }
  async record(): Promise<LearnerScore | null> {
    throw new Error("not used in this test");
  }
  async correctionHistory(): Promise<LearnerScoreCorrection[]> {
    throw new Error("not used in this test");
  }
  async computeTermGrade(): Promise<ComputedTermGrade | null> {
    throw new Error("not used in this test");
  }
}

const SECTION: Section = {
  id: "sec-1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  gradeLevel: "7",
  name: "Mabini",
  createdAt: "now",
};

const SUBJECT: Subject = { id: "sub-1", schoolId: "s1", name: "Mathematics", createdAt: "now" };

const PERIOD: GradingPeriod = {
  id: "gp-1",
  schoolId: "s1",
  schoolYear: "2026-2027",
  policyPeriodId: "pp1",
  label: "1st Term",
  startsOn: "2026-06-08",
  endsOn: "2026-09-15",
  createdAt: "now",
};

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

class FakeSubjectRepository implements SubjectRepository {
  createCalls: string[] = [];
  pending = false;
  constructor(private subjects: Subject[] = [SUBJECT]) {}
  async list(): Promise<Subject[]> {
    return this.subjects;
  }
  async create(name: string): Promise<Subject> {
    this.createCalls.push(name);
    if (this.pending) return new Promise(() => {});
    const subject: Subject = { id: "sub-2", schoolId: "s1", name, createdAt: "now" };
    this.subjects = [...this.subjects, subject];
    return subject;
  }
}

class FakeGradingRepository implements GradingRepository {
  constructor(private periods: GradingPeriod[] = [PERIOD]) {}
  async listPolicies(): Promise<GradingPolicy[]> {
    return [];
  }
  async listPolicyPeriods(): Promise<GradingPolicyPeriod[]> {
    return [];
  }
  async listPeriodsBySchoolYear(): Promise<GradingPeriod[]> {
    return this.periods;
  }
  async createPeriod(): Promise<GradingPeriod | null> {
    throw new Error("not used in this test");
  }
}

const NEXT_SECTION: Section = { ...SECTION, id: "sec-2", name: "Rizal", schoolYear: "2027-2028" };
const NEXT_PERIOD: GradingPeriod = {
  ...PERIOD,
  id: "gp-2",
  schoolYear: NEXT_SECTION.schoolYear,
  label: "Next year term",
};

function deferredPeriods() {
  let resolve!: (periods: GradingPeriod[]) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<GradingPeriod[]>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const WEIGHT_POLICY: GradingWeightPolicy = {
  id: "wp-1",
  name: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
  sourceCitation: "DepEd Order No. 015, s. 2026",
  isDefault: true,
};

class FakeClassRecordRepository implements ClassRecordRepository {
  createCalls: Array<{
    sectionId: string;
    subjectId: string;
    gradingPeriodId: string;
    weightPolicyId: string;
  }> = [];
  createResult: ClassRecord | null = {
    id: "cr-1",
    schoolId: "s1",
    sectionId: "sec-1",
    subjectId: "sub-1",
    gradingPeriodId: "gp-1",
    weightPolicyId: "wp-1",
    createdAt: "now",
  };
  weightPolicies: GradingWeightPolicy[] = [WEIGHT_POLICY];
  listCallCount = 0;
  pending = false;
  constructor(public records: ClassRecordDetail[] = []) {}
  async list(): Promise<ClassRecordDetail[]> {
    this.listCallCount += 1;
    return this.records;
  }
  async create(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null> {
    this.createCalls.push({ sectionId, subjectId, gradingPeriodId, weightPolicyId });
    if (this.pending) return new Promise(() => {});
    if (this.createResult) {
      const detail: ClassRecordDetail = {
        id: this.createResult.id,
        schoolId: this.createResult.schoolId,
        sectionId,
        sectionName: "Mabini",
        subjectId,
        subjectName: "Mathematics",
        gradingPeriodId,
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId,
        weightPolicyName: WEIGHT_POLICY.name,
        createdAt: "now",
        itemCount: 0,
        recordedCount: 0,
        totalEligible: 0,
      };
      this.records = [...this.records, detail];
    }
    return this.createResult;
  }
  async listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return this.weightPolicies;
  }
}

function renderScreen(
  options: {
    sectionRepo?: FakeSectionRepository;
    subjectRepo?: FakeSubjectRepository;
    gradingRepo?: FakeGradingRepository;
    classRecordRepo?: FakeClassRecordRepository;
  } = {},
) {
  const sectionRepo = options.sectionRepo ?? new FakeSectionRepository();
  const subjectRepo = options.subjectRepo ?? new FakeSubjectRepository();
  const gradingRepo = options.gradingRepo ?? new FakeGradingRepository();
  const classRecordRepo = options.classRecordRepo ?? new FakeClassRecordRepository();
  const result = render(
    <ModeProvider>
      <ClassRecordsScreen
        classRecordService={new ClassRecordApplicationService(classRecordRepo)}
        sectionService={new SectionApplicationService(sectionRepo)}
        subjectService={new SubjectApplicationService(subjectRepo)}
        gradingService={new GradingApplicationService(gradingRepo)}
        assessmentService={new AssessmentApplicationService(new FakeAssessmentRepository())}
        learnerScoreService={new LearnerScoreApplicationService(new FakeLearnerScoreRepository())}
        exportService={new ExportApplicationService(new FakeExportRepository())}
      />
    </ModeProvider>,
  );
  return { ...result, sectionRepo, subjectRepo, gradingRepo, classRecordRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ClassRecordsScreen", () => {
  it("blocks stale periods immediately while a new section year is loading", async () => {
    const user = userEvent.setup();
    const pending = deferredPeriods();
    const gradingRepo = new FakeGradingRepository();
    vi.spyOn(gradingRepo, "listPeriodsBySchoolYear")
      .mockResolvedValueOnce([PERIOD])
      .mockReturnValueOnce(pending.promise);
    const { classRecordRepo } = renderScreen({
      gradingRepo,
      sectionRepo: new FakeSectionRepository([SECTION, NEXT_SECTION]),
    });
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue(PERIOD.id));
    await user.selectOptions(screen.getByLabelText("Section"), NEXT_SECTION.id);
    expect(screen.getByLabelText("Grading period")).toBeDisabled();
    expect(screen.queryByRole("option", { name: PERIOD.label })).not.toBeInTheDocument();
    const open = screen.getByRole("button", { name: "Open class record" });
    expect(open).toHaveAttribute("aria-disabled", "true");
    await user.click(open);
    open.focus();
    await user.keyboard("{Enter}");
    expect(classRecordRepo.createCalls).toEqual([]);
    await act(async () => pending.resolve([NEXT_PERIOD]));
    expect(screen.getByLabelText("Grading period")).toHaveValue(NEXT_PERIOD.id);
  });

  it("retries a failed year read without creating or losing other choices", async () => {
    const user = userEvent.setup();
    const pending = deferredPeriods();
    const retry = deferredPeriods();
    const gradingRepo = new FakeGradingRepository();
    const reads = vi
      .spyOn(gradingRepo, "listPeriodsBySchoolYear")
      .mockResolvedValueOnce([PERIOD])
      .mockReturnValueOnce(pending.promise)
      .mockReturnValueOnce(retry.promise);
    const { classRecordRepo } = renderScreen({
      gradingRepo,
      sectionRepo: new FakeSectionRepository([SECTION, NEXT_SECTION]),
    });
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue(PERIOD.id));
    await user.selectOptions(screen.getByLabelText("Section"), NEXT_SECTION.id);
    await act(async () => pending.reject(new Error("offline")));
    expect(screen.getByLabelText("Grading period")).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent(NEXT_SECTION.schoolYear);
    await user.click(screen.getByRole("button", { name: "Open class record" }));
    expect(classRecordRepo.createCalls).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Retry grading periods" }));
    expect(screen.getByLabelText("Section")).toHaveValue(NEXT_SECTION.id);
    expect(screen.getByLabelText("Subject")).toHaveValue(SUBJECT.id);
    expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue(WEIGHT_POLICY.id);
    expect(classRecordRepo.createCalls).toEqual([]);
    await act(async () => retry.resolve([NEXT_PERIOD]));
    expect(reads.mock.calls).toEqual([
      [SECTION.schoolYear],
      [NEXT_SECTION.schoolYear],
      [NEXT_SECTION.schoolYear],
    ]);
    await user.click(screen.getByRole("button", { name: "Open class record" }));
    expect(classRecordRepo.createCalls).toEqual([
      {
        sectionId: NEXT_SECTION.id,
        subjectId: SUBJECT.id,
        gradingPeriodId: NEXT_PERIOD.id,
        weightPolicyId: WEIGHT_POLICY.id,
      },
    ]);
  });

  it("does not restore an earlier response after switching away and back", async () => {
    const user = userEvent.setup();
    const old = deferredPeriods();
    const current = deferredPeriods();
    const gradingRepo = new FakeGradingRepository();
    vi.spyOn(gradingRepo, "listPeriodsBySchoolYear")
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce([NEXT_PERIOD])
      .mockReturnValueOnce(current.promise);
    renderScreen({ gradingRepo, sectionRepo: new FakeSectionRepository([SECTION, NEXT_SECTION]) });
    await screen.findByLabelText("Section");
    await user.selectOptions(screen.getByLabelText("Section"), NEXT_SECTION.id);
    await waitFor(() =>
      expect(screen.getByLabelText("Grading period")).toHaveValue(NEXT_PERIOD.id),
    );
    await user.selectOptions(screen.getByLabelText("Section"), SECTION.id);
    await act(async () => old.resolve([PERIOD]));
    expect(screen.getByLabelText("Grading period")).toBeDisabled();
    await act(async () => current.resolve([PERIOD]));
    expect(screen.getByLabelText("Grading period")).toHaveValue(PERIOD.id);
  });

  it.each(["empty", "foreign-year"])(
    "blocks an %s response without retaining the previous period",
    async (kind) => {
      const user = userEvent.setup();
      const gradingRepo = new FakeGradingRepository();
      vi.spyOn(gradingRepo, "listPeriodsBySchoolYear")
        .mockResolvedValueOnce([PERIOD])
        .mockResolvedValueOnce(kind === "empty" ? [] : [PERIOD]);
      const { classRecordRepo } = renderScreen({
        gradingRepo,
        sectionRepo: new FakeSectionRepository([SECTION, NEXT_SECTION]),
      });
      await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue(PERIOD.id));
      await user.selectOptions(screen.getByLabelText("Section"), NEXT_SECTION.id);
      if (kind === "empty")
        expect(
          await screen.findByText(`No grading periods for ${NEXT_SECTION.schoolYear}.`),
        ).toBeInTheDocument();
      else
        expect(
          await screen.findByRole("button", { name: "Retry grading periods" }),
        ).toBeInTheDocument();
      expect(screen.getByLabelText("Grading period")).toBeDisabled();
      await user.click(screen.getByRole("button", { name: "Open class record" }));
      expect(classRecordRepo.createCalls).toEqual([]);
      await expectNoAccessibilityViolations(document.body);
    },
  );

  it("opens a class record for the selected section, subject, grading period, and weight policy", async () => {
    const user = userEvent.setup();
    const { classRecordRepo } = renderScreen();
    await screen.findByLabelText("Section");
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue("gp-1"));
    await waitFor(() =>
      expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1"),
    );

    await user.click(screen.getByRole("button", { name: "Open class record" }));

    await waitFor(() => expect(screen.getByText("Class record opened.")).toBeInTheDocument());
    expect(classRecordRepo.createCalls).toEqual([
      { sectionId: "sec-1", subjectId: "sub-1", gradingPeriodId: "gp-1", weightPolicyId: "wp-1" },
    ]);
  });

  it("does not open a second class record while the first is still in flight", async () => {
    const user = userEvent.setup();
    const classRecordRepo = new FakeClassRecordRepository();
    classRecordRepo.pending = true;
    renderScreen({ classRecordRepo });
    await screen.findByLabelText("Section");
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue("gp-1"));
    await waitFor(() =>
      expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1"),
    );

    const openButton = screen.getByRole("button", { name: "Open class record" });
    await user.click(openButton);
    await waitFor(() => expect(classRecordRepo.createCalls).toHaveLength(1));

    expect(openButton).toHaveAttribute("aria-disabled", "true");
    await user.click(openButton);

    expect(classRecordRepo.createCalls).toHaveLength(1);
  });

  it("shows an error when the combination is rejected", async () => {
    const user = userEvent.setup();
    const classRecordRepo = new FakeClassRecordRepository();
    classRecordRepo.createResult = null;
    renderScreen({ classRecordRepo });
    await screen.findByLabelText("Section");
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue("gp-1"));
    await waitFor(() =>
      expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1"),
    );

    await user.click(screen.getByRole("button", { name: "Open class record" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeInTheDocument());
  });

  it("adds a new subject and selects it", async () => {
    const user = userEvent.setup();
    const { subjectRepo } = renderScreen();
    await screen.findByLabelText("Section");

    await user.type(screen.getByLabelText("Add a subject"), "Science");
    await user.click(screen.getByRole("button", { name: "Add subject" }));

    await waitFor(() => expect(screen.getByText("Science added.")).toBeInTheDocument());
    expect(subjectRepo.createCalls).toEqual(["Science"]);
    expect(screen.getByLabelText("Subject")).toHaveValue("sub-2");
  });

  it("does not add a second subject while the first add is still in flight", async () => {
    const user = userEvent.setup();
    const subjectRepo = new FakeSubjectRepository();
    subjectRepo.pending = true;
    renderScreen({ subjectRepo });
    await screen.findByLabelText("Section");

    await user.type(screen.getByLabelText("Add a subject"), "Science");
    const addButton = screen.getByRole("button", { name: "Add subject" });
    await user.click(addButton);
    await waitFor(() => expect(subjectRepo.createCalls).toHaveLength(1));

    expect(addButton).toHaveAttribute("aria-disabled", "true");
    await user.click(addButton);

    expect(subjectRepo.createCalls).toHaveLength(1);
  });

  it("lists existing class records", async () => {
    const classRecordRepo = new FakeClassRecordRepository([
      {
        id: "cr-1",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: WEIGHT_POLICY.name,
        createdAt: "now",
        itemCount: 3,
        recordedCount: 24,
        totalEligible: 30,
      },
    ]);
    renderScreen({ classRecordRepo });

    expect(await screen.findByText("Mabini")).toBeInTheDocument();
    expect(screen.getByRole("cell", { name: "Mathematics" })).toBeInTheDocument();
  });

  it("shows a compact per-class-record progress summary", async () => {
    const classRecordRepo = new FakeClassRecordRepository([
      {
        id: "cr-1",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: WEIGHT_POLICY.name,
        createdAt: "now",
        itemCount: 3,
        recordedCount: 24,
        totalEligible: 30,
      },
      {
        id: "cr-2",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-2",
        subjectName: "Science",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: WEIGHT_POLICY.name,
        createdAt: "now",
        itemCount: 0,
        recordedCount: 0,
        totalEligible: 30,
      },
    ]);
    renderScreen({ classRecordRepo });

    expect(await screen.findByText("3 items · 24 of 90 recorded")).toBeInTheDocument();
    expect(screen.getByText("No assessment items yet")).toBeInTheDocument();
  });

  it("refreshes the progress summary after returning from a workspace, not just on first mount", async () => {
    const user = userEvent.setup();
    const classRecordRepo = new FakeClassRecordRepository([
      {
        id: "cr-1",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: WEIGHT_POLICY.name,
        createdAt: "now",
        itemCount: 0,
        recordedCount: 0,
        totalEligible: 30,
      },
    ]);
    renderScreen({ classRecordRepo });

    expect(await screen.findByText("No assessment items yet")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Open workspace" }));
    await screen.findByRole("heading", { name: "Class Record Workspace" });

    // While the workspace is open, scoring happened -- simulate the
    // repository's next `list()` reflecting that, exactly as the real
    // Tauri repository would after items/scores are recorded.
    classRecordRepo.records = [{ ...classRecordRepo.records[0]!, itemCount: 2, recordedCount: 15 }];

    await user.click(screen.getByRole("button", { name: "Back to Class Records" }));

    expect(await screen.findByText("2 items · 15 of 60 recorded")).toBeInTheDocument();
    expect(classRecordRepo.listCallCount).toBeGreaterThanOrEqual(2);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Class Records" })).toHaveFocus(),
    );
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await screen.findByLabelText("Section");
    await waitFor(() => expect(screen.getByLabelText("Grading period")).toHaveValue("gp-1"));
    await waitFor(() =>
      expect(screen.getByLabelText("DepEd grading weighting")).toHaveValue("wp-1"),
    );

    await expectNoAccessibilityViolations(container);
  });
});
