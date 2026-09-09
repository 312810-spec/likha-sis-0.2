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

## The Faculty Standard (elevation pass, see `DESIGN.md`)

Full direction and research: `DESIGN.md`'s "Elevation pass: The Faculty
Standard" section. This is the distilled, checkable version — run
through it on every screen you write or touch, not just new ones.

**Before considering a screen "done":**

1. **It uses the shared vocabulary, not hand-rolled markup.** `<Page
title=... hint=...>` (or `<PageHeader>` inside a custom layout) for
   the header, `<Alert>` for error/success/warning/info banners,
   `<EmptyState>` for a no-data state, `<StatusChip>` for any state
   that isn't plain body text, `<Loading>` for loading text. If a
   screen is duplicating what one of these already does, that's the
   bug to fix, not a reason to add a sixth ad hoc pattern. Check with
   `grep -LE "<Page($|[ >])|<PageHeader" src/ui/*Screen.tsx` — as of
   2026-09-09 every screen passes (either directly or by delegating to
   a child that does; `HomeScreen` is the one legitimate exception, a
   pure role-router with no title of its own). Keep this check clean
   on every new screen — a green check today doesn't excuse a new
   hand-rolled header tomorrow.
2. **Depth is assigned by role, not decoration — and the tokens
   already exist.** `styles.css` already has a real, dual-themed
   elevation scale (`--elevation-1`, `--elevation-2`,
   `--elevation-small/medium/pressed`) with real usage in a handful of
   places (search `box-shadow: var(--elevation` to see them). The
   actual gap isn't a missing system, it's that most screens never
   reach for it: flat stays flat (ambient text, never a card), an
   ordinary resting card gets `--elevation-small`, a hover/focus lift
   gets `--elevation-medium`, a drawer/overlay/the one thing on screen
   that must be answered gets `--elevation-2`. Don't invent a
   competing `--shadow-*` vocabulary — extend this one if a genuinely
   new role is needed, don't duplicate it.
3. **Numbers are tabular.** Any column of grades, LRNs, dates, or
   counts gets `font-variant-numeric: tabular-nums` (already a global
   rule in `styles.css` — don't override it locally with a competing
   font-feature declaration).
4. **The one new accent, `--color-accent`/`--color-accent-surface`
   (implemented, muted brass), is earned, not decorative.** Reserve it
   for a genuinely distinguishing moment (a needs-attention eyebrow,
   one section rule) — if you're reaching for it more than once per
   screen, that's a sign it's becoming decoration, not signal. Every
   other color stays the existing token set; don't invent a new hex
   value for a "just this once" case.
5. **Motion explains something or it doesn't ship.** A hover lift, a
   press state, a cross-fade between screen states — yes, if it
   confirms feedback, hierarchy, or continuity. Motion added because a
   screen "feels static" without a specific state it's explaining —
   no. `prefers-reduced-motion` must still collapse it to near-zero,
   same as every existing motion token.
6. **Both themes, still.** Any new token needs real light AND dark
   values, verified with computed contrast the same way `--color-accent`
   was (see `styles.css`'s comment on it) — this project's existing
   token-per-theme discipline (`:root`/`prefers-color-scheme`/
   `[data-theme]`) doesn't get a pass just because a change originated
   from a "premium" pass rather than a feature.
7. **`Source Serif 4` is not yet approved — don't add it.** Public
   Sans is deliberately self-hosted via `@fontsource` with no runtime
   webfont fetch, specifically because this app is offline-first; a
   Google Fonts CDN `<link>` would silently break that promise at a
   school with no internet. Adding a second face means a new npm
   dependency (`@fontsource/source-serif-4` or similar), which this
   project already treats as a flaggable decision (see `--font-serif`'s
   own comment in `styles.css`, deferred once already for the same
   reason). Don't add it without the user explicitly signing off on
   that specific dependency; `--font-serif`'s existing system-stack
   fallback already gets the serif/sans pairing effect at zero cost.

**Enforcement**: this project also has the `impeccable` skill installed,
which ships its own design-detector hook (`/impeccable hooks on`) that
can auto-run after a UI file edit and surface findings — turn it on if
you want an automatic second check beyond this list. Don't hand-roll a
competing PreToolUse hook for this; `.claude/hooks/check-write-edit.cjs`
is a narrow secret/PII scanner and is the wrong place to bolt on design
review.
