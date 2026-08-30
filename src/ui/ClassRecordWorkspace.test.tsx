import { render, screen, waitFor, within } from "@testing-library/react";
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

  constructor(private items: AssessmentItemDetail[] = [ITEM]) {}

  async listCategorySets(): Promise<AssessmentCategorySet[]> {
    return [CATEGORY_SET];
  }

  async listCategoriesForSet(): Promise<AssessmentCategory[]> {
    return [CATEGORY];
  }

  listItemsCallCount = 0;
  failNextListItemsCall = false;
  async listItemsByClassRecord(): Promise<AssessmentItemDetail[]> {
    this.listItemsCallCount += 1;
    if (this.failNextListItemsCall) {
      this.failNextListItemsCall = false;
      throw new Error("simulated items load failure");
    }
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
    return this.updateResult;
  }

  deleteCalls: string[] = [];
  deleteResult = true;
  async deleteItem(id: string): Promise<boolean> {
    this.deleteCalls.push(id);
    if (this.deleteResult) {
      this.items = this.items.filter((item) => item.id !== id);
    }
    return this.deleteResult;
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

  failNextRosterForItemCall = false;

  constructor(private roster: LearnerScoreRosterEntry[] | null = [ROSTER_ENTRY]) {}

  async rosterForItem(): Promise<LearnerScoreRosterEntry[] | null> {
    if (this.failNextRosterForItemCall) {
      this.failNextRosterForItemCall = false;
      throw new Error("simulated roster load failure");
    }
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

  it("offers a Retry action when the initial assessment-item load fails, and it actually retries", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.failNextListItemsCall = true;
    renderScreen({ assessmentRepo });

    await screen.findByText(/could not load this class record's assessment items/i);
    const listCallsBeforeRetry = assessmentRepo.listItemsCallCount;

    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ })).toBeInTheDocument();
    expect(assessmentRepo.listItemsCallCount).toBeGreaterThan(listCallsBeforeRetry);
    expect(
      screen.queryByText(/could not load this class record's assessment items/i),
    ).not.toBeInTheDocument();
  });

  it("clicking Retry on a failed assessment-item load does not drop keyboard focus to <body>", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.failNextListItemsCall = true;
    renderScreen({ assessmentRepo });
    await screen.findByText(/could not load this class record's assessment items/i);

    // The Retry button's own retry function clears the error (unmounting
    // the button being clicked) as its first synchronous step -- without
    // a focus fix, the browser drops focus to <body> at that point.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("heading", { name: "Class Record Workspace" })).toHaveFocus();
  });

  it("clicking Retry on a failed roster load does not drop keyboard focus to <body>", async () => {
    const user = userEvent.setup();
    const scoreRepo = new FakeLearnerScoreRepository();
    scoreRepo.failNextRosterForItemCall = true;
    renderScreen({ scoreRepo });
    const itemButton = await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });
    await user.click(itemButton);
    await screen.findByText(/could not load the roster for this item/i);

    // The Retry button's own retry function clears the error (unmounting
    // the button being clicked) as its first synchronous step -- without
    // a focus fix, the browser drops focus to <body> at that point.
    await user.click(screen.getByRole("button", { name: "Retry" }));

    expect(document.activeElement).not.toBe(document.body);
    expect(screen.getByRole("heading", { name: "Class Record Workspace" })).toHaveFocus();
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
  });

  it("moves focus to the item-action error banner when a delete fails, wherever the list scrolled to", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    assessmentRepo.deleteResult = false;
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await screen.findByText(/could not delete this item/i);
    await waitFor(() => expect(screen.getByRole("alert")).toHaveFocus());
  });

  it("moves focus into the delete confirmation, then to the heading once the item is actually gone", async () => {
    const user = userEvent.setup();
    const assessmentRepo = new FakeAssessmentRepository([ITEM]);
    renderScreen({ assessmentRepo });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Confirm delete" })).toHaveFocus(),
    );

    await user.click(screen.getByRole("button", { name: "Confirm delete" }));
    await waitFor(() => expect(assessmentRepo.deleteCalls).toEqual(["ai-1"]));

    // The item's own controls (including the button that was just
    // focused) are now gone -- focus must land somewhere real, not <body>.
    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Class Record Workspace" })).toHaveFocus(),
    );
  });

  it("returns focus to the item's own Delete button after cancelling the confirmation", async () => {
    const user = userEvent.setup();
    renderScreen({ assessmentRepo: new FakeAssessmentRepository([ITEM]) });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Delete" })).toHaveFocus());
  });

  it("moves focus into the edit form, then back to the item's select button after Cancel", async () => {
    const user = userEvent.setup();
    renderScreen({ assessmentRepo: new FakeAssessmentRepository([ITEM]) });
    await screen.findByRole("button", { name: /Quiz 1 \(max 20\)/ });

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameField = screen.getAllByLabelText("Item name")[1]!;
    await waitFor(() => expect(nameField).toHaveFocus());

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Quiz 1 \(max 20\)/ })).toHaveFocus(),
    );
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
      { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 18 },
      { assessmentItemId: "ai-1", learnerId: "l2", status: "scored", score: 15 },
    ]);
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

  it("never lets an older score-write response overwrite a newer exception-write for the same learner", async () => {
    const user = userEvent.setup();

    class OrderControlledLearnerScoreRepository implements LearnerScoreRepository {
      calls: Array<{ learnerId: string; status: LearnerScoreStatus; score: number | null }> = [];
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
        _assessmentItemId: string,
        learnerId: string,
        status: LearnerScoreStatus,
        score: number | null,
      ): Promise<LearnerScore | null> {
        this.calls.push({ learnerId, status, score });
        const index = this.calls.length - 1;
        return new Promise((resolve) => {
          this.pending[index] = resolve;
        });
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

    // Start Ana's write (call 0: scored 18).
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "18{Enter}");
    // Start Bo's write (call 1: scored 15) -- this must not leave Ana's row
    // stuck disabled once Bo's write is the one in flight, and must not
    // block a later write for Ana from starting.
    await user.type(screen.getByLabelText("Score for Bo Reyes"), "15{Enter}");
    // A second, newer write for Ana (call 2: Excused) starts before call 0
    // resolves.
    await user.click(within(anaGroup).getByRole("button", { name: "Excused" }));

    expect(repo.calls).toEqual([
      { learnerId: "l1", status: "scored", score: 18 },
      { learnerId: "l2", status: "scored", score: 15 },
      { learnerId: "l1", status: "excused", score: null },
    ]);

    // Resolve out of order: the newer write (call 2, Excused) resolves first...
    repo.resolveCall(2);
    await waitFor(() =>
      expect(within(anaGroup).getByRole("button", { name: "Excused" })).toHaveAttribute(
        "aria-pressed",
        "true",
      ),
    );
    // ...then the older write (call 0, scored 18) arrives late.
    repo.resolveCall(0);
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Ana's displayed state must still reflect the newer write (Excused),
    // never reverted by the stale, older response.
    expect(within(anaGroup).getByRole("button", { name: "Excused" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
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
    };
    await user.type(screen.getByLabelText("Score for Ana Cruz"), "19{Enter}");
    await waitFor(() =>
      expect(scoreRepo.recordCalls).toEqual([
        { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 19 },
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
        { assessmentItemId: "ai-1", learnerId: "l1", status: "scored", score: 19 },
      ]),
    );
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(scoreRepo.computeTermGradeCalls).toEqual([]);
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
