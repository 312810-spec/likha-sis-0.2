import type { ReactNode } from "react";
import type { CurrentSession } from "../domain/session";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "./theme/modes";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AppShellProps {
  session: CurrentSession | null;
  onLogout: () => void;
  children: ReactNode;
}

export function AppShell({ session, onLogout, children }: AppShellProps) {
  const { mode, setMode } = useTeacherMode();

  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <h1 className="app-shell-title">LIKHA-SIS</h1>

        <div role="group" aria-label="Teacher interface mode" className="mode-switcher">
          {TEACHER_MODES.map((teacherMode) => (
            <button
              key={teacherMode}
              type="button"
              aria-pressed={mode === teacherMode}
              onClick={() => setMode(teacherMode)}
            >
              {TEACHER_MODE_LABELS[teacherMode]}
            </button>
          ))}
        </div>

        {session && (
          <div className="app-shell-session">
            <span className="app-shell-session-identity">
              {session.displayName} · {session.schoolName}
            </span>
            <button type="button" onClick={onLogout}>
              Log out
            </button>
          </div>
        )}
      </header>

      <main className="app-shell-main">{children}</main>
    </div>
  );
}
