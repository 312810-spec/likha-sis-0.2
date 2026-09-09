# ADR-0078: Live Logo Palette Wiring — Global Dark-Mode Token Override, No Persistence

Status: Accepted

## Context

ADR-0075 (Batch 4) built `src/domain/palette.ts` — a dependency-free
dominant-color extractor plus a WCAG-AA-verified dark-mode
accent/surface/text token deriver — but explicitly left it unwired to
any live screen ("a thin UI-side glue component (not yet wired to a live
screen this batch)"). Batch 8 item 6 closes that gap: draw the school's
uploaded logo to a canvas, feed its pixels through `derivePaletteTokens`,
and apply the result in place of the static dark palette in
`styles.css` when a logo exists, falling back cleanly otherwise.

`AppLayout` already fetches the current school logo once (as an object
URL) for the `Sidebar`/`TopBar` image — this is the natural, already-
shared source of logo bytes rather than a second fetch.

## Decisions

### 1. Apply derived tokens as a single injected `<style>` override, dark-mode only

`useLivePalette` (`src/ui/theme/useLivePalette.ts`) draws the logo to an
offscreen `<canvas>`, calls `derivePaletteTokens`, and — only when
`meetsAa` is true — injects/updates one `<style id="live-palette-tokens">`
element in `document.head` with two rules: `:root[data-theme="dark"]`
(explicit dark choice) and the `@media (prefers-color-scheme: dark)`
guarded `:root:not([data-theme="light"])` block (system dark). Both
mirror `styles.css`'s own existing dark-mode selectors exactly, so the
override only ever competes with the static dark rules, never the light
palette — a logo never changes the light theme, which
`derivePaletteTokens` was never asked to verify contrast for. No logo,
a decode failure, no canvas 2D context, or a derived pair that fails AA
all resolve to the same thing: the style element is removed and the
existing static palette applies unchanged. This is a hard requirement,
not a nicety — an unverified/failed pair must never reach the DOM.

**Alternative considered and rejected**: writing derived values directly
onto `document.documentElement.style` (inline custom properties). Inline
styles have higher specificity than any stylesheet rule including
`:root[data-theme="light"]`, so an inline override would leak into light
mode too (or need duplicate light-vs-dark inline-write logic). A
same-specificity, later-in-cascade `<style>` element confined to the
same selectors the static rules already use avoids that entirely and
keeps the "dark-mode only" guarantee structural, not conditional logic
that could drift.

### 2. Wired once in `AppLayout`, not per-screen

`useLivePalette(logoUrl)` is called once, in `AppLayout`, using the same
`logoUrl` object URL already fetched there for the sidebar/topbar logo
image — not duplicated per screen, and not added to `composition.ts`
(this is UI-layer DOM/canvas glue, not an application service; per
`palette.ts`'s own doc comment, the module stays UI-import-free and
`useLivePalette` is the "small piece of UI glue" it anticipates). The
whole signed-in app re-themes together whenever the logo changes,
exactly like the existing `ColorThemeContext` light/dark toggle.

### 3. No persistence, no new repository/command

The derived tokens are recomputed client-side from the logo every time
`AppLayout` mounts with a logo present. Nothing is written to the
database or synced — this is pure presentation derived from data
(the logo bytes) already persisted and fetched for an unrelated reason.
If recomputing on every load becomes a measured performance problem,
caching the derived tokens is a candidate follow-up, not a decision this
ADR needs to make now.

## Consequences

- A school with a bright/dark logo that yields an AA-verified pair gets
  a personalized dark-mode accent + surface + text; every school without
  a logo, or whose logo's dominant color can't clear AA even after the
  deriver's darken/lighten search, keeps today's static Calm Civic
  Classroom dark palette unchanged.
- `--color-surface-2`, `--color-border`, `--color-border-soft`, and every
  other dark-mode token stay static even when the logo override is
  active — only `--color-primary`/`--color-surface`/`--color-text` are
  derived. A logo whose accent clashes badly with the untouched
  secondary tokens is a known, accepted visual-polish limitation of this
  slice, not a correctness bug (nothing fails AA; the mismatch is purely
  aesthetic). A follow-up could derive a fuller token set if this proves
  to matter in practice.
- Testable without a real image decode: `computeLivePaletteStyleText`
  (pixels -> CSS text or `null`) and `applyLivePaletteStyle` (CSS text or
  `null` -> DOM) are pure/DOM-only halves exported separately from
  `useLivePalette` itself, which is the only piece that touches
  `Image`/canvas — see `useLivePalette.test.ts`.

## Deferred / explicitly out of scope

- Light-mode token derivation. `derivePaletteTokens` only verifies the
  dark accessible pair; extending it to a light-mode-safe pair is new
  domain-layer work, not part of this wiring slice.
- Deriving `--color-surface-2`/`--color-border`/etc. from the logo too
  (see Consequences above).
- Any server-side/synced storage of derived tokens.
