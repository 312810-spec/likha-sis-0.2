import { ValidationError } from "../domain/errors";
import type { DeviceSyncCredential } from "../domain/device-sync-credential";
import type { DeviceSyncRepository } from "../domain/ports/device-sync-repository";

/** `listDevices` takes no input to validate, matching every other
 * same-school reference-data read in this codebase (see
 * `SchoolMemberApplicationService.listMembers`). `revokeDevice` validates
 * shape only — the backend alone decides whether the caller is actually
 * allowed to revoke this particular device. */
export class DeviceSyncApplicationService {
  constructor(private readonly devices: DeviceSyncRepository) {}

  listDevices(): Promise<DeviceSyncCredential[]> {
    return this.devices.listDevices();
  }

  async revokeDevice(credentialId: string): Promise<boolean> {
    const target = credentialId.trim();
    if (target.length === 0) {
      throw new ValidationError("A device must be selected.");
    }
    return this.devices.revokeDevice(target);
  }

  getHubBaseUrl(): Promise<string | null> {
    return this.devices.getHubBaseUrl();
  }

  /** Trims and treats an empty string exactly like `null` (clears the
   * setting) before ever calling the repository — the actual
   * scheme/host format check is the backend's alone
   * (`commands::device_sync::validate_hub_base_url`), since duplicating
   * URL-parsing logic here would just be a second, possibly-diverging
   * copy of the same rule. */
  setHubBaseUrl(hubBaseUrl: string | null): Promise<void> {
    const trimmed = hubBaseUrl?.trim() ?? "";
    return this.devices.setHubBaseUrl(trimmed.length === 0 ? null : trimmed);
  }
}
