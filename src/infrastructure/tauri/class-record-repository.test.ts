import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  ClassRecord,
  ClassRecordDetail,
  GradingWeightPolicy,
} from "../../domain/class-record";
import { TauriClassRecordRepository } from "./class-record-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriClassRecordRepository", () => {
  it("list invokes list_class_records_by_school with no arguments (scope comes from the session)", async () => {
    const records: ClassRecordDetail[] = [
      {
        id: "cr-1",
        schoolId: "s1",
        sectionId: "sec-1",
        sectionName: "Mabini",
        subjectId: "sub-1",
        subjectName: "Mathematics",
        gradingPeriodId: "gp-1",
        gradingPeriodLabel: "1st Term",
        schoolYear: "2026-2027",
        weightPolicyId: "wp-1",
        weightPolicyName: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(records);

    const result = await new TauriClassRecordRepository().list();

    expect(mockInvoke).toHaveBeenCalledWith("list_class_records_by_school");
    expect(result).toEqual(records);
  });

  it("create invokes create_class_record with sectionId/subjectId/gradingPeriodId/weightPolicyId", async () => {
    const record: ClassRecord = {
      id: "cr-1",
      schoolId: "s1",
      sectionId: "sec-1",
      subjectId: "sub-1",
      gradingPeriodId: "gp-1",
      weightPolicyId: "wp-1",
      createdAt: "now",
    };
    mockInvoke.mockResolvedValueOnce(record);

    const result = await new TauriClassRecordRepository().create("sec-1", "sub-1", "gp-1", "wp-1");

    expect(mockInvoke).toHaveBeenCalledWith("create_class_record", {
      sectionId: "sec-1",
      subjectId: "sub-1",
      gradingPeriodId: "gp-1",
      weightPolicyId: "wp-1",
    });
    expect(result).toEqual(record);
  });

  it("create returns null when a referenced id doesn't resolve within the caller's school", async () => {
    mockInvoke.mockResolvedValueOnce(null);

    const result = await new TauriClassRecordRepository().create("sec-1", "sub-1", "gp-1", "wp-1");

    expect(result).toBeNull();
  });

  it("listGradingWeightPolicies invokes list_grading_weight_policies with no arguments", async () => {
    const policies: GradingWeightPolicy[] = [
      {
        id: "wp-1",
        name: "DepEd K-10 Core Subjects Weighting (DO 015, s. 2026)",
        sourceCitation: "DepEd Order No. 015, s. 2026",
        isDefault: true,
      },
    ];
    mockInvoke.mockResolvedValueOnce(policies);

    const result = await new TauriClassRecordRepository().listGradingWeightPolicies();

    expect(mockInvoke).toHaveBeenCalledWith("list_grading_weight_policies");
    expect(result).toEqual(policies);
  });
});
