import { useEffect, useRef, useState, type FormEvent } from "react";
import type { LegacySetupRecoveryApplicationService } from "../application/legacy-setup-recovery-service";
import type { CurrentSession } from "../domain/session";
import { Alert } from "./components/Alert";

export function LegacySetupRecovery({
  service,
  onRestored,
}: {
  service: LegacySetupRecoveryApplicationService;
  onRestored: (session: CurrentSession) => void;
}) {
  const [check, setCheck] = useState<{
    service: LegacySetupRecoveryApplicationService;
    attempt: number;
    available: boolean;
    failed: boolean;
  } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [editing, setEditing] = useState(false);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const flight = useRef(false);
  const identity = useRef<object | null>(null);
  const trigger = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const token = {};
    identity.current = token;
    flight.current = false;
    service
      .available()
      .then((result) => {
        if (identity.current === token)
          setCheck({ service, attempt, available: result, failed: false });
      })
      .catch(() => {
        if (identity.current === token)
          setCheck({ service, attempt, available: false, failed: true });
      });
    return () => {
      identity.current = null;
    };
  }, [service, attempt]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (flight.current || !password.length) return;
    flight.current = true;
    const token = identity.current;
    const submitted = password;
    setPassword("");
    setPending(true);
    setError(null);
    try {
      const session = await service.restore(submitted);
      if (identity.current === token) onRestored(session);
    } catch (failure) {
      if (identity.current === token) {
        setError(
          String(failure) === "account_locked"
            ? "This account is temporarily locked. Wait before trying again."
            : String(failure) === "authentication_failed"
              ? "Password verification failed. Enter your current password to try again."
              : "Setup access could not be restored. Your account may no longer qualify. Refresh the setup check before retrying.",
        );
      }
    } finally {
      if (identity.current === token) {
        flight.current = false;
        setPending(false);
      }
    }
  }

  const currentCheck = check?.service === service && check.attempt === attempt ? check : null;
  if (currentCheck?.failed)
    return (
      <Alert tone="error">
        Could not check setup recovery.{" "}
        <button
          type="button"
          onClick={() => {
            setEditing(false);
            setPassword("");
            setError(null);
            setAttempt((n) => n + 1);
          }}
        >
          Retry setup check
        </button>
      </Alert>
    );
  if (!currentCheck?.available) return null;
  return (
    <section aria-label="Restore setup access">
      <Alert tone="info">
        <p>
          This installation has one account with no assigned roles. Restore the application access
          needed to set up sections, learners and teaching assignments.
        </p>
        <p>
          This grants Teacher, Registrar and School Head permissions in LIKHA-SIS. It does not
          designate a school position or change your records or password.
        </p>
        {!editing ? (
          <button ref={trigger} type="button" onClick={() => setEditing(true)}>
            Restore setup access
          </button>
        ) : (
          <form onSubmit={submit} aria-label="Confirm setup access recovery">
            <label htmlFor="setup-recovery-password">Current password</label>
            <input
              autoFocus
              id="setup-recovery-password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              disabled={pending}
              required
            />
            {error && <Alert tone="error">{error}</Alert>}
            <button type="submit" disabled={pending || !password.length}>
              {pending ? "Restoring setup access…" : "Confirm restore setup access"}
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setEditing(false);
                setPassword("");
                setError(null);
                requestAnimationFrame(() => trigger.current?.focus());
              }}
            >
              Cancel
            </button>
            {error && (
              <button
                type="button"
                disabled={pending}
                onClick={() => {
                  setEditing(false);
                  setPassword("");
                  setError(null);
                  setAttempt((n) => n + 1);
                }}
              >
                Refresh setup check
              </button>
            )}
          </form>
        )}
      </Alert>
    </section>
  );
}
