import { useEffect, useState, type FormEvent } from "react";
import type { DocumentRepositoryApplicationService } from "../application/document-repository-service";
import { ValidationError } from "../domain/errors";
import type {
  DocumentRepositoryConnectionStatus,
  QueuedUpload,
} from "../domain/document-repository";
import { Alert } from "./components/Alert";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";

interface DocumentRepositoryScreenProps {
  documentRepositoryService: DocumentRepositoryApplicationService;
  /** Same display-only role list every other role-adaptive screen in this
   * codebase already receives (`HomeScreen`, `GradeReviewScreen`) — see
   * `src/domain/session.ts`. Never the sole authorization boundary: every
   * write this screen triggers is independently re-checked
   * server-side (`ManageDocumentRepositoryConnection`, School-Head-only). */
  roles: string[];
}

const KIND_LABELS: Record<string, string> = {
  "sf1-export": "SF1 export",
  "sf9-export": "SF9 export",
  "sf10-export": "SF10 export",
  "disaster-recovery-backup": "Disaster recovery backup",
};

const STATUS_LABELS: Record<string, string> = {
  queued: "Waiting to send",
  uploading: "Sending…",
  uploaded: "Sent",
  failed: "Could not send yet",
};

/**
 * Official School Repository settings (ADR-0088, Batch 18 checkpoints
 * 3-4): lets a School Head connect this school's Microsoft 365 tenant and
 * shows the opportunistic upload queue for already-generated exports/
 * backups. Genuinely invisible/inert until a School Head configures it —
 * matching the Weather & Hazard Alerts precedent's "absent, not broken"
 * pattern (ADR-0079): an unconfigured install, viewed by anyone who isn't
 * a School Head, renders a single quiet sentence and nothing else — no
 * error state, no dead buttons.
 */
export function DocumentRepositoryScreen({
  documentRepositoryService,
  roles,
}: DocumentRepositoryScreenProps) {
  const isSchoolHead = roles.includes("school_head");

  const [status, setStatus] = useState<DocumentRepositoryConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [tenantIdDraft, setTenantIdDraft] = useState("");
  const [clientIdDraft, setClientIdDraft] = useState("");

  const [queue, setQueue] = useState<QueuedUpload[]>([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    setLoadError(null);
    documentRepositoryService
      .getConnectionStatus()
      .then((result) => {
        setStatus(result);
        setTenantIdDraft(result.tenantId ?? "");
        setClientIdDraft(result.clientId ?? "");
      })
      .catch(() => {
        setLoadError("Could not load the Microsoft 365 connection status. Try again.");
      })
      .finally(() => {
        setLoading(false);
      });
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function loadQueue() {
    setQueueLoading(true);
    setQueueError(null);
    documentRepositoryService
      .listQueuedUploads()
      .then(setQueue)
      .catch(() => {
        setQueueError("Could not load the upload queue. Try again.");
      })
      .finally(() => {
        setQueueLoading(false);
      });
  }

  useEffect(() => {
    if (status?.configured) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      loadQueue();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status?.configured]);

  async function handleSaveConfiguration(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setConfirmation(null);
    setSaving(true);
    try {
      await documentRepositoryService.configure({
        tenantId: tenantIdDraft,
        clientId: clientIdDraft,
      });
      setConfirmation("Microsoft 365 tenant saved. Connect below to finish setup.");
      load();
    } catch (e) {
      setError(
        e instanceof ValidationError
          ? e.message
          : "Could not save this tenant. You may not have permission to change it.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleConnect() {
    setError(null);
    setConfirmation(null);
    setSaving(true);
    try {
      await documentRepositoryService.connect();
      setConfirmation("Connected to Microsoft 365.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not connect to Microsoft 365. Try again.");
      load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDisconnect() {
    setError(null);
    setConfirmation(null);
    setSaving(true);
    try {
      await documentRepositoryService.disconnect();
      setConfirmation("Disconnected from Microsoft 365.");
      load();
    } catch {
      setError("Could not disconnect. You may not have permission to change it.");
    } finally {
      setSaving(false);
    }
  }

  async function handleTrySendingNow() {
    setQueueError(null);
    setQueueLoading(true);
    try {
      const updated = await documentRepositoryService.drainQueue();
      setQueue(updated);
    } catch {
      setQueueError("Could not reach the upload queue right now. It will try again later.");
    } finally {
      setQueueLoading(false);
    }
  }

  if (loading) {
    return (
      <Page title="Official School Repository">
        <Loading label="Loading connection status…" />
      </Page>
    );
  }

  if (loadError) {
    return (
      <Page title="Official School Repository">
        <Alert tone="error">{loadError}</Alert>
      </Page>
    );
  }

  const configured = status?.configured ?? false;

  // Invisible/inert: an unconfigured install, viewed by anyone who isn't
  // a School Head, gets one quiet sentence and nothing actionable.
  if (!configured && !isSchoolHead) {
    return (
      <Page title="Official School Repository">
        <p className="field-hint">
          Not set up for this school yet. Ask your School Head to connect Microsoft 365 from this
          screen.
        </p>
      </Page>
    );
  }

  return (
    <Page
      title="Official School Repository"
      hint={
        <p className="field-hint">
          Connects this school's Microsoft 365 (SharePoint/OneDrive) tenant so approved school
          documents can be shared centrally. Only a School Head can connect or disconnect.
        </p>
      }
    >
      {error && <Alert tone="error">{error}</Alert>}
      {confirmation && <Alert tone="success">{confirmation}</Alert>}

      {!configured ? (
        isSchoolHead ? (
          <form className="form-row" onSubmit={handleSaveConfiguration}>
            <div className="field">
              <label htmlFor="ms365-tenant-id">Microsoft 365 tenant ID</label>
              <input
                id="ms365-tenant-id"
                type="text"
                value={tenantIdDraft}
                onChange={(event) => setTenantIdDraft(event.target.value)}
                disabled={saving}
                required
              />
            </div>
            <div className="field">
              <label htmlFor="ms365-client-id">Azure AD app (client) ID</label>
              <input
                id="ms365-client-id"
                type="text"
                value={clientIdDraft}
                onChange={(event) => setClientIdDraft(event.target.value)}
                disabled={saving}
                required
              />
            </div>
            <button type="submit" aria-disabled={saving}>
              {saving ? "Saving…" : "Save tenant"}
            </button>
          </form>
        ) : null
      ) : (
        <>
          <section aria-label="Connection status" className="document-repository-status">
            <p>
              <strong>Tenant:</strong> {status?.tenantId}
            </p>
            <p>
              <strong>Status:</strong> {status?.connected ? "Connected" : "Not connected"}
            </p>
            {status?.lastVerifiedAt && (
              <p>
                <strong>Last verified:</strong> {status.lastVerifiedAt}
              </p>
            )}
            {status?.lastError && <Alert tone="error">{status.lastError}</Alert>}
          </section>

          {isSchoolHead && (
            <div className="document-repository-actions">
              {!status?.connected ? (
                <button type="button" onClick={handleConnect} disabled={saving}>
                  {saving ? "Connecting…" : "Connect to Microsoft 365"}
                </button>
              ) : (
                <button type="button" onClick={handleDisconnect} disabled={saving}>
                  {saving ? "Disconnecting…" : "Disconnect"}
                </button>
              )}
            </div>
          )}

          <section aria-label="Upload queue" className="document-repository-queue">
            <h3>Upload queue</h3>
            {queueError && <Alert tone="error">{queueError}</Alert>}
            {queueLoading ? (
              <Loading label="Loading upload queue…" />
            ) : queue.length === 0 ? (
              <p className="field-hint">Nothing queued for upload right now.</p>
            ) : (
              <ul className="document-repository-queue-list">
                {queue.map((item) => (
                  <li key={item.id}>
                    <span>{KIND_LABELS[item.kind] ?? item.kind}</span> — {item.fileName} —{" "}
                    <span>{STATUS_LABELS[item.status] ?? item.status}</span>
                  </li>
                ))}
              </ul>
            )}
            <button type="button" onClick={handleTrySendingNow} disabled={queueLoading}>
              Try sending now
            </button>
          </section>
        </>
      )}
    </Page>
  );
}
