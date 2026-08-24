import { ValidationError } from "../domain/errors";
import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../domain/assessment";
import type { AssessmentRepository } from "../domain/ports/assessment-repository";

const MAX_NAME_LENGTH = 100;

/**
 * Orchestrates assessment-category and assessment-item use cases. UI
 * code depends on this, never directly on an `AssessmentRepository`.
 * School scope is never a parameter here — it comes from the caller's
 * authenticated session on the Rust side. See
 * `ClassRecordApplicationService` for the same convention.
 */
export class AssessmentApplicationService {
  constructor(private readonly assessments: AssessmentRepository) {}

  listCategorySets(): Promise<AssessmentCategorySet[]> {
    return this.assessments.listCategorySets();
  }

  listCategoriesForSet(setId: string): Promise<AssessmentCategory[]> {
    return this.assessments.listCategoriesForSet(setId);
  }

  listItemsByClassRecord(classRecordId: string): Promise<AssessmentItemDetail[]> {
    return this.assessments.listItemsByClassRecord(classRecordId);
  }

  async createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null> {
    const trimmedClassRecordId = classRecordId.trim();
    const trimmedCategoryId = categoryId.trim();
    const trimmedName = name.trim();
    if (trimmedClassRecordId.length === 0) {
      throw new ValidationError("Class record is required.");
    }
    if (trimmedCategoryId.length === 0) {
      throw new ValidationError("Category is required.");
    }
    if (trimmedName.length === 0) {
      throw new ValidationError("Item name is required.");
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      throw new ValidationError(`Item name must be at most ${MAX_NAME_LENGTH} characters.`);
    }
    if (!Number.isFinite(maxScore) || maxScore <= 0) {
      throw new ValidationError("Max score must be a positive number.");
    }

    return this.assessments.createItem(
      trimmedClassRecordId,
      trimmedCategoryId,
      trimmedName,
      maxScore,
    );
  }
}
