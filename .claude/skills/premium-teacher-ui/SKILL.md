---
name: premium-teacher-ui
description: Use when building or editing screens in src/ui, or making any visual/interaction design decision for the teacher-facing app.
---

# Premium Teacher UI

Three modes, one functional surface: Efficient / Comfortable / Guided.
**Comfortable is the default.** All three must retain full functional
parity — Guided is not "the same screen with a tooltip," it renders
genuine contextual help other modes don't show (see
`docs/adr/0005-app-shell-and-first-ui-slice.md` for the concrete pattern
used in `LoginScreen`/`LearnerListScreen`).

Pattern:

- New screens go in `src/ui/`, receive their `*ApplicationService`s as
  props (never import `src/composition.ts` directly, so they stay
  testable with fakes).
- Check `useTeacherMode()` before assuming Guided-only content isn't
  needed.
- Don't rely on color alone to convey state (WCAG 1.4.1) — this project
  has shipped that bug once (mode switcher's pressed state).
- Give interactive controls visible loading/confirmation states — this
  project has shipped missing-loading-state and missing-confirmation bugs
  once each.

**Standing limitation:** no browser/screenshot/rendering tool is
available by default in this environment. You cannot verify actual visual
layout, spacing, or "does it feel premium" — only structural/behavioral
tests (React Testing Library) and computed contrast ratios. State this
plainly rather than implying visual verification happened; see
`docs/VERIFICATION-DEBT.md`. If `@playwright/cli` is set up (see the
`playwright-cli` skill), it can drive `vite dev` in a real browser for a
partial check — still not the compiled native app.
