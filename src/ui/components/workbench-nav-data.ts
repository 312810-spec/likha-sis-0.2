export type SignedInTab =
  | "workspace"
  | "learners"
  | "sections"
  | "section-roster"
  | "teaching-assignments"
  | "section-adviser"
  | "schedule-meetings"
  | "sf1-import"
  | "today-classes"
  | "attendance"
  | "subject-attendance"
  | "subject-monitor"
  | "adviser-view"
  | "teacher-load"
  | "monthly-summary"
  | "grading-periods"
  | "class-records"
  | "audit-log";

/**
 * The display label for every tab. An explicit object literal, not a
 * derived map, so the compiler enforces that every `SignedInTab` has a
 * label — including `section-roster`, which is a contextual sub-screen
 * reached from Sections (it needs a selected section) and therefore has no
 * `NAV_GROUPS` entry, only a label for the document title (`App.tsx`).
 */
export const TAB_LABELS: Record<SignedInTab, string> = {
  workspace: "Home",
  learners: "Learners",
  sections: "Sections",
  "section-roster": "Section Roster",
  "teaching-assignments": "Teaching Assignments",
  "section-adviser": "Section Adviser",
  "schedule-meetings": "Class Schedule",
  "sf1-import": "SF1: Enrollment",
  "today-classes": "Today's Classes",
  attendance: "Attendance",
  "subject-attendance": "Subject Attendance",
  "subject-monitor": "Subject Monitor",
  "adviser-view": "Adviser View",
  "teacher-load": "My Teaching Load",
  "monthly-summary": "Monthly Summary",
  "grading-periods": "Grading Periods",
  "class-records": "Class Records",
  "audit-log": "Sign-in Activity",
};

interface NavGroup {
  label: string;
  tabs: readonly { id: SignedInTab; label: string }[];
}

function tab(id: SignedInTab): { id: SignedInTab; label: string } {
  return { id, label: TAB_LABELS[id] };
}

/** Groups every navigable destination into a teacher's actual daily
 * rhythm instead of one flat button row -- see
 * docs/adr/0031-design-system-and-app-shell.md. `section-roster`,
 * `teaching-assignments`, and `schedule-meetings` are deliberately
 * absent: each is only ever reached contextually, from the screen one
 * level up with its own selection already made. Kept as a data-only
 * module, separate from the shell components that consume it
 * (`src/ui/shell/Sidebar.tsx`, `BottomNav.tsx`), so those files stay
 * component-only for React Fast Refresh. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Daily Teaching",
    tabs: [
      tab("today-classes"),
      tab("attendance"),
      tab("subject-attendance"),
      tab("subject-monitor"),
      tab("adviser-view"),
      tab("teacher-load"),
      tab("monthly-summary"),
    ],
  },
  {
    label: "Learner Records",
    tabs: [tab("learners"), tab("sections"), tab("sf1-import")],
  },
  {
    label: "Grading",
    tabs: [tab("grading-periods"), tab("class-records")],
  },
  {
    label: "Security",
    tabs: [tab("audit-log")],
  },
];

/** The pinned Home destination, rendered above the groups in the sidebar
 * and first in the bottom nav. Wave 1: this is still the existing
 * `workspace` tab (TeacherWorkspaceScreen). Wave 3 repoints it at the new
 * role-adaptive HomeScreen. */
export const HOME_DESTINATION: { id: SignedInTab; label: string } = {
  id: "workspace",
  label: "Home",
};

/** The four real destinations of the phone bottom-tab bar. `BottomNav.tsx`
 * appends a synthetic fifth "More" control that opens the drawer -- it is
 * not a `SignedInTab`, so it is not listed here. */
export const BOTTOM_NAV: readonly { id: SignedInTab; label: string }[] = [
  { id: "workspace", label: "Home" },
  { id: "today-classes", label: "Classes" },
  { id: "learners", label: "Learners" },
  { id: "class-records", label: "Grades" },
];

const CONTEXTUAL_PARENT: Partial<Record<SignedInTab, SignedInTab>> = {
  "section-roster": "sections",
  "teaching-assignments": "sections",
  "section-adviser": "sections",
  "schedule-meetings": "sections",
};

/** Collapses a contextual sub-screen tab to the group destination it was
 * reached from, so the sidebar highlights the right item and the
 * breadcrumb names the right group. Every other tab returns itself. */
export function normalizeTab(tab: SignedInTab): SignedInTab {
  return CONTEXTUAL_PARENT[tab] ?? tab;
}

/** The nav-group label that owns a tab (contextual tabs resolved via
 * `normalizeTab`). `null` for the pinned Home destination, which sits
 * outside every group. */
export function groupLabelForTab(tab: SignedInTab): string | null {
  const id = normalizeTab(tab);
  for (const group of NAV_GROUPS) {
    if (group.tabs.some((t) => t.id === id)) return group.label;
  }
  return null;
}
