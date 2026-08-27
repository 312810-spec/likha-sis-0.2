export type SignedInTab =
  | "workspace"
  | "learners"
  | "sections"
  | "section-roster"
  | "sf1-import"
  | "attendance"
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
  workspace: "Workspace",
  learners: "Learners",
  sections: "Sections",
  "section-roster": "Section Roster",
  "sf1-import": "SF1: Enrollment",
  attendance: "Attendance",
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
 * docs/adr/0031-design-system-and-app-shell.md. `section-roster` is
 * deliberately absent: it is only ever reached from the "Sections" screen
 * with a section already chosen. Kept in its own data-only module (not
 * `WorkbenchNav.tsx`) so that component file can stay component-only for
 * React Fast Refresh. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Daily Teaching",
    tabs: [tab("workspace"), tab("attendance"), tab("monthly-summary")],
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
