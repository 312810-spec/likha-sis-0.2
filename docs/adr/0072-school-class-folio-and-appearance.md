# ADR-0072: School class folio and explicit appearance

Status: Accepted

Date: 2026-10-03

## Context

The product owner approved the researched class-folio concept and requested implementation plus dark mode on a branch from main. The supplied school seal establishes the brand palette. Apple design guidance informs hierarchy, clarity, restraint, typography, and accessibility; this remains a Windows and Android product with a custom shared theme.

Reference: [apple-design-skill](https://github.com/dickwu/apple-design-skill), including its accessibility, layout, typography, color, branding, sidebar, and list/table guidance. The owner's global school theme and explicit dark-mode request take precedence over native-theme defaults.

## Decision

- Share semantic light and dark CSS tokens across the entire app. The seal's royal blue becomes a contrast-safe action blue (`#292db0` light, `#b8bdf8` dark). Content stays opaque; no glass over registers or scores.
- Expose System, Light, and Dark appearance. System tracks OS changes; explicit choices override the OS. Remember the preference locally per device, separately from teacher density, authentication, school records, and sync. Disabled storage does not break the current choice.
- Replace the teacher home greeting and repeated attendance action rows with one section index and one selected section register. Preserve the existing attention ordering and per-school-year grading lookup. Home's existing data is a section list, so label it **Sections**, without claiming it is an authorized subject-assignment list.
- Preserve the schedule index while a teacher works inside a subject class in My Day. Attendance and Class Record actions keep the existing assignment identifiers and application-service revalidation. Distinguish repeated meetings of the same assignment by their start time.
- Use a labeled class/section picker on phones rather than horizontally scrolling cards. Keep the class identity, term context, and primary action above the register. Mobile folio controls are at least 48px high.
- Put secondary sign-in activity behind a disclosure; retain independent loading/error/retry behavior. Collapse pending-work disclosure while a class is selected; tasks remain accessible.
- Preserve Efficient/Comfortable/Guided parity, drawer focus trapping, Escape/focus return, skip navigation, semantic tables, non-color selection rules, status text, and reduced motion.
- Print on white paper regardless of appearance; appearance does not alter exported reports or academic policy.

## Scope and boundaries

This slice implements the global theme, shell styling, teacher home, and My Day/class-workspace composition. It does not invent Scores/Forms tabs or placeholders: the existing class-record workflow remains reachable, and still requires explicit grading-period and weighting choices. No schema, grade formula, permission, native command, sync behavior, or official export format changes.

The development preview uses only synthetic records. The small school seal is a design reference asset inside `src/dev-preview`, not a production default or exported official-form logo. Its My Day scenario is deliberately fixed for visual checks; production reads the real day's authorized summary.

## Verification

- `scripts/palette-contrast.test.mjs` calculates contrast from the actual formatted CSS: normal/secondary/action text at least 4.5:1; control borders at least 3:1; semantic status text and action labels at least 4.5:1.
- Appearance tests exercise OS changes, explicit overrides, persistence, invalid values, and unavailable storage.
- Existing workflow tests verify real identifiers, retry states, ordering, grading context, and accessibility; class-index selection adds direct regression coverage.
- Browser smoke covers 1440, 1024, 390, and 320px; both explicit appearances; all three teacher modes; WCAG A/AA axe checks; reload persistence; class switching; and attendance/class-record handoffs.
- Screenshots in `docs/design/class-folio` show the actual shared React components with synthetic records, not generated concept art.
- Linux Chromium browser evidence does not replace packaged Windows/Tauri or physical Android validation. Those checks remain necessary before release.
