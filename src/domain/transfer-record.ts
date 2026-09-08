/**
 * Transfers In/Out Documentation Registry — validation logic only.
 *
 * SCOPE NOTE (Batch 5): this batch ships the pure validation rules a
 * transfer-record form needs, but deliberately DOES NOT add the Rust
 * migration/repository/command layer or a UI screen this slice —
 * building a new tenant-scoped persisted entity correctly (migration,
 * repository, narrow commands, TS port, application service, tests on
 * both sides, `authorize_*` wiring) is a full vertical slice of work in
 * its own right, and this batch prioritized getting the two
 * policy-sensitive items (award eligibility, weather, ID-card
 * verification) right over rushing a seventh. See
 * `docs/CURRENT-HANDOFF.md`'s Batch 5 entry for the explicit deferral
 * and the recorded next slice.
 */

/** @public — only consumed structurally, via `TransferRecordInput.direction`. */
export type TransferDirection = "in" | "out";
/** @public — only consumed structurally, via `TransferRecordInput.status`. */
export type TransferStatus = "pending" | "completed" | "cancelled";

export interface TransferRecordInput {
  learnerId: string;
  direction: TransferDirection;
  transferDate: string; // ISO yyyy-mm-dd
  otherSchoolName: string;
  status: TransferStatus;
  remarks?: string;
}

export class TransferRecordValidationError extends Error {}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Throws `TransferRecordValidationError` on the first violation found;
 * returns the trimmed, normalized record on success. Mirrors the
 * trim/non-empty/max-length validation convention every
 * `*-service.ts` in this codebase already applies before calling a
 * repository port. */
export function validateTransferRecord(input: TransferRecordInput): TransferRecordInput {
  const learnerId = input.learnerId.trim();
  if (learnerId.length === 0) {
    throw new TransferRecordValidationError("A learner is required.");
  }

  const otherSchoolName = input.otherSchoolName.trim();
  if (otherSchoolName.length === 0) {
    throw new TransferRecordValidationError(
      input.direction === "in"
        ? "The originating school name is required."
        : "The receiving school name is required.",
    );
  }
  if (otherSchoolName.length > 200) {
    throw new TransferRecordValidationError("The school name is too long.");
  }

  if (!ISO_DATE_PATTERN.test(input.transferDate)) {
    throw new TransferRecordValidationError("Transfer date must be a valid yyyy-mm-dd date.");
  }

  const remarks = input.remarks?.trim();
  if (remarks !== undefined && remarks.length > 1000) {
    throw new TransferRecordValidationError("Remarks are too long.");
  }

  return {
    learnerId,
    direction: input.direction,
    transferDate: input.transferDate,
    otherSchoolName,
    status: input.status,
    remarks: remarks === "" ? undefined : remarks,
  };
}

/**
 * A persisted transfer record (Batch 9, ADR-0080). Mirrors Rust's
 * `repository::transfer_record::TransferRecord` exactly. Kept in this
 * same file, alongside the validation this batch reuses unchanged, so
 * the two never drift apart -- see this file's own top-of-file scope
 * note for why the validation-only slice and this persisted-record slice
 * were originally split across batches.
 */
export interface TransferRecord {
  id: string;
  schoolId: string;
  learnerId: string;
  direction: TransferDirection;
  transferDate: string;
  otherSchoolName: string;
  status: TransferStatus;
  remarks: string | null;
  createdByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}
