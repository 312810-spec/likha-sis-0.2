import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type { AssessmentRepository } from "../domain/ports/assessment-repository";
import { AssessmentApplicationService } from "./assessment-service";

class FakeAssessmentRepository implements AssessmentRepository {
  createCalls: Array<{
    classRecordId: string;
    categoryId: string;
    name: string;
    maxScore: number;
  }> = [];
  createResult: AssessmentItem | null = {
    id: "ai-1",
    schoolId: "s1",
    classRecordId: "cr-1",
    categoryId: "cat-1",
    name: "Quiz 1",
    maxScore: 20,
    createdAt: "now",
  };
  categorySetsToReturn: AssessmentCategorySet[] = [];
  categoriesToReturn: AssessmentCategory[] = [];
  itemsToReturn: AssessmentItemDetail[] = [];

  async listCategorySets(): Promise<AssessmentCategorySet[]> {
    return this.categorySetsToReturn;
  }

  async listCategoriesForSet(): Promise<AssessmentCategory[]> {
    return this.categoriesToReturn;
  }

  async listItemsByClassRecord(): Promise<AssessmentItemDetail[]> {
    return this.itemsToReturn;
  }

  async createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    this.createCalls.push({ classRecordId, categoryId, name, maxScore });
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

describe("AssessmentApplicationService", () => {
  it("creates an item with trimmed fields", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    const item = await service.createItem(" cr-1 ", " cat-1 ", " Quiz 1 ", 20);

    expect(item).toEqual(repo.createResult);
    expect(repo.createCalls).toEqual([
      { classRecordId: "cr-1", categoryId: "cat-1", name: "Quiz 1", maxScore: 20 },
    ]);
  });

  it("rejects an empty class record id without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.createItem("  ", "cat-1", "Quiz 1", 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty category id without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.createItem("cr-1", "  ", "Quiz 1", 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects an empty item name without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.createItem("cr-1", "cat-1", "  ", 20)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a non-positive max score without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.createItem("cr-1", "cat-1", "Quiz 1", 0)).rejects.toBeInstanceOf(
      ValidationError,
    );
    await expect(service.createItem("cr-1", "cat-1", "Quiz 1", -5)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("rejects a non-finite max score without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.createItem("cr-1", "cat-1", "Quiz 1", NaN)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.createCalls).toEqual([]);
  });

  it("lists category sets by delegating to the repository", async () => {
    const repo = new FakeAssessmentRepository();
    repo.categorySetsToReturn = [
      { id: "set-1", name: "DO 015", sourceCitation: "cite", isDefault: true, createdAt: "now" },
    ];
    const service = new AssessmentApplicationService(repo);

    const sets = await service.listCategorySets();

    expect(sets).toBe(repo.categorySetsToReturn);
  });

  it("renames an item with trimmed fields", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await service.renameItem(" ai-1 ", " Quiz 1 (Retake) ");

    expect(repo.renameCalls).toEqual([{ id: "ai-1", name: "Quiz 1 (Retake)" }]);
  });

  it("rejects renaming to an empty name without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.renameItem("ai-1", "  ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.renameCalls).toEqual([]);
  });

  it("fully updates an item with trimmed fields", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await service.updateItem(" ai-1 ", " Quiz 1 ", " cat-2 ", 25);

    expect(repo.updateCalls).toEqual([
      { id: "ai-1", name: "Quiz 1", categoryId: "cat-2", maxScore: 25 },
    ]);
  });

  it("rejects a non-positive max score on update without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.updateItem("ai-1", "Quiz 1", "cat-1", 0)).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.updateCalls).toEqual([]);
  });

  it("deletes an item by delegating to the repository", async () => {
    const repo = new FakeAssessmentRepository();
    repo.deleteResult = true;
    const service = new AssessmentApplicationService(repo);

    const result = await service.deleteItem("ai-1");

    expect(result).toBe(true);
    expect(repo.deleteCalls).toEqual(["ai-1"]);
  });

  it("rejects deleting with an empty id without calling the repository", async () => {
    const repo = new FakeAssessmentRepository();
    const service = new AssessmentApplicationService(repo);

    await expect(service.deleteItem("  ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.deleteCalls).toEqual([]);
  });
});
