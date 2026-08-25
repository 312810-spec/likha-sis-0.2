import { useEffect, useRef, useState } from "react";
import type { AuthApplicationService } from "../application/auth-service";
import { Alert } from "./components/Alert";

interface IdleTimeoutWarningProps {
  authService: AuthApplicationService;
  /** Called once the session has actually idle-timed-out (or been
   * revoked/hit its absolute TTL) — the same "return to sign-in with a
   * clear reason" flow `onSessionExpired` already drives for a failed
   * protected command (ADR-0022). This component detects the *peek*
   * case: nothing has failed yet because the teacher simply hasn't
   * clicked anything since the deadline passed. */
  onExpired: () => void;
}

/** How often to re-check the session's idle deadline. A peek only
 * (`authService.currentSession()`) -- never touches the idle window
 * itself, matching ADR-0020's contract that only real protected-command
 * activity may slide it forward. */
const POLL_INTERVAL_MS = 30_000;

/** Show the warning once the idle deadline is this close. Comfortably
 * inside ADR-0020's 30-minute window and well above `POLL_INTERVAL_MS`,
 * so at least a few polls land inside the warning period even under
 * normal jitter. */
const WARNING_THRESHOLD_MS = 2 * 60_000;

function formatMinutes(msRemaining: number): string {
  const minutes = Math.max(1, Math.ceil(msRemaining / 60_000));
  return minutes === 1 ? "1 minute" : `${minutes} minutes`;
}

/**
 * Warns a teacher before ADR-0020's 30-minute idle timeout silently signs
 * them out, and offers a one-click way to stay signed in without needing
 * to go do something elsewhere in the app. See ADR-0026.
 *
 * Deliberately warning-tone `Alert` (`role="alert"`), not
 * `role="alertdialog"` (self-review correction, ADR-0027) -- this
 * banner never traps focus, moves focus into itself, or blocks
 * interaction with the rest of the page, so it isn't a dialog;
 * `alertdialog` implies exactly that modal behavior per ARIA authoring
 * practices, which would mislead assistive tech into expecting it.
 */
export function IdleTimeoutWarning({ authService, onExpired }: IdleTimeoutWarningProps) {
  const [msRemaining, setMsRemaining] = useState<number | null>(null);
  const [extending, setExtending] = useState(false);
  const onExpiredRef = useRef(onExpired);
  useEffect(() => {
    onExpiredRef.current = onExpired;
  }, [onExpired]);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      const session = await authService.currentSession().catch(() => null);
      if (cancelled) return;
      if (!session) {
        onExpiredRef.current();
        return;
      }
      const remaining = session.idleExpiresAtUnixMs - Date.now();
      if (remaining <= 0) {
        onExpiredRef.current();
        return;
      }
      setMsRemaining(remaining <= WARNING_THRESHOLD_MS ? remaining : null);
    }

    void poll();
    const interval = setInterval(() => void poll(), POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [authService]);

  async function handleStaySignedIn() {
    setExtending(true);
    try {
      await authService.extendSession();
      setMsRemaining(null);
    } catch {
      onExpiredRef.current();
    } finally {
      setExtending(false);
    }
  }

  if (msRemaining === null) return null;

  return (
    <Alert tone="warning" inline>
      <p>
        You&rsquo;ve been inactive for a while — your session will expire in about{" "}
        {formatMinutes(msRemaining)} unless you stay signed in.
      </p>
      <button
        type="button"
        className="button-primary"
        disabled={extending}
        onClick={handleStaySignedIn}
      >
        {extending ? "Staying signed in…" : "Stay signed in"}
      </button>
    </Alert>
  );
}
