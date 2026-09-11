import { useEffect, useState } from "react";
import type { CurrentSession } from "../../domain/session";
import { Icon, type IconName } from "../components/icons";
import {
  HOME_DESTINATION,
  NAV_GROUPS,
  normalizeTab,
  type SignedInTab,
} from "../components/workbench-nav-data";
import { TEACHER_MODES, TEACHER_MODE_LABELS } from "../theme/modes";
import { useTeacherMode } from "../theme/useTeacherMode";

interface SidebarProps {
  session: CurrentSession;
  activeTab: SignedInTab;
  onNavigate: (tab: SignedInTab) => void;
  /** Object URL for the school's uploaded branding logo, or `null` when
   * none has been uploaded (or it hasn't loaded yet) -- see
   * `SchoolBrandingScreen`. */
  logoUrl?: string | null;
}

const STORAGE_KEY = "likha-sis:nav-collapsed";

const GROUP_ICON: Record<string, IconName> = {
  "Daily Teaching": "today",
  "Class Overview": "grid",
  "Learner Records": "learners",
  Grading: "grid",
  Security: "shield",
};

const TAB_ICON: Partial<Record<SignedInTab, IconName>> = {
  "today-classes": "today",
  attendance: "check",
  "subject-attendance": "check",
  "subject-monitor": "clock",
  "adviser-view": "learners",
  "teacher-load": "clock",
  "monthly-summary": "calendar",
  learners: "learners",
  sections: "sections",
  "sf1-import": "import",
  "grading-periods": "clock",
  "class-records": "grid",
  "audit-log": "shield",
};

/** Sync (2 items) and Security (5 items) are lower-frequency/admin-oriented
 * next to Daily Teaching/Class Overview/Learner Records/Grading/Creation
 * Studio, which a teacher touches constantly -- collapsed by default so a
 * first-time sidebar isn't ~24 destinations deep. Only the zero-state
 * default: any stored choice (including a teacher re-expanding either
 * group) always wins, on every later read. */
const DEFAULT_COLLAPSED = ["Sync", "Security"];

function readCollapsed(): Set<string> {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed))
        return new Set(parsed.filter((x): x is string => typeof x === "string"));
    }
  } catch {
    // Unreadable / disabled storage -- fall back to the same default as
    // "nothing stored yet", since there's no way to know what the teacher
    // chose.
  }
  return new Set(DEFAULT_COLLAPSED);
}

export function Sidebar({ session, activeTab, onNavigate, logoUrl }: SidebarProps) {
  const { mode, setMode } = useTeacherMode();
  const [collapsed, setCollapsed] = useState<Set<string>>(readCollapsed);
  const current = normalizeTab(activeTab);

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify([...collapsed]));
    } catch {
      // Non-fatal: the collapse state still applies for this session.
    }
  }, [collapsed]);

  function toggleGroup(label: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(label)) {
        next.delete(label);
      } else {
        next.add(label);
      }
      return next;
    });
  }

  return (
    <nav aria-label="Primary" className="app-sidebar">
      <h1 className="app-sidebar-brand">
        {logoUrl && <img src={logoUrl} alt="" className="app-sidebar-logo" />}
        LIKHA-SIS
      </h1>
      <p className="app-sidebar-identity">
        <strong>{session.displayName}</strong>
        <span>{session.schoolName}</span>
      </p>

      <div className="app-sidebar-scroll">
        <button
          type="button"
          className="app-nav-item"
          aria-current={current === HOME_DESTINATION.id ? "page" : undefined}
          onClick={() => onNavigate(HOME_DESTINATION.id)}
        >
          <Icon name="home" />
          <span>{HOME_DESTINATION.label}</span>
        </button>

        {NAV_GROUPS.map((group) => {
          const isCollapsed = collapsed.has(group.label);
          return (
            <section className="app-nav-group" key={group.label}>
              <button
                type="button"
                className="app-nav-group-toggle"
                aria-expanded={!isCollapsed}
                onClick={() => toggleGroup(group.label)}
              >
                <Icon name={GROUP_ICON[group.label] ?? "grid"} />
                <span>{group.label}</span>
                <span className="app-nav-group-chevron" aria-hidden="true">
                  <Icon name="chevron" />
                </span>
              </button>
              {!isCollapsed && (
                <ul className="app-nav-group-items">
                  {group.tabs.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        className="app-nav-item"
                        aria-current={current === t.id ? "page" : undefined}
                        onClick={() => onNavigate(t.id)}
                      >
                        <Icon name={TAB_ICON[t.id] ?? "grid"} />
                        <span>{t.label}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })}
      </div>

      <div className="app-sidebar-modes" role="group" aria-label="Teacher interface mode">
        {TEACHER_MODES.map((m) => (
          <button key={m} type="button" aria-pressed={mode === m} onClick={() => setMode(m)}>
            {TEACHER_MODE_LABELS[m]}
          </button>
        ))}
      </div>
    </nav>
  );
}
