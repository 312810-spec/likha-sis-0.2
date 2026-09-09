import type { DeviceSyncCredential } from "../../domain/device-sync-credential";
import type { DeviceSyncRepository } from "../../domain/ports/device-sync-repository";
import { invoke } from "./invoke";

/** Tauri adapter for `list_device_sync_credentials`,
 * `revoke_device_sync_credential`, `get_sync_hub_base_url`, and
 * `set_sync_hub_base_url` (`src-tauri/src/commands/device_sync.rs`). */
export class TauriDeviceSyncRepository implements DeviceSyncRepository {
  listDevices(): Promise<DeviceSyncCredential[]> {
    return invoke<DeviceSyncCredential[]>("list_device_sync_credentials");
  }

  revokeDevice(credentialId: string): Promise<boolean> {
    return invoke<boolean>("revoke_device_sync_credential", { credentialId });
  }

  getHubBaseUrl(): Promise<string | null> {
    return invoke<string | null>("get_sync_hub_base_url");
  }

  setHubBaseUrl(hubBaseUrl: string | null): Promise<void> {
    return invoke<void>("set_sync_hub_base_url", { hubBaseUrl });
  }
}
