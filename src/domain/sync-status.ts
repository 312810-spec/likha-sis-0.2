/**
 * THIS device's own sync status for its own school, as shown on the
 * sync-status screen — see `commands::sync_status::get_sync_status`
 * (Rust) for the read side. Read-only: no field here corresponds to a
 * write path. `lastPullAt` is deliberately NOT a general connectivity
 * health check — see `SyncStatusSummary::last_pull_at`'s own doc comment
 * (Rust) for why an all-quiet successful poll does not move it.
 */
export interface SyncStatus {
  /** Whether this device has completed sync enrollment for its own
   * school at all. `false` means every other field is "nothing to
   * report yet." */
  enrolled: boolean;
  /** ISO timestamp of the last time this device actually applied or
   * staged a pulled change, or `null` if it never has. */
  lastPullAt: string | null;
  /** This device's own changes still queued to push to the sync hub. */
  pendingChangeCount: number;
  /** Whether at least one still-pending outgoing change has recorded a
   * failed push attempt — the best-available "having trouble reaching
   * the sync hub" signal this device actually tracks. */
  hasPendingSyncTrouble: boolean;
  /** Open (unresolved) sync conflicts for this school — resolve these
   * on `ConflictReviewScreen`, not here. */
  openConflictCount: number;
}
