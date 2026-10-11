import type { CurrentSession } from "../../domain/session";
import { AppearanceControl } from "../theme/AppearanceControl";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";

/** Shared preferences for the desktop account popover and phone Account screen. */
export function ShellAccountPreferences({
  session,
  onLogout,
}: {
  session: CurrentSession;
  onLogout: () => void;
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
        Save unfinished work before logging out or closing LIKHA. Unsaved session drafts are cleared
        on logout and are not kept after the app closes.
      </p>
      <button className="app-account-logout" type="button" onClick={onLogout}>
        Log out
      </button>
    </div>
  );
}
