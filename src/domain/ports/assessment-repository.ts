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
  /** Renames an item -- always permitted, scored or not. See
   * `assessment_item::rename`'s Rust doc comment for why this one field
   * is always safe to change. */
  renameItem(id: string, name: string): Promise<AssessmentItem | null>;
  /** Fully edits an item's name/category/max score -- only accepted by
   * the Rust layer while the item has no recorded scores yet; returns
   * `null` otherwise (the same fail-closed convention as every other
   * rejection in this domain). */
  updateItem(
    id: string,
    name: string,
    categoryId: string,
    maxScore: number,
  ): Promise<AssessmentItem | null>;
  /** Deletes an item -- only accepted while it has no recorded scores
   * yet; returns `false` otherwise. */
  deleteItem(id: string): Promise<boolean>;
}
