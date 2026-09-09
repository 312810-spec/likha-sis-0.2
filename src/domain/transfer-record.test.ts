import { describe, expect, it } from "vitest";
import {
  TransferRecordValidationError,
  validateTransferRecord,
  type TransferRecordInput,
} from "./transfer-record";

function record(overrides: Partial<TransferRecordInput> = {}): TransferRecordInput {
  return {
    learnerId: "learner-1",
    direction: "out",
    transferDate: "2026-06-01",
    otherSchoolName: "Sample Receiving Elementary School",
    status: "pending",
    ...overrides,
  };
}

describe("validateTransferRecord", () => {
  it("accepts a well-formed record and trims strings", () => {
    const result = validateTransferRecord(record({ otherSchoolName: "  Sample School  " }));
    expect(result.otherSchoolName).toBe("Sample School");
  });

  it("rejects an empty learner id", () => {
    expect(() => validateTransferRecord(record({ learnerId: "  " }))).toThrow(
      TransferRecordValidationError,
    );
  });

  it("rejects an empty other-school name", () => {
    expect(() => validateTransferRecord(record({ otherSchoolName: "" }))).toThrow(
      TransferRecordValidationError,
    );
  });

  it("rejects a malformed transfer date", () => {
    expect(() => validateTransferRecord(record({ transferDate: "06/01/2026" }))).toThrow(
      TransferRecordValidationError,
    );
  });

  it("rejects remarks over the length limit", () => {
    expect(() => validateTransferRecord(record({ remarks: "x".repeat(1001) }))).toThrow(
      TransferRecordValidationError,
    );
  });

  it("normalizes blank remarks to undefined", () => {
    const result = validateTransferRecord(record({ remarks: "   " }));
    expect(result.remarks).toBeUndefined();
  });
});
