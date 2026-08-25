import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../../domain/assessment";
import { TauriAssessmentRepository } from "./assessment-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriAssessmentRepository", () => {
  it("listCategorySets invokes list_assessment_category_sets with no arguments", async () => {
    const sets: AssessmentCategorySet[] = [
      { id: "set-1", name: "DO 015", sourceCitation: "cite", isDefault: true, createdAt: "now" },
    ];
    mockInvoke.mockResolvedValueOnce(sets);

    const result = await new TauriAssessmentRepository().listCategorySets();

    expect(mockInvoke).toHaveBeenCalledWith("list_assessment_category_sets");
    expect(result).toEqual(sets);
  });

  it("listCategoriesForSet invokes list_assessment_categories_for_set with setId", async () => {
    const categories: AssessmentCategory[] = [
      { id: "cat-1", setId: "set-1", sequence: 1, name: "Written Works" },
    ];
    mockInvoke.mockResolvedValueOnce(categories);

    const result = await new TauriAssessmentRepository().listCategoriesForSet("set-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_assessment_categories_for_set", {
      setId: "set-1",
    });
    expect(result).toEqual(categories);
  });

  it("listItemsByClassRecord invokes list_assessment_items_by_class_record with classRecordId", async () => {
    const items: AssessmentItemDetail[] = [
      {
        id: "ai-1",
        schoolId: "s1",
        classRecordId: "cr-1",
        categoryId: "cat-1",
        categoryName: "Written Works",
        name: "Quiz 1",
        maxScore: 20,
        createdAt: "now",
        recordedCount: 0,
        totalEligible: 1,
      },
    ];
    mockInvoke.mockResolvedValueOnce(items);

    const result = await new TauriAssessmentRepository().listItemsByClassRecord("cr-1");

    expect(mockInvoke).toHaveBeenCalledWith("list_assessment_items_by_class_record", {
      classRecordId: "cr-1",
    });
    expect(result).toEqual(items);
  });

  it("createItem invokes create_assessment_item with classRecordId/categoryId/name/maxScore", async () => {
    const item: AssessmentItem = {
      id: "ai-1",
      schoolId: "s1",
      classRecordId: "cr-1",
      categoryId: "cat-1",
      name: "Quiz 1",
      maxScore: 20,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(item);

    const result = await new TauriAssessmentRepository().createItem("cr-1", "cat-1", "Quiz 1", 20);

    expect(mockInvoke).toHaveBeenCalledWith("create_assessment_item", {
      classRecordId: "cr-1",
      categoryId: "cat-1",
      name: "Quiz 1",
      maxScore: 20,
    });
    expect(result).toEqual(item);
  });

  it("createItem returns null when a referenced id doesn't resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriAssessmentRepository().createItem("cr-1", "cat-1", "Quiz 1", 20);

    expect(result).toBeNull();
  });

  it("renameItem invokes rename_assessment_item with id/name", async () => {
    const item: AssessmentItem = {
      id: "ai-1",
      schoolId: "s1",
      classRecordId: "cr-1",
      categoryId: "cat-1",
      name: "Quiz 1 (Retake)",
      maxScore: 20,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(item);

    const result = await new TauriAssessmentRepository().renameItem("ai-1", "Quiz 1 (Retake)");

    expect(mockInvoke).toHaveBeenCalledWith("rename_assessment_item", {
      id: "ai-1",
      name: "Quiz 1 (Retake)",
    });
    expect(result).toEqual(item);
  });

  it("updateItem invokes update_assessment_item with id/name/categoryId/maxScore", async () => {
    const item: AssessmentItem = {
      id: "ai-1",
      schoolId: "s1",
      classRecordId: "cr-1",
      categoryId: "cat-2",
      name: "Quiz 1",
      maxScore: 25,
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(item);

    const result = await new TauriAssessmentRepository().updateItem("ai-1", "Quiz 1", "cat-2", 25);

    expect(mockInvoke).toHaveBeenCalledWith("update_assessment_item", {
      id: "ai-1",
      name: "Quiz 1",
      categoryId: "cat-2",
      maxScore: 25,
    });
    expect(result).toEqual(item);
  });

  it("deleteItem invokes delete_assessment_item with id", async () => {
    mockInvoke.mockResolvedValueOnce(true);

    const result = await new TauriAssessmentRepository().deleteItem("ai-1");

    expect(mockInvoke).toHaveBeenCalledWith("delete_assessment_item", { id: "ai-1" });
    expect(result).toBe(true);
  });
});
