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

/** No dedicated "not configured" placeholder text -- an empty text
 * field with this as its `placeholder` attribute already communicates
 * "using the default" without a second sentence to keep in sync with
 * `sync_client::DEFAULT_HUB_BASE_URL`'s actual value. */
const DEFAULT_HUB_ADDRESS_PLACEHOLDER = "http://127.0.0.1:7878 (default, this device only)";

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
 *
 * Also carries this device's hub-address setting (the fix for the
 * "loopback-only" gap recorded at the end of Batches 16-18): visible to
 * everyone for the same "no UI hiding" reason as the device list above,
 * but only a School Head can actually save a change
 * (`commands::device_sync::set_sync_hub_base_url`'s own
 * `ManageSchoolMembership` gate).
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

  const [hubBaseUrlDraft, setHubBaseUrlDraft] = useState("");
  const [hubBaseUrlLoading, setHubBaseUrlLoading] = useState(true);
  const [hubBaseUrlSaving, setHubBaseUrlSaving] = useState(false);
  const [hubBaseUrlError, setHubBaseUrlError] = useState<string | null>(null);
  const [hubBaseUrlConfirmation, setHubBaseUrlConfirmation] = useState<string | null>(null);

  const requestRef = useRef(0);
  const hubBaseUrlRequestRef = useRef(0);
  const confirmPanelRef = useRef<HTMLDivElement | null>(null);

  // Moves keyboard/screen-reader focus into the inline confirmation panel
  // when it opens -- previously a keyboard/screen-reader user had to keep
  // tabbing forward from "Remove device" to reach "Cancel"/"Yes, remove
  // this device," instead of focus landing there the way a true modal
  // dialog would (see docs/VERIFICATION-DEBT.md's "Device management
  // screen" entry). No shared dialog primitive exists in this codebase
  // yet to reuse, so this focuses the panel's own `role="group"`
  // container directly rather than building one for a single screen.
  useEffect(() => {
    if (pendingRevokeId !== null) {
      confirmPanelRef.current?.focus();
    }
  }, [pendingRevokeId]);

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

  function loadHubBaseUrl() {
    const requestId = ++hubBaseUrlRequestRef.current;
    setHubBaseUrlLoading(true);
    deviceSyncService
      .getHubBaseUrl()
      .then((result) => {
        if (hubBaseUrlRequestRef.current !== requestId) return;
        setHubBaseUrlDraft(result ?? "");
      })
      .catch(() => {
        // Silent: the hub-address panel simply shows an empty (default)
        // field rather than blocking the whole screen's device list on
        // a failure of this one read -- `devices.length === 0`'s
        // EmptyState above is the load-failure path that actually
        // matters for this screen.
      })
      .finally(() => {
        if (hubBaseUrlRequestRef.current !== requestId) return;
        setHubBaseUrlLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadHubBaseUrl();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deviceSyncService]);

  async function saveHubBaseUrl() {
    if (hubBaseUrlSaving) return;
    setHubBaseUrlError(null);
    setHubBaseUrlConfirmation(null);
    setHubBaseUrlSaving(true);
    try {
      await deviceSyncService.setHubBaseUrl(hubBaseUrlDraft);
      setHubBaseUrlConfirmation(
        hubBaseUrlDraft.trim().length === 0
          ? "This device will use the default address again."
          : "This device's hub address was updated.",
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      setHubBaseUrlError(
        message.toLowerCase().includes("unauthorized")
          ? "Only a School Head can change this device's hub address."
          : message ||
              "Could not save this address. Check that it looks like http://192.168.1.10:7878.",
      );
    } finally {
      setHubBaseUrlSaving(false);
    }
  }

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

      <section className="device-hub-address" aria-label="This device's hub address">
        <h2>This device&rsquo;s hub address</h2>
        {mode === "guided" && (
          <p className="field-hint">
            This is the school computer this device sends and receives records from. Leave it blank
            to use the default, which only works when the hub is running on this exact same computer
            -- fill it in with the hub computer&rsquo;s network address (for example
            <code> http://192.168.1.10:7878</code>) if this device needs to reach it over your
            school&rsquo;s network. Only a School Head can change this.
          </p>
        )}
        {hubBaseUrlError && <Alert tone="error">{hubBaseUrlError}</Alert>}
        {hubBaseUrlConfirmation && <Alert tone="success">{hubBaseUrlConfirmation}</Alert>}
        <div className="field">
          <label htmlFor="device-hub-address-input">Hub address</label>
          <input
            id="device-hub-address-input"
            type="text"
            value={hubBaseUrlDraft}
            placeholder={DEFAULT_HUB_ADDRESS_PLACEHOLDER}
            disabled={hubBaseUrlLoading || hubBaseUrlSaving}
            onChange={(event) => setHubBaseUrlDraft(event.target.value)}
          />
          <button type="button" onClick={saveHubBaseUrl} aria-disabled={hubBaseUrlSaving}>
            {hubBaseUrlSaving ? "Saving…" : "Save"}
          </button>
        </div>
      </section>

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
                    tabIndex={-1}
                    ref={confirmPanelRef}
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
