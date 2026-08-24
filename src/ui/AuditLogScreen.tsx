import { useEffect, useRef, useState } from "react";
import type { AuthApplicationService } from "../application/auth-service";
import type { AuditEventType, AuditLogEntry } from "../domain/session";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AuditLogScreenProps {
  authService: AuthApplicationService;
}

const EVENT_LABELS: Record<AuditEventType, string> = {
  login_success: "Signed in",
  login_failed: "Failed sign-in attempt",
  account_locked: "Account temporarily locked",
  logout: "Signed out",
};

/** Formats an ISO timestamp as a readable local date and time, e.g. "Aug
 * 25, 2026, 5:10 AM" -- raw `created_at` values are ISO strings
 * (`2026-08-25T05:10:23.456Z`) meant for storage/ordering, not for a
 * teacher to read directly. Falls back to the raw string for anything
 * that doesn't parse as a real date, rather than surfacing "Invalid
 * Date." Same "don't show a raw ISO timestamp to a teacher" fix
 * `ClassRecordWorkspace.tsx`'s `formatSavedTime` already applied for
 * same-day saves; this one also needs the date, since entries here can
 * span many days. */
function formatWhen(createdAt: string): string {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;
  return date.toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function AuditLogScreen({ authService }: AuditLogScreenProps) {
  const { mode } = useTeacherMode();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    headingRef.current?.focus();
  }, []);

  useEffect(() => {
    let cancelled = false;
    authService
      .listAuditLog()
      .then((result) => {
        if (!cancelled) setEntries(result);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load the sign-in activity log.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [authService]);

  return (
    <section aria-label="Sign-in activity">
      <h2 ref={headingRef} tabIndex={-1}>
        Sign-in Activity
      </h2>
      {mode === "guided" && (
        <p className="field-hint">
          This shows recent sign-in attempts for your school — who signed in, who signed out, and
          any failed or locked-out attempts. It does not track what anyone did after signing in.
        </p>
      )}

      {error && (
        <div className="error-banner" role="alert">
          {error}
        </div>
      )}

      {loading ? (
        <p role="status">Loading sign-in activity…</p>
      ) : entries.length === 0 ? (
        <p>No sign-in activity recorded yet.</p>
      ) : (
        <table className="attendance-roster">
          <thead>
            <tr>
              <th scope="col">When</th>
              <th scope="col">Username</th>
              <th scope="col">Event</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry) => (
              <tr key={entry.id}>
                <td>{formatWhen(entry.createdAt)}</td>
                <td>{entry.username}</td>
                <td>{EVENT_LABELS[entry.eventType]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
