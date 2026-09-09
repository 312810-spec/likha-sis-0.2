import type { DeviceSyncCredential } from "../device-sync-credential";

/**
 * The device-management screen's port — lists the caller's own school's
 * currently-enrolled sync devices and revokes one. Deliberately narrow:
 * no enrollment here (that flow has no UI yet, see
 * `commands::device_sync::enroll_device_sync_credential`'s own doc
 * comment) and no past-revocations audit (a later increment). `school_id`
 * is never a parameter on either method — always session-derived
 * server-side, matching every other same-school command in this
 * codebase.
 */
export interface DeviceSyncRepository {
  listDevices(): Promise<DeviceSyncCredential[]>;
  /**
   * Revokes one device's sync credential, immediately and irreversibly
   * cutting it off from sync. Returns `false` (not a thrown error) when
   * the credential is already gone/revoked or belongs to a different
   * school; a thrown `Unauthorized` means the caller itself lacks
   * permission to revoke this particular device — see
   * `auth::revoke_device_sync_credential`'s doc comment for the exact
   * "own device OR School Head in the same school" rule. The UI must
   * not conflate the two outcomes, matching `SchoolMemberRepository.resetPassword`'s
   * established convention.
   */
  revokeDevice(credentialId: string): Promise<boolean>;

  /**
   * This device's configured hub address for the caller's own school, if
   * any has ever been set — `null` means it is using the default
   * loopback address (`sync_client::DEFAULT_HUB_BASE_URL`, only reachable
   * when the hub happens to run on this exact same machine). Any
   * authenticated school member may read it.
   */
  getHubBaseUrl(): Promise<string | null>;

  /**
   * Sets (`hubBaseUrl` non-null) or clears (`null`) this device's hub
   * address. School-Head-only server-side
   * (`Capability::ManageSchoolMembership`) — this controls where this
   * device sends its own sync credential secret on every push/pull
   * round, see `commands::device_sync::set_sync_hub_base_url`'s own doc
   * comment for why that makes it a security-relevant setting, not a
   * routine preference. A malformed address is rejected server-side
   * (thrown, never silently stored) before it is ever saved.
   */
  setHubBaseUrl(hubBaseUrl: string | null): Promise<void>;
}
