import { ValidationError } from "../domain/errors";
import type { ClassRecord, ClassRecordDetail, GradingWeightPolicy } from "../domain/class-record";
import type { ClassRecordRepository } from "../domain/ports/class-record-repository";

/**
 * Orchestrates class-record use cases (opening/creating the section +
 * subject + grading-period gradebook workspace). UI code depends on this,
 * never directly on a `ClassRecordRepository`. School scope is never a
 * parameter here — it comes from the caller's authenticated session on
 * the Rust side. See `SectionApplicationService` for the same convention.
 */
export class ClassRecordApplicationService {
  constructor(private readonly classRecords: ClassRecordRepository) {}

  listClassRecords(): Promise<ClassRecordDetail[]> {
    return this.classRecords.list();
  }

  async createClassRecord(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null> {
    const trimmedSectionId = sectionId.trim();
    const trimmedSubjectId = subjectId.trim();
    const trimmedGradingPeriodId = gradingPeriodId.trim();
    const trimmedWeightPolicyId = weightPolicyId.trim();
    if (trimmedSectionId.length === 0) {
      throw new ValidationError("Section is required.");
    }
    if (trimmedSubjectId.length === 0) {
      throw new ValidationError("Subject is required.");
    }
    if (trimmedGradingPeriodId.length === 0) {
      throw new ValidationError("Grading period is required.");
    }
    if (trimmedWeightPolicyId.length === 0) {
      throw new ValidationError("Grading weight policy is required.");
    }

    return this.classRecords.create(
      trimmedSectionId,
      trimmedSubjectId,
      trimmedGradingPeriodId,
      trimmedWeightPolicyId,
    );
  }

  listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return this.classRecords.listGradingWeightPolicies();
  }
}
