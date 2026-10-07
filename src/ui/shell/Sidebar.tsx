import type { CurrentSession } from "../../domain/session";
import { Icon, type IconName } from "../components/icons";
import { PRIMARY_NAV, primaryTabFor, type SignedInTab } from "../components/workbench-nav-data";

interface SidebarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  logoUrl?: string | null;
  collapsed?: boolean;
  collapsible?: boolean;
  onToggleCollapse?: () => void;
}

const ICONS: Record<string, IconName> = {
  workspace: "home",
  "adviser-view": "learners",
  "class-records": "document",
  "school-forms": "document",
  calendar: "calendar",
  more: "more",
};

export function Sidebar({
  session,
  activeTab,
  onNavigate,
  logoUrl,
  collapsed = false,
  collapsible = false,
  onToggleCollapse,
}: SidebarProps) {
  const current = primaryTabFor(activeTab);

  return (
    <nav aria-label="Primary" className="app-sidebar">
      <div className="app-sidebar-brand">
        {logoUrl ? (
          <img src={logoUrl} alt="" className="app-sidebar-logo" />
        ) : (
          <span className="app-sidebar-fallback-mark" aria-hidden="true">
            L
          </span>
        )}
        <strong className="app-sidebar-school">{session.schoolName}</strong>
        <span className="app-sidebar-wordmark">LIKHA-SIS</span>
      </div>

      <div className="app-sidebar-scroll">
        {PRIMARY_NAV.map((destination) => (
          <button
            key={destination.id}
            type="button"
            className="app-nav-item"
            aria-current={current === destination.id ? "page" : undefined}
            aria-label={collapsed ? destination.label : undefined}
            title={collapsed ? destination.label : undefined}
            onClick={() => onNavigate(destination.id)}
          >
            <Icon name={ICONS[destination.id] ?? "grid"} />
            <span>{destination.label}</span>
          </button>
        ))}
      </div>

      {collapsible && onToggleCollapse ? (
        <div className="app-sidebar-footer">
          <button
            type="button"
            className="app-sidebar-collapse"
            aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}
            title={collapsed ? "Expand navigation" : "Collapse navigation"}
            onClick={onToggleCollapse}
          >
            <Icon name="chevron" />
            <span>{collapsed ? "Expand" : "Collapse"}</span>
          </button>
        </div>
      ) : null}
    </nav>
  );
}
