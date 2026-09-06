import type { SyncStatus } from "../sync-status";

/**
 * The sync-status screen's port — reads THIS device's own sync status
 * for the caller's own school. Deliberately read-only and single-method:
 * no write path exists here at all. `school_id` is never a parameter —
 * always session-derived server-side, matching every other same-school
 * command in this codebase.
 */
export interface SyncStatusRepository {
  getStatus(): Promise<SyncStatus>;
}
