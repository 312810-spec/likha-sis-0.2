import type { CurrentSession } from "../../domain/session";
import { AppearanceControl } from "../theme/AppearanceControl";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";

/** Shared preferences for the desktop account popover and phone Account screen. */
export function ShellAccountPreferences({
  session,
  onLogout,
  logoutPending = false,
  logoutError,
}: {
  session: CurrentSession;
  onLogout: () => void;
  logoutPending?: boolean;
  logoutError?: string | null;
}) {
  const { mode, setMode } = useTeacherMode();
  return (
    <div className="app-account-preferences">
      <div className="app-account-identity">
        <strong>{session.displayName}</strong>
        <span>{session.schoolName}</span>
      </div>
      <AppearanceControl />
      <div className="app-account-modes" role="group" aria-label="Teacher interface mode">
        <span>Interface density</span>
        <div>
          {TEACHER_MODES.map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={mode === value}
              onClick={() => setMode(value)}
            >
              {TEACHER_MODE_LABELS[value]}
            </button>
          ))}
        </div>
      </div>
      <p className="field-hint">
        Save unfinished work before logging out or closing LIKHA. Memory-only session drafts clear
        after successful logout or when the app closes. Classroom recovery drafts saved on this
        device remain available for the same account to review and restore.
      </p>
      {logoutError && <p role="alert">{logoutError}</p>}
      <button
        className="app-account-logout"
        type="button"
        disabled={logoutPending}
        onClick={onLogout}
      >
        {logoutPending ? "Logging out…" : "Log out"}
      </button>
    </div>
  );
}
