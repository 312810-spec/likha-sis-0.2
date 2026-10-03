# ADR-0073: assigned class worksheet and concept navigation

Date: 2026-10-03. Status: implemented on the redesign branch.

## Decision

The owner requested complete UI/UX replacement against the approved class-folio image, with Prompt Master establishing the frontend engineer role first. The bounded implementation brief is `docs/design/class-folio/FRONTEND-IMPLEMENTATION-BRIEF.md`. This extends ADR-0072 beyond a visual reskin.

Dashboard now consumes authorized teaching assignments instead of the school-wide section overview. A persistent class index controls an opaque worksheet with Overview, Scores, and Forms. The real grading journey stays inside Scores, retains visited state across worksheet tabs, and still requires explicit academic choices. Attendance handoff retains the assignment and revalidates authority. Login starts on Dashboard.

Desktop navigation is Dashboard, My Advisory, Class Record, School Forms, Calendar, and More. Phone navigation is Today, Classes, Forms, and Account. More preserves the existing tools, including the daily teaching planner and record management. Account houses Light/Dark/System, density, and sign-out. School Forms links real supported review/import/export workflows; Calendar shows authorized recurring schedule meetings for a chosen date and discloses that holidays/cancellations are not included.

## Design reasoning and deliberate differences

The supplied school seal, saturated selected-class tab, three-column register, understated worksheet tabs, and aligned rows supply the product identity. The actual configured seal is used in production; preview branding and records remain synthetic.

[apple-design-skill](https://github.com/dickwu/apple-design-skill) was read with accessibility, layout, typography, color, desktop design, sidebars, split views, tabs, dark mode, and cross-platform references. The relevant principles are persistent selection (`split-views.md`, Best practices), legible adaptable text (`accessibility.md`, Vision), and grouped progressive disclosure (`layout.md`, Visual hierarchy). This is React/Tauri on Windows with a responsive mobile browser layout, so Apple-specific native chrome is not imitated. The owner requested custom global school theming and a dark-mode setting; System remains the default and explicit preference persists locally.

The concept's sample scores, grade level, term, and SF9/SF2 illustrations are not invented in production. Overview shows sourced subject attendance totals. Scores uses selected grading records. Advisory authority and official attendance remain separate from subject attendance. Existing exports retain their form-inspired disclosures and are not presented as official submission-ready forms.

Two independent reviewers assessed the actual desktop and phone captures. Review found and resolved the embedded Back-to-class no-op, sign-in destination retention, and worksheet-tab draft loss. Shared components, security rules, academic services, native backups, and sync remain intact.

## Verification

Frontend quality, production build, preview-isolation check, and browser smoke cover this implementation. Browser evidence includes both appearances, three density settings, 1440/1024/390/320px widths, accessibility, assigned class switching, preserved score tabs, scoped attendance, Forms, advisory monthly preview, Calendar, Account, More, and final-control footer clearance. Screenshots are reproducible with `LIKHA_CAPTURE_UI=1 npm run quality:ui`.

Windows installed-app visual review and physical-device native validation remain release checks; responsive browser evidence does not establish Android readiness.
