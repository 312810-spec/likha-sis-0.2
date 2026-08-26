import { invoke } from "./invoke";
import type { Sf1ImportRepository } from "../../domain/ports/sf1-import-repository";
import type {
  Sf1ImportHistoryEntry,
  Sf1ImportPreview,
  Sf1ImportSummary,
  Sf1RowCommitPlan,
} from "../../domain/sf1-import";

/** Tauri/Rust implementation of {@link Sf1ImportRepository}. */
export class TauriSf1ImportRepository implements Sf1ImportRepository {
  preview(filePath: string): Promise<Sf1ImportPreview> {
    return invoke<Sf1ImportPreview>("preview_sf1_import", { filePath });
  }

  commit(
    sectionId: string,
    startsOn: string,
    plans: Sf1RowCommitPlan[],
    filePath: string,
  ): Promise<Sf1ImportSummary> {
    return invoke<Sf1ImportSummary>("commit_sf1_import", {
      sectionId,
      startsOn,
      plans,
      filePath,
    });
  }

  listImportHistory(limit: number): Promise<Sf1ImportHistoryEntry[]> {
    return invoke<Sf1ImportHistoryEntry[]>("list_sf1_import_history", { limit });
  }
}
