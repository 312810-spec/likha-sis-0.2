---
name: accessibility
description: Use when building or editing any screen/component in src/ui, or when asked about WCAG/accessibility compliance.
---

# Accessibility

Every new screen gets a structural accessibility test using
`expectNoAccessibilityViolations(container)` from `src/test/a11y.ts` (a
direct `axe-core` wrapper — `vitest-axe` was tried and dropped as
unmaintained with types that don't match Vitest 4.x).

Lessons already paid for in this codebase — check for these specifically:

- Compute actual contrast ratios from real hex values for any
  border/text/icon color against its background; don't estimate. A
  project-wide `--color-border` once measured ~1.3–1.6:1, well under the
  3:1 WCAG 1.4.11 minimum for UI component boundaries.
- Never convey state (selected/pressed/error) by color alone (WCAG
  1.4.1).
- Interactive targets (checkboxes, radios, small buttons) need at least
  24×24px hit area in every teacher mode (WCAG 2.2 SC 2.5.8) — this
  failed in two of three modes once.
- Link hint text to its field via `aria-describedby`, not just visual
  proximity.
- Manage focus on screen transitions.

Automated `axe-core` results are necessary, not sufficient. A human and a
real screen-reader (NVDA/Narrator) pass on the compiled app is a separate,
still-owed requirement — see `docs/VERIFICATION-DEBT.md`. Don't imply
automated coverage substitutes for it.
