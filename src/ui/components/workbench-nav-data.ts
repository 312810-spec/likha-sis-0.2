export type SignedInTab =
  | "schedule-planner"
  | "published-schedule"
  | "attachments"
  | "school-resources"
  | "review-workspace"
  | "school-planning"
  | "school-offerings"
  | "daily-planner"
  | "record-library"
  | "workspace"
  | "school-forms"
  | "calendar"
  | "more"
  | "account"
  | "learners"
  | "sections"
  | "section-roster"
  | "teaching-assignments"
  | "section-adviser"
  | "schedule-meetings"
  | "sf1-import"
  | "my-day"
  | "today-classes"
  | "attendance"
  | "subject-attendance"
  | "subject-monitor"
  | "adviser-view"
  | "teacher-load"
  | "monthly-summary"
  | "grading-periods"
  | "class-records"
  | "lesson-plans"
  | "audit-log"
  | "admin-password-reset"
  | "school-members"
  | "devices"
  | "conflict-review"
  | "sync-status"
  | "school-branding";

/**
 * The display label for every tab. An explicit object literal, not a
 * derived map, so the compiler enforces that every `SignedInTab` has a
 * label — including `section-roster`, which is a contextual sub-screen
 * reached from Sections (it needs a selected section) and therefore has no
 * `NAV_GROUPS` entry, only a label for the document title (`App.tsx`).
 */
export const TAB_LABELS: Record<SignedInTab, string> = {
  "schedule-planner": "Teacher Load Planner",
  "published-schedule": "My Published Schedule",
  attachments: "Attachments",
  "school-resources": "Resources and Learner Support",
  "review-workspace": "Forms and TANAW Review",
  "school-planning": "School Notices and Programs",
  "school-offerings": "Subject Offerings",
  "daily-planner": "Daily teaching planner",
  "record-library": "Record management",
  workspace: "Dashboard",
  "school-forms": "School Forms",
  calendar: "Calendar",
  more: "More",
  account: "Account",
  learners: "Learners",
  sections: "Sections",
  "section-roster": "Section Roster",
  "teaching-assignments": "Teaching Assignments",
  "section-adviser": "Section Adviser",
  "schedule-meetings": "Class Schedule",
  "sf1-import": "Import Learners (SF1)",
  "my-day": "My Classes",
  "today-classes": "Today's Classes",
  attendance: "Attendance",
  "subject-attendance": "Subject Attendance",
  "subject-monitor": "My Subject Attendance",
  "adviser-view": "My Advisory",
  "teacher-load": "My Teaching Load",
  "monthly-summary": "Monthly Summary",
  "grading-periods": "Grading Periods",
  "class-records": "Class Record",
  "lesson-plans": "Lesson Plans",
  "audit-log": "Sign-in Activity",
  "admin-password-reset": "Reset a Password",
  "school-members": "School Members",
  devices: "Devices",
  "conflict-review": "Review Sync Conflicts",
  "sync-status": "Sync Status",
  "school-branding": "School Logo",
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
    label: "School Planning",
    tabs: [
      tab("schedule-planner"),
      tab("published-schedule"),
      tab("school-planning"),
      tab("school-offerings"),
    ],
  },
  {
    label: "Evidence and Support",
    tabs: [tab("review-workspace"), tab("attachments"), tab("school-resources")],
  },
  {
    label: "Daily Teaching",
    tabs: [
      tab("daily-planner"),
      tab("today-classes"),
      tab("attendance"),
      tab("subject-attendance"),
    ],
  },
  {
    label: "Class Overview",
    tabs: [
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
    tabs: [tab("grading-periods"), tab("record-library")],
  },
  {
    label: "Creation Studio",
    tabs: [tab("lesson-plans")],
  },
  {
    label: "Sync",
    tabs: [tab("sync-status"), tab("conflict-review")],
  },
  {
    label: "Security",
    tabs: [
      tab("audit-log"),
      tab("admin-password-reset"),
      tab("school-members"),
      tab("devices"),
      tab("school-branding"),
    ],
  },
];

/** The six deliberately small destinations of the class-folio shell. Detailed
 * tools remain in NAV_GROUPS and are reached through the More workspace. */
export const PRIMARY_NAV: readonly { id: SignedInTab; label: string }[] = [
  tab("workspace"),
  tab("adviser-view"),
  tab("class-records"),
  tab("school-forms"),
  tab("calendar"),
  tab("more"),
];
export const HOME_DESTINATION = { id: "workspace" as const, label: "Dashboard" };
export const BOTTOM_NAV: readonly { id: SignedInTab; label: string }[] = [
  { id: "workspace", label: "Today" },
  { id: "my-day", label: "Classes" },
  { id: "school-forms", label: "Forms" },
  { id: "account", label: "Account" },
];

/** Keeps a meaningful primary destination selected while using its tools. */
export function primaryTabFor(tab: SignedInTab): SignedInTab {
  if (tab === "workspace" || tab === "my-day" || tab === "today-classes") return "workspace";
  if (["adviser-view", "attendance", "section-adviser"].includes(tab)) return "adviser-view";
  if (["class-records", "grading-periods"].includes(tab)) return "class-records";
  if (["school-forms", "monthly-summary", "sf1-import"].includes(tab)) return "school-forms";
  if (["calendar", "schedule-meetings", "schedule-planner", "published-schedule"].includes(tab))
    return "calendar";
  return "more";
}

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

/** Navigation visibility complements independently enforced native authority. */
export function canNavigateTab(tab: SignedInTab, roles: readonly string[] = ["teacher"]): boolean {
  const head = roles.includes("school_head");
  const registrar = roles.includes("registrar");
  if (
    [
      "schedule-planner",
      "admin-password-reset",
      "school-members",
      "devices",
      "school-branding",
      "grading-periods",
      "school-offerings",
      "teaching-assignments",
      "section-adviser",
      "schedule-meetings",
    ].includes(tab)
  )
    return head;
  if (
    [
      "learners",
      "sections",
      "section-roster",
      "sf1-import",
      "record-library",
      "attendance",
      "monthly-summary",
    ].includes(tab)
  )
    return head || registrar;
  return true;
}
export function visibleNavGroups(roles?: readonly string[]): readonly NavGroup[] {
  return NAV_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => canNavigateTab(tab.id, roles)),
  })).filter((group) => group.tabs.length > 0);
}
