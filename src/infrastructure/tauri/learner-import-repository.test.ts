import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../../domain/learner-import";
import { TauriLearnerImportRepository } from "./learner-import-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

describe("TauriLearnerImportRepository", () => {
  it("preview invokes preview_learner_import with csvText", async () => {
    const rows: LearnerImportPreviewRow[] = [
      {
        rowNumber: 1,
        givenName: "Ana",
        familyName: "Santos",
        lrn: null,
        sex: null,
        error: null,
        potentialDuplicate: null,
      },
    ];
    mockInvoke.mockResolvedValueOnce(rows);

    const result = await new TauriLearnerImportRepository().preview("given_name,family_name\n");

    expect(mockInvoke).toHaveBeenCalledWith("preview_learner_import", {
      csvText: "given_name,family_name\n",
    });
    expect(result).toEqual(rows);
  });

  it("commit invokes commit_learner_import with the decisions array", async () => {
    const decisions: LearnerImportDecision[] = [
      {
        rowNumber: 1,
        action: "create",
        existingLearnerId: null,
        importedGivenName: "Ana",
        importedFamilyName: "Santos",
        importedLrn: null,
        importedSex: null,
        finalGivenName: "Ana",
        finalFamilyName: "Santos",
        finalLrn: null,
        finalSex: null,
      },
    ];
    const batchResult: LearnerImportBatchResult = {
      batchId: "b1",
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
    };
    mockInvoke.mockResolvedValueOnce(batchResult);

    const result = await new TauriLearnerImportRepository().commit(decisions);

    expect(mockInvoke).toHaveBeenCalledWith("commit_learner_import", { decisions });
    expect(result).toEqual(batchResult);
  });

  it("log invokes get_learner_import_log with batchId", async () => {
    const entries: LearnerImportLogEntry[] = [
      {
        id: "1",
        batchId: "b1",
        rowNumber: 1,
        decision: "created",
        resultingLearnerId: "l1",
        potentialDuplicateLearnerId: null,
        importedGivenName: "Ana",
        importedFamilyName: "Santos",
        importedLrn: null,
        importedSex: null,
        createdAt: "now",
      },
    ];
    mockInvoke.mockResolvedValueOnce(entries);

    const result = await new TauriLearnerImportRepository().log("b1");

    expect(mockInvoke).toHaveBeenCalledWith("get_learner_import_log", { batchId: "b1" });
    expect(result).toEqual(entries);
  });
});
