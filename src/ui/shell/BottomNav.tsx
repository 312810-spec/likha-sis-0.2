import { Icon, type IconName } from "../components/icons";
import { BOTTOM_NAV, type SignedInTab } from "../components/workbench-nav-data";
interface BottomNavProps {
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
}
const ICON: Record<string, IconName> = {
  workspace: "home",
  "my-day": "document",
  "school-forms": "document",
  account: "learners",
};
export function BottomNav({ activeTab, onNavigate }: BottomNavProps) {
  const current =
    activeTab === "today-classes" ||
    activeTab === "class-records" ||
    activeTab === "subject-attendance"
      ? "my-day"
      : activeTab === "monthly-summary" || activeTab === "sf1-import"
        ? "school-forms"
        : activeTab;
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
