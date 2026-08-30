import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../domain/learner-import";
import type { LearnerImportRepository } from "../domain/ports/learner-import-repository";
import { LearnerImportApplicationService } from "./learner-import-service";

class FakeLearnerImportRepository implements LearnerImportRepository {
  previewCalls: string[] = [];
  commitCalls: LearnerImportDecision[][] = [];
  logCalls: string[] = [];
  previewResult: LearnerImportPreviewRow[] = [];
  commitResult: LearnerImportBatchResult = {
    batchId: "batch-1",
    createdCount: 0,
    updatedCount: 0,
    skippedCount: 0,
  };
  logResult: LearnerImportLogEntry[] = [];

  async preview(csvText: string): Promise<LearnerImportPreviewRow[]> {
    this.previewCalls.push(csvText);
    return this.previewResult;
  }

  async commit(decisions: LearnerImportDecision[]): Promise<LearnerImportBatchResult> {
    this.commitCalls.push(decisions);
    return this.commitResult;
  }

  async log(batchId: string): Promise<LearnerImportLogEntry[]> {
    this.logCalls.push(batchId);
    return this.logResult;
  }
}

function row(overrides: Partial<LearnerImportPreviewRow> = {}): LearnerImportPreviewRow {
  return {
    rowNumber: 1,
    givenName: "Ana",
    familyName: "Santos",
    lrn: null,
    sex: null,
    error: null,
    potentialDuplicate: null,
    ...overrides,
  };
}

function decision(overrides: Partial<LearnerImportDecision> = {}): LearnerImportDecision {
  return {
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
    ...overrides,
  };
}

describe("LearnerImportApplicationService", () => {
  it("previewImport rejects an empty file without calling the repository", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(service.previewImport("   ")).rejects.toBeInstanceOf(ValidationError);
    expect(repo.previewCalls).toEqual([]);
  });

  it("previewImport delegates to the repository", async () => {
    const repo = new FakeLearnerImportRepository();
    repo.previewResult = [row()];
    const service = new LearnerImportApplicationService(repo);

    const result = await service.previewImport("given_name,family_name\nAna,Santos\n");

    expect(result).toEqual([row()]);
    expect(repo.previewCalls).toEqual(["given_name,family_name\nAna,Santos\n"]);
  });

  it("defaultDecisionFor defaults to create when no duplicate is flagged", () => {
    const service = new LearnerImportApplicationService(new FakeLearnerImportRepository());

    const result = service.defaultDecisionFor(row());

    expect(result.action).toBe("create");
    expect(result.existingLearnerId).toBeNull();
  });

  it("defaultDecisionFor defaults to skip (never update) when a duplicate is flagged", () => {
    const service = new LearnerImportApplicationService(new FakeLearnerImportRepository());
    const duplicate = {
      id: "existing-1",
      schoolId: "s1",
      givenName: "Ana",
      familyName: "Santos",
      lrn: null,
      sex: null as "M" | "F" | null,
      createdAt: "now",
    };

    const result = service.defaultDecisionFor(row({ potentialDuplicate: duplicate }));

    expect(result.action).toBe("skip");
    expect(result.existingLearnerId).toBe("existing-1");
  });

  it("commitImport rejects an empty decision list without calling the repository", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(service.commitImport([])).rejects.toBeInstanceOf(ValidationError);
    expect(repo.commitCalls).toEqual([]);
  });

  it("commitImport rejects a create decision with an empty final name", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(service.commitImport([decision({ finalGivenName: "  " })])).rejects.toBeInstanceOf(
      ValidationError,
    );
    expect(repo.commitCalls).toEqual([]);
  });

  it("commitImport rejects a malformed final LRN", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(
      service.commitImport([decision({ finalLrn: "not-an-lrn" })]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.commitCalls).toEqual([]);
  });

  it("commitImport rejects an update decision with no existingLearnerId", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(
      service.commitImport([decision({ action: "update", existingLearnerId: null })]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.commitCalls).toEqual([]);
  });

  it("commitImport rejects a skip decision with no existingLearnerId", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);

    await expect(
      service.commitImport([decision({ action: "skip", existingLearnerId: null })]),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(repo.commitCalls).toEqual([]);
  });

  it("commitImport skips name/LRN validation for a skip decision", async () => {
    const repo = new FakeLearnerImportRepository();
    const service = new LearnerImportApplicationService(repo);
    const skipDecision = decision({
      action: "skip",
      existingLearnerId: "existing-1",
      finalGivenName: "",
      finalLrn: "not-an-lrn",
    });

    await service.commitImport([skipDecision]);

    expect(repo.commitCalls).toEqual([[skipDecision]]);
  });

  it("commitImport delegates a valid batch to the repository", async () => {
    const repo = new FakeLearnerImportRepository();
    repo.commitResult = {
      batchId: "batch-9",
      createdCount: 1,
      updatedCount: 0,
      skippedCount: 0,
    };
    const service = new LearnerImportApplicationService(repo);

    const result = await service.commitImport([decision()]);

    expect(result).toEqual(repo.commitResult);
    expect(repo.commitCalls).toEqual([[decision()]]);
  });

  it("getImportLog delegates to the repository", async () => {
    const repo = new FakeLearnerImportRepository();
    repo.logResult = [
      {
        id: "1",
        batchId: "batch-1",
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
    const service = new LearnerImportApplicationService(repo);

    const result = await service.getImportLog("batch-1");

    expect(result).toEqual(repo.logResult);
    expect(repo.logCalls).toEqual(["batch-1"]);
  });
});
