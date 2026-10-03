import type { CurrentSession } from "../../domain/session";
import { Icon, type IconName } from "../components/icons";
import { PRIMARY_NAV, primaryTabFor, type SignedInTab } from "../components/workbench-nav-data";

interface SidebarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  logoUrl?: string | null;
}
const ICONS: Record<string, IconName> = {
  workspace: "home",
  "adviser-view": "learners",
  "class-records": "document",
  "school-forms": "document",
  calendar: "calendar",
  more: "more",
};
export function Sidebar({ session, activeTab, onNavigate, logoUrl }: SidebarProps) {
  const current = primaryTabFor(activeTab);
  return (
    <nav aria-label="Primary" className="app-sidebar">
      <div className="app-sidebar-brand">
        {logoUrl && <img src={logoUrl} alt="" className="app-sidebar-logo" />}
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
            onClick={() => onNavigate(destination.id)}
          >
            <Icon name={ICONS[destination.id] ?? "grid"} />
            <span>{destination.label}</span>
          </button>
        ))}
      </div>
    </nav>
  );
}
