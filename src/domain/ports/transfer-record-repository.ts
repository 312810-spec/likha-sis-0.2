import type { TransferRecord, TransferRecordInput } from "../transfer-record";

/**
 * Port for the Transfers In/Out Documentation Registry (Batch 9,
 * ADR-0080). `schoolId`/the acting user are never client-trusted for
 * authorization -- the Rust command layer derives the session and
 * checks the `ManageTransferRecords` capability server-side; this port
 * only carries the ids/fields needed to route the call.
 */
export interface TransferRecordRepository {
  record(input: TransferRecordInput): Promise<TransferRecord>;
  listForLearner(learnerId: string): Promise<TransferRecord[]>;
  listForSchool(): Promise<TransferRecord[]>;
  updateStatus(id: string, status: TransferRecord["status"]): Promise<TransferRecord>;
}
