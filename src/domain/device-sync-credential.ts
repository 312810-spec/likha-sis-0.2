/**
 * One currently-enrolled device sync credential, as shown on the
 * device-management screen — see `commands::device_sync::list_device_sync_credentials`
 * (Rust) for the read side and `commands::device_sync::revoke_device_sync_credential`
 * for the write side. Never carries secret material — the credential's
 * bearer secret is returned exactly once, at enrollment, and is not part
 * of this read model.
 */
export interface DeviceSyncCredential {
  credentialId: string;
  deviceLabel: string | null;
  /** The account this device is enrolled under. */
  ownerDisplayName: string;
  ownerUsername: string;
  /** ISO timestamp — when this device was enrolled. */
  createdAt: string;
  /** ISO timestamp of the device's last successful sync, or `null` if it
   * has never synced since enrolling. */
  lastUsedAt: string | null;
}
