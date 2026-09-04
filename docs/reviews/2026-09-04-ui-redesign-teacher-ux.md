# Teacher-UX Review — UI Redesign Shell + Primitives + Role-Adaptive Home + Page Re-fit (ADR-0064 Waves 1–6, UX-02/03/04)

Reviewer: standing in for `teacher-ux-reviewer` (dedicated agent's findings could not be
retrieved — known harness issue). Read-only. Scope per the review brief: shell
(`AppLayout`/`Sidebar`/`TopBar`/`BottomNav`), `HomeScreen` + `SchoolHeadHome` +
`TeacherWorkspaceScreen`, daily-teaching screens (Attendance, Monthly Summary, Class
Records, Class Record Workspace, Learner List, Section Roster, Sections), the
`Page`/`KpiStrip`/`Card`/`DataTable` primitives, `theme/modes.ts`, and the mode blocks of
`theme/styles.css`.

Standing limitation: no browser/native-render tool. This is a structural + copy + flow
review of the source only. Visual spacing/density and a real NVDA/Narrator pass are still
owed (already tracked in `docs/VERIFICATION-DEBT.md`).

---

## Verdict: PASS-WITH-MINORS

No Blocking findings. The redesign keeps teacher-facing language plain in the great
majority of places, preserves functional parity across Efficient / Comfortable / Guided
(no action is hidden by mode — Guided only adds genuine explanatory `field-hint` copy),
and the record-changing flows (end enrollment, delete assessment item, all exports) are
consistently confirmed, consequence-labelled, and carry honest "not a submission-ready
official form" disclosures. The items below are clarity, information-architecture, and
polish fixes, plus one phone-shell gap.

Finding count: 17 (0 Blocking / 4 Should-fix / 10 Minor / 3 Informational) + 1 positive
note.

---

## Findings

### Should-fix

**S1 — Sidebar destinations "Subject Monitor" and "Adviser View" give a teacher no idea
what the screen does.**
`src/ui/components/workbench-nav-data.ts:42-43` (rendered by `src/ui/shell/Sidebar.tsx:113-126`).
A teacher scanning the "Daily Teaching" group can predict "Attendance", "Today's Classes",
"Monthly Summary" — but "Subject Monitor" and "Adviser View" are internal names. There is
no tooltip, no sub-label, and the group is not explained. The teacher has to click each
one to find out what it is.
Fix: rename to outcome-phrased labels a teacher would recognise (e.g. "Subject Attendance
Overview" / "My Advisory Class") or add a one-line group description in Guided mode. At
minimum align the label with the screen's own `<Page title>` so the breadcrumb and the
nav item agree.

**S2 — "Category set" / "Category" in the Class Record Workspace are unexplained, even in
Guided mode.**
`src/ui/ClassRecordWorkspace.tsx:531-559`; the Guided hint at lines 518-526 talks about
"assessment items" and the Enter/arrow keyboard model but never says what a _category set_
is. This is the first control on the screen and it is core DepEd grading structure
(Written Works / Performance Tasks / Quarterly Assessment). A non-technical teacher faced
with two unlabeled dropdowns called "Category set" and "Category" has to guess.
Fix: add a Guided sentence naming the DepEd component structure and what "set" means
(the weighting group), and consider defaulting + collapsing these until the teacher needs
to add a non-standard item.

**S3 — No path from the Section Roster back into taking attendance for that same
section.**
`src/ui/SectionRosterScreen.tsx` — the only navigation out is "← Back to sections"
(line 834-836). The natural teacher flow section → roster → "now mark today's attendance
for this class" forces: Back to sections → open the Attendance nav item → re-pick the
section from the dropdown. `AttendanceScreen` already accepts `initialSectionId`
(`src/ui/AttendanceScreen.tsx:27`) and `TeacherWorkspaceScreen` already uses that handoff,
so the plumbing exists.
Fix: add a "Take attendance for this section" action on the roster screen that opens
Attendance pre-selected, mirroring the workspace's `onOpenAttendance` handoff.

**S4 — The School-Head overview shows raw ISO dates and spreadsheet jargon to a
principal.**
`src/ui/home/SchoolHeadHome.tsx:210-213` appends the bare ISO string to the "Attendance
today" KPI foot (`… · ${todayIso}` → `… · 2026-09-04`, and `no attendance recorded yet ·
2026-09-04`). Lines 270-275 render recent SF1 imports as `filename · N rows ·
date` — "rows" is spreadsheet language; the teacher imported _learners_. Every other
date in the app is run through a `formatIsoDate`/`toLocaleDateString` helper.
Fix: format the KPI-foot date like the rest of the app ("4 Sep 2026"), and say
`N learners` instead of `N rows`.

### Minor

**M5 — "Daily Teaching" holds seven items, including three that are monitoring/reference
views, not daily doing.**
`src/ui/components/workbench-nav-data.ts:70-81`: today-classes, attendance,
subject-attendance, subject-monitor, adviser-view, teacher-load, monthly-summary. "My
Teaching Load", "Subject Monitor" and "Adviser View" are things a teacher checks
occasionally, not part of the daily attendance/teaching rhythm the group name promises.
Consider a separate "Overview" / "My Classes at a glance" group or moving load/monitor
views there.

**M6 — Learner List uses bare `<p>` for its empty and no-match states while every other
screen uses `<EmptyState>`.**
`src/ui/LearnerListScreen.tsx:453` (`<p>No learners enrolled yet.</p>`) and `:455`
(`<p>No learners match …</p>`). Inconsistent quiet-state treatment; `EmptyState` exists
precisely to stop a teacher reading "nothing here" as "something broke"
(`src/ui/components/EmptyState.tsx:3-9`).

**M7 — "Export SF2 (CSV)" and "Export SF4 (CSV, whole school)" are the only SF buttons
without the plain-language expansion every other one has.**
`src/ui/MonthlySummaryScreen.tsx:357-359` and `:387-389`. Compare
`SectionRosterScreen`'s "Generate SF1 (School Register)", "Export SF5 (Promotion &
Level of Proficiency)", "Generate SF9 (Report Card)" and Learner List's "Export SF10
(Permanent Record)". SF2 is explained in a page hint but SF4 (a school-wide daily
attendance summary) is never spelled out on this screen.
Fix: "Export SF2 (Monthly attendance, CSV)" / "Export SF4 (School attendance summary,
CSV)".

**M8 — Several Class Record Workspace errors are dead ends — a page-level banner with no
Retry.**
`src/ui/ClassRecordWorkspace.tsx:528` renders `{error}` with no action; contributing
paths include "Could not load categories for this set." (`:171-173`), "Could not compute
term grades." (`:473`), and the item-create error branch (`:231-234`). The roster-level
errors on this same screen _do_ have Retry (`:722-728`), so the inconsistency is visible.
Fix: give the page-level banner a Retry that re-runs the failed load/compute.

**M9 — "Could not export the learner list." has no recovery affordance.**
`src/ui/LearnerListScreen.tsx:290` sets the error with no button; the teacher has to
work out that re-clicking "Export learner list (CSV)" is the retry. Most other export
failures in the app follow the same no-retry shape (M8), but the roster/attendance
retries set the better precedent.

**M10 — "School year" KPI shows a bare "—" when sections span different years, with no
explanation.**
`src/ui/home/SchoolHeadHome.tsx:66-69` and `:246`. A school head seeing "—" where a year
should be cannot tell whether data is missing or the school genuinely has mixed years.
Add a `foot`/`hint` ("sections span more than one school year") on that `Kpi`.

**M11 — The "Manage" card on the School-Head Home is two bare buttons with only a space
between them — reads as unfinished for an official overview.**
`src/ui/home/SchoolHeadHome.tsx:280-287` (`<button>Manage sections</button>{" "}<button>SF1
import</button>`). No layout, no spacing rhythm, no context line. The other three cards on
this screen have a list or an `EmptyState`; this one looks like a placeholder.

**M12 — On the phone shell, the signed-in teacher's name and school are not visible
anywhere.**
`src/ui/shell/TopBar.tsx:45-47` is the only place identity is rendered, and
`src/ui/theme/styles.css:1504-1506` sets `.app-topbar-identity { display: none }` at
phone width. The drawer (`Sidebar.tsx`) shows only the brand wordmark — no identity line.
On a shared device (an explicit LIKHA constraint) a teacher on the phone layout can't
confirm whose session they're in without signing out. Android is a later platform, so
this is Minor, but it should be fixed before the phone shell ships.

**M13 — `aria-disabled` buttons stay clickable and silently do nothing, with no feedback.**
E.g. `src/ui/AttendanceScreen.tsx:367-374` — "Mark all present" is `aria-disabled` (not
`disabled`) when the roster is fully marked; clicking it hits an early `return` with no
message. The same pattern is used for "Add item", "Export …", and the submit buttons
across Class Records, Class Record Workspace, Sections, Learner List. The intent
(preserve focus, announce state) is reasonable, but a teacher who clicks a greyed button
and sees nothing happen has no idea why. Consider a short inline note ("Everyone already
has a mark for this date") on the no-op path, or a visibly distinct disabled style.

**M14 — "SF1: Enrollment" nav label uses a colon form and an unexpanded acronym.**
`src/ui/components/workbench-nav-data.ts:37`. The screen itself expands SF1, but the
sidebar item doesn't. "Enrollment (SF1 import)" or "Import learners (SF1)" would read
more naturally next to "Learners" and "Sections" in the same group.

### Informational

**I15 — The Class Record Workspace opens with a four-field item-creation form
(`Category set` / `Category` / `Item name` / `Max score`) before any item exists or is
selected.** `src/ui/ClassRecordWorkspace.tsx:531-588`. Heavy first impression, especially
in Guided. Consider deferring the form behind an "Add assessment item" disclosure once at
least one item exists.

**I16 — The `.page` wrapper class emitted by `Page` has no CSS rule.**
`src/ui/components/Page.tsx:24`. Already recorded in ADR-0064's Wave 6 accepted backlog;
restating so it isn't lost.

**I17 — Two DOM nodes carry `role="group" aria-label="Teacher interface mode"`** — one in
`Sidebar.tsx:134`, one in `TopBar.tsx:37` — with CSS showing exactly one at a time
(`styles.css:1321-1322`, `:1501-1509`). Harmless for a teacher (the hidden one is
`display:none`), but an accessibility reviewer will flag the duplicate accessible name;
worth a note here so it isn't mistaken for a teacher-facing regression. The pressed state
itself is correctly non-colour-only (checkmark `::before` + `font-weight:700` +
background) — the bug the `premium-teacher-ui` skill warns about is not present.

### Positive note

The record-mutating and record-emitting flows are handled with real care and would feel
trustworthy to a non-technical teacher: the Section Roster transfer / end-enrollment /
"correct today's placement" panels each state the consequence in plain language and
distinguish "nothing is deleted" (`SectionRosterScreen.tsx:1402-1418`); assessment-item
delete is a genuine two-step confirm gated to unscored items only
(`ClassRecordWorkspace.tsx:688-708`); and every export (SF2/SF4/SF5/SF6/SF9/SF10, learner
roster, report card) surfaces an explicit "inspired by / not a submission-ready
reproduction of the official form" disclosure plus a list of omitted fields
(`MonthlySummaryScreen.tsx:373-384`, `SectionRosterScreen.tsx:1078-1082`,
`ClassRecordWorkspace.tsx:968-980`, `LearnerListScreen.tsx:581-592`). Error and loading
states on the attendance and score-entry paths are specific and per-row recoverable.

---

## Top 3 to fix first

1. **S1 — clarify the opaque nav labels ("Subject Monitor", "Adviser View", and the
   "SF1: Enrollment" form).** Cheap, high-frequency: it's the first thing every teacher
   reads on every session and currently can't fully parse.
2. **S3 — add "Take attendance for this section" to the Section Roster.** Removes a
   repeated 3-step re-navigation from the single most common teacher workflow; the
   handoff mechanism already exists.
3. **S2 — explain "Category set" / "Category" in Guided mode in the Class Record
   Workspace.** It's the entry point to grade recording and currently expects prior
   knowledge the Guided mode is supposed to supply.

---

## Review-debt disposition

**The teacher-UX review debt for the redesign shell + primitives + role-adaptive Home +
Page re-fit (ADR-0064 Waves 1–6) and for UX-02/03/04 can be marked CLOSED.** No Blocking
issue was found; functional parity across the three modes holds, Guided help is genuine
rather than noise, and the trust-critical flows (delete / end-enrollment / export) are
confirmed and honestly framed. The independent-review debt line for `teacher-ux-reviewer`
in `docs/VERIFICATION-DEBT.md` can be cleared and replaced with the smaller follow-ups
below.

Carry forward as smaller tracked debt (not blocking):

- S1–S4 and M5, M14 — nav-label clarity, the roster→attendance shortcut, the
  Category-set Guided copy, and the School-Head-Home date/`rows` formatting.
- M12 — phone shell shows no signed-in identity; fix before the phone/Android layout
  ships.
- M8/M9 — add Retry to the remaining page-level export/compute error banners.
- Native NVDA/Narrator pass and `npm run quality:ui` (Playwright) across the redesigned
  surface — still owed, already in `docs/VERIFICATION-DEBT.md` (browser binary absent in
  this environment); unchanged by this review.
