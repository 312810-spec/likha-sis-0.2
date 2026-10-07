# ADR-0073 — FORGE Premium UI/UX Program

**Status:** Active implementation branch  
**Branch:** `feat/forge-premium-ui`  
**Scope:** LIKHA-SIS desktop-first shell and teacher workspace refinement

## Context

The approved class-folio direction in ADR-0072 remains the source of truth. This program does not replace it with a generic SaaS dashboard. It applies seven targeted refinement lenses to the existing product:

1. premium dashboard blueprint;
2. useful animated data visualizations;
3. premium dark mode;
4. smooth collapsible navigation;
5. intentional empty states;
6. content-shaped skeleton loading;
7. one master map governing layout, hierarchy, and build sequence.

The product remains a local-first school information and teacher-workspace application. Existing authorization, synchronization, backup/recovery, academic calculations, exports, and teacher workflows must remain behaviorally intact.

## FORGE outcome

A teacher should be able to open LIKHA-SIS and understand, with minimal interpretation:

- what needs attention;
- which class or task is next;
- what changed;
- what remains incomplete;
- which action should happen next.

The hierarchy is therefore **Now → Attention → Next → Insight → Explore**, while the existing class-folio metaphor remains the primary working composition.

## Non-negotiable constraints

- Do not turn the home experience into KPI/bento-card clutter.
- Do not fabricate academic, attendance, synchronization, or administrative state.
- Preserve the distinction between saved locally and transferred/synchronized.
- Preserve keyboard navigation, focus restoration, reduced-motion behavior, and non-color state cues.
- Keep school branding restrained; use it as accent/identity rather than tinting every surface.
- Dark mode uses semantic tokens, not color inversion.
- Motion communicates state change, continuity, hierarchy, or progress only.
- Windows behavior is the first implementation target; phone/Android layouts must not regress.

## Build sequence

### Milestone 1 — Premium shell foundation

- [x] Create isolated implementation branch.
- [x] Add persistent desktop sidebar collapse state.
- [x] Keep phone drawer fully expanded regardless of desktop preference.
- [x] Preserve accessible destination names in icon-only mode.
- [x] Add reduced-motion-compatible collapse transitions.
- [ ] Run final PR CI and repair any regression.
- [ ] Inspect PR-captured desktop/phone screenshots in light and dark appearances.

### Milestone 2 — Design-token refinement

- [x] Add semantic surface, border, interaction, and chart aliases over the existing verified palette.
- [x] Preserve the existing light/dark token source of truth and contrast checks.
- [x] Keep motion on the shared duration/easing tokens.
- [x] Keep school identity restrained to the existing accent/brand surfaces.

### Milestone 3 — Intentional interface states

- [x] Add reusable content-shaped skeletons.
- [x] Upgrade major empty states with purpose/explanation where useful.
- [x] Distinguish successful zero-state from missing-data state (for example, no sync conflicts).
- [x] Preserve exact-action retries for failed operations.

### Milestone 4 — Today / attention hierarchy

- [x] Keep the approved class-folio as the teacher workspace.
- [x] Put verified Next, Attention, and Insight signals before secondary actions.
- [x] Only label a meeting as Now when the saved schedule proves the current time is inside it.
- [x] Replace the school-head bento with a compact summary rail and operational sections.

### Milestone 5 — Data visualization

- [x] Add an attendance snapshot only from the real subject-attendance monitor.
- [x] Keep numeric values visible beside decorative bars.
- [x] Animate entry conservatively and disable animation for reduced-motion users.
- [x] Keep detailed roster/table data as the accessible, inspectable source.

### Milestone 6 — Theme and motion polish

- [x] Preserve semantic light/dark surfaces and add semantic aliases for new work.
- [x] Remove decorative gradient treatment from loading motion.
- [x] Keep school branding restrained rather than tinting every surface.
- [x] Normalize new transitions and chart motion around the shared tokens.

### Milestone 7 — Verification and merge gate

Required before merge:

- TypeScript/typecheck;
- ESLint and formatting;
- architecture checks;
- dead-code check;
- unit/component tests;
- accessibility checks;
- build;
- dev-preview isolation;
- UI smoke coverage;
- visual inspection at desktop and phone widths;
- no regression to existing local-first/sync/security behavior.

## Current implementation checkpoint

The first implementation slice adds a desktop-only collapsible sidebar. The preference is stored as local UI state under `likha-sis:sidebar-collapsed`; it is not academic data and is not synchronized. At phone width the existing off-canvas drawer remains expanded and unchanged.

The collapsed shell keeps each destination's accessible name through `aria-label` and `title`, retains the six approved primary destinations, and uses the existing motion tokens so reduced-motion users receive effectively instant state changes.

## Verification checkpoint

The PR workflow captures UI screenshots while running the existing deterministic UI smoke suite. Final completion requires the latest PR head to pass security, JavaScript/TypeScript quality, accessibility/UI smoke, native checks, and Windows build/tests, followed by inspection of the captured light/dark desktop and phone screenshots.

Merge remains a human approval step under the product rule: AI prepares; teacher reviews; teacher approves.
