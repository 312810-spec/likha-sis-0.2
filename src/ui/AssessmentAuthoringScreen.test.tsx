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

describe("PM-12 delayed edit receipts", () => {
  const prefix = "authoring-";
  async function begin(repo: FakeAssessmentRepository) {
    renderScreen(repo);
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
    const mounted = renderScreen(repo);
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
