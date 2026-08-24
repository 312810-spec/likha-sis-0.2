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
});
