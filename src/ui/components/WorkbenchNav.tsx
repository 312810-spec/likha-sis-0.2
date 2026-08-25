import { NavItem } from "./NavItem";
import { NAV_GROUPS, type SignedInTab } from "./workbench-nav-data";

interface WorkbenchNavProps {
  activeTab: SignedInTab;
  onTabChange: (tab: SignedInTab) => void;
}

/** The grouped teacher-workbench navigation, extracted in UX-02 so the
 * dev-only visual fixture (`src/dev-preview/`) renders the exact same
 * navigation production does, not a drifting duplicate -- see
 * docs/adr/0032-teacher-workspace-polish.md. */
export function WorkbenchNav({ activeTab, onTabChange }: WorkbenchNavProps) {
  return (
    <nav aria-label="Teacher workbench" className="workbench-nav">
      {NAV_GROUPS.map((group) => (
        <div className="nav-group" key={group.label} role="group" aria-label={group.label}>
          <span className="nav-group-label" aria-hidden="true">
            {group.label}
          </span>
          {group.tabs.map((tab) => (
            <NavItem
              key={tab.id}
              label={tab.label}
              active={activeTab === tab.id}
              onClick={() => onTabChange(tab.id)}
            />
          ))}
        </div>
      ))}
    </nav>
  );
}
