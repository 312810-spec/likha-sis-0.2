import { invoke } from "@tauri-apps/api/core";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../../domain/assessment";
import type { AssessmentRepository } from "../../domain/ports/assessment-repository";

/** Tauri/SQLite implementation of {@link AssessmentRepository}. */
export class TauriAssessmentRepository implements AssessmentRepository {
  listCategorySets(): Promise<AssessmentCategorySet[]> {
    return invoke<AssessmentCategorySet[]>("list_assessment_category_sets");
  }

  listCategoriesForSet(setId: string): Promise<AssessmentCategory[]> {
    return invoke<AssessmentCategory[]>("list_assessment_categories_for_set", { setId });
  }

  listItemsByClassRecord(classRecordId: string): Promise<AssessmentItemDetail[]> {
    return invoke<AssessmentItemDetail[]>("list_assessment_items_by_class_record", {
      classRecordId,
    });
  }

  createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    return invoke<AssessmentItem | null>("create_assessment_item", {
      classRecordId,
      categoryId,
      name,
      maxScore,
    });
  }
}
