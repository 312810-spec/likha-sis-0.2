import type { CurrentSession } from "../../domain/session";
import { Icon } from "../components/icons";
import { TAB_LABELS, groupLabelForTab, type SignedInTab } from "../components/workbench-nav-data";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";
import { APPEARANCES, APPEARANCE_LABELS } from "../theme/appearance";
import { useAppearance } from "../theme/useAppearance";

interface TopBarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onLogout: () => void;
  onOpenDrawer: () => void;
  /** Object URL for the school's uploaded branding logo, or `null`/
   * absent when none has been uploaded (or it hasn't loaded yet) --
   * see `SchoolBrandingScreen`. */
  logoUrl?: string | null;
}

export function TopBar({ session, activeTab, onLogout, onOpenDrawer, logoUrl }: TopBarProps) {
  const { mode, setMode } = useTeacherMode();
  const { appearance, setAppearance } = useAppearance();
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

      {/* Appearance + density: one "Display" cluster (ADR-0070 Wave B).
          Two labelled groups joined visually; on phone the whole cluster
          moves into the drawer (see Sidebar). */}
      <div className="app-topbar-display">
        <div className="app-topbar-appearance" role="group" aria-label="Appearance">
          {APPEARANCES.map((a) => (
            <button
              key={a}
              type="button"
              aria-pressed={appearance === a}
              onClick={() => setAppearance(a)}
            >
              {APPEARANCE_LABELS[a]}
            </button>
          ))}
        </div>

        <div className="app-topbar-modes" role="group" aria-label="Teacher interface mode">
          {TEACHER_MODES.map((m) => (
            <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
              {TEACHER_MODE_LABELS[m]}
            </button>
          ))}
        </div>
      </div>

      <span className="app-topbar-identity">
        {logoUrl && <img src={logoUrl} alt="" className="app-topbar-logo" />}
        {session.displayName} · {session.schoolName}
      </span>
      <button type="button" onClick={onLogout}>
        Log out
      </button>
    </header>
  );
}
