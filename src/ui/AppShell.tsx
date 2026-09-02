import type { ReactNode } from "react";
import type { CurrentSession } from "../domain/session";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "./theme/modes";
import { useTeacherMode } from "./theme/useTeacherMode";

interface AppShellProps {
  session: CurrentSession | null;
  onLogout: () => void;
  /** The workbench navigation, rendered inside the sidebar -- kept as a
   * prop rather than imported directly so `AppShell` doesn't need to
   * know about `WorkbenchNav`'s own data module, matching this
   * project's existing pattern of screens receiving their collaborators
   * as props (see docs/adr/0066-bright-command-redesign.md). Optional
   * so `AppShell` degrades to a header-only layout (no empty sidebar
   * rail) for any caller with no nav to show, e.g. a future signed-out
   * shell reuse. */
  nav?: ReactNode;
  children: ReactNode;
}

/** First-letter-of-each-word initials for the session avatar badge
 * (e.g. "Ana Cruz" -> "AC") -- capped at two characters so a long
 * display name still fits the fixed-size badge. */
function initialsFor(displayName: string): string {
  const letters = displayName
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean);
  return letters.slice(0, 2).join("").toUpperCase();
}

export function AppShell({ session, onLogout, nav, children }: AppShellProps) {
  const { mode, setMode } = useTeacherMode();

  return (
    <div className="app-shell">
      <aside className="app-shell-sidebar">
        <div className="app-shell-brand">
          <span className="app-shell-brand-mark" aria-hidden="true">
            L
          </span>
          <h1 className="app-shell-title">LIKHA-SIS</h1>
        </div>
        {nav}
      </aside>

      <header className="app-shell-header">
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
            <span className="app-shell-session-avatar" aria-hidden="true">
              {initialsFor(session.displayName)}
            </span>
            <span className="app-shell-session-identity">
              <span className="app-shell-session-name">{session.displayName}</span>
              <span className="app-shell-session-school">{session.schoolName}</span>
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
