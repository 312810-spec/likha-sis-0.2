import { invoke } from "./invoke";
import type {
  LearnerImportBatchResult,
  LearnerImportDecision,
  LearnerImportLogEntry,
  LearnerImportPreviewRow,
} from "../../domain/learner-import";
import type { LearnerImportRepository } from "../../domain/ports/learner-import-repository";

/** Tauri/SQLite implementation of {@link LearnerImportRepository}. */
export class TauriLearnerImportRepository implements LearnerImportRepository {
  preview(csvText: string): Promise<LearnerImportPreviewRow[]> {
    return invoke<LearnerImportPreviewRow[]>("preview_learner_import", { csvText });
  }

  commit(decisions: LearnerImportDecision[]): Promise<LearnerImportBatchResult> {
    return invoke<LearnerImportBatchResult>("commit_learner_import", { decisions });
  }

  log(batchId: string): Promise<LearnerImportLogEntry[]> {
    return invoke<LearnerImportLogEntry[]>("get_learner_import_log", { batchId });
  }
}
