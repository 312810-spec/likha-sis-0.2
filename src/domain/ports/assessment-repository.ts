import type {
  AssessmentCategory,
  AssessmentCategorySet,
  AssessmentItem,
  AssessmentItemDetail,
} from "../assessment";

/** Repository port for assessment category reference data and assessment
 * items. Implicitly scoped to the current session's school where
 * applicable — no `schoolId` parameter anywhere here, same convention as
 * {@link SectionRepository}. */
export interface AssessmentRepository {
  listCategorySets(): Promise<AssessmentCategorySet[]>;
  listCategoriesForSet(setId: string): Promise<AssessmentCategory[]>;
  listItemsByClassRecord(classRecordId: string): Promise<AssessmentItemDetail[]>;
  createItem(
    classRecordId: string,
    categoryId: string,
    name: string,
    maxScore: number,
  ): Promise<AssessmentItem | null>;
}
