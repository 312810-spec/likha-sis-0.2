/** A named, versioned assessment-category structure with its own source
 * citation — DepEd's Written Work/Performance Task/Quarterly Assessment
 * naming has itself changed (DepEd Order No. 015, s. 2026 renamed the
 * third category to "Examinations" and repealed the older DO 8, s.
 * 2015), so category names are reference data, not a hardcoded set. */
export interface AssessmentCategorySet {
  id: string;
  name: string;
  sourceCitation: string;
  isDefault: boolean;
  createdAt: string;
}

export interface AssessmentCategory {
  id: string;
  setId: string;
  sequence: number;
  name: string;
}

export interface AssessmentItem {
  id: string;
  schoolId: string;
  classRecordId: string;
  categoryId: string;
  name: string;
  maxScore: number;
  createdAt: string;
}

/** An assessment item joined with its category's name, for a workspace
 * screen that groups items by category. `recordedCount`/`totalEligible`
 * let a teacher see each item's completion (e.g. "12/30 recorded")
 * without opening it -- `totalEligible` is the class record's own
 * eligible-learner roster size, the same for every item in one class
 * record. */
export interface AssessmentItemDetail {
  id: string;
  schoolId: string;
  classRecordId: string;
  categoryId: string;
  categoryName: string;
  name: string;
  maxScore: number;
  createdAt: string;
  recordedCount: number;
  totalEligible: number;
}
