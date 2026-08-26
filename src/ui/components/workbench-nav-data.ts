export type SignedInTab =
  | "workspace"
  | "learners"
  | "sections"
  | "sf1-import"
  | "attendance"
  | "monthly-summary"
  | "grading-periods"
  | "class-records"
  | "audit-log";

interface NavGroup {
  label: string;
  tabs: readonly { id: SignedInTab; label: string }[];
}

/** Groups every destination (none removed, none renamed) into a
 * teacher's actual daily rhythm instead of one flat button row -- see
 * docs/adr/0031-design-system-and-app-shell.md. Kept in its own
 * data-only module (not `WorkbenchNav.tsx`) so that component file can
 * stay component-only for React Fast Refresh. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Daily Teaching",
    tabs: [
      { id: "workspace", label: "Workspace" },
      { id: "attendance", label: "Attendance" },
      { id: "monthly-summary", label: "Monthly Summary" },
    ],
  },
  {
    label: "Learner Records",
    tabs: [
      { id: "learners", label: "Learners" },
      { id: "sections", label: "Sections" },
      { id: "sf1-import", label: "SF1: Enrollment" },
    ],
  },
  {
    label: "Grading",
    tabs: [
      { id: "grading-periods", label: "Grading Periods" },
      { id: "class-records", label: "Class Records" },
    ],
  },
  {
    label: "Security",
    tabs: [{ id: "audit-log", label: "Sign-in Activity" }],
  },
];

export const TAB_LABELS: Record<SignedInTab, string> = Object.fromEntries(
  NAV_GROUPS.flatMap((group) => group.tabs.map((tab) => [tab.id, tab.label])),
) as Record<SignedInTab, string>;
