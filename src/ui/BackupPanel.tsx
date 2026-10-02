import { useState, type FormEvent } from "react";
import type { BackupApplicationService } from "../application/backup-service";
import { ValidationError } from "../domain/errors";
import { Alert } from "./components/Alert";

interface BackupPanelProps {
  service: BackupApplicationService;
  recovery?: boolean;
  onRecoveryReady?: () => void;
}

export function BackupPanel({ service, recovery = false, onRecoveryReady }: BackupPanelProps) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [sourceRetired, setSourceRetired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const prefix = recovery ? "recovery" : "backup";

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || ready || (recovery && !sourceRetired)) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      if (recovery) {
        if (await service.stageRecovery(password, confirmation)) {
          setReady(true);
          setSuccess(
            "Recovery is ready. Close LIKHA-SIS completely and reopen it, then sign in with your original app account. Re-enroll client synchronization before transferring records.",
          );
          onRecoveryReady?.();
        }
      } else {
        const path = await service.create(password, confirmation);
        if (path)
          setSuccess(
            `Backup saved: ${path}. Keep the file and its recovery password separately, away from this computer.`,
          );
      }
    } catch (failure) {
      setError(
        failure instanceof ValidationError
          ? failure.message
          : "Could not complete the backup operation. Try again.",
      );
    } finally {
      setPassword("");
      setConfirmation("");
      setBusy(false);
    }
  }

  return (
    <section
      aria-label={recovery ? "Recover an existing installation" : "Full installation backup"}
    >
      <h3>{recovery ? "Recover your records" : "Full installation backup"}</h3>
      <p>
        {recovery
          ? "Use an encrypted LIKHA-SIS backup before setting up this computer. Recovery keeps the original app accounts, records and pending edits. It requires the recovery password chosen when the backup was created."
          : "Save all schools, app accounts, attendance, grades and pending edits on this installation. A School Head for every school on this computer can create this backup."}
      </p>
      {!recovery && (
        <p>
          Choose a strong recovery password and keep it somewhere safe. It cannot be reset if
          forgotten. This is separate from your app login password.
        </p>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      {success && <Alert tone="success">{success}</Alert>}
      {!ready && (
        <form onSubmit={submit} aria-label={recovery ? "Restore backup" : "Create backup"}>
          <fieldset disabled={busy}>
            <legend>{recovery ? "Backup recovery password" : "Choose a recovery password"}</legend>
            <div className="field">
              <label htmlFor={`${prefix}-password`}>Recovery password</label>
              <input
                id={`${prefix}-password`}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <div className="field">
              <label htmlFor={`${prefix}-confirmation`}>Repeat recovery password</label>
              <input
                id={`${prefix}-confirmation`}
                type="password"
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                required
              />
            </div>
            {recovery && (
              <label>
                <input
                  type="checkbox"
                  checked={sourceRetired}
                  onChange={(e) => setSourceRetired(e.target.checked)}
                />
                I will use this as the replacement installation and stop using the original computer
                for these records.
              </label>
            )}
            <button type="submit" disabled={recovery && !sourceRetired}>
              {busy
                ? "Working…"
                : recovery
                  ? "Choose backup and recover"
                  : "Choose location and save backup"}
            </button>
          </fieldset>
        </form>
      )}
    </section>
  );
}
