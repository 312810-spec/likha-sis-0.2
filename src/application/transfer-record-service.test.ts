import { describe, expect, it } from "vitest";
import { ValidationError } from "../domain/errors";
import type { TransferRecord, TransferRecordInput } from "../domain/transfer-record";
import { TransferRecordValidationError } from "../domain/transfer-record";
import type { TransferRecordRepository } from "../domain/ports/transfer-record-repository";
import { TransferRecordApplicationService } from "./transfer-record-service";

const VALID_INPUT: TransferRecordInput = {
  learnerId: "l1",
  direction: "out",
  transferDate: "2026-06-15",
  otherSchoolName: "Synthetic Receiving School",
  status: "pending",
  remarks: "Synthetic remark",
};

const RECORD: TransferRecord = {
  id: "t1",
  schoolId: "s1",
  learnerId: "l1",
  direction: "out",
  transferDate: "2026-06-15",
  otherSchoolName: "Synthetic Receiving School",
  status: "pending",
  remarks: "Synthetic remark",
  createdByUserId: "u1",
  createdAt: "now",
  updatedAt: "now",
};

class FakeTransferRecordRepository implements TransferRecordRepository {
  recordCalls: TransferRecordInput[] = [];
  listForLearnerCalls: string[] = [];
  listForSchoolCalls = 0;
  updateStatusCalls: Array<{ id: string; status: TransferRecord["status"] }> = [];
  recordResult: TransferRecord = RECORD;
  learnerRecordsToReturn: TransferRecord[] = [];
  schoolRecordsToReturn: TransferRecord[] = [];
  updateStatusResult: TransferRecord = RECORD;

  async record(input: TransferRecordInput): Promise<TransferRecord> {
    this.recordCalls.push(input);
    return this.recordResult;
  }

  async listForLearner(learnerId: string): Promise<TransferRecord[]> {
    this.listForLearnerCalls.push(learnerId);
    return this.learnerRecordsToReturn;
  }

  async listForSchool(): Promise<TransferRecord[]> {
    this.listForSchoolCalls += 1;
    return this.schoolRecordsToReturn;
  }

  async updateStatus(id: string, status: TransferRecord["status"]): Promise<TransferRecord> {
    this.updateStatusCalls.push({ id, status });
    return this.updateStatusResult;
  }
}

describe("TransferRecordApplicationService", () => {
  it("trims and forwards a valid record", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await service.record({
      ...VALID_INPUT,
      learnerId: "  l1  ",
      otherSchoolName: "  Synthetic Receiving School  ",
    });

    expect(repo.recordCalls).toHaveLength(1);
    expect(repo.recordCalls.at(0)?.learnerId).toBe("l1");
    expect(repo.recordCalls.at(0)?.otherSchoolName).toBe("Synthetic Receiving School");
  });

  it("rejects a blank learner id before reaching the repository", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await expect(service.record({ ...VALID_INPUT, learnerId: "  " })).rejects.toThrow(
      TransferRecordValidationError,
    );
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("rejects a blank other-school name before reaching the repository", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await expect(service.record({ ...VALID_INPUT, otherSchoolName: "   " })).rejects.toThrow(
      TransferRecordValidationError,
    );
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("rejects an invalid transfer date before reaching the repository", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await expect(service.record({ ...VALID_INPUT, transferDate: "not-a-date" })).rejects.toThrow(
      TransferRecordValidationError,
    );
    expect(repo.recordCalls).toHaveLength(0);
  });

  it("forwards listForLearner with a trimmed id", async () => {
    const repo = new FakeTransferRecordRepository();
    repo.learnerRecordsToReturn = [RECORD];
    const service = new TransferRecordApplicationService(repo);

    const result = await service.listForLearner("  l1  ");

    expect(repo.listForLearnerCalls).toEqual(["l1"]);
    expect(result).toEqual([RECORD]);
  });

  it("rejects an empty learner id for listForLearner", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await expect(service.listForLearner("   ")).rejects.toThrow(ValidationError);
    expect(repo.listForLearnerCalls).toHaveLength(0);
  });

  it("forwards listForSchool with no arguments", async () => {
    const repo = new FakeTransferRecordRepository();
    repo.schoolRecordsToReturn = [RECORD];
    const service = new TransferRecordApplicationService(repo);

    const result = await service.listForSchool();

    expect(repo.listForSchoolCalls).toBe(1);
    expect(result).toEqual([RECORD]);
  });

  it("forwards updateStatus with a trimmed id", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await service.updateStatus("  t1  ", "completed");

    expect(repo.updateStatusCalls).toEqual([{ id: "t1", status: "completed" }]);
  });

  it("rejects an empty id for updateStatus", async () => {
    const repo = new FakeTransferRecordRepository();
    const service = new TransferRecordApplicationService(repo);

    await expect(service.updateStatus("  ", "completed")).rejects.toThrow(ValidationError);
    expect(repo.updateStatusCalls).toHaveLength(0);
  });
});
