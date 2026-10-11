import { Icon, type IconName } from "../components/icons";
import { BOTTOM_NAV, bottomTabFor, type SignedInTab } from "../components/workbench-nav-data";
interface BottomNavProps {
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
}
const ICON: Record<string, IconName> = {
  today: "home",
  "my-day": "document",
  "school-forms": "document",
  account: "learners",
};
export function BottomNav({ activeTab, onNavigate }: BottomNavProps) {
  const current = bottomTabFor(activeTab);
  return (
    <nav aria-label="Primary — quick access" className="app-bottomnav">
      {BOTTOM_NAV.map((destination) => (
        <button
          key={destination.id}
          type="button"
          aria-current={current === destination.id ? "page" : undefined}
          onClick={() => onNavigate(destination.id)}
        >
          <Icon name={ICON[destination.id] ?? "grid"} />
          <span>{destination.label}</span>
        </button>
      ))}
    </nav>
  );
}
