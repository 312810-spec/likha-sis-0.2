import { SessionDraftProvider } from "./SessionDraftProvider";
import { clearSessionDrafts } from "./session-draft-store";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentApplicationService } from "../application/assessment-service";
import { ExportApplicationService } from "../application/export-service";
import { LearnerScoreApplicationService } from "../application/learner-score-service";
import { LearnerScoreSyncStatusApplicationService } from "../application/learner-score-sync-status-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type {
  ClassSummaryExportResult,
  LearnerRosterExportResult,
  ReportCardExportResult,
  Sf2ExportResult,
  Sf5ExportResult,
  Sf6ExportResult,
} from "../domain/export";
import type {
  ComputedTermGrade,
  LearnerScore,
  LearnerScoreCorrection,
  LearnerScoreRosterEntry,
  LearnerScoreStatus,
} from "../domain/learner-score";
import type { ReportReadinessRepository } from "../domain/ports/report-readiness-repository";
import type { ReportCardReadiness } from "../domain/report-readiness";
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
  recordedCount: 0,
  totalEligible: 0,
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
  pending = false;

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
    if (this.pending) return new Promise<AssessmentItem | null>(() => {});
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
          recordedCount: 0,
          totalEligible: 0,
        },
      ];
    }
    return this.createResult;
  }

  renameCalls: Array<{ id: string; name: string }> = [];
  renameResult: AssessmentItem | null = null;
  async renameItem(id: string, name: string): Promise<AssessmentItem | null> {
    this.renameCalls.push({ id, name });
    if (this.pending) return new Promise<AssessmentItem | null>(() => {});
    return this.renameResult;
  }

  updateCalls: Array<{ id: string; name: string; categoryId: string; maxScore: number }> = [];
  updateResult: AssessmentItem | null = null;
  async updateItem(
    id: string,
    name: string,
    categoryId: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    this.updateCalls.push({ id, name, categoryId, maxScore });
    if (this.pending) return new Promise<AssessmentItem | null>(() => {});
    return this.updateResult;
  }

  deleteCalls: string[] = [];
  deleteResult = true;
  async deleteItem(id: string): Promise<boolean> {
    this.deleteCalls.push(id);
    if (this.pending) return new Promise<boolean>(() => {});
    return this.deleteResult;
  }
}

class FakeLearnerScoreRepository implements LearnerScoreRepository {
  recordCalls: Array<{
    assessmentItemId: string;
    learnerId: string;
    status: LearnerScoreStatus;
    score: number | null;
    correctionReason: string | null;
  }> = [];
  correctionHistoryResult: LearnerScoreCorrection[] = [];
  correctionHistoryCalls = 0;
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
    correctionReason: string | null,
  ): Promise<LearnerScore | null> {
    this.recordCalls.push({ assessmentItemId, learnerId, status, score, correctionReason });
    return this.recordResult;
  }

  async correctionHistory(): Promise<LearnerScoreCorrection[]> {
    this.correctionHistoryCalls += 1;
    return this.correctionHistoryResult;
  }

  computeTermGradeCalls: Array<{ classRecordId: string; learnerId: string }> = [];
  computeTermGradeResult: ComputedTermGrade | null = {
    initialGrade: 85.8,
    termGrade: 88,
    wasTransmuted: true,
    wasFloored: false,
    complete: true,
  };
  computeTermGradePending = false;

  async computeTermGrade(
    classRecordId: string,
    learnerId: string,
  ): Promise<ComputedTermGrade | null> {
    this.computeTermGradeCalls.push({ classRecordId, learnerId });
    if (this.computeTermGradePending) return new Promise<ComputedTermGrade | null>(() => {});
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

  reportCardPending = false;
  async exportClassRecordReportCard(classRecordId: string): Promise<ReportCardExportResult | null> {
    this.reportCardCalls.push({ classRecordId });
    if (this.reportCardPending) return new Promise<ReportCardExportResult | null>(() => {});
    return this.reportCardResult;
  }

  classSummaryCalls: Array<{ classRecordId: string }> = [];
  classSummaryResult: ClassSummaryExportResult | null = {
    filePath: "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ClassSummary_Mabini_Science_1st_Term.csv",
    disclosure: {
      populatedFields: ["Learner Name", "Current Average"],
      omittedFields: [{ field: "Initial Grade", reason: "see the full report card" }],
    },
  };
  classSummaryPending = false;
  async exportClassRecordSummary(classRecordId: string): Promise<ClassSummaryExportResult | null> {
    this.classSummaryCalls.push({ classRecordId });
    if (this.classSummaryPending) return new Promise<ClassSummaryExportResult | null>(() => {});
    return this.classSummaryResult;
  }

  async exportLearnerRoster(): Promise<LearnerRosterExportResult | null> {
    throw new Error("not used in this test");
  }

  async exportLearnerPermanentRecordSf10(): Promise<
    import("../domain/export").Sf10ExportResult | null
  > {
    throw new Error("not used in this test");
  }

  revealCalls: string[] = [];
  revealShouldThrow = false;

  async revealExportedFile(filePath: string): Promise<void> {
    this.revealCalls.push(filePath);
    if (this.revealShouldThrow) throw new Error("could not open folder");
  }
}

function renderScreen(
  options: {
    assessmentRepo?: FakeAssessmentRepository;
    scoreRepo?: FakeLearnerScoreRepository;
    exportRepo?: FakeExportRepository;
    syncService?: LearnerScoreSyncStatusApplicationService;
    owner?: string;
    readiness?: ReportReadinessRepository;
  } = {},
) {
  const assessmentRepo = options.assessmentRepo ?? new FakeAssessmentRepository();
  const scoreRepo = options.scoreRepo ?? new FakeLearnerScoreRepository();
  const exportRepo = options.exportRepo ?? new FakeExportRepository();
  const result = render(
    <SessionDraftProvider owner={options.owner ?? null}>
      <ModeProvider>
        <ClassRecordWorkspace
          classRecordId="cr-1"
          teachingAssignmentId={options.syncService ? "ta-1" : undefined}
          learnerScoreSyncStatusService={options.syncService}
          weightPolicyName="DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)"
          assessmentService={new AssessmentApplicationService(assessmentRepo)}
          learnerScoreService={new LearnerScoreApplicationService(scoreRepo)}
          exportService={new ExportApplicationService(exportRepo, options.readiness)}
        />
      </ModeProvider>
    </SessionDraftProvider>,
  );
  return { ...result, assessmentRepo, scoreRepo, exportRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("ClassRecordWorkspace", () => {
  it("updates assessment completion and protection after the first saved score", async () => {
    const user = userEvent.setup();
    renderScreen();
    await user.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    await user.type(await screen.findByLabelText("Score for Ana Cruz"), "18{Enter}");
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\).*1 of 1 recorded/ });
    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByText(/Can’t delete — already has recorded scores/)).toBeInTheDocument();
  });
  it("keeps an unfinished assessment draft when the editor is collapsed", async () => {
    const user = userEvent.setup();
    renderScreen();
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });
    const toggle = screen.getByRole("button", { name: "Add assessment item" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    await user.click(toggle);
    await user.type(screen.getByLabelText("Item name"), "Draft quiz");
    await user.click(screen.getByRole("button", { name: "Close item editor" }));
    expect(screen.getByLabelText("Item name")).not.toBeVisible();
    await user.click(toggle);
    expect(screen.getByLabelText("Item name")).toHaveValue("Draft quiz");
  });
  it("explains grading categories and links the help to each field in Guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen();
    await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" });

    await userEvent.click(screen.getByRole("button", { name: "Add assessment item" }));
    const categorySet = screen.getByLabelText("Category set");
    const category = screen.getByLabelText("Category");
    expect(categorySet).toHaveAccessibleDescription(/DepEd grading rules/);
    expect(category).toHaveAccessibleDescription(/activity type/);
  });

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

    await user.click(screen.getByRole("button", { name: "Add assessment item" }));
    await user.type(screen.getByLabelText("Item name"), "Quiz 2");
    await user.clear(screen.getByLabelText("Max score"));
    await user.type(screen.getByLabelText("Max score"), "10");
    await user.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(screen.getByText("Quiz 2 added.")).toBeInTheDocument());
    expect(assessmentRepo.createCalls).toEqual([
      { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 2", maxScore: 10 },
    ]);
  });

  it("shows a per-item completion readout once the item has eligible learners", async () => {
    const itemWithCounts: AssessmentItemDetail = {
      ...ITEM,
      recordedCount: 2,
      totalEligible: 5,
    };
    renderScreen({ assessmentRepo: new FakeAssessmentRepository([itemWithCounts]) });

    expect(
      await screen.findByRole("button", {
        name: "Written Works — Quiz 1 (max 20) · 2 of 5 recorded",
      }),
    ).toBeInTheDocument();
  });

  it("renames an already-scored item without offering to change its category or max score", async () => {
    const user = userEvent.setup();
    const scoredItem: AssessmentItemDetail = { ...ITEM, recordedCount: 3, totalEligible: 5 };
    const assessmentRepo = new FakeAssessmentRepository([scoredItem]);
    assessmentRepo.renameResult = { ...scoredItem, name: "Quiz 1 (Retake)" };
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Edit" }));

    expect(
      screen.getByText(/already contains learner scores/, { exact: false }),
    ).toBeInTheDocument();
    expect(screen.queryAllByLabelText("Category")).toHaveLength(1); // only the create form's
    expect(screen.queryAllByLabelText("Max score")).toHaveLength(1); // only the create form's

    // Two "Item name" fields exist -- the always-visible create form's, and
    // this edit form's -- so index into the pair rather than getByLabelText.
    const nameField = screen.getAllByLabelText("Item name")[1]!;
    await user.clear(nameField);
    await user.type(nameField, "Quiz 1 (Retake)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(assessmentRepo.renameCalls).toEqual([{ id: "ai-1", name: "Quiz 1 (Retake)" }]),
    );
    expect(assessmentRepo.updateCalls).toEqual([]);
    await waitFor(() => expect(screen.getByText("Quiz 1 (Retake) updated.")).toBeInTheDocument());
  });

  it("fully edits an unscored item's name, category, and max score", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.updateResult = {
      id: "ai-1",
      schoolId: "s1",
      classRecordId: "cr-1",
      categoryId: "cat-1",
      name: "Quiz 1 (Revised)",
      maxScore: 25,
      createdAt: "now",
    };
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getAllByLabelText("Item name")[1]!;
    await user.clear(nameField);
    await user.type(nameField, "Quiz 1 (Revised)");
    const maxField = screen.getAllByLabelText("Max score")[1]!;
    await user.clear(maxField);
    await user.type(maxField, "25");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() =>
      expect(assessmentRepo.updateCalls).toEqual([
        { id: "ai-1", name: "Quiz 1 (Revised)", categoryId: "cat-1", maxScore: 25 },
      ]),
    );
    await waitFor(() => expect(screen.getByText("Quiz 1 (Revised) updated.")).toBeInTheDocument());
  });

  it("deletes an unscored item only after a second confirming click", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    expect(screen.getByText(/can.t be undone/i)).toBeInTheDocument();
    expect(assessmentRepo.deleteCalls).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => expect(assessmentRepo.deleteCalls).toEqual(["ai-1"]));
    await waitFor(() => expect(screen.getByText("Quiz 1 deleted.")).toBeInTheDocument());
  });

  it("does not offer to delete an item that already has recorded scores", async () => {
    const scoredItem: AssessmentItemDetail = { ...ITEM, recordedCount: 1, totalEligible: 5 };
    renderScreen({ assessmentRepo: new FakeAssessmentRepository([scoredItem]) });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    expect(screen.queryByRole("button", { name: "Delete" })).not.toBeInTheDocument();
    expect(screen.getByText(/already has recorded scores/, { exact: false })).toBeInTheDocument();
  });

  it("disambiguates each item's Edit/Delete buttons by name, for assistive technology", async () => {
    const user = userEvent.setup();
    const item2: AssessmentItemDetail = {
      ...ITEM,
      id: "ai-2",
      name: "Quiz 2",
      recordedCount: 0,
      totalEligible: 0,
    };
    const assessmentRepo = new FakeAssessmentRepository([ITEM, item2]);
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    // Two items both render an "Edit" and a "Delete" button -- a screen
    // reader must be able to tell them apart via the surrounding group's
    // accessible name, not just document order.
    const quiz1Group = screen.getByRole("group", { name: "Actions for Quiz 1" });
    const quiz2Group = screen.getByRole("group", { name: "Actions for Quiz 2" });

    await user.click(within(quiz2Group).getByRole("button", { name: "Delete" }));

    expect(within(quiz2Group).getByText(/can.t be undone/i)).toBeInTheDocument();
    // Quiz 1's group must be entirely unaffected by Quiz 2's delete confirmation.
    expect(within(quiz1Group).getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(within(quiz1Group).getByRole("button", { name: "Delete" })).toBeInTheDocument();
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

  it("asks for a reason before changing an already-recorded score, and writes nothing until one is given", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19");
    await user.tab();

    // The change is held, not written — the boundary requires a reason, and
    // the row asks for one inline instead of surfacing a rejection.
    expect(repo.recordCalls).toEqual([]);
    expect(
      await screen.findByLabelText("Reason for changing Ana Cruz's recorded score"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("A reason is required to change a recorded score."),
    ).toBeInTheDocument();
  });

  it("writes the correction with its reason once the teacher provides one", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.clear(screen.getByLabelText("Score for Ana Cruz"));
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19");
    await user.tab();
    const reasonField = await screen.findByLabelText(
      "Reason for changing Ana Cruz's recorded score",
    );
    await user.type(reasonField, "Rechecked the written work{Enter}");

    await waitFor(() =>
      expect(repo.recordCalls).toEqual([
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "scored",
          score: 19,
          correctionReason: "Rechecked the written work",
        },
      ]),
    );
    // The row returns to normal score entry once the correction lands.
    expect(screen.getByLabelText("Score for Ana Cruz")).toBeInTheDocument();
  });

  it("cancelling a held correction writes nothing and restores the recorded score", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.clear(screen.getByLabelText("Score for Ana Cruz"));
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19");
    await user.tab();
    const reasonField = await screen.findByLabelText(
      "Reason for changing Ana Cruz's recorded score",
    );
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(repo.recordCalls).toEqual([]);
    expect(reasonField).not.toBeInTheDocument();
    expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(15);
  });

  it("shows a recorded score's correction history when the teacher opens it", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    scoreRepo.correctionHistoryResult = [
      {
        id: "corr-1",
        assessmentItemId: "ai-1",
        learnerId: "l1",
        previousStatus: "scored",
        previousScore: 12,
        previousRecordedByUserId: "u-2",
        previousRecordedByName: "Ben Reyes",
        previousRecordedAt: "2026-10-01T09:00:00Z",
        newStatus: "scored",
        newScore: 15,
        correctedByUserId: "u-1",
        correctedByName: "Ana Santos",
        reason: "Recounted the written work",
        correctedAt: "2026-10-03T11:00:00Z",
      },
    ];
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    // M07: the command existed but nothing in production called it. This is
    // the wiring — a recorded score carries its lineage one click away.
    await user.click(screen.getByRole("button", { name: /correction history for ana cruz/i }));

    expect(repo.correctionHistoryCalls).toBe(1);
    expect(await screen.findByText(/recounted the written work/i)).toBeInTheDocument();
    expect(screen.getByText(/ben reyes/i)).toBeInTheDocument();
  });

  it("offers no history affordance on a score that has never been recorded", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: null, score: null, updatedAt: null },
    ]);
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    expect(
      screen.queryByRole("button", { name: /correction history for ana cruz/i }),
    ).not.toBeInTheDocument();
    expect(repo.correctionHistoryCalls).toBe(0);
  });

  it("marks an exception on an already-recorded score as a correction that needs a reason", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    const { scoreRepo: repo } = renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Excused" }));

    expect(repo.recordCalls).toEqual([]);
    expect(
      await screen.findByLabelText("Reason for changing Ana Cruz's recorded score"),
    ).toBeInTheDocument();
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
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "scored",
          score: 18,
          correctionReason: null,
        },
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
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "scored",
          score: 18,
          correctionReason: null,
        },
      ]),
    );
    expect(screen.getByLabelText("Score for Bo Reyes")).toHaveFocus();
  });

  it("ArrowDown saves and moves focus down; ArrowUp saves and moves focus up", async () => {
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

    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{ArrowDown}");
    await waitFor(() => expect(screen.getByLabelText("Score for Bo Reyes")).toHaveFocus());

    await user.type(screen.getByLabelText("Score for Bo Reyes"), "15{ArrowUp}");
    await waitFor(() => expect(screen.getByLabelText("Score for Ana Cruz")).toHaveFocus());

    expect(scoreRepo.recordCalls).toEqual([
      {
        assessmentItemId: "ai-1",
        learnerId: "l1",
        status: "scored",
        score: 18,
        correctionReason: null,
      },
      {
        assessmentItemId: "ai-1",
        learnerId: "l2",
        status: "scored",
        score: 15,
        correctionReason: null,
      },
    ]);
  });

  it("Tab saves and moves focus to the next learner's score field, and Shift+Tab moves back up", async () => {
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

    // Without Tab handling, native Tab leaves the score grid for the row's
    // Excused/N/A buttons — a gradebook costing a mouse per row.
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Tab}");
    await waitFor(() => expect(screen.getByLabelText("Score for Bo Reyes")).toHaveFocus());

    await user.type(screen.getByLabelText("Score for Bo Reyes"), "15{Shift>}{Tab}{/Shift}");
    await waitFor(() => expect(screen.getByLabelText("Score for Ana Cruz")).toHaveFocus());

    expect(scoreRepo.recordCalls).toEqual([
      {
        assessmentItemId: "ai-1",
        learnerId: "l1",
        status: "scored",
        score: 18,
        correctionReason: null,
      },
      {
        assessmentItemId: "ai-1",
        learnerId: "l2",
        status: "scored",
        score: 15,
        correctionReason: null,
      },
    ]);
  });

  it("Tab does not move focus away when the save is rejected, so the entry is not silently dropped", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      ROSTER_ENTRY,
      {
        learnerId: "l2",
        givenName: "Bo",
        familyName: "Reyes",
        status: null,
        score: null,
        updatedAt: null,
      },
    ]);
    // The Rust boundary returns Ok(None) for an out-of-range score; the
    // recordResult is what that surfaces as here.
    scoreRepo.recordResult = null;
    renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.type(input, "18{Tab}");

    await waitFor(() => expect(scoreRepo.recordCalls).toHaveLength(1));
    expect(input).toHaveFocus();
  });

  it("ArrowDown on the last learner's row does not move focus away (no next row to go to)", async () => {
    const user = userEvent.setup();
    renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.type(input, "18{ArrowDown}");

    await waitFor(() => expect(input).toHaveFocus());
  });

  it("a failed save shows an inline error and never moves focus away from the row that needs fixing", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository([
      ROSTER_ENTRY,
      {
        learnerId: "l2",
        givenName: "Bo",
        familyName: "Reyes",
        status: null,
        score: null,
        updatedAt: null,
      },
    ]);
    scoreRepo.recordResult = null;
    renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.type(input, "18{Enter}");

    expect(await screen.findByText("Could not save this score.")).toBeInTheDocument();
    // Enter would normally move focus to the next learner on success --
    // a rejected save must never imply success by moving focus away from
    // the row a teacher still needs to fix.
    expect(input).toHaveFocus();
    expect(screen.getByLabelText("Score for Bo Reyes")).not.toHaveFocus();
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
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "excused",
          score: null,
          correctionReason: null,
        },
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

  it("marks a computable grade provisional when not every score is recorded yet", async () => {
    // CTOS §5: provisional values must be visibly provisional. A grade that
    // is real but computed over a class record with blanks left must read
    // differently from a finished one — a teacher deciding whether a 88 is
    // final has no other signal on this screen.
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository();
    scoreRepo.computeTermGradeResult = {
      initialGrade: 85.8,
      termGrade: 88,
      wasTransmuted: true,
      wasFloored: false,
      complete: false,
    };
    renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Show term grades" }));

    expect(await screen.findByText("88")).toBeInTheDocument();
    expect(screen.getByText(/provisional/)).toBeInTheDocument();
  });

  it("shows a complete grade with no provisional marker", async () => {
    const user = userEvent.setup();
    renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Show term grades" }));

    expect(await screen.findByText("88")).toBeInTheDocument();
    expect(screen.queryByText(/provisional/)).not.toBeInTheDocument();
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

  it("opens the folder for the exported report card when Open folder is clicked", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");
    await user.click(screen.getByRole("button", { name: "Export report card (CSV)" }));
    await screen.findByText("ReportCard_Mabini_Science_1st_Term.csv", { exact: false });

    await user.click(screen.getByRole("button", { name: "Open report card folder" }));

    await waitFor(() =>
      expect(exportRepo.revealCalls).toEqual([
        "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ReportCard_Mabini_Science_1st_Term.csv",
      ]),
    );
  });

  it("exports a class summary for the class record and shows the saved path", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Export class summary (CSV)" }));

    await waitFor(() => expect(exportRepo.classSummaryCalls).toEqual([{ classRecordId: "cr-1" }]));
    expect(
      await screen.findByText("ClassSummary_Mabini_Science_1st_Term.csv", { exact: false }),
    ).toBeInTheDocument();
    expect(screen.getByText("Initial Grade", { exact: false })).toBeInTheDocument();
  });

  it("opens the folder for the exported class summary when Open folder is clicked", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");
    await user.click(screen.getByRole("button", { name: "Export class summary (CSV)" }));
    await screen.findByText("ClassSummary_Mabini_Science_1st_Term.csv", { exact: false });

    await user.click(screen.getByRole("button", { name: "Open class summary folder" }));

    await waitFor(() =>
      expect(exportRepo.revealCalls).toEqual([
        "C:\\Users\\teacher\\Documents\\LIKHA-SIS\\ClassSummary_Mabini_Science_1st_Term.csv",
      ]),
    );
  });

  it("never shows a previous assessment item's roster after switching to an item whose load fails", async () => {
    const user = userEvent.setup();
    const ITEM_2: AssessmentItemDetail = {
      id: "ai-2",
      schoolId: "s1",
      classRecordId: "cr-1",
      categoryId: "cat-1",
      categoryName: "Written Works",
      name: "Quiz 2",
      maxScore: 10,
      createdAt: "now",
      recordedCount: 0,
      totalEligible: 0,
    };

    class PerItemLearnerScoreRepository implements LearnerScoreRepository {
      async rosterForItem(assessmentItemId: string): Promise<LearnerScoreRosterEntry[] | null> {
        if (assessmentItemId === "ai-2") {
          throw new Error("simulated roster load failure");
        }
        return [ROSTER_ENTRY];
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

    render(
      <ModeProvider>
        <ClassRecordWorkspace
          classRecordId="cr-1"
          weightPolicyName="DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)"
          assessmentService={
            new AssessmentApplicationService(new FakeAssessmentRepository([ITEM, ITEM_2]))
          }
          learnerScoreService={
            new LearnerScoreApplicationService(new PerItemLearnerScoreRepository())
          }
          exportService={new ExportApplicationService(new FakeExportRepository())}
        />
      </ModeProvider>,
    );

    const item1Button = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(item1Button);
    expect(await screen.findByText("Ana Cruz")).toBeInTheDocument();

    const item2Button = screen.getByRole("button", { name: "Written Works — Quiz 2 (max 10)" });
    await user.click(item2Button);

    await screen.findByText(/could not load the roster for this item/i);
    // Item 1's roster must never render as if it belongs to Item 2.
    expect(screen.queryByText("Ana Cruz")).not.toBeInTheDocument();
  });

  it("prevents a concurrent exception write while allowing another learner to save", async () => {
    const user = userEvent.setup();

    class OrderControlledLearnerScoreRepository implements LearnerScoreRepository {
      calls: Array<{
        assessmentItemId: string;
        learnerId: string;
        status: LearnerScoreStatus;
        score: number | null;
        correctionReason: string | null;
      }> = [];
      private pending: Array<(result: LearnerScore) => void> = [];

      async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
        return [
          ROSTER_ENTRY,
          {
            learnerId: "l2",
            givenName: "Bo",
            familyName: "Reyes",
            status: null,
            score: null,
            updatedAt: null,
          },
        ];
      }
      record(
        assessmentItemId: string,
        learnerId: string,
        status: LearnerScoreStatus,
        score: number | null,
        correctionReason: string | null,
      ): Promise<LearnerScore | null> {
        this.calls.push({ assessmentItemId, learnerId, status, score, correctionReason });
        const index = this.calls.length - 1;
        return new Promise((resolve) => {
          this.pending[index] = resolve;
        });
      }
      async correctionHistory(): Promise<LearnerScoreCorrection[]> {
        return [];
      }
      resolveCall(index: number) {
        const call = this.calls[index];
        if (!call) throw new Error(`no call recorded at index ${index}`);
        this.pending[index]?.({
          id: `ls-${index}`,
          schoolId: "s1",
          assessmentItemId: "ai-1",
          learnerId: call.learnerId,
          status: call.status,
          score: call.score,
          recordedByUserId: "u1",
          recordedAt: "now",
          updatedAt: `record-${index}`,
        });
      }
      async computeTermGrade(): Promise<ComputedTermGrade | null> {
        throw new Error("not used in this test");
      }
    }

    const repo = new OrderControlledLearnerScoreRepository();
    render(
      <ModeProvider>
        <ClassRecordWorkspace
          classRecordId="cr-1"
          weightPolicyName="DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)"
          assessmentService={new AssessmentApplicationService(new FakeAssessmentRepository())}
          learnerScoreService={new LearnerScoreApplicationService(repo)}
          exportService={new ExportApplicationService(new FakeExportRepository())}
        />
      </ModeProvider>,
    );
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    const anaGroup = screen.getByRole("group", { name: "Exception status for Ana Cruz" });

    // Same learner is guarded; a different learner remains independently editable.
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");
    await user.type(screen.getByLabelText("Score for Bo Reyes"), "15{Enter}");
    const exception = within(anaGroup).getByRole("button", { name: "Excused" });
    expect(exception).toBeDisabled();
    await user.click(exception);
    expect(repo.calls.map((call) => [call.learnerId, call.status, call.score])).toEqual([
      ["l1", "scored", 18],
      ["l2", "scored", 15],
    ]);
    await act(async () => repo.resolveCall(1));
    expect(exception).toBeDisabled();
    await act(async () => repo.resolveCall(0));
    expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(18);
    expect(exception).not.toBeDisabled();
    await user.click(exception);
    expect(await screen.findByLabelText(/Reason for changing Ana/)).toBeVisible();
    expect(screen.getByText("Recorded: 18 / 20")).toBeVisible();
    expect(screen.getByText("Change to: Excused")).toBeVisible();
    expect(repo.calls).toHaveLength(2);
  });

  it("does not perform a write when the teacher selects the already-active exception status", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([
        {
          learnerId: "l1",
          givenName: "Ana",
          familyName: "Cruz",
          status: "excused",
          score: null,
          updatedAt: "2026-08-20T09:15:00.000Z",
        },
      ]),
    });
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Excused" }));
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scoreRepo.recordCalls).toEqual([]);
  });

  it("automatically refreshes a learner's term grade after a score changes, without another button press", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");

    // A new score is saved after grades were computed -- the repository's
    // computed result changes, simulating a real recomputation.
    scoreRepo.computeTermGradeResult = {
      initialGrade: 90,
      termGrade: 92,
      wasTransmuted: true,
      wasFloored: false,
      complete: true,
    };
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "scored",
          score: 19,
          correctionReason: null,
        },
      ]),
    );

    // The grade refreshes automatically -- no second "Show term grades"
    // click required -- and the old, now-stale number is gone.
    await waitFor(() => expect(screen.getByText("92")).toBeInTheDocument());
    expect(screen.queryByText("88")).not.toBeInTheDocument();
  });

  it("does not attempt to refresh term grades after a score change if grades were never shown", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");

    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        {
          assessmentItemId: "ai-1",
          learnerId: "l1",
          status: "scored",
          score: 19,
          correctionReason: null,
        },
      ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scoreRepo.computeTermGradeCalls).toEqual([]);
  });

  it("does not create a second item while the first creation is still in flight", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.pending = true;
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Add assessment item" }));
    await user.type(screen.getByLabelText("Item name"), "Quiz 2");
    const addButton = screen.getByRole("button", { name: "Add item" });
    await user.click(addButton);
    await waitFor(() => expect(assessmentRepo.createCalls.length).toBe(1));

    expect(addButton).toHaveAttribute("aria-disabled", "true");
    await user.click(addButton);

    expect(assessmentRepo.createCalls.length).toBe(1);
  });

  it("does not save a second edit while the first save is still in flight", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.updateResult = { ...ITEM, name: "Quiz 1 (Revised)" };
    assessmentRepo.pending = true;
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const saveButton = screen.getByRole("button", { name: "Save" });
    await user.click(saveButton);
    await waitFor(() => expect(assessmentRepo.updateCalls.length).toBe(1));

    expect(saveButton).toHaveAttribute("aria-disabled", "true");
    await user.click(saveButton);

    expect(assessmentRepo.updateCalls.length).toBe(1);
  });

  it("does not delete an item twice while the first deletion is still in flight", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.pending = true;
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    const confirmButton = screen.getByRole("button", { name: "Confirm delete" });
    await user.click(confirmButton);
    await waitFor(() => expect(assessmentRepo.deleteCalls.length).toBe(1));

    expect(confirmButton).toHaveAttribute("aria-disabled", "true");
    await user.click(confirmButton);

    expect(assessmentRepo.deleteCalls.length).toBe(1);
  });

  it("does not compute term grades a second time while the first computation is still in flight", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");
    scoreRepo.computeTermGradePending = true;

    const showButton = screen.getByRole("button", { name: "Show term grades" });
    await user.click(showButton);
    await waitFor(() => expect(scoreRepo.computeTermGradeCalls.length).toBe(1));

    expect(showButton).toHaveAttribute("aria-disabled", "true");
    await user.click(showButton);

    expect(scoreRepo.computeTermGradeCalls.length).toBe(1);
  });

  it("does not export the report card a second time while the first export is still in flight", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    const itemButton = await screen.findByRole("button", {
      name: "Written Works — Quiz 1 (max 20)",
    });
    await user.click(itemButton);
    await screen.findByText("Quiz 1 scores");
    exportRepo.reportCardPending = true;

    const exportButton = screen.getByRole("button", { name: "Export report card (CSV)" });
    await user.click(exportButton);
    await waitFor(() => expect(exportRepo.reportCardCalls.length).toBe(1));

    expect(exportButton).toHaveAttribute("aria-disabled", "true");
    await user.click(exportButton);

    expect(exportRepo.reportCardCalls.length).toBe(1);
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

describe("assignment-owned score sync evidence", () => {
  const saved = {
    ...ROSTER_ENTRY,
    status: "scored" as const,
    score: 18,
    updatedAt: "2026-09-15T12:00:00Z",
  };
  async function openItem(user: ReturnType<typeof userEvent.setup>, name = "Quiz 1") {
    await user.click(
      await screen.findByRole("button", { name: `Written Works — ${name} (max 20)` }),
    );
    await screen.findByText(`${name} scores`);
  }
  it("requires refreshed persisted evidence after reconnect, not an online event", async () => {
    const user = userEvent.setup();
    const getStatus = vi.fn().mockResolvedValue("waitingToSync");
    const { scoreRepo } = renderScreen({
      syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }),
    });
    await openItem(user);
    await act(async () => {
      window.dispatchEvent(new Event("offline"));
    });
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");
    await screen.findByText("Last sync check: Waiting to sync");
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
    expect(scoreRepo.recordCalls).toHaveLength(1);
    await act(async () => {
      window.dispatchEvent(new Event("online"));
    });
    expect(getStatus).toHaveBeenCalledTimes(1);
    expect(screen.queryByText("Last sync check: Synced")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh transfer status" }));
    await screen.findByText("Last sync check: Waiting to sync");
    expect(getStatus).toHaveBeenCalledTimes(2);
    getStatus.mockResolvedValue("synced");
    expect(screen.queryByText("Last sync check: Synced")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh transfer status" }));
    await screen.findByText("Last sync check: Synced");
    expect(getStatus).toHaveBeenLastCalledWith("ta-1", "ai-1", "l1");
    expect(scoreRepo.recordCalls).toHaveLength(1);
  });
  it("discards a late pre-denial refresh without losing the local save", async () => {
    const user = userEvent.setup();
    let resolve!: (status: "synced") => void;
    const getStatus = vi
      .fn()
      .mockResolvedValueOnce("waitingToSync")
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            resolve = r;
          }),
      )
      .mockRejectedValue("unauthorized");
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([saved]),
      syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }),
    });
    await openItem(user);
    await screen.findByText("Last sync check: Waiting to sync");
    await user.click(screen.getByRole("button", { name: "Refresh transfer status" }));
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Last sync check/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Refresh transfer status" }));
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(3));
    await act(async () => resolve("synced"));
    expect(screen.queryByText(/Last sync check/)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
    expect(scoreRepo.recordCalls).toHaveLength(0);
  });
  it("hides evidence during drafts and restores it for an unchanged commit without writing", async () => {
    const user = userEvent.setup();
    const getStatus = vi.fn().mockResolvedValue("synced");
    const { scoreRepo } = renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([saved]),
      syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }),
    });
    await openItem(user);
    await screen.findByText("Last sync check: Synced");
    const input = screen.getByLabelText("Score for Ana Cruz");
    await user.clear(input);
    expect(screen.queryByText(/Last sync check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Saved on this device/)).not.toBeInTheDocument();
    await user.type(input, "18{Enter}");
    await screen.findByText("Last sync check: Synced");
    expect(scoreRepo.recordCalls).toEqual([]);
  });
  it("clears a previous snapshot on access denial while preserving the local save", async () => {
    const user = userEvent.setup();
    const getStatus = vi.fn().mockResolvedValueOnce("synced").mockRejectedValue("unauthorized");
    renderScreen({
      scoreRepo: new FakeLearnerScoreRepository([saved]),
      syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }),
    });
    await openItem(user);
    await screen.findByText("Last sync check: Synced");
    await user.click(screen.getByRole("button", { name: "Refresh transfer status" }));
    await waitFor(() => expect(getStatus).toHaveBeenCalledTimes(2));
    expect(screen.queryByText(/Last sync check/)).not.toBeInTheDocument();
    expect(screen.getByText(/Saved on this device/)).toBeInTheDocument();
  });
  it("keeps a successful save when the separate evidence lookup fails", async () => {
    const user = userEvent.setup();
    const getStatus = vi.fn().mockRejectedValue(new Error("offline"));
    renderScreen({ syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }) });
    await openItem(user);
    expect(getStatus).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");
    await screen.findByText(/Saved on this device/);
    await waitFor(() => expect(getStatus).toHaveBeenCalledExactlyOnceWith("ta-1", "ai-1", "l1"));
    expect(screen.queryByText(/Last sync check/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Could not save/)).not.toBeInTheDocument();
  });
  it("discards a saved response from an assessment item that was left", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository();
    let resolve!: (value: LearnerScore | null) => void;
    vi.spyOn(repo, "record").mockImplementation(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    const getStatus = vi.fn().mockResolvedValue("synced");
    renderScreen({
      assessmentRepo: new FakeAssessmentRepository([ITEM, { ...ITEM, id: "ai-2", name: "Quiz 2" }]),
      scoreRepo: repo,
      syncService: new LearnerScoreSyncStatusApplicationService({ getStatus }),
    });
    await openItem(user);
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");
    await openItem(user, "Quiz 2");
    await act(async () => resolve(repo.recordResult));
    expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(null);
    expect(screen.queryByText(/Saved on this device|Last sync check/)).not.toBeInTheDocument();
    expect(getStatus).not.toHaveBeenCalled();
  });
});

describe("score save acknowledgment continuity", () => {
  it("preserves a newer score draft and focus when an older save finishes", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository([
      ROSTER_ENTRY,
      { ...ROSTER_ENTRY, learnerId: "l2", givenName: "Bo", familyName: "Reyes" },
    ]);
    let resolveSave!: (value: LearnerScore | null) => void;
    vi.spyOn(repo, "record").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    renderScreen({ scoreRepo: repo });
    await user.click(
      await screen.findByRole("button", {
        name: "Written Works — Quiz 1 (max 20)",
      }),
    );
    const input = await screen.findByLabelText("Score for Ana Cruz");
    await user.type(input, "18{Enter}");
    await user.clear(input);
    await user.type(input, "19");
    await act(async () => {
      resolveSave(repo.recordResult);
    });
    expect(input).toHaveValue(19);
    expect(screen.getByText(/Not saved/)).toBeVisible();
    expect(screen.getByText(/On this device: 18 \/ 20/)).toBeVisible();
    expect(input).toHaveFocus();
    expect(screen.queryByText(/Saved on this device/)).not.toBeInTheDocument();
    expect(repo.record).toHaveBeenCalledTimes(1);
  });
});

describe("score draft continuity", () => {
  it("restores score text and selected item on remount without replaying a write", async () => {
    clearSessionDrafts();
    const user = userEvent.setup();
    const first = renderScreen({ owner: "teacher:school" });
    await screen.findByText(/Quiz 1/);
    await user.click(screen.getByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText(/Score for Ana Cruz/i);
    fireEvent.change(input, { target: { value: "13" } });
    first.unmount();
    const second = renderScreen({
      owner: "teacher:school",
      assessmentRepo: first.assessmentRepo,
      scoreRepo: first.scoreRepo,
    });
    expect(await screen.findByLabelText(/Score for Ana Cruz/i)).toHaveValue(13);
    expect(second.scoreRepo.recordCalls).toHaveLength(0);
    second.unmount();
    renderScreen({
      owner: "other:school",
      assessmentRepo: first.assessmentRepo,
      scoreRepo: first.scoreRepo,
    });
    await screen.findByText(/Quiz 1/);
    expect(screen.queryByLabelText(/Score for Ana Cruz/i)).not.toBeInTheDocument();
    clearSessionDrafts();
  });
});

describe("score decision design", () => {
  async function openSavedScore() {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    renderScreen({ scoreRepo: repo });
    await user.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText("Score for Ana Cruz");
    return { user, repo, input };
  }

  it("reviews recorded and proposed values before a correction is committed", async () => {
    const { user, repo, input } = await openSavedScore();
    await user.clear(input);
    await user.type(input, "19{Enter}");
    const reason = await screen.findByLabelText("Reason for changing Ana Cruz's recorded score");
    expect(screen.getByText("Recorded: 15 / 20")).toBeVisible();
    expect(screen.getByText("Change to: 19 / 20")).toBeVisible();
    expect(reason).toHaveAccessibleDescription(/Recorded: 15 \/ 20.*Change to: 19 \/ 20/);
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("lets keyboard users reach Cancel without saving a completed reason", async () => {
    const { user, repo, input } = await openSavedScore();
    await user.clear(input);
    await user.type(input, "19{Enter}");
    await user.type(await screen.findByLabelText(/Reason for changing Ana/), "Rechecked work");
    await user.tab();
    expect(screen.getByRole("button", { name: "Save correction" })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();
    expect(repo.recordCalls).toHaveLength(0);
    await user.keyboard("{Enter}");
    await waitFor(() => expect(screen.getByLabelText("Score for Ana Cruz")).toHaveFocus());
    expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(15);
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("explains a blank edit without erasing the recorded score and lets Tab leave the final input", async () => {
    const { user, repo, input } = await openSavedScore();
    await user.clear(input);
    expect(screen.getByText(/Blank input does not clear the recorded value/)).toBeVisible();
    expect(screen.getByText(/On this device: 15 \/ 20/)).toBeVisible();
    await user.tab();
    expect(input).not.toHaveFocus();
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("does not submit an IME composition Enter in the correction reason", async () => {
    const { user, repo, input } = await openSavedScore();
    await user.clear(input);
    await user.type(input, "19{Enter}");
    const reason = await screen.findByLabelText(/Reason for changing Ana/);
    fireEvent.change(reason, { target: { value: "Rechecked work" } });
    fireEvent.keyDown(reason, { key: "Enter", isComposing: true });
    expect(repo.recordCalls).toHaveLength(0);
    expect(reason).toBeInTheDocument();
    fireEvent.keyDown(reason, { key: "Enter", isComposing: false });
    await waitFor(() => expect(repo.recordCalls).toHaveLength(1));
  });

  it("lets native Tab reach an interior learner's row actions after restoring the input", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository([
      ROSTER_ENTRY,
      { ...ROSTER_ENTRY, learnerId: "l2", givenName: "Bo", familyName: "Reyes" },
    ]);
    renderScreen({ scoreRepo: repo });
    await user.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText("Score for Ana Cruz");
    await user.click(input);
    await user.type(input, "13{Escape}");
    await user.tab();
    expect(
      within(screen.getByRole("group", { name: "Exception status for Ana Cruz" })).getByRole(
        "button",
        { name: "Excused" },
      ),
    ).toHaveFocus();
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("discloses pending edits while completeness uses saved records", async () => {
    const { user, input } = await openSavedScore();
    expect(screen.getByText(/Based on saved records on this device/)).toBeVisible();
    expect(screen.queryByText(/This item has pending edits/)).not.toBeInTheDocument();
    await user.clear(input);
    await user.type(input, "19");
    expect(screen.getByText(/This item has pending edits/)).toBeVisible();
    await user.keyboard("{Escape}");
    expect(screen.queryByText(/This item has pending edits/)).not.toBeInTheDocument();
  });

  it("guards an explicit correction while its acknowledgment is pending", async () => {
    const { user, repo, input } = await openSavedScore();
    let resolveSave!: (value: LearnerScore | null) => void;
    vi.spyOn(repo, "record").mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveSave = resolve;
        }),
    );
    await user.clear(input);
    await user.type(input, "19{Enter}");
    const reason = await screen.findByLabelText(/Reason for changing Ana/);
    await user.type(reason, "Rechecked work{Enter}{Enter}");
    expect(repo.record).toHaveBeenCalledTimes(1);
    expect(reason).toHaveAttribute("readonly");
    expect(screen.getByRole("button", { name: "Save correction" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await act(async () => resolveSave({ ...repo.recordResult!, score: 19 }));
    expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(19);
  });
});

describe("score decision status distinctions", () => {
  it.each([
    ["scored", 0, "0 / 20"],
    ["excused", null, "Excused"],
    ["not_applicable", null, "N/A"],
  ] as const)("keeps %s distinct during correction review", async (status, score, label) => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository([
      { ...ROSTER_ENTRY, status, score, updatedAt: "2026-10-01T00:00:00Z" },
    ]);
    renderScreen({ scoreRepo: repo });
    await user.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText("Score for Ana Cruz");
    await user.clear(input);
    await user.type(input, "19{Enter}");
    expect(screen.getByText(`Recorded: ${label}`)).toBeVisible();
    expect(screen.getByText("Change to: 19 / 20")).toBeVisible();
    expect(repo.recordCalls).toHaveLength(0);
  });
});

describe("term-grade response continuity", () => {
  async function open(user: ReturnType<typeof userEvent.setup>, name = "Quiz 1") {
    await user.click(
      await screen.findByRole("button", { name: `Written Works — ${name} (max 20)` }),
    );
    await screen.findByLabelText("Score for Ana Cruz");
  }

  it("replaces a stale grade with an explicit refresh failure and retries without replaying a score", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    const compute = vi
      .spyOn(scoreRepo, "computeTermGrade")
      .mockRejectedValueOnce(new Error("synthetic failed read"));
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    expect(await screen.findByText("Could not refresh. Show term grades to retry.")).toBeVisible();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(screen.getByText(/Saved on this device/)).toBeVisible();
    compute.mockRestore();
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    expect(scoreRepo.recordCalls).toHaveLength(1);
  });

  it("discards a term-grade response after leaving its assessment roster", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository();
    let release!: (value: ComputedTermGrade | null) => void;
    vi.spyOn(repo, "computeTermGrade").mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    renderScreen({
      scoreRepo: repo,
      assessmentRepo: new FakeAssessmentRepository([ITEM, { ...ITEM, id: "ai-2", name: "Quiz 2" }]),
    });
    await open(user);
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await open(user, "Quiz 2");
    await act(async () => release(repo.computeTermGradeResult));
    expect(screen.queryByRole("table", { name: "Computed term grades" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Show term grades" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
  });

  it("does not let an older bulk computation replace a grade refreshed after a score save", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    await open(user);
    let release!: (value: ComputedTermGrade | null) => void;
    vi.spyOn(scoreRepo, "computeTermGrade")
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockResolvedValueOnce({ ...scoreRepo.computeTermGradeResult!, termGrade: 92 });
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    await screen.findByText("92");
    await act(async () => release(scoreRepo.computeTermGradeResult));
    expect(screen.getByText("92")).toBeVisible();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
  });
});

describe("term-grade refresh ordering and partial failure", () => {
  it("keeps a newer explicit read when an older automatic refresh finishes later", async () => {
    const user = userEvent.setup();
    const { scoreRepo } = renderScreen();
    await user.click(
      await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" }),
    );
    await screen.findByLabelText("Score for Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    let release!: (value: ComputedTermGrade | null) => void;
    vi.spyOn(scoreRepo, "computeTermGrade")
      .mockImplementationOnce(
        () =>
          new Promise((r) => {
            release = r;
          }),
      )
      .mockResolvedValueOnce({ ...scoreRepo.computeTermGradeResult!, termGrade: 92 });
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    expect(await screen.findByText("Updating grade…")).toBeVisible();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("92");
    await act(async () => release(scoreRepo.computeTermGradeResult));
    expect(screen.getByText("92")).toBeVisible();
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(scoreRepo.recordCalls).toHaveLength(1);
  });

  it("shows independent success, unavailable and failed reads without hiding the successful rows", async () => {
    const user = userEvent.setup();
    const repo = new FakeLearnerScoreRepository([
      ROSTER_ENTRY,
      { ...ROSTER_ENTRY, learnerId: "l2", givenName: "Bo", familyName: "Reyes" },
      { ...ROSTER_ENTRY, learnerId: "l3", givenName: "Ci", familyName: "Lim" },
    ]);
    vi.spyOn(repo, "computeTermGrade").mockImplementation(async (_record, learner) => {
      if (learner === "l2") throw new Error("synthetic failed read");
      return learner === "l3" ? null : repo.computeTermGradeResult;
    });
    renderScreen({ scoreRepo: repo });
    await user.click(
      await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" }),
    );
    await screen.findByLabelText("Score for Ana Cruz");
    await user.click(screen.getByRole("button", { name: "Show term grades" }));
    const grades = await screen.findByRole("table", { name: "Computed term grades" });
    expect(await within(grades).findByText("88")).toBeVisible();
    expect(within(grades).getByText("Not yet available")).toBeVisible();
    expect(within(grades).getByText("Could not refresh. Show term grades to retry.")).toBeVisible();
    expect(repo.recordCalls).toHaveLength(0);
  });
});

describe("Scores CSV attempt feedback", () => {
  const variants = [
    { label: "report card", method: "exportClassRecordReportCard", result: "reportCardResult" },
    { label: "class summary", method: "exportClassRecordSummary", result: "classSummaryResult" },
  ] as const;
  async function open(user: ReturnType<typeof userEvent.setup>) {
    await user.click(
      await screen.findByRole("button", { name: "Written Works — Quiz 1 (max 20)" }),
    );
    await screen.findByLabelText("Score for Ana Cruz");
  }
  it.each(variants)(
    "removes the previous $label outcome during a new attempt and failure",
    async ({ label, method, result }) => {
      const user = userEvent.setup();
      const { exportRepo } = renderScreen();
      await open(user);
      const action = screen.getByRole("button", { name: `Export ${label} (CSV)` });
      await user.click(action);
      await screen.findByText(exportRepo[result]!.filePath);
      let reject!: (e: Error) => void;
      vi.spyOn(exportRepo, method).mockImplementationOnce(
        () =>
          new Promise((_resolve, fail) => {
            reject = fail;
          }),
      );
      await user.click(action);
      expect(screen.queryByText(exportRepo[result]!.filePath)).not.toBeInTheDocument();
      await act(async () => reject(new Error("synthetic failure")));
      expect(await screen.findByText(`Could not export the ${label}.`)).toBeVisible();
      expect(screen.queryByRole("button", { name: "Reload items" })).not.toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: `Export ${label} (CSV)` }));
      await screen.findByText(exportRepo[result]!.filePath);
      expect(screen.queryByText(`Could not export the ${label}.`)).not.toBeInTheDocument();
    },
  );
  it.each(variants)(
    "does not present a previous $label result after a null response",
    async ({ label, method, result }) => {
      const user = userEvent.setup();
      const { exportRepo } = renderScreen();
      await open(user);
      const action = screen.getByRole("button", { name: `Export ${label} (CSV)` });
      await user.click(action);
      await screen.findByText(exportRepo[result]!.filePath);
      vi.spyOn(exportRepo, method).mockResolvedValueOnce(null);
      await user.click(action);
      expect(
        await screen.findByText(
          `No ${label} export was returned. Check access to this class record and try again.`,
        ),
      ).toBeVisible();
      expect(screen.queryByText(exportRepo[result]!.filePath)).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "Reload items" })).not.toBeInTheDocument();
    },
  );
  it("keeps the other output confirmed with its named folder action", async () => {
    const user = userEvent.setup();
    const { exportRepo, scoreRepo } = renderScreen();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Export report card (CSV)" }));
    await user.click(screen.getByRole("button", { name: "Export class summary (CSV)" }));
    await screen.findByRole("button", { name: "Open report card folder" });
    await screen.findByRole("button", { name: "Open class summary folder" });
    vi.spyOn(exportRepo, "exportClassRecordSummary").mockRejectedValueOnce(
      new Error("synthetic failure"),
    );
    await user.click(screen.getByRole("button", { name: "Export class summary (CSV)" }));
    await screen.findByText("Could not export the class summary.");
    expect(screen.getByText(exportRepo.reportCardResult!.filePath)).toBeVisible();
    expect(screen.getByRole("button", { name: "Open report card folder" })).toBeVisible();
    expect(
      screen.queryByRole("button", { name: "Open class summary folder" }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Exported snapshot of saved records/)).toBeVisible();
    expect(scoreRepo.recordCalls).toHaveLength(0);
  });
  it("guards duplicate class-summary export while pending", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    await open(user);
    exportRepo.classSummaryPending = true;
    const action = screen.getByRole("button", { name: "Export class summary (CSV)" });
    await user.click(action);
    expect(action).toHaveAttribute("aria-disabled", "true");
    await user.click(action);
    expect(exportRepo.classSummaryCalls).toHaveLength(1);
  });
  it("retains the confirmed file if opening its folder fails without exporting again", async () => {
    const user = userEvent.setup();
    const { exportRepo } = renderScreen();
    await open(user);
    await user.click(screen.getByRole("button", { name: "Export report card (CSV)" }));
    const folder = await screen.findByRole("button", { name: "Open report card folder" });
    exportRepo.revealShouldThrow = true;
    await user.click(folder);
    expect(await screen.findByText("Could not open the folder for this file.")).toBeVisible();
    expect(screen.getByText(exportRepo.reportCardResult!.filePath)).toBeVisible();
    expect(exportRepo.reportCardCalls).toHaveLength(1);
    expect(exportRepo.revealCalls).toEqual([exportRepo.reportCardResult!.filePath]);
  });
});

describe("assessment creation acknowledgment continuity", () => {
  it.each([false, true])(
    "retains a newer creation draft and focus, including returned original text: %s",
    async (returned) => {
      const user = userEvent.setup();
      const repo = new FakeAssessmentRepository();
      const create = repo.createItem.bind(repo);
      let release!: () => Promise<void>;
      const spy = vi.spyOn(repo, "createItem").mockImplementationOnce(
        (...args) =>
          new Promise((resolve) => {
            release = async () => resolve(await create(...args));
          }),
      );
      renderScreen({ assessmentRepo: repo });
      await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });
      await user.click(screen.getByRole("button", { name: "Add assessment item" }));
      const name = screen.getByLabelText("Item name"),
        max = screen.getByLabelText("Max score");
      await user.type(name, "Quiz 2");
      await user.click(screen.getByRole("button", { name: "Add item" }));
      await user.clear(name);
      await user.type(name, returned ? "Quiz 2" : "Quiz 3");
      if (!returned) {
        await user.clear(max);
        await user.type(max, "10");
      } else await user.click(max);
      await act(async () => release());
      expect(name).toBeVisible();
      expect(name).toHaveValue(returned ? "Quiz 2" : "Quiz 3");
      expect(max).toHaveValue(returned ? 20 : 10);
      expect(max).toHaveFocus();
      expect(screen.getByRole("button", { name: "Close item editor" })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith("cr-1", "cat-1", "Quiz 2", 20);
      expect(screen.getByText(/Quiz 2 added\./)).toBeVisible();
    },
  );
});

describe("assessment creation draft boundaries", () => {
  it("retains a max-only change without clearing the submitted name", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    const create = repo.createItem.bind(repo);
    let release!: () => Promise<void>;
    vi.spyOn(repo, "createItem").mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          release = async () => resolve(await create(...args));
        }),
    );
    renderScreen({ assessmentRepo: repo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });
    await user.click(screen.getByRole("button", { name: "Add assessment item" }));
    const name = screen.getByLabelText("Item name"),
      max = screen.getByLabelText("Max score");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.clear(max);
    await user.type(max, "10");
    await act(async () => release());
    expect(name).toHaveValue("Quiz 2");
    expect(name).toBeVisible();
    expect(max).toHaveValue(10);
    expect(max).toHaveFocus();
    expect(repo.createCalls).toEqual([
      { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 2", maxScore: 20 },
    ]);
  });
  it("retains a newer workspace draft after a failed create without retrying it", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    let reject!: (e: Error) => void;
    const spy = vi.spyOn(repo, "createItem").mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderScreen({ assessmentRepo: repo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });
    await user.click(screen.getByRole("button", { name: "Add assessment item" }));
    const name = screen.getByLabelText("Item name");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.clear(name);
    await user.type(name, "Quiz 3");
    await act(async () => reject(new Error("synthetic failure")));
    expect(await screen.findByText("Could not create this item.")).toBeVisible();
    expect(name).toHaveValue("Quiz 3");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});

describe("first assessment creation draft continuity", () => {
  it("keeps an implicitly open empty-record composer open for newer work", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository([]);
    const create = repo.createItem.bind(repo);
    let release!: () => Promise<void>;
    vi.spyOn(repo, "createItem").mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          release = async () => resolve(await create(...args));
        }),
    );
    renderScreen({ assessmentRepo: repo });
    const name = await screen.findByLabelText("Item name");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: "Add item" }));
    await user.clear(name);
    await user.type(name, "Quiz 3");
    await act(async () => release());
    expect(name).toHaveValue("Quiz 3");
    expect(name).toBeVisible();
    expect(name).toHaveFocus();
    expect(screen.getByRole("button", { name: "Close item editor" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });
});

describe("PM-12 delayed edit receipts", () => {
  const prefix = "";
  async function begin(repo: FakeAssessmentRepository) {
    renderScreen({ assessmentRepo: repo });
    await waitFor(() =>
      expect(screen.getAllByRole("button", { name: "Edit" }).length).toBeGreaterThan(0),
    );
    await userEvent.click(screen.getAllByRole("button", { name: "Edit" })[0]!);
    return screen.getByLabelText("Item name", { selector: `#${prefix}edit-name-ai-1` });
  }

  it("retains newer edit fields and focus after a delayed full update", async () => {
    const repo = new FakeAssessmentRepository();
    vi.spyOn(repo, "listCategoriesForSet").mockResolvedValue([
      CATEGORY,
      { ...CATEGORY, id: "cat-2", name: "Other category" },
    ]);
    let resolve!: (item: AssessmentItem | null) => void;
    const save = vi
      .spyOn(repo, "updateItem")
      .mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const name = await begin(repo);
    fireEvent.change(name, { target: { value: "Submitted revision" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await userEvent.click(screen.getByRole("button", { name: "Saving…" }));
    fireEvent.change(name, { target: { value: "Newer revision" } });
    const max = screen.getByLabelText("Max score", { selector: `#${prefix}edit-max-ai-1` });
    fireEvent.change(max, { target: { value: "30" } });
    fireEvent.change(
      screen.getByLabelText("Category", { selector: `#${prefix}edit-category-ai-1` }),
      { target: { value: "cat-2" } },
    );
    max.focus();
    await act(async () => resolve({ ...ITEM, name: "Submitted revision" }));
    expect(name).toBeVisible();
    expect(name).toHaveValue("Newer revision");
    expect(max).toHaveValue(30);
    expect(max).toHaveFocus();
    expect(
      screen.getByLabelText("Category", { selector: `#${prefix}edit-category-ai-1` }),
    ).toHaveValue("cat-2");
    expect(save).toHaveBeenCalledExactlyOnceWith("ai-1", "Submitted revision", "cat-1", 20);
    expect(await screen.findByText(/Submitted revision updated\./)).toBeVisible();
  });

  it("preserves a newer scored-item rename even when text returns to the submitted value", async () => {
    const repo = new FakeAssessmentRepository([{ ...ITEM, recordedCount: 2 }]);
    let resolve!: (item: AssessmentItem | null) => void;
    const rename = vi
      .spyOn(repo, "renameItem")
      .mockImplementationOnce(() => new Promise((done) => (resolve = done)));
    const update = vi.spyOn(repo, "updateItem");
    const name = await begin(repo);
    fireEvent.change(name, { target: { value: "Submitted revision" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(name, { target: { value: "Temporary" } });
    fireEvent.change(name, { target: { value: "Submitted revision" } });
    await act(async () => resolve({ ...ITEM, name: "Submitted revision" }));
    expect(name).toBeVisible();
    expect(name).toHaveValue("Submitted revision");
    expect(rename).toHaveBeenCalledExactlyOnceWith("ai-1", "Submitted revision");
    expect(update).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    "preserves a reopened editor after cancel; different target=%s",
    async (different) => {
      const repo = new FakeAssessmentRepository([ITEM, { ...ITEM, id: "ai-2" }]);
      let resolve!: (item: AssessmentItem | null) => void;
      const save = vi
        .spyOn(repo, "updateItem")
        .mockImplementationOnce(() => new Promise((done) => (resolve = done)));
      const name = await begin(repo);
      fireEvent.change(name, { target: { value: "Submitted revision" } });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await userEvent.click(screen.getByRole("button", { name: "Cancel" }));
      const edits = screen.getAllByRole("button", { name: "Edit" });
      await userEvent.click(edits[different ? 1 : 0]!);
      const id = different ? "ai-2" : "ai-1";
      const reopened = screen.getByLabelText("Item name", {
        selector: `#${prefix}edit-name-${id}`,
      });
      fireEvent.change(reopened, { target: { value: "Reopened work" } });
      await act(async () => resolve({ ...ITEM, name: "Submitted revision" }));
      expect(reopened).toBeVisible();
      expect(reopened).toHaveValue("Reopened work");
      expect(save).toHaveBeenCalledTimes(1);
    },
  );

  it("retains newer work on rejection and retries only after explicit Save", async () => {
    const repo = new FakeAssessmentRepository();
    let reject!: (error: Error) => void;
    const save = vi
      .spyOn(repo, "updateItem")
      .mockImplementationOnce(() => new Promise((_done, fail) => (reject = fail)))
      .mockResolvedValueOnce({ ...ITEM, name: "Newer revision" });
    const name = await begin(repo);
    fireEvent.change(name, { target: { value: "Submitted revision" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(name, { target: { value: "Newer revision" } });
    await act(async () => reject(new Error("synthetic failure")));
    expect(name).toHaveValue("Newer revision");
    expect(await screen.findByText(/Could not save changes to “Submitted revision”/)).toBeVisible();
    expect(save).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(save).toHaveBeenLastCalledWith("ai-1", "Newer revision", "cat-1", 20);
    expect(await screen.findByText("Newer revision updated.")).toBeVisible();
    expect(
      screen.queryByLabelText("Item name", { selector: `#${prefix}edit-name-ai-1` }),
    ).not.toBeInTheDocument();
  });
  it("keeps an editor mounted while the post-save list read is delayed", async () => {
    const repo = new FakeAssessmentRepository();
    const read = repo.listItemsByClassRecord.bind(repo);
    let listResolve!: (items: AssessmentItemDetail[]) => void;
    vi.spyOn(repo, "listItemsByClassRecord")
      .mockImplementationOnce(read)
      .mockImplementationOnce(() => new Promise((done) => (listResolve = done)));
    let resolve!: (item: AssessmentItem | null) => void;
    vi.spyOn(repo, "updateItem").mockImplementationOnce(
      () => new Promise((done) => (resolve = done)),
    );
    const name = await begin(repo);
    fireEvent.change(name, { target: { value: "Submitted revision" } });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.change(name, { target: { value: "Newer revision" } });
    name.focus();
    await act(async () => resolve({ ...ITEM, name: "Submitted revision" }));
    expect(name).toBeVisible();
    expect(name).toHaveFocus();
    expect(screen.getByRole("button", { name: "Saving…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    fireEvent.change(name, { target: { value: "Work during list read" } });
    await act(async () => listResolve([ITEM]));
    expect(name).toBeVisible();
    expect(name).toHaveFocus();
    expect(name).toHaveValue("Work during list read");
  });

  it.each(["null", "reject"])(
    "identifies the old target on a delayed %s without clearing the next editor",
    async (outcome) => {
      const repo = new FakeAssessmentRepository([
        ITEM,
        { ...ITEM, id: "ai-2", name: "Second item" },
      ]);
      let resolve!: (item: AssessmentItem | null) => void;
      let reject!: (error: Error) => void;
      const save = vi.spyOn(repo, "updateItem").mockImplementationOnce(
        () =>
          new Promise((done, fail) => {
            resolve = done;
            reject = fail;
          }),
      );
      const name = await begin(repo);
      fireEvent.change(name, { target: { value: "Submitted revision" } });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      await userEvent.click(screen.getByRole("button", { name: "Edit" }));
      const next = screen.getByLabelText("Item name", { selector: `#${prefix}edit-name-ai-2` });
      fireEvent.change(next, { target: { value: "Second unsaved work" } });
      await act(async () =>
        outcome === "null" ? resolve(null) : reject(new Error("synthetic rejection")),
      );
      expect(next).toBeVisible();
      expect(next).toHaveValue("Second unsaved work");
      expect(
        await screen.findByText(/Could not save changes to “Submitted revision”/),
      ).toBeVisible();
      expect(save).toHaveBeenCalledTimes(1);
    },
  );
  it("ignores a rejected old write after the source screen is unmounted and reopened", async () => {
    const repo = new FakeAssessmentRepository();
    let reject!: (error: Error) => void;
    vi.spyOn(repo, "updateItem").mockImplementationOnce(
      () => new Promise((_done, fail) => (reject = fail)),
    );
    const mounted = renderScreen({ assessmentRepo: repo });
    await screen.findByRole("button", { name: "Edit" });
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Item name", { selector: `#${prefix}edit-name-ai-1` }), {
      target: { value: "Old source revision" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    mounted.unmount();
    const next = new FakeAssessmentRepository();
    const name = await begin(next);
    fireEvent.change(name, { target: { value: "Current source work" } });
    await act(async () => reject(new Error("old source rejected")));
    expect(name).toBeVisible();
    expect(name).toHaveValue("Current source work");
    expect(
      screen.queryByText(/Could not save changes to “Old source revision”/),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "false");
  });
});

describe("PM-12 deletion state ownership", () => {
  async function begin(
    items = [
      { ...ITEM, recordedCount: 0 },
      { ...ITEM, id: "ai-2", name: "Quiz 2", recordedCount: 0 },
    ],
  ) {
    const repo = new FakeAssessmentRepository(items);
    renderScreen({ assessmentRepo: repo });
    await screen.findByRole("group", { name: "Actions for Quiz 1" });
    return repo;
  }
  function group(name: string) {
    return screen.getByRole("group", { name: `Actions for ${name}` });
  }
  async function arm(name: string) {
    await userEvent.click(within(group(name)).getByRole("button", { name: "Delete" }));
  }
  async function submit(name: string) {
    await arm(name);
    await userEvent.click(within(group(name)).getByRole("button", { name: "Confirm delete" }));
  }

  it.each([true, false])(
    "keeps the next prepared confirmation after an older result=%s",
    async (result) => {
      const repo = await begin();
      let resolve!: (value: boolean) => void;
      const remove = vi
        .spyOn(repo, "deleteItem")
        .mockImplementationOnce(() => new Promise((done) => (resolve = done)));
      await submit("Quiz 1");
      await arm("Quiz 2");
      await act(async () => resolve(result));
      expect(within(group("Quiz 2")).getByRole("button", { name: "Confirm delete" })).toBeVisible();
      expect(remove).toHaveBeenCalledExactlyOnceWith("ai-1");
      if (!result) expect(await screen.findByText(/“Quiz 1” was not deleted/)).toBeVisible();
    },
  );

  it("keeps another pending delete guarded after the first result arrives", async () => {
    const repo = await begin();
    const original = repo.deleteItem.bind(repo);
    let first!: (value: boolean) => void;
    let second!: (value: boolean) => void;
    const remove = vi
      .spyOn(repo, "deleteItem")
      .mockImplementationOnce(() => new Promise((done) => (first = done)))
      .mockImplementationOnce(() => new Promise((done) => (second = done)))
      .mockImplementation(original);
    await submit("Quiz 1");
    await submit("Quiz 2");
    await act(async () => first(true));
    const busy = within(group("Quiz 2")).getByRole("button", { name: "Deleting…" });
    await userEvent.click(busy);
    expect(remove).toHaveBeenCalledTimes(2);
    expect(busy).toHaveAttribute("aria-disabled", "true");
    await act(async () => second(false));
    expect(await screen.findByText(/“Quiz 2” was not deleted/)).toBeVisible();
  });

  it("does not offer Cancel or Edit as executable actions after dispatch", async () => {
    const repo = await begin();
    vi.spyOn(repo, "deleteItem").mockImplementationOnce(() => new Promise(() => {}));
    await submit("Quiz 1");
    expect(
      within(group("Quiz 1")).queryByRole("button", { name: "Cancel" }),
    ).not.toBeInTheDocument();
    expect(within(group("Quiz 1")).getByText(/Deletion requested/)).toBeVisible();
    const edit = within(group("Quiz 1")).getByRole("button", { name: "Edit" });
    expect(edit).toHaveAttribute("aria-disabled", "true");
    await userEvent.click(edit);
    expect(
      screen.queryByLabelText("Item name", { selector: "#edit-name-ai-1" }),
    ).not.toBeInTheDocument();
  });

  it("requires read-only reload after an unconfirmed result and never replays deletion", async () => {
    const repo = await begin();
    let reject!: (error: Error) => void;
    const remove = vi
      .spyOn(repo, "deleteItem")
      .mockImplementationOnce(() => new Promise((_done, fail) => (reject = fail)));
    await submit("Quiz 1");
    await arm("Quiz 2");
    await act(async () => reject(new Error("synthetic unknown result")));
    expect(await screen.findByText(/Deletion of “Quiz 1” was not confirmed/)).toBeVisible();
    const reload = screen.getByRole("button", { name: "Reload items" });
    expect(screen.queryByRole("button", { name: "Confirm delete" })).not.toBeInTheDocument();
    expect(remove).toHaveBeenCalledTimes(1);
    await userEvent.click(reload);
    expect(await screen.findByRole("group", { name: "Actions for Quiz 2" })).toBeVisible();
    expect(within(group("Quiz 2")).getByRole("button", { name: "Confirm delete" })).toBeVisible();
    expect(remove).toHaveBeenCalledTimes(1);
  });

  it("cancels a prepared deletion without a write", async () => {
    const repo = await begin();
    const remove = vi.spyOn(repo, "deleteItem");
    await arm("Quiz 1");
    await userEvent.click(within(group("Quiz 1")).getByRole("button", { name: "Cancel" }));
    expect(within(group("Quiz 1")).getByRole("button", { name: "Delete" })).toBeVisible();
    expect(remove).not.toHaveBeenCalled();
  });
  it.each(["range", "name"])(
    "retains invalid %s edit and never calls the repository",
    async (kind) => {
      const repo = await begin();
      const update = vi.spyOn(repo, "updateItem");
      await userEvent.click(within(group("Quiz 1")).getByRole("button", { name: "Edit" }));
      const selector = kind === "range" ? "#edit-max-ai-1" : "#edit-name-ai-1";
      const value = kind === "range" ? "0" : "x".repeat(101);
      const field = screen.getByLabelText(kind === "range" ? "Max score" : "Item name", {
        selector,
      });
      fireEvent.change(field, { target: { value } });
      await userEvent.click(screen.getByRole("button", { name: "Save" }));
      expect(
        await screen.findByText(
          kind === "range"
            ? /Max score must be a positive number/
            : /Item name must be at most 100 characters/,
        ),
      ).toBeVisible();
      expect(field).toBeVisible();
      expect(update).not.toHaveBeenCalled();
    },
  );

  it("returns keyboard focus to a surviving item after the focused deletion succeeds", async () => {
    const repo = await begin();
    vi.spyOn(repo, "listItemsByClassRecord").mockResolvedValue([
      { ...ITEM, id: "ai-2", name: "Quiz 2", recordedCount: 0 },
    ]);
    let resolve!: (value: boolean) => void;
    vi.spyOn(repo, "deleteItem").mockImplementationOnce(
      () => new Promise((done) => (resolve = done)),
    );
    await submit("Quiz 1");
    expect(within(group("Quiz 1")).getByRole("button", { name: "Deleting…" })).toHaveFocus();
    await act(async () => resolve(true));
    const second = group("Quiz 2").closest("li")!;
    expect(second.contains(document.activeElement)).toBe(true);
  });
  it("does not let an older post-delete list read re-enable writes after an unconfirmed deletion", async () => {
    const repo = await begin();
    let first!: (value: boolean) => void;
    let secondFail!: (error: Error) => void;
    vi.spyOn(repo, "deleteItem")
      .mockImplementationOnce(() => new Promise((done) => (first = done)))
      .mockImplementationOnce(() => new Promise((_done, fail) => (secondFail = fail)));
    let read!: (items: AssessmentItemDetail[]) => void;
    vi.spyOn(repo, "listItemsByClassRecord").mockImplementationOnce(
      () => new Promise((done) => (read = done)),
    );
    await submit("Quiz 1");
    await submit("Quiz 2");
    await act(async () => first(true));
    await act(async () => secondFail(new Error("synthetic unconfirmed deletion")));
    await act(async () =>
      read([
        { ...ITEM, recordedCount: 0 },
        { ...ITEM, id: "ai-2", name: "Quiz 2", recordedCount: 0 },
      ]),
    );
    expect(await screen.findByRole("button", { name: "Reload items" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Actions for Quiz 2" })).not.toBeInTheDocument();
  });
  it("does not automatically recover an unconfirmed deletion when another delete acknowledges later", async () => {
    const repo = await begin();
    const read = vi.spyOn(repo, "listItemsByClassRecord");
    let first!: (value: boolean) => void;
    let secondFail!: (error: Error) => void;
    vi.spyOn(repo, "deleteItem")
      .mockImplementationOnce(() => new Promise((done) => (first = done)))
      .mockImplementationOnce(() => new Promise((_done, fail) => (secondFail = fail)));
    await submit("Quiz 1");
    await submit("Quiz 2");
    await act(async () => secondFail(new Error("synthetic unconfirmed deletion")));
    await act(async () => first(true));
    expect(await screen.findByRole("button", { name: "Reload items" })).toBeVisible();
    expect(screen.queryByRole("group", { name: "Actions for Quiz 2" })).not.toBeInTheDocument();
    expect(read).not.toHaveBeenCalled();
  });
});

it("retains a later selected item when an older selected deletion completes", async () => {
  const repo = new FakeAssessmentRepository([
    { ...ITEM, recordedCount: 0 },
    { ...ITEM, id: "ai-2", name: "Quiz 2", recordedCount: 0 },
  ]);
  let resolve!: (value: boolean) => void;
  vi.spyOn(repo, "deleteItem").mockImplementationOnce(
    () => new Promise((done) => (resolve = done)),
  );
  renderScreen({ assessmentRepo: repo });
  await userEvent.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
  const first = screen.getByRole("group", { name: "Actions for Quiz 1" });
  await userEvent.click(within(first).getByRole("button", { name: "Delete" }));
  await userEvent.click(within(first).getByRole("button", { name: "Confirm delete" }));
  await userEvent.click(screen.getByRole("button", { name: /Quiz 2 \(max 20\)/ }));
  expect(await screen.findByRole("heading", { name: "Quiz 2 scores" })).toBeVisible();
  await act(async () => resolve(true));
  expect(screen.getByRole("heading", { name: "Quiz 2 scores" })).toBeVisible();
});

describe("PM-13 roster preservation across assessment checks", () => {
  const second = { ...ITEM, id: "ai-2", name: "Quiz 2" };
  async function begin(entry: LearnerScoreRosterEntry = ROSTER_ENTRY) {
    const assessmentRepo = new FakeAssessmentRepository([ITEM, second]);
    const scoreRepo = new FakeLearnerScoreRepository([entry]);
    const roster = vi.spyOn(scoreRepo, "rosterForItem");
    renderScreen({ assessmentRepo, scoreRepo });
    await userEvent.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText("Score for Ana Cruz");
    let read!: (items: AssessmentItemDetail[]) => void;
    let readFail!: (error: Error) => void;
    vi.spyOn(assessmentRepo, "listItemsByClassRecord").mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          read = done;
          readFail = fail;
        }),
    );
    let remove!: (result: boolean) => void;
    vi.spyOn(assessmentRepo, "deleteItem").mockImplementationOnce(
      () => new Promise((done) => (remove = done)),
    );
    const group = screen.getByRole("group", { name: "Actions for Quiz 2" });
    await userEvent.click(within(group).getByRole("button", { name: "Delete" }));
    await userEvent.click(within(group).getByRole("button", { name: "Confirm delete" }));
    return {
      assessmentRepo,
      scoreRepo,
      input,
      read: () => read,
      readFail: () => readFail,
      remove: () => remove,
      roster,
    };
  }

  it("keeps a newer score input mounted and focused while an unrelated assessment read is pending", async () => {
    const x = await begin();
    fireEvent.change(x.input, { target: { value: "19" } });
    x.input.focus();
    await act(async () => x.remove()(true));
    expect(x.input).toBeVisible();
    expect(x.input).toHaveValue(19);
    expect(x.input).toHaveFocus();
    expect(await screen.findByText(/Checking assessment items/)).toBeVisible();
    await userEvent.keyboard("{Enter}");
    expect(x.scoreRepo.recordCalls).toHaveLength(0);
    await act(async () => x.read()([ITEM]));
    expect(x.input).toBeVisible();
    expect(x.input).toHaveFocus();
    expect(x.input).toHaveValue(19);
    expect(x.roster).toHaveBeenCalledTimes(1);
    expect(x.scoreRepo.recordCalls).toHaveLength(0);
  });

  it("accepts an already-dispatched score acknowledgment during the check and preserves newer work", async () => {
    const x = await begin();
    let save!: (result: LearnerScore | null) => void;
    const record = vi
      .spyOn(x.scoreRepo, "record")
      .mockImplementationOnce(() => new Promise((done) => (save = done)));
    fireEvent.change(x.input, { target: { value: "18" } });
    await userEvent.click(x.input);
    await userEvent.keyboard("{Enter}");
    fireEvent.change(x.input, { target: { value: "19" } });
    x.input.focus();
    await act(async () => x.remove()(true));
    await act(async () => save(x.scoreRepo.recordResult));
    expect(x.input).toBeVisible();
    expect(x.input).toHaveValue(19);
    expect(x.input).toHaveFocus();
    expect(await screen.findByText(/On this device: 18 \/ 20/)).toBeVisible();
    await act(async () => x.read()([ITEM]));
    expect(x.input).toHaveValue(19);
    expect(x.input).toHaveFocus();
    expect(record).toHaveBeenCalledExactlyOnceWith("ai-1", "l1", "scored", 18, null);
    expect(screen.getByRole("button", { name: /Quiz 1 \(max 20\) · 1 of/ })).toBeVisible();
  });

  it("preserves a reasoned correction and its comparison during the item check", async () => {
    const x = await begin({ ...ROSTER_ENTRY, status: "scored", score: 15, updatedAt: "old" });
    fireEvent.change(x.input, { target: { value: "19" } });
    x.input.focus();
    await userEvent.keyboard("{Enter}");
    const reason = await screen.findByRole("textbox", {
      name: "Reason for changing Ana Cruz's recorded score",
    });
    fireEvent.change(reason, { target: { value: "Rechecked paper" } });
    reason.focus();
    await act(async () => x.remove()(true));
    expect(reason).toBeVisible();
    expect(reason).toHaveValue("Rechecked paper");
    expect(reason).toHaveFocus();
    expect(screen.getByText("Recorded: 15 / 20")).toBeVisible();
    await userEvent.keyboard("{Enter}");
    expect(x.scoreRepo.recordCalls).toHaveLength(0);
    await act(async () => x.read()([ITEM]));
    expect(reason).toHaveFocus();
    expect(reason).toHaveValue("Rechecked paper");
  });

  it("retains a row validation error until the teacher corrects the draft", async () => {
    const x = await begin();
    fireEvent.change(x.input, { target: { value: "21" } });
    x.input.focus();
    await userEvent.keyboard("{Enter}");
    const error = await screen.findByText(/Score must be between 0 and 20/);
    await act(async () => x.remove()(true));
    expect(error).toBeVisible();
    expect(x.input).toHaveValue(21);
    await act(async () => x.read()([ITEM]));
    expect(error).toBeVisible();
    expect(x.scoreRepo.recordCalls).toHaveLength(0);
  });
  it.each(["maximum", "category", "removed"])(
    "invalidates the roster when its selected %s contract changes",
    async (kind) => {
      const x = await begin();
      fireEvent.change(x.input, { target: { value: "19" } });
      await act(async () => x.remove()(true));
      await act(async () =>
        x.read()(
          kind === "removed"
            ? []
            : [{ ...ITEM, ...(kind === "maximum" ? { maxScore: 15 } : { categoryId: "cat-2" }) }],
        ),
      );
      if (kind === "removed")
        expect(screen.queryByLabelText("Score for Ana Cruz")).not.toBeInTheDocument();
      else {
        const next = await screen.findByLabelText("Score for Ana Cruz");
        expect(x.roster).toHaveBeenCalledTimes(2);
        expect(next).toHaveValue(19);
        if (kind === "maximum") {
          expect(next).toHaveAttribute("max", "15");
          next.focus();
          await userEvent.keyboard("{Enter}");
          expect(await screen.findByText(/Score must be between 0 and 15/)).toBeVisible();
        }
      }
      expect(x.scoreRepo.recordCalls).toHaveLength(0);
    },
  );

  it("withholds the roster on list-read failure and restores its draft only after explicit reload", async () => {
    const x = await begin();
    fireEvent.change(x.input, { target: { value: "19" } });
    x.input.focus();
    await act(async () => x.remove()(true));
    await act(async () => x.readFail()(new Error("synthetic denied list read")));
    expect(screen.queryByLabelText("Score for Ana Cruz")).not.toBeInTheDocument();
    const reload = await screen.findByRole("button", { name: "Reload items" });
    await userEvent.click(reload);
    expect(await screen.findByLabelText("Score for Ana Cruz")).toHaveValue(19);
    expect(x.scoreRepo.recordCalls).toHaveLength(0);
  });

  it("preserves the roster for a selected-item rename that keeps its score contract", async () => {
    const x = await begin();
    fireEvent.change(x.input, { target: { value: "0" } });
    x.input.focus();
    await act(async () => x.remove()(true));
    await act(async () => x.read()([{ ...ITEM, name: "Quiz 1 revised" }]));
    expect(screen.getByRole("heading", { name: "Quiz 1 revised scores" })).toBeVisible();
    expect(x.input).toBeVisible();
    expect(x.input).toHaveFocus();
    expect(x.input).toHaveValue(0);
    expect(x.roster).toHaveBeenCalledTimes(1);
  });

  it("invalidates displayed derived grades without resetting the active zero draft", async () => {
    const x = await begin();
    await userEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    fireEvent.change(x.input, { target: { value: "0" } });
    x.input.focus();
    await act(async () => x.remove()(true));
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(x.input).toHaveValue(0);
    expect(x.input).toHaveFocus();
    await act(async () => x.read()([ITEM]));
    expect(screen.queryByText("88")).not.toBeInTheDocument();
    expect(x.scoreRepo.computeTermGradeCalls).toHaveLength(1);
  });

  it("rejects an old grade reply and its bulk finally while a newer grade request is pending", async () => {
    const x = await begin();
    let old!: (grade: ComputedTermGrade | null) => void;
    let next!: (grade: ComputedTermGrade | null) => void;
    const compute = vi
      .spyOn(x.scoreRepo, "computeTermGrade")
      .mockImplementationOnce(() => new Promise((done) => (old = done)))
      .mockImplementationOnce(() => new Promise((done) => (next = done)));
    await userEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await act(async () => x.remove()(true));
    await act(async () => x.read()([ITEM]));
    await userEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await act(async () => old({ ...x.scoreRepo.computeTermGradeResult!, termGrade: 99 }));
    expect(screen.queryByText("99")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Computing…" })).toHaveAttribute(
      "aria-disabled",
      "true",
    );
    await act(async () => next(x.scoreRepo.computeTermGradeResult));
    expect(await screen.findByText("88")).toBeVisible();
    expect(compute).toHaveBeenCalledTimes(2);
  });

  it("retains a newer draft after an in-flight score fails during the check and retries only explicitly", async () => {
    const x = await begin();
    let fail!: (error: Error) => void;
    const record = vi
      .spyOn(x.scoreRepo, "record")
      .mockImplementationOnce(() => new Promise((_done, reject) => (fail = reject)))
      .mockResolvedValueOnce({ ...x.scoreRepo.recordResult!, score: 19 });
    fireEvent.change(x.input, { target: { value: "18" } });
    x.input.focus();
    await userEvent.keyboard("{Enter}");
    fireEvent.change(x.input, { target: { value: "19" } });
    await act(async () => x.remove()(true));
    await act(async () => fail(new Error("synthetic failed score")));
    expect(await screen.findByText("Could not save this score.")).toBeVisible();
    expect(x.input).toHaveValue(19);
    await act(async () => x.read()([ITEM]));
    expect(record).toHaveBeenCalledTimes(1);
    x.input.focus();
    await userEvent.keyboard("{Enter}");
    expect(record).toHaveBeenLastCalledWith("ai-1", "l1", "scored", 19, null);
    await waitFor(() => expect(screen.getByLabelText("Score for Ana Cruz")).toHaveValue(19));
  });
});

describe("PM-13 saved-grade readiness with unsaved work", () => {
  async function begin() {
    const x = renderScreen();
    await userEvent.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const input = await screen.findByLabelText("Score for Ana Cruz");
    const compute = vi.spyOn(x.scoreRepo, "computeTermGrade");
    let resolve!: (r: LearnerScore | null) => void;
    let reject!: (e: Error) => void;
    const record = vi.spyOn(x.scoreRepo, "record").mockImplementationOnce(
      () =>
        new Promise((done, fail) => {
          resolve = done;
          reject = fail;
        }),
    );
    const startSave = async () => {
      fireEvent.change(input, { target: { value: "18" } });
      input.focus();
      await userEvent.keyboard("{Enter}");
      expect(record).toHaveBeenCalledExactlyOnceWith("ai-1", "l1", "scored", 18, null);
    };
    return { ...x, input, compute, record, startSave, done: () => resolve, fail: () => reject };
  }

  it("does not read a term-grade snapshot while a score write is unresolved", async () => {
    const x = await begin();
    await x.startSave();
    const button = screen.getByRole("button", { name: "Show term grades" });
    fireEvent.click(button);
    fireEvent.click(button);
    expect(x.compute).not.toHaveBeenCalled();
    expect(button).toHaveAttribute("aria-disabled", "true");
    expect(button).toHaveAccessibleDescription(/A score save is pending/);
    expect(x.record).toHaveBeenCalledTimes(1);
    await act(async () => x.done()(x.scoreRepo.recordResult));
    fireEvent.click(button);
    await screen.findByText("88");
    expect(x.compute).toHaveBeenCalledExactlyOnceWith("cr-1", "l1");
  });

  it("withholds a displayed grade during saving then refreshes saved evidence while retaining a newer zero draft", async () => {
    const x = await begin();
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    await x.startSave();
    const grades = screen.getByRole("table", { name: "Computed term grades" });
    expect(within(grades).queryByText("88")).not.toBeInTheDocument();
    expect(within(grades).getByText(/Score save pending/)).toBeVisible();
    fireEvent.change(x.input, { target: { value: "0" } });
    await act(async () => x.done()(x.scoreRepo.recordResult));
    expect(x.input).toHaveValue(0);
    expect(within(grades).getByText("88")).toBeVisible();
    expect(screen.getByText(/This item has unsaved score work/)).toBeVisible();
    expect(x.compute).toHaveBeenCalledTimes(2);
    expect(x.record).toHaveBeenCalledTimes(1);
  });

  it("does not expose an older grade reply during saving and keeps the newer draft after failure", async () => {
    const x = await begin();
    let grade!: (r: ComputedTermGrade | null) => void;
    x.compute.mockImplementationOnce(
      () =>
        new Promise((done) => {
          grade = done;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await x.startSave();
    await act(async () => grade(x.scoreRepo.computeTermGradeResult));
    const grades = screen.getByRole("table", { name: "Computed term grades" });
    expect(within(grades).queryByText("88")).not.toBeInTheDocument();
    fireEvent.change(x.input, { target: { value: "19" } });
    await act(async () => x.fail()(new Error("synthetic denied save")));
    expect(x.input).toHaveValue(19);
    expect(within(grades).queryByText("88")).not.toBeInTheDocument();
    expect(within(grades).getByText(/Score save was not confirmed/)).toBeVisible();
    expect(screen.getByText("Could not save this score.")).toBeVisible();
    expect(screen.getByRole("button", { name: "Show term grades" })).toHaveAttribute(
      "aria-disabled",
      "false",
    );
    expect(screen.getByText(/This item has unsaved score work/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    expect(x.compute).toHaveBeenCalledTimes(2);
    expect(x.record).toHaveBeenCalledTimes(1);
  });

  it("labels computed completeness as saved-only with an unsaved zero, and Escape removes only the warning", async () => {
    const x = await begin();
    fireEvent.change(x.input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await screen.findByText("88");
    const note = screen.getByText(/Term grades use saved records on this device/);
    expect(note).toHaveTextContent(/Unsaved input is excluded/);
    expect(note).toHaveTextContent(/computed completeness is not reporting approval/);
    expect(screen.getByText(/This item has unsaved score work/)).toBeVisible();
    expect(x.record).not.toHaveBeenCalled();
    x.input.focus();
    await userEvent.keyboard("{Escape}");
    expect(screen.queryByText(/This item has unsaved score work/)).not.toBeInTheDocument();
    expect(note).toBeVisible();
    expect(x.record).not.toHaveBeenCalled();
  });
  it("rejects a pre-save grade reply that arrives after the score failure until an explicit fresh check", async () => {
    const x = await begin();
    let old!: (r: ComputedTermGrade | null) => void;
    x.compute.mockImplementationOnce(
      () =>
        new Promise((done) => {
          old = done;
        }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    await x.startSave();
    await act(async () => x.fail()(new Error("synthetic unknown write outcome")));
    await act(async () => old({ ...x.scoreRepo.computeTermGradeResult!, termGrade: 99 }));
    const grades = screen.getByRole("table", { name: "Computed term grades" });
    expect(within(grades).queryByText("99")).not.toBeInTheDocument();
    expect(within(grades).getByText(/Score save was not confirmed/)).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Show term grades" }));
    expect(await within(grades).findByText("88")).toBeVisible();
    expect(x.compute).toHaveBeenCalledTimes(2);
    expect(x.record).toHaveBeenCalledTimes(1);
  });
});

describe("PM-13 reporting preview freshness", () => {
  it.each(["null", "reject"])(
    "retires the reporting snapshot after an unconfirmed %s correction without replay",
    async (outcome) => {
      const scoreRepo = new FakeLearnerScoreRepository([
        { ...ROSTER_ENTRY, status: "scored", score: 18, updatedAt: "saved-before-check" },
      ]);
      const preview: ReportCardReadiness = {
        classRecordId: "cr-1",
        schoolYear: "2026-2027",
        sectionName: "Synthetic Section",
        subjectName: "Synthetic Subject",
        gradingPeriodLabel: "Synthetic Term",
        startsOn: "2026-06-08",
        endsOn: "2026-09-15",
        weightPolicyId: "synthetic-policy",
        checkedAt: "before correction",
        learnerCount: 1,
        missingGradeCount: 0,
        provisionalGradeCount: 0,
        completeGradeCount: 1,
        missingLrnCount: 0,
        officialFidelity: "not_verified",
        learners: [],
        disclosure: { populatedFields: [], omittedFields: [] },
      };
      const previewReportCard = vi
        .fn()
        .mockResolvedValueOnce(preview)
        .mockResolvedValueOnce({ ...preview, checkedAt: "fresh after uncertain write" });
      const x = renderScreen({ scoreRepo, readiness: { previewReportCard } });
      await userEvent.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
      await screen.findByLabelText("Score for Ana Cruz");
      await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
      await screen.findByText(/Checked: before correction/);
      const input = screen.getByLabelText("Score for Ana Cruz");
      fireEvent.change(input, { target: { value: "19" } });
      input.focus();
      await userEvent.keyboard("{Enter}");
      const reason = await screen.findByLabelText("Reason for changing Ana Cruz's recorded score");
      fireEvent.change(reason, { target: { value: "Synthetic recheck reason" } });
      let done!: (value: LearnerScore | null) => void;
      let fail!: (error: Error) => void;
      const write = vi.spyOn(scoreRepo, "record").mockImplementationOnce(
        () =>
          new Promise((resolve, reject) => {
            done = resolve;
            fail = reject;
          }),
      );
      await userEvent.click(screen.getByRole("button", { name: "Save correction" }));
      expect(screen.queryByText(/Checked: before correction/)).not.toBeInTheDocument();
      await act(async () =>
        outcome === "null" ? done(null) : fail(new Error("Synthetic unknown write outcome")),
      );
      await screen.findByText("Could not save this score.");
      expect(screen.queryByText(/Checked: before correction/)).not.toBeInTheDocument();
      expect(
        screen.getByText(/Run the check again to review the current saved records/),
      ).toBeVisible();
      expect(reason).toHaveValue("Synthetic recheck reason");
      expect(screen.getByText("Change to: 19 / 20")).toBeVisible();
      expect(reason).toBeVisible();
      expect(previewReportCard).toHaveBeenCalledTimes(1);
      await userEvent.click(screen.getByRole("button", { name: "Check reporting preparation" }));
      expect(await screen.findByText(/Checked: fresh after uncertain write/)).toBeVisible();
      expect(write).toHaveBeenCalledExactlyOnceWith(
        "ai-1",
        "l1",
        "scored",
        19,
        "Synthetic recheck reason",
      );
      expect(previewReportCard.mock.calls).toEqual([["cr-1"], ["cr-1"]]);
      expect(x.exportRepo.reportCardCalls).toHaveLength(0);
      expect(screen.getByText("Change to: 19 / 20")).toBeVisible();
      expect(reason).toBeVisible();
      expect(reason).toHaveValue("Synthetic recheck reason");
    },
  );
});

describe("PM-13 category read recovery", () => {
  function deferred() {
    let resolve!: (value: AssessmentCategory[]) => void;
    let reject!: (reason: Error) => void;
    const promise = new Promise<AssessmentCategory[]>((yes, no) => {
      resolve = yes;
      reject = no;
    });
    return { promise, resolve, reject };
  }
  const secondSet = {
    ...CATEGORY_SET,
    id: "set-2",
    name: "Synthetic alternative set",
    isDefault: false,
  };
  const secondCategory = {
    ...CATEGORY,
    id: "cat-2",
    setId: secondSet.id,
    name: "Synthetic second category",
  };

  it("retries categories without reloading items/roster or replacing zero and authoring drafts", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    const scoreRepo = new FakeLearnerScoreRepository();
    const first = deferred(),
      retry = deferred();
    const reads = vi
      .spyOn(repo, "listCategoriesForSet")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise);
    const items = vi.spyOn(repo, "listItemsByClassRecord");
    const rosters = vi.spyOn(scoreRepo, "rosterForItem");
    renderScreen({ assessmentRepo: repo, scoreRepo });
    await user.click(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ }));
    const score = await screen.findByLabelText("Score for Ana Cruz");
    fireEvent.change(score, { target: { value: "0" } });
    await user.click(screen.getByRole("button", { name: "Add assessment item" }));
    const name = screen.getByLabelText("Item name", { selector: "#workspace-item-name" });
    fireEvent.change(name, { target: { value: "Retained synthetic draft" } });
    fireEvent.change(screen.getByLabelText("Max score", { selector: "#workspace-max-score" }), {
      target: { value: "30" },
    });
    await act(async () => first.reject(Error("Synthetic offline")));
    expect(screen.getByLabelText("Category", { selector: "#workspace-category" })).toBeDisabled();
    const retryButton = screen.getByRole("button", { name: "Retry categories" });
    await user.click(retryButton);
    expect(items).toHaveBeenCalledTimes(1);
    expect(rosters).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText("Score for Ana Cruz")).toBe(score);
    expect(score).toHaveValue(0);
    expect(name).toHaveValue("Retained synthetic draft");
    expect(screen.getByLabelText("Max score", { selector: "#workspace-max-score" })).toHaveValue(
      30,
    );
    expect(scoreRepo.recordCalls).toEqual([]);
    expect(repo.createCalls).toEqual([]);
    await act(async () => retry.resolve([CATEGORY]));
    expect(reads.mock.calls).toEqual([[CATEGORY_SET.id], [CATEGORY_SET.id]]);
    await user.click(screen.getByRole("button", { name: "Add item" }));
    expect(repo.createCalls).toEqual([
      {
        classRecordId: "cr-1",
        categoryId: CATEGORY.id,
        name: "Retained synthetic draft",
        maxScore: 30,
      },
    ]);
    expect(scoreRepo.recordCalls).toEqual([]);
  });

  it.each(["empty", "wrong-set"])(
    "fails closed for %s categories with an honest linked explanation",
    async (kind) => {
      const repo = new FakeAssessmentRepository([]);
      vi.spyOn(repo, "listCategoriesForSet").mockResolvedValue(
        kind === "empty" ? [] : [secondCategory],
      );
      renderScreen({ assessmentRepo: repo });
      const category = await screen.findByLabelText("Category", {
        selector: "#workspace-category",
      });
      if (kind === "empty") await screen.findByText("No categories are available for this set.");
      else await screen.findByRole("button", { name: "Retry categories" });
      expect(category).toBeDisabled();
      expect(category).toHaveAccessibleDescription();
      fireEvent.change(screen.getByLabelText("Item name"), { target: { value: "Blocked draft" } });
      await userEvent.click(screen.getByRole("button", { name: "Add item" }));
      expect(repo.createCalls).toEqual([]);
    },
  );

  it("ignores the old reply when returning to the same set during a newer read", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository([]);
    vi.spyOn(repo, "listCategorySets").mockResolvedValue([CATEGORY_SET, secondSet]);
    const old = deferred(),
      current = deferred();
    vi.spyOn(repo, "listCategoriesForSet")
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce([secondCategory])
      .mockReturnValueOnce(current.promise);
    renderScreen({ assessmentRepo: repo });
    const set = await screen.findByLabelText("Category set");
    await waitFor(() => expect(set).toHaveValue(CATEGORY_SET.id));
    await user.selectOptions(set, secondSet.id);
    await screen.findByRole("option", { name: secondCategory.name });
    await user.selectOptions(set, CATEGORY_SET.id);
    await act(async () => old.resolve([CATEGORY]));
    expect(screen.getByLabelText("Category", { selector: "#workspace-category" })).toBeDisabled();
    await act(async () => current.resolve([CATEGORY]));
    expect(screen.getByLabelText("Category", { selector: "#workspace-category" })).toBeEnabled();
    expect(screen.queryByRole("option", { name: secondCategory.name })).not.toBeInTheDocument();
  });
  it("does not reload assessments when recovering the category read", async () => {
    const repo = new FakeAssessmentRepository();
    const reads = vi.spyOn(repo, "listItemsByClassRecord");
    vi.spyOn(repo, "listCategoriesForSet")
      .mockRejectedValueOnce(Error("Synthetic offline"))
      .mockResolvedValueOnce([CATEGORY]);
    renderScreen({ assessmentRepo: repo });
    await screen.findByRole("alert");
    await userEvent.click(
      screen.queryByRole("button", { name: "Retry categories" }) ??
        screen.getByRole("button", { name: "Reload items" }),
    );
    await waitFor(() => expect(screen.queryByRole("alert")).not.toBeInTheDocument());
    expect(reads).toHaveBeenCalledTimes(1);
    expect(repo.createCalls).toEqual([]);
  });

  it("retains an unscored item's edit draft through category failure and retry", async () => {
    const repo = new FakeAssessmentRepository();
    const first = deferred(),
      retry = deferred();
    vi.spyOn(repo, "listCategoriesForSet")
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(retry.promise);
    renderScreen({ assessmentRepo: repo });
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]!);
    const name = screen.getByLabelText("Item name", { selector: "#edit-name-ai-1" });
    const max = screen.getByLabelText("Max score", { selector: "#edit-max-ai-1" });
    fireEvent.change(name, { target: { value: "Retained edit" } });
    fireEvent.change(max, { target: { value: "40" } });
    await act(async () => first.reject(Error("Synthetic offline")));
    await userEvent.click(screen.getByRole("button", { name: "Retry categories" }));
    expect(screen.getByLabelText("Item name", { selector: "#edit-name-ai-1" })).toBe(name);
    expect(name).toHaveValue("Retained edit");
    expect(max).toHaveValue(40);
    expect(screen.getByRole("button", { name: "Save" })).toHaveAttribute("aria-disabled", "true");
    await act(async () => retry.resolve([CATEGORY]));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(repo.updateCalls).toEqual([
      { id: ITEM.id, name: "Retained edit", categoryId: CATEGORY.id, maxScore: 40 },
    ]);
  });

  it("allows scored-item rename without requiring category recovery", async () => {
    const repo = new FakeAssessmentRepository([{ ...ITEM, recordedCount: 2 }]);
    vi.spyOn(repo, "listCategoriesForSet").mockRejectedValue(Error("Synthetic offline"));
    renderScreen({ assessmentRepo: repo });
    await userEvent.click((await screen.findAllByRole("button", { name: "Edit" }))[0]!);
    fireEvent.change(screen.getByLabelText("Item name", { selector: "#edit-name-ai-1" }), {
      target: { value: "Rename only" },
    });
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(repo.renameCalls).toEqual([{ id: ITEM.id, name: "Rename only" }]);
    expect(repo.updateCalls).toEqual([]);
  });
});
