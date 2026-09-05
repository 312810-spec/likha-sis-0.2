import { useEffect, useRef, useState } from "react";
import type { ConflictReviewApplicationService } from "../application/conflict-review-service";
import type { ConflictEntityPreview, ConflictReviewSummary } from "../domain/conflict-review";
import { Alert } from "./components/Alert";
import { EmptyState } from "./components/EmptyState";
import { Loading } from "./components/Loading";
import { Page } from "./components/Page";
import { useTeacherMode } from "./theme/useTeacherMode";

interface ConflictReviewScreenProps {
  conflictReviewService: ConflictReviewApplicationService;
}

const GENERIC_FAILURE_MESSAGE =
  "Could not resolve this conflict. It may already have been resolved, or you may not have permission to resolve it.";

const ENTITY_KIND_LABELS: Record<string, string> = {
  learner: "Learner",
  attendance: "Attendance record",
  section: "Section",
};

function entityKindLabel(entityKind: string): string {
  return ENTITY_KIND_LABELS[entityKind] ?? entityKind;
}

/** Formats an ISO timestamp as a readable local date and time, matching
 * `DeviceManagementScreen`'s established "never show a raw ISO storage
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

/** A short, plain-language summary of one version of a record, for the
 * side-by-side comparison a teacher must choose between. Every field
 * shown is a real value from that version — never a generic "changed"
 * placeholder, since this decision needs concrete facts to be informed. */
function describePreview(preview: ConflictEntityPreview): string[] {
  switch (preview.kind) {
    case "learner":
      return [
        `Name: ${preview.givenName} ${preview.familyName}`,
        `LRN: ${preview.lrn ?? "Not recorded"}`,
      ];
    case "attendance":
      return [`Date: ${preview.attendanceDate}`, `Status: ${preview.status}`];
    case "section":
      return [
        `Name: ${preview.name}`,
        `Grade level: ${preview.gradeLevel}`,
        `School year: ${preview.schoolYear}`,
      ];
  }
}

/**
 * Conflict review (ADR-0067's "explicit review queue" for a divergent
 * version, finally given a screen): a pulled change is staged here
 * instead of silently overwriting this device's own unsynced edit
 * whenever the two disagree. This is the first screen making a real,
 * teacher-facing decision about which version of a record survives, so
 * both versions are shown with their actual field values, not an
 * abstract "conflict exists" toggle.
 *
 * **Who can resolve a conflict**: any authenticated member of the
 * conflict's own school — see `commands::conflict_review`'s own doc
 * comment (Rust) for why this is not restricted to a School Head, unlike
 * device removal. A teacher resolving a conflict on their own class's
 * attendance or a learner they work with every day needs no admin
 * involvement; the backend still enforces school isolation regardless of
 * what this screen shows.
 *
 * Each conflict is reviewed and resolved individually — no bulk or
 * automatic resolution exists here on purpose.
 */
export function ConflictReviewScreen({ conflictReviewService }: ConflictReviewScreenProps) {
  const { mode } = useTeacherMode();

  const [conflicts, setConflicts] = useState<ConflictReviewSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);

  const [pendingChoiceId, setPendingChoiceId] = useState<string | null>(null);
  const [resolving, setResolving] = useState(false);

  const requestRef = useRef(0);

  function load() {
    const requestId = ++requestRef.current;
    setLoading(true);
    setLoadError(null);
    conflictReviewService
      .listConflicts()
      .then((result) => {
        if (requestRef.current !== requestId) return;
        setConflicts(result);
      })
      .catch(() => {
        if (requestRef.current !== requestId) return;
        setLoadError("Could not load the list of sync conflicts.");
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
  }, [conflictReviewService]);

  function startResolve(conflictId: string) {
    setError(null);
    setConfirmation(null);
    setPendingChoiceId(conflictId);
  }

  function cancelResolve() {
    setPendingChoiceId(null);
  }

  async function resolve(conflict: ConflictReviewSummary, keepLocal: boolean) {
    if (resolving) return;
    // "Use the incoming version" is only ever meaningful once a preview of
    // it has actually been shown -- if decrypting it failed at list time,
    // clicking through anyway would apply a version the teacher never got
    // to see. `aria-disabled` (used instead of the native `disabled`
    // attribute, matching this app's established pending-state
    // convention) does not itself block a click, so this guard is what
    // actually enforces it.
    if (!keepLocal && !conflict.incoming) return;
    setError(null);
    setConfirmation(null);
    setResolving(true);
    try {
      const succeeded = await conflictReviewService.resolveConflict(
        conflict.id,
        keepLocal ? "keep_local" : "use_incoming",
      );
      if (succeeded) {
        setConfirmation(
          keepLocal
            ? `Kept this device's own version of the ${entityKindLabel(conflict.entityKind).toLowerCase()}.`
            : `Used the incoming version of the ${entityKindLabel(conflict.entityKind).toLowerCase()}.`,
        );
        setConflicts((current) => current.filter((c) => c.id !== conflict.id));
      } else {
        setError(GENERIC_FAILURE_MESSAGE);
      }
    } catch {
      setError(GENERIC_FAILURE_MESSAGE);
    } finally {
      setResolving(false);
      setPendingChoiceId(null);
    }
  }

  return (
    <Page
      title="Review Sync Conflicts"
      hint={
        mode === "guided" ? (
          <p className="field-hint">
            A conflict happens when this device changed a record while another device changed the
            same record too, before the two could sync with each other. Nothing is applied
            automatically — for each one below, choose whether to keep this device&rsquo;s own
            version or use the version from the other device.
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
        <Loading label="Loading sync conflicts…" />
      ) : loadError ? null : conflicts.length === 0 ? (
        <EmptyState>There are no sync conflicts to review right now.</EmptyState>
      ) : (
        <ul className="conflict-review-list" aria-label="Sync conflicts">
          {conflicts.map((conflict) => {
            const isPending = pendingChoiceId === conflict.id;
            return (
              <li key={conflict.id} className="conflict-review-card">
                <div className="conflict-review-card-main">
                  <p className="conflict-review-card-name">
                    {entityKindLabel(conflict.entityKind)} conflict
                  </p>
                  <p className="conflict-review-card-detail">
                    Detected {formatWhen(conflict.createdAt)} · from another device
                  </p>

                  <div className="conflict-review-versions">
                    <div className="conflict-review-version">
                      <h3>This device&rsquo;s version</h3>
                      {conflict.local ? (
                        <ul>
                          {describePreview(conflict.local).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>This device no longer has its own copy of this record.</p>
                      )}
                    </div>
                    <div className="conflict-review-version">
                      <h3>Incoming version</h3>
                      {conflict.incoming ? (
                        <ul>
                          {describePreview(conflict.incoming).map((line) => (
                            <li key={line}>{line}</li>
                          ))}
                        </ul>
                      ) : (
                        <p>
                          {conflict.incomingUnavailableReason ??
                            "The incoming version is not available to preview right now."}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {isPending ? (
                  <div
                    className="conflict-review-card-confirm"
                    role="group"
                    aria-label={`Resolve this ${entityKindLabel(conflict.entityKind).toLowerCase()} conflict?`}
                  >
                    <p className="conflict-review-card-confirm-text">
                      Choose which version to keep. This cannot be undone.
                    </p>
                    <div className="conflict-review-card-confirm-actions">
                      <button type="button" onClick={cancelResolve} aria-disabled={resolving}>
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={() => resolve(conflict, true)}
                        aria-disabled={resolving}
                      >
                        {resolving ? "Resolving…" : "Keep this device's version"}
                      </button>
                      <button
                        type="button"
                        className="button-danger"
                        onClick={() => resolve(conflict, false)}
                        aria-disabled={resolving || !conflict.incoming}
                      >
                        {resolving ? "Resolving…" : "Use the incoming version"}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => startResolve(conflict.id)}>
                    Resolve this conflict
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
