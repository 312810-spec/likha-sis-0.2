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
  workspace: "Workspace",
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
 * level up with its own selection already made. Kept in its own
 * data-only module (not `WorkbenchNav.tsx`) so that component file can
 * stay component-only for React Fast Refresh. */
export const NAV_GROUPS: readonly NavGroup[] = [
  {
    label: "Daily Teaching",
    tabs: [
      tab("workspace"),
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
