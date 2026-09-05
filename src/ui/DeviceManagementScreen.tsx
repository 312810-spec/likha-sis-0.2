import { useEffect, useRef, useState } from "react";
import type { DeviceSyncApplicationService } from "../application/device-sync-service";
import type { DeviceSyncCredential } from "../domain/device-sync-credential";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface DeviceManagementScreenProps {
  deviceSyncService: DeviceSyncApplicationService;
}

/** A single generic message for every way a revoke can fail to actually
 * happen -- a denied capability check (thrown `Unauthorized`) and a
 * target already gone/revoked (returned as `false`) are deliberately
 * indistinguishable here, matching `AdminPasswordResetScreen`'s own
 * enumeration-safety choice for the analogous backend contract. */
const GENERIC_FAILURE_MESSAGE =
  "Could not remove this device. It may already be off sync, or you may not have permission to remove it.";

/** Formats an ISO timestamp as a readable local date and time, matching
 * `AuditLogScreen`'s established "never show a raw ISO storage
 * timestamp to a teacher" fix. */
function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function deviceName(device: DeviceSyncCredential): string {
  return device.deviceLabel && device.deviceLabel.trim().length > 0
    ? device.deviceLabel
    : "Unnamed device";
}

/**
 * Device sync management (Wave, ADR-0067/0069's device credential surface,
 * finally given a screen): lets a School Head see every device currently
 * allowed to sync this school's records, and remove one that is lost,
 * retired, or no longer trusted. Any authenticated school member sees the
 * same list (matching `AdminPasswordResetScreen`'s established
 * convention of not hiding a screen behind client-side role checks); the
 * backend alone enforces that a removal only succeeds for the device's
 * own owner or a School Head in the same school (`ManageSchoolMembership`)
 * -- security must not rely on UI hiding.
 *
 * Removal is a two-step, plain-language confirmation, not a single
 * click or a browser `confirm()` dialog: the consequence (this device
 * stops syncing immediately, and cannot be undone) is stated in the
 * confirmation panel itself, matching this app's "no unexplained
 * destructive action" convention. No enrollment/pairing flow here --
 * that is a separate, larger UX question (see `docs/CURRENT-HANDOFF.md`).
 */
export function DeviceManagementScreen({ deviceSyncService }: DeviceManagementScreenProps) {
  const { mode } = useTeacherMode();

  const [devices, setDevices] = useState<DeviceSyncCredential[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [pendingRevokeId, setPendingRevokeId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    deviceSyncService
      .listDevices()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setDevices(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load the list of devices.");
      })
      .finally(() => {
        if (requestRef.current !== requestId) return;
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSyncService]);

  function startRevoke(credentialId: string) {
    setError(null);
    setConfirmation(null);
    setPendingRevokeId(credentialId);
  }

  function cancelRevoke() {
    setPendingRevokeId(null);
  }

  async function confirmRevoke(device: DeviceSyncCredential) {
    if (revoking) return;
    setError(null);
    setConfirmation(null);
    setRevoking(true);
    try {
      const succeeded = await deviceSyncService.revokeDevice(device.credentialId);
      if (succeeded) {
        setConfirmation(`${deviceName(device)} was removed and can no longer sync.`);
        setDevices((current) => current.filter((d) => d.credentialId !== device.credentialId));
      } else {
        setError(GENERIC_FAILURE_MESSAGE);
      }
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setRevoking(false);
      setPendingRevokeId(null);
    }
  }

  return (
    <Page
      title="Devices"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            This shows every device currently allowed to sync your school&rsquo;s records -- usually
            a school computer or an approved laptop. If a device is lost, stolen, or no longer used,
            remove it here so it can no longer send or receive data for your school.
          </p>
        ) : undefined
      }
    >
      {loadError && (
        <Alert tone="error">
          <p>{loadError}</p>
          <button type="button" onClick={load}>
            Retry
          </button>
        </Alert>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {loading ? (
        <Loading label="Loading devices…" />
      ) : loadError ? null : devices.length === 0 ? (
        <EmptyState>No devices are currently enrolled for sync.</EmptyState>
      ) : (
        <ul className="device-list" aria-label="Enrolled devices">
          {devices.map((device) => {
            const isPending = pendingRevokeId === device.credentialId;
            return (
              <li key={device.credentialId} className="device-card">
                <div className="device-card-main">
                  <p className="device-card-name">{deviceName(device)}</p>
                  <p className="device-card-detail">
                    Enrolled to {device.ownerDisplayName} ({device.ownerUsername})
                  </p>
                  <p className="device-card-detail">
                    Added {formatWhen(device.createdAt)}
                    {device.lastUsedAt
                      ? ` · Last synced ${formatWhen(device.lastUsedAt)}`
                      : " · Has not synced yet"}
                  </p>
                </div>

                {isPending ? (
                  <div
                    className="device-card-confirm"
                    role="group"
                    aria-label={`Remove ${deviceName(device)}?`}
                  >
                    <p className="device-card-confirm-text">
                      Remove <strong>{deviceName(device)}</strong>? This device will stop syncing
                      right away, and this cannot be undone. If it is still in use, it can enroll
                      again later.
                    </p>
                    <div className="device-card-confirm-actions">
                      <button type="button" onClick={cancelRevoke} aria-disabled={revoking}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => confirmRevoke(device)}
                        aria-disabled={revoking}
                      >
                        {revoking ? "Removing…" : "Yes, remove this device"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="button-danger-secondary"
                    onClick={() => startRevoke(device.credentialId)}
                  >
                    Remove device
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </Page>
  );
}
