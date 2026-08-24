import { invoke } from "./invoke";
import type {
  ClassRecord,
  ClassRecordDetail,
  GradingWeightPolicy,
} from "../../domain/class-record";
import type { ClassRecordRepository } from "../../domain/ports/class-record-repository";

/** Tauri/SQLite implementation of {@link ClassRecordRepository}. */
export class TauriClassRecordRepository implements ClassRecordRepository {
  list(): Promise<ClassRecordDetail[]> {
    return invoke<ClassRecordDetail[]>("list_class_records_by_school");
  }

  create(
    sectionId: string,
    subjectId: string,
    gradingPeriodId: string,
    weightPolicyId: string,
  ): Promise<ClassRecord | null> {
    return invoke<ClassRecord | null>("create_class_record", {
      sectionId,
      subjectId,
      gradingPeriodId,
      weightPolicyId,
    });
  }

  listGradingWeightPolicies(): Promise<GradingWeightPolicy[]> {
    return invoke<GradingWeightPolicy[]>("list_grading_weight_policies");
  }
}
