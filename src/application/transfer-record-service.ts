import { ValidationError } from "../domain/errors";
import type {
  TransferRecord,
  TransferRecordInput,
  TransferStatus,
} from "../domain/transfer-record";
import { validateTransferRecord } from "../domain/transfer-record";
import type { TransferRecordRepository } from "../domain/ports/transfer-record-repository";

/**
 * Orchestrates the Transfers In/Out Documentation Registry (Batch 9,
 * ADR-0080). Reuses `validateTransferRecord` (Batch 5) unchanged --
 * per `.claude/rules/architecture.md`'s `*-service.ts` convention, this
 * is where input is validated before ever reaching a repository port.
 * School/authorization scope is never a parameter here -- it comes from
 * the caller's authenticated session on the Rust side, matching
 * `LessonPlanApplicationService`'s own convention.
 */
export class TransferRecordApplicationService {
  constructor(private readonly transferRecords: TransferRecordRepository) {}

  async record(input: TransferRecordInput): Promise<TransferRecord> {
    const validated = validateTransferRecord(input);
    return this.transferRecords.record(validated);
  }

  async listForLearner(learnerId: string): Promise<TransferRecord[]> {
    const trimmedLearnerId = learnerId.trim();
    if (trimmedLearnerId.length === 0) {
      throw new ValidationError("A learner is required.");
    }
    return this.transferRecords.listForLearner(trimmedLearnerId);
  }

  listForSchool(): Promise<TransferRecord[]> {
    return this.transferRecords.listForSchool();
  }

  async updateStatus(id: string, status: TransferStatus): Promise<TransferRecord> {
    const trimmedId = id.trim();
    if (trimmedId.length === 0) {
      throw new ValidationError("A transfer record is required.");
    }
    return this.transferRecords.updateStatus(trimmedId, status);
  }
}
