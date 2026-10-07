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
- [ ] Run CI and repair any regression.
- [ ] Perform rendered desktop/phone visual review.

### Milestone 2 — Design-token refinement

- Expand semantic surface, border, interaction, and chart tokens.
- Review light/dark contrast.
- Define teacher-facing elevation and motion levels.
- Eliminate remaining hardcoded UI colors where they bypass the theme system.

### Milestone 3 — Intentional interface states

- Replace generic loading text where layout is predictable with content-shaped skeletons.
- Upgrade empty states to explain purpose, reason, and next action.
- Distinguish successful zero-state (for example, no conflicts) from missing-data empty-state.
- Keep exact-action retries for failed operations.

### Milestone 4 — Today / attention hierarchy

- Refine the teacher landing experience without replacing the approved folio.
- Surface immediate work first: current/next class, incomplete attendance, pending records, conflicts, or local unsent changes only when supported by real services.
- Avoid ornamental metrics.

### Milestone 5 — Data visualization

- Add charts only where they improve a teacher decision.
- Animate initial/update transitions conservatively.
- Provide textual/table alternatives and honor `prefers-reduced-motion`.

### Milestone 6 — Theme and motion polish

- Refine dark surfaces, control outlines, hover/pressed/focus states, and account overlays.
- Verify school-logo-derived accent behavior remains restrained.
- Normalize motion durations and easing around the shared tokens.

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

## Next implementation slice

After CI is green, implement **intentional loading + empty-state primitives** before changing dashboard content. This creates reusable quality improvements without coupling the redesign to unverified new data sources.
