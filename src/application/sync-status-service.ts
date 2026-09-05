import type { SyncStatus } from "../domain/sync-status";
import type { SyncStatusRepository } from "../domain/ports/sync-status-repository";

/** `getStatus` takes no input to validate, matching every other
 * same-school reference-data read in this codebase (see
 * `DeviceSyncApplicationService.listDevices`). */
export class SyncStatusApplicationService {
  constructor(private readonly repository: SyncStatusRepository) {}

  getStatus(): Promise<SyncStatus> {
    return this.repository.getStatus();
  }
}
