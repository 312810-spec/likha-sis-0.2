import { invoke } from "@tauri-apps/api/core";
import { describe, expect, it, vi } from "vitest";
import type { TransferRecord } from "../../domain/transfer-record";
import { TauriTransferRecordRepository } from "./transfer-record-repository";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

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

describe("TauriTransferRecordRepository", () => {
  it("record invokes record_transfer with every field, defaulting absent remarks to null", async () => {
    mockInvoke.mockResolvedValueOnce(RECORD);

    const returned = await new TauriTransferRecordRepository().record({
      learnerId: "l1",
      direction: "out",
      transferDate: "2026-06-15",
      otherSchoolName: "Synthetic Receiving School",
      status: "pending",
    });

    expect(mockInvoke).toHaveBeenCalledWith("record_transfer", {
      learnerId: "l1",
      direction: "out",
      transferDate: "2026-06-15",
      otherSchoolName: "Synthetic Receiving School",
      status: "pending",
      remarks: null,
    });
    expect(returned).toEqual(RECORD);
  });

  it("listForLearner invokes list_transfers_for_learner with the learner id", async () => {
    mockInvoke.mockResolvedValueOnce([RECORD]);

    const returned = await new TauriTransferRecordRepository().listForLearner("l1");

    expect(mockInvoke).toHaveBeenCalledWith("list_transfers_for_learner", { learnerId: "l1" });
    expect(returned).toEqual([RECORD]);
  });

  it("listForSchool invokes list_transfers_for_school with no arguments", async () => {
    mockInvoke.mockResolvedValueOnce([RECORD]);

    const returned = await new TauriTransferRecordRepository().listForSchool();

    expect(mockInvoke).toHaveBeenCalledWith("list_transfers_for_school", {});
    expect(returned).toEqual([RECORD]);
  });

  it("updateStatus invokes update_transfer_status with the id and status", async () => {
    mockInvoke.mockResolvedValueOnce({ ...RECORD, status: "completed" });

    const returned = await new TauriTransferRecordRepository().updateStatus("t1", "completed");

    expect(mockInvoke).toHaveBeenCalledWith("update_transfer_status", {
      id: "t1",
      status: "completed",
    });
    expect(returned.status).toBe("completed");
  });
});
