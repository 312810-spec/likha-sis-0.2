import { Icon, type IconName } from "../components/icons";
import { BOTTOM_NAV, normalizeTab, type SignedInTab } from "../components/workbench-nav-data";

interface BottomNavProps {
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  onOpenMore: () => void;
}

const ICON: Record<string, IconName> = {
  workspace: "home",
  "today-classes": "today",
  learners: "learners",
  "class-records": "grid",
};

export function BottomNav({ activeTab, onNavigate, onOpenMore }: BottomNavProps) {
  const current = normalizeTab(activeTab);
  return (
    <nav aria-label="Primary — quick access" className="app-bottomnav">
      {BOTTOM_NAV.map((d) => (
        <button
          key={d.id}
          type="button"
          aria-current={current === d.id ? "page" : undefined}
          onClick={() => onNavigate(d.id)}
        >
          <Icon name={ICON[d.id] ?? "grid"} />
          <span>{d.label}</span>
        </button>
      ))}
      <button type="button" onClick={onOpenMore}>
        <Icon name="menu" />
        <span>More</span>
      </button>
    </nav>
  );
}
