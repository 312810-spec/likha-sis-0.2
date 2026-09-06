import { useEffect, useRef, useState } from "react";
import type { SyncStatusApplicationService } from "../application/sync-status-service";
import type { SyncStatus } from "../domain/sync-status";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface SyncStatusScreenProps {
  syncStatusService: SyncStatusApplicationService;
  /** Navigates to `ConflictReviewScreen` -- this screen links to it
   * rather than duplicating any conflict-resolution UI. */
  onReviewConflicts: () => void;
}

/** Formats an ISO timestamp as a short, teacher-legible "how long ago"
 * phrase for the recent past, falling back to a plain local date/time
 * once it's no longer recent -- a raw ISO storage timestamp is never
 * shown to a teacher, matching `DeviceManagementScreen`/`ConflictReviewScreen`'s
 * established `formatWhen` convention, extended here with a relative
 * phrasing for the common "just synced" case. */
function formatRelative(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;

  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 45) return "Just now";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days} day${days === 1 ? "" : "s"} ago`;

  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Sync status (ADR-0067's "still required before production PII" list
 * named this a still-open item, distinct from the already-shipped
 * device-management and conflict-review screens): a plain-language view
 * of whether THIS device is enrolled for sync, when it last actually
 * received a change from another device, how many of its own changes
 * are still waiting to send, and whether any sync conflicts need a
 * teacher's decision. Deliberately not a technical dashboard -- no raw
 * cursor numbers, error codes, or connection internals are shown here;
 * see `commands::sync_status::get_sync_status`'s own doc comment (Rust)
 * for exactly what backs each figure and what it honestly does NOT
 * claim to measure (this is not a live connectivity health check).
 *
 * Read-only: no action on this screen changes sync state. Resolving a
 * conflict happens on `ConflictReviewScreen`, reached via
 * `onReviewConflicts`; enrolling/removing a device happens on
 * `DeviceManagementScreen`.
 */
export function SyncStatusScreen({ syncStatusService, onReviewConflicts }: SyncStatusScreenProps) {
  const { mode } = useTeacherMode();

  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    syncStatusService
      .getStatus()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setStatus(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load this device's sync status.");
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
  }, [syncStatusService]);

  return (
    <Page
      title="Sync Status"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            This shows whether this device is set up to sync your school&rsquo;s records with your
            other devices, and how up to date it is. It does not change anything -- to remove a
            device, use Devices; to resolve a conflict, use Review Sync Conflicts.
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

      {loading ? (
        <Loading label="Loading sync status…" />
      ) : loadError || !status ? null : !status.enrolled ? (
        <Alert tone="info">
          <p>
            This device is not set up to sync your school&rsquo;s records with other devices. See
            Devices to enroll it.
          </p>
        </Alert>
      ) : (
        <ul className="sync-status-list" aria-label="Sync status">
          <li className="sync-status-card">
            <p className="sync-status-card-name">This device</p>
            <p className="sync-status-card-detail">Set up to sync this school&rsquo;s records</p>
          </li>

          <li className="sync-status-card">
            <p className="sync-status-card-name">Last synced</p>
            <p className="sync-status-card-detail">
              {status.lastPullAt
                ? `Received an update ${formatRelative(status.lastPullAt)}`
                : "This device has not received any updates from another device yet."}
            </p>
          </li>

          <li className="sync-status-card">
            <p className="sync-status-card-name">
              {status.pendingChangeCount === 0
                ? "All changes are synced"
                : `${status.pendingChangeCount} change${status.pendingChangeCount === 1 ? "" : "s"} waiting to sync`}
            </p>
            {status.pendingChangeCount > 0 && status.hasPendingSyncTrouble && (
              <p className="sync-status-card-detail">
                This device is having trouble reaching the sync hub. It will keep trying
                automatically -- no action is needed unless this continues for a long time.
              </p>
            )}
          </li>

          <li className="sync-status-card">
            <p className="sync-status-card-name">
              {status.openConflictCount === 0
                ? "No sync conflicts"
                : `${status.openConflictCount} conflict${status.openConflictCount === 1 ? "" : "s"} need${status.openConflictCount === 1 ? "s" : ""} your review`}
            </p>
            {status.openConflictCount > 0 && (
              <button type="button" onClick={onReviewConflicts}>
                Review conflicts
              </button>
            )}
          </li>
        </ul>
      )}
    </Page>
  );
}
