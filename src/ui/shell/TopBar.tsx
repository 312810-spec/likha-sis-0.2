import type { CurrentSession } from "../../domain/session";
import { Icon } from "../components/icons";
import { TAB_LABELS, groupLabelForTab, type SignedInTab } from "../components/workbench-nav-data";
import { COLOR_THEMES, COLOR_THEME_LABELS } from "../theme/color-theme";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useColorTheme } from "../theme/useColorTheme";
import { useTeacherMode } from "../theme/useTeacherMode";
import { useLiveClock } from "./useLiveClock";

interface TopBarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onLogout: () => void;
  onOpenDrawer: () => void;
  /** Object URL for the school's uploaded branding logo, or `null`/
   * absent when none has been uploaded (or it hasn't loaded yet) --
   * see `SchoolBrandingScreen`. */
  logoUrl?: string | null;
  /** Unread notification count for the bell affordance (ADR-0075).
   * Defaults to 0 -- this batch adds the affordance only; no
   * notification-producing backend exists yet, so a real caller has
   * nothing to pass here today. Never renders a badge for 0. */
  unreadNotificationCount?: number;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

export function TopBar({
  session,
  activeTab,
  onLogout,
  onOpenDrawer,
  logoUrl,
  unreadNotificationCount = 0,
}: TopBarProps) {
  const { mode, setMode } = useTeacherMode();
  const { theme, setTheme } = useColorTheme();
  const clock = useLiveClock();
  const group = groupLabelForTab(activeTab);

  return (
    <header className="app-topbar">
      <button
        type="button"
        className="app-topbar-menu"
        data-drawer-toggle
        aria-label="Open navigation"
        onClick={onOpenDrawer}
      >
        <Icon name="menu" />
      </button>

      <div className="app-topbar-crumbs">
        {group && <span>{group}</span>}
        <strong>{TAB_LABELS[activeTab]}</strong>
      </div>

      <div className="app-topbar-spacer" />

      <time className="app-topbar-clock" dateTime={clock} aria-label={`Current time ${clock}`}>
        {clock}
      </time>

      <div className="app-topbar-modes" role="group" aria-label="Teacher interface mode">
        {TEACHER_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {TEACHER_MODE_LABELS[m]}
          </button>
        ))}
      </div>

      <div className="app-theme-toggle" role="group" aria-label="Color theme">
        {COLOR_THEMES.map((t) => (
          <button key={t} type="button" aria-pressed={theme === t} onClick={() => setTheme(t)}>
            {COLOR_THEME_LABELS[t]}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="app-notification-bell"
        aria-label={
          unreadNotificationCount > 0
            ? `Notifications, ${unreadNotificationCount} unread`
            : "Notifications, none unread"
        }
      >
        <Icon name="bell" />
        {unreadNotificationCount > 0 && (
          <span className="app-notification-badge" aria-hidden="true">
            {unreadNotificationCount > 99 ? "99+" : unreadNotificationCount}
          </span>
        )}
      </button>

      <span className="app-topbar-identity">
        {logoUrl && <img src={logoUrl} alt="" className="app-topbar-logo" />}
        {session.displayName} · {session.schoolName}
      </span>
      <span className="app-avatar" aria-hidden="true">
        {initials(session.displayName)}
      </span>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </header>
  );
}
