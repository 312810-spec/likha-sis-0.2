import type { SyncStatus } from "../../domain/sync-status";
import type { SyncStatusRepository } from "../../domain/ports/sync-status-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `get_sync_status` (`src-tauri/src/commands/sync_status.rs`). */
export class TauriSyncStatusRepository implements SyncStatusRepository {
  getStatus(): Promise<SyncStatus> {
    return invoke<SyncStatus>("get_sync_status");
  }
}
