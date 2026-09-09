import type { TransferRecord, TransferRecordInput } from "../../domain/transfer-record";
import type { TransferRecordRepository } from "../../domain/ports/transfer-record-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `record_transfer`/`list_transfers_for_learner`/
 * `list_transfers_for_school`/`update_transfer_status`
 * (`src-tauri/src/commands/transfer_record.rs`). */
export class TauriTransferRecordRepository implements TransferRecordRepository {
  record(input: TransferRecordInput): Promise<TransferRecord> {
    return invoke<TransferRecord>("record_transfer", {
      learnerId: input.learnerId,
      direction: input.direction,
      transferDate: input.transferDate,
      otherSchoolName: input.otherSchoolName,
      status: input.status,
      remarks: input.remarks ?? null,
    });
  }

  listForLearner(learnerId: string): Promise<TransferRecord[]> {
    return invoke<TransferRecord[]>("list_transfers_for_learner", { learnerId });
  }

  listForSchool(): Promise<TransferRecord[]> {
    return invoke<TransferRecord[]>("list_transfers_for_school", {});
  }

  updateStatus(id: string, status: TransferRecord["status"]): Promise<TransferRecord> {
    return invoke<TransferRecord>("update_transfer_status", { id, status });
  }
}
