import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AssessmentApplicationService } from "../application/assessment-service";
import { ExportApplicationService } from "../application/export-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type {
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
} from "../domain/export";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import type { AssessmentRepository } from "../domain/ports/assessment-repository";
import type { ExportRepository } from "../domain/ports/export-repository";
import type { LearnerScoreRepository } from "../domain/ports/learner-score-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ClassRecordWorkspace } from "./ClassRecordWorkspace";
import { ModeProvider } from "./theme/ModeContext";

const CATEGORY_SET: AssessmentCategorySet = {
  id: "set-1",
  name: "DepEd Classroom Assessment (DO 015, s. 2026)",
  sourceCitation: "DepEd Order No. 015, s. 2026",
  isDefault: true,
  createdAt: "now",
};

const CATEGORY: AssessmentCategory = {
  id: "cat-1",
  setId: "set-1",
  sequence: 1,
  name: "Written Works",
};

const ITEM: AssessmentItemDetail = {
  id: "ai-1",
  schoolId: "s1",
  classRecordId: "cr-1",
  categoryId: "cat-1",
  categoryName: "Written Works",
  name: "Quiz 1",
  maxScore: 20,
  createdAt: "now",
};

const ROSTER_ENTRY: LearnerScoreRosterEntry = {
  learnerId: "l1",
  givenName: "Ana",
  familyName: "Cruz",
  status: null,
  score: null,
  updatedAt: null,
};

class FakeAssessmentRepository implements AssessmentRepository {
  createCalls: Array<{
    classRecordId: string;
    categoryId: string;
    name: string;
    maxScore: number;
  }> = [];
  createResult: AssessmentItem | null = {
    id: "ai-2",
    schoolId: "s1",
    classRecordId: "cr-1",
    categoryId: "cat-1",
    name: "Quiz 2",
    maxScore: 10,
    createdAt: "now",
  };

  constructor(private items: AssessmentItemDetail[] = [ITEM]) {}

  async listCategorySets(): Promise<AssessmentCategorySet[]> {
    return [CATEGORY_SET];
  }

  async listCategoriesForSet(): Promise<AssessmentCategory[]> {
    return [CATEGORY];
  }

  async listItemsByClassRecord(): Promise<AssessmentItemDetail[]> {
    return this.items;
  }

  async createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    this.createCalls.push({ classRecordId, categoryId, name, maxScore });
    if (this.createResult) {
      this.items = [
        ...this.items,
        {
          id: this.createResult.id,
          schoolId: this.createResult.schoolId,
          classRecordId,
          categoryId,
          categoryName: CATEGORY.name,
          name,
          maxScore,
          createdAt: "now",
        },
      ];
    }
    return this.createResult;
  }
}

class FakeLearnerScoreRepository implements LearnerScoreRepository {
  recordCalls: Array<{
    assessmentItemId: string;
    learnerId: string;
    status: LearnerScoreStatus;
    score: number | null;
  }> = [];
  recordResult: LearnerScore | null = {
    id: "ls-1",
    schoolId: "s1",
    assessmentItemId: "ai-1",
    learnerId: "l1",
    status: "scored",
    score: 18,
    recordedByUserId: "u1",
    recordedAt: "now",
    updatedAt: "now",
  };

  constructor(private roster: LearnerScoreRosterEntry[] | null = [ROSTER_ENTRY]) {}

  async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
    return this.roster;
  }

  async record(
    assessmentItemId: string,
    learnerId: string,
    status: LearnerScoreStatus,
    score: number | null,
  ): Promise<LearnerScore | null> {
    this.recordCalls.push({ assessmentItemId, learnerId, status, score });
    return this.recordResult;
  }

  computeTermGradeCalls: Array<{ classRecordId: string; learnerId: string }> = [];
  computeTermGradeResult: ComputedTermGrade | null = {
    initialGrade: 85.8,
    termGrade: 88,
    wasTransmuted: true,
    wasFloored: false,
  };

  async computeTermGrade(
    classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    this.computeTermGradeCalls.push({ classRecordId, learnerId });
    return this.computeTermGradeResult;
  }
}

class FakeExportRepository implements ExportRepository {
  reportCardCalls: Array<{ classRecordId: string }> = [];
  reportCardResult: ReportCardExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ReportCard_Mabini_Science_1st_Term.csv",
    disclosure: {
      populatedFields: ["Learner Name", "Term Grade"],
      omittedFields: [{ field: "Qualitative Descriptor", reason: "not re-verified" }],
    },
  };

  async exportSectionMonthlySf2(): Promise<Sf2ExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    this.reportCardCalls.push({ classRecordId });
    return this.reportCardResult;
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }
}

function renderScreen(
  options: {
    assessmentRepo?: FakeAssessmentRepository;
    scoreRepo?: FakeLearnerScoreRepository;
    exportRepo?: FakeExportRepository;
  } = {},
) {
  const assessmentRepo = options.assessmentRepo ?? new FakeAssessmentRepository();
  const scoreRepo = options.scoreRepo ?? new FakeLearnerScoreRepository();
  const exportRepo = options.exportRepo ?? new FakeExportRepository();
  const result = render(
    <ModeProvider>
      <ClassRecordWorkspace
        classRecordId="cr-1"
        weightPolicyName="DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)"
        assessmentService={new AssessmentApplicationService(assessmentRepo)}
        learnerScoreService={new LearnerScoreApplicationService(scoreRepo)}
        exportService={new ExportApplicationService(exportRepo)}
      />
    </ModeProvider>,
  );
  return { ...result, assessmentRepo, scoreRepo, exportRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ClassRecordWorkspace", () => {
  it("lists existing assessment items", async () => {
    renderScreen();

    expect(
      await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" }),
    ).toBeInTheDocument();
  });

  it("creates a new assessment item", async () => {
    const user = userEvent.setup();
    const { assessmentRepo } = renderScreen();
    await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" });

    await user.type(screen.getByLabelText("Item name"), "Quiz 2");
    await user.clear(screen.getByLabelText("Max score"));
    await user.type(screen.getByLabelText("Max score"), "10");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(screen.getByText("Quiz 2 added.")).toBeInTheDocument());
    expect(assessmentRepo.createCalls).toEqual([
      { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 2", maxScore: 10 },
    ]);
  });

  it("selecting an item shows its roster", async () => {
    const user = userEvent.setup();
    renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });

    await user.click(itemButton);

    expect(await screen.findByText("Quiz 1 scores")).toBeInTheDocument();
    expect(screen.getByRole("rowheader", { name: "Ana Cruz" })).toBeInTheDocument();
  });

  it("saves a score when the field loses focus (blur-commit)", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18");
    await user.tab();

    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 18 },
      ]),
    );
  });

  it("saves on Enter and moves focus to the next learner's score field", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([
        ROSTER_ENTRY,
        {
          learnerId: "l2",
          givenName: "Bo",
          familyName: "Reyes",
          status: null,
          score: null,
          updatedAt: null,
        },
      ]),
    });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");

    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 18 },
      ]),
    );
    expect(screen.getByLabelText("Score for Bo Reyes")).toHaveFocus();
  });

  it("does not re-save an unchanged value on blur", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([
        {
          learnerId: "l1",
          givenName: "Ana",
          familyName: "Cruz",
          status: "scored",
          score: 18,
          updatedAt: "2026-08-20T09:15:00.000Z",
        },
      ]),
    });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.click(input);
    await user.tab();

    expect(scoreRepo.recordCalls).toEqual([]);
  });

  it("Escape reverts an unsaved edit without saving", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([
        {
          learnerId: "l1",
          givenName: "Ana",
          familyName: "Cruz",
          status: "scored",
          score: 18,
          updatedAt: "2026-08-20T09:15:00.000Z",
        },
      ]),
    });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.clear(input);
    await user.type(input, "5");
    await user.keyboard("{Escape}");

    expect(input).toHaveValue(18);
    expect(scoreRepo.recordCalls).toEqual([]);
  });

  it("shows an inline error and keeps focus in the field when the score is out of range", async () => {
    const user = userEvent.setup();
    renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.type(input, "999{Enter}");

    expect(await screen.findByRole("alert")).toHaveTextContent("Score must be between 0 and 20.");
    expect(input).toHaveFocus();
  });

  it("records an excused entry via its dedicated button, without touching the score field", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Excused" }));

    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        { assessmentItemId: "ai-1", learnerId: "l1", status: "excused", score: null },
      ]),
    );
  });

  it("shows the last-saved time for a previously scored entry", async () => {
    const user = userEvent.setup();
    renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([
        {
          learnerId: "l1",
          givenName: "Ana",
          familyName: "Cruz",
          status: "scored",
          score: 18,
          updatedAt: "2026-08-20T09:15:00.000Z",
        },
      ]),
    });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);

    expect(await screen.findByText(/^Saved /)).toBeInTheDocument();
  });

  it("computes and shows term grades for every learner on the roster", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Show term grades" }));

    await waitFor(() =>
      expect(scoreRepo.computeTermGradeCalls).toEqual([{ classRecordId: "cr-1", learnerId: "l1" }]),
    );
    expect(await screen.findByText("88")).toBeInTheDocument();
  });

  it("shows 'Not yet available' for a learner with no computable term grade yet", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository();
    scoreRepo.computeTermGradeResult = null;
    renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Show term grades" }));

    expect(await screen.findByText("Not yet available")).toBeInTheDocument();
  });

  it("exports a report card for the class record and shows the saved path", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Export report card (CSV)" }));

    await waitFor(() => expect(exportRepo.reportCardCalls).toEqual([{ classRecordId: "cr-1" }]));
    expect(
      await screen.findByText("ReportCard_Mabini_Science_1st_Term.csv", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Qualitative Descriptor", { exact: false })).toBeInTheDocument();
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen();

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Class Record Workspace" })).toHaveFocus(),
    );
  });

  it("has no detectable accessibility violations", async () => {
    const user = userEvent.setup();
    const { container } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await expectNoAccessibilityViolations(container);
  });
});
