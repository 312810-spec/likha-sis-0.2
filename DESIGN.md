# Design

## Current direction: school class folio

The product owner approved the class-folio concept on 2026-10-03 and requested dark mode. [ADR-0072](docs/adr/0072-school-class-folio-and-appearance.md) supersedes the earlier Calm Civic Classroom palette and home layout in ADR-0031/0032. Those ADRs remain historical evidence of behavior and accessibility requirements.

The interface is a teacher's working register: a persistent class or section index beside an opaque working sheet. Use the school seal sparingly for identity; take its royal blue into the global action theme. Apple guidance supplies restraint, hierarchy, alignment, and clarity. Windows and Android conventions, teacher comprehension, and existing workflows determine the controls.

## Shared theme

All screens use semantic CSS variables in `src/ui/theme/styles.css`, not individual hardcoded palettes. Light, Dark, and System appearance are independent of Efficient, Comfortable, and Guided density. Appearance is a local device preference, never academic or synchronized data.

| Role             | Light     | Dark      |
| ---------------- | --------- | --------- |
| Canvas           | `#f6f7fa` | `#141722` |
| Navigation/index | `#eef0f6` | `#1b1f2d` |
| Working sheet    | `#ffffff` | `#222737` |
| Text             | `#172033` | `#f0f2fa` |
| Secondary text   | `#586174` | `#b3bbcf` |
| Primary action   | `#2536c4` | `#b8bdf8` |
| Action text      | `#ffffff` | `#181b40` |
| Control outline  | `#7a8192` | `#8993aa` |

Decorative dividers use a separate soft token; they are never the only control boundary. Success, warning, danger, and productive states have independent readable text/surface pairs. `scripts/palette-contrast.test.mjs` checks these actual CSS values after formatting.

## Typography and composition

Public Sans stays self-hosted with weights 400, 600, and 700 and tabular figures. No font or image network request is required by production. Use restrained headings, compact labels, generous separation between task groups, and aligned table columns. Body and secondary reading text scale with the teacher's interface mode.

Dashboard lists the signed-in teacher’s authorized subject assignments beside a selected worksheet. Overview, Scores, and Forms are working tabs. Overview uses real subject attendance totals; Scores embeds the real class-record journey with explicit term and weighting choices. Visited Scores stays mounted across worksheet tabs so drafts and failed edits remain available. My Advisory owns official advisory attendance. Class Record opens the assigned worksheet in Scores; More keeps the legacy management tools and daily planner reachable.

Phones use a compact, scrollable assigned-class list and Today / Classes / Forms / Account navigation. Keep the selected context and one primary action ahead of the register. Folio touch controls are at least 48px tall. Keep wide monthly grids in bounded scroll regions; do not shrink or obscure learner names. Preserve the existing stacked score-entry and attendance layouts.

## Existing behavioral contracts

- Keep the shared `Alert`, `Loading`, `EmptyState`, `StatusChip`, `Page`, and `PageHeader` patterns and independent errors/retries.
- Preserve per-row saving feedback, exact failed-action retry, and attendance keyboard shortcuts. Do not invent Saved/Synced claims from visual state.
- Keep all capabilities in every teacher mode; Guided adds contextual explanation.
- Preserve drawer focus trapping, Escape, focus restoration, skip navigation, visible keyboard focus, labeled controls, table headers/captions, and non-color state cues.
- Honor `prefers-reduced-motion` directly. Motion explains a state change; it is never decoration.
- Secondary sign-in activity and pending work use disclosures. Existing tasks and permissions remain intact.

## Avoid

- Generic KPI/bento dashboards, greeting heroes, gradients, repeated decorative icon tiles, or a separate Open Record pill on every row.
- Glass over learner records, grades, or dense controls.
- Unsupported tabs or placeholder features in order to imitate a concept image.
- Rebranding official exports, changing grading rules, or implying DepEd endorsement. In-app school branding is allowed; official form branding is governed separately.
- Treating UI context as authorization. Application and native boundaries remain authoritative.

## Evidence

Actual rendered screenshots: [class folio](docs/design/class-folio/README.md). Run `npm run quality` for source checks and tests, then `npm run build` and `npm run check:dev-preview-isolation`. `npm run quality:ui` exercises appearance, density, responsive layout, and connected workflows through the isolated synthetic preview. Packaged Windows and physical Android verification remain release checks.
