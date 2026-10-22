import { SessionDraftProvider } from "./SessionDraftProvider";
import { clearSessionDrafts } from "./session-draft-store";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AssessmentApplicationService } from "../application/assessment-service";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type { AssessmentRepository } from "../domain/ports/assessment-repository";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { AssessmentAuthoringScreen } from "./AssessmentAuthoringScreen";
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
    return this.deleteResult;
  }
}

function renderScreen(repo: FakeAssessmentRepository, onBack = vi.fn()) {
  const service = new AssessmentApplicationService(repo);
  const utils = render(
    <ModeProvider>
      <AssessmentAuthoringScreen
        classRecordId="cr-1"
        classRecordLabel="Mabini — Mathematics — Quarter 1 (2026-2027)"
        assessmentService={service}
        onBack={onBack}
      />
    </ModeProvider>,
  );
  return { ...utils, onBack };
}

describe("AssessmentAuthoringScreen", () => {
  let repo: FakeAssessmentRepository;

  beforeEach(() => {
    repo = new FakeAssessmentRepository();
  });

  it("renders the existing item list and the class record label", async () => {
    renderScreen(repo);

    expect(await screen.findByText(/Written Works — Quiz 1/)).toBeInTheDocument();
    expect(screen.getByText(/Mabini — Mathematics — Quarter 1/)).toBeInTheDocument();
  });

  it("adds an item and keeps the form open with only the name cleared", async () => {
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await user.type(screen.getByLabelText("Item name"), "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));

    await waitFor(() => {
      expect(repo.createCalls).toEqual([
        { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 2", maxScore: 20 },
      ]);
    });
    expect(await screen.findByText(/Written Works — Quiz 2/)).toBeInTheDocument();
    expect(screen.getByLabelText("Item name")).toHaveValue("");
    expect(screen.getByLabelText("Max score")).toHaveValue(20);
    expect(await screen.findByText("1 item added this session.")).toBeInTheDocument();
  });

  it("submits an item on Enter in the name field", async () => {
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await user.type(screen.getByLabelText("Item name"), "Quiz 2{Enter}");

    await waitFor(() => {
      expect(repo.createCalls).toHaveLength(1);
    });
  });

  it("renames an item via the edit form", async () => {
    const user = userEvent.setup();
    repo.renameResult = { ...ITEM, name: "Quiz 1 (Retake)" };
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await user.click(screen.getByRole("button", { name: "Edit" }));
    const nameInput = screen.getByLabelText("Item name", { selector: "#authoring-edit-name-ai-1" });
    await user.clear(nameInput);
    await user.type(nameInput, "Quiz 1 (Retake)");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(repo.updateCalls).toEqual([
        { id: "ai-1", name: "Quiz 1 (Retake)", categoryId: "cat-1", maxScore: 20 },
      ]);
    });
  });

  it("deletes an item after two-step confirmation", async () => {
    const user = userEvent.setup();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete" }));

    await waitFor(() => {
      expect(repo.deleteCalls).toEqual(["ai-1"]);
    });
  });

  it("calls onBack when the back action is used", async () => {
    const user = userEvent.setup();
    const { onBack } = renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await user.click(screen.getByRole("button", { name: /Back to Class Records/ }));

    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations", async () => {
    const { container } = renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);

    await expectNoAccessibilityViolations(container);
  });
});

describe("assessment recovery", () => {
  it("blocks writes after a failed fresh read and reloads without erasing typed work", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    vi.spyOn(repo, "listItemsByClassRecord").mockRejectedValueOnce(new Error("offline"));
    renderScreen(repo);
    await screen.findByRole("button", { name: "Reload items" });
    await user.type(screen.getByLabelText("Item name"), "Retained task");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    expect(repo.createCalls).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Reload items" }));
    await screen.findByText(/Written Works — Quiz 1/);
    expect(screen.getByLabelText("Item name")).toHaveValue("Retained task");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await waitFor(() => expect(repo.createCalls).toHaveLength(1));
  });

  it("requires an explicit choice before adding an exact duplicate", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    await user.type(screen.getByLabelText("Item name"), "Quiz 1");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    expect(repo.createCalls).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: "Review existing item" }));
    expect(repo.createCalls).toHaveLength(0);
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await user.click(screen.getByRole("button", { name: "Save another item" }));
    await waitFor(() => expect(repo.createCalls).toHaveLength(1));
  });

  it("clears a confirmed creation before a failing list refresh and offers read-only recovery", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    const list = vi.spyOn(repo, "listItemsByClassRecord");
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    list.mockRejectedValueOnce(new Error("refresh offline"));
    await user.type(screen.getByLabelText("Item name"), "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await screen.findByText(/The change is saved, but the item list could not refresh/);
    expect(screen.getByLabelText("Item name")).toHaveValue("");
    expect(screen.getByText("Quiz 2 added.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reload items" }));
    await screen.findByText(/Written Works — Quiz 2/);
    expect(repo.createCalls).toHaveLength(1);
  });
});

describe("authoring draft continuity", () => {
  it("restores an unfinished composer for the same owner and class", async () => {
    clearSessionDrafts();
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);
    const element = (
      <SessionDraftProvider owner="teacher:school">
        <ModeProvider>
          <AssessmentAuthoringScreen
            classRecordId="cr-1"
            classRecordLabel="Mabini"
            assessmentService={service}
            onBack={() => {}}
          />
        </ModeProvider>
      </SessionDraftProvider>
    );
    const first = render(element);
    await screen.findByText(/Written Works — Quiz 1/);
    await user.type(screen.getByLabelText("Item name"), "Unfinished quiz");
    first.unmount();
    render(element);
    await screen.findByText(/Written Works — Quiz 1/);
    expect(screen.getByLabelText("Item name")).toHaveValue("Unfinished quiz");
    expect(repo.createCalls).toHaveLength(0);
    clearSessionDrafts();
  });
});

describe("assessment creation acknowledgment continuity", () => {
  it("retains the next Studio item and focused field while the previous creation finishes", async () => {
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
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    const name = screen.getByLabelText("Item name"),
      max = screen.getByLabelText("Max score");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await user.clear(name);
    await user.type(name, "Quiz 3");
    await user.clear(max);
    await user.type(max, "10");
    await act(async () => release());
    expect(name).toHaveValue("Quiz 3");
    expect(max).toHaveValue(10);
    expect(max).toHaveFocus();
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy).toHaveBeenCalledWith("cr-1", "cat-1", "Quiz 2", 20);
    expect(screen.getByText(/Quiz 2 added\./)).toBeVisible();
  });
  it("does not steal focus after a late list refresh while the next name is being prepared", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    const original = repo.listItemsByClassRecord.bind(repo);
    let release!: () => Promise<void>;
    vi.spyOn(repo, "listItemsByClassRecord").mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          release = async () => resolve(await original());
        }),
    );
    const name = screen.getByLabelText("Item name"),
      max = screen.getByLabelText("Max score");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await screen.findByText(/Quiz 2 added\./);
    await user.type(name, "Quiz 3");
    await user.click(max);
    await act(async () => release());
    expect(name).toHaveValue("Quiz 3");
    expect(max).toHaveFocus();
  });
  it("does not create an item for an IME composition Enter", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    const spy = vi.spyOn(repo, "createItem");
    const name = screen.getByLabelText("Item name");
    await user.type(name, "Quiz 2");
    fireEvent.keyDown(name, { key: "Enter", code: "Enter", isComposing: true });
    expect(spy).not.toHaveBeenCalled();
    expect(name).toHaveValue("Quiz 2");
  });
});

describe("Studio creation draft boundaries", () => {
  it("retains a category-only change while acknowledging the submitted category", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    vi.spyOn(repo, "listCategoriesForSet").mockResolvedValue([
      CATEGORY,
      { ...CATEGORY, id: "cat-2", name: "Synthetic second category" },
    ]);
    const create = repo.createItem.bind(repo);
    let release!: () => Promise<void>;
    vi.spyOn(repo, "createItem").mockImplementationOnce(
      (...args) =>
        new Promise((resolve) => {
          release = async () => resolve(await create(...args));
        }),
    );
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    const name = screen.getByLabelText("Item name"),
      category = screen.getByLabelText("Category", { exact: true });
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await user.selectOptions(category, "cat-2");
    await act(async () => release());
    expect(name).toHaveValue("Quiz 2");
    expect(category).toHaveValue("cat-2");
    expect(category).toHaveFocus();
    expect(repo.createCalls).toEqual([
      { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 2", maxScore: 20 },
    ]);
  });
  it("retains a newer Studio draft after a failed create without retrying it", async () => {
    const user = userEvent.setup();
    const repo = new FakeAssessmentRepository();
    let reject!: (e: Error) => void;
    const spy = vi.spyOn(repo, "createItem").mockImplementationOnce(
      () =>
        new Promise((_resolve, fail) => {
          reject = fail;
        }),
    );
    renderScreen(repo);
    await screen.findByText(/Written Works — Quiz 1/);
    const name = screen.getByLabelText("Item name");
    await user.type(name, "Quiz 2");
    await user.click(screen.getByRole("button", { name: /Add item and continue/ }));
    await user.clear(name);
    await user.type(name, "Quiz 3");
    await act(async () => reject(new Error("synthetic failure")));
    expect(await screen.findByText("Could not add this item.")).toBeVisible();
    expect(name).toHaveValue("Quiz 3");
    expect(spy).toHaveBeenCalledTimes(1);
  });
});
