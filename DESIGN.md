# Design

**Status**: chosen direction for the UI-First World-Class Product
Program (ADR-0030). Written at UX-00; implemented incrementally starting
UX-01 — this file states the target system, it does not mean every
screen already matches it. `src/ui/theme/styles.css` is the incumbent
implementation as of UX-00 and the evolution baseline (refinement, not
a from-scratch replacement — see "Relationship to the incumbent system"
below).

## Chosen direction: Calm Civic Classroom

**Selected over alternatives, with rationale, not chosen by default.**
The directing prompt offered "Calm Civic Classroom" as a recommended
starting thesis and explicitly authorized proceeding with it or a
stronger Impeccable-recommended alternative without pausing to ask.
Evaluated against LIKHA's own priority order
(privacy/security → correctness → DepEd compliance → teacher usability
→ offline reliability → maintainability → zero billing → performance →
speed):

- It does not ask for anything expensive: no imagery pipeline, no
  brand photography, no licensed asset library — compatible with
  zero-billing and offline-first (a locally-bundled typeface, CSS, and
  the app's own already-built components).
- Its own stated qualities — trustworthy, calm, legible, comfortable
  for repetitive daily work — map directly onto teacher usability and
  the shared-computer/varied-digital-confidence audience `PRODUCT.md`
  already establishes, rather than optimizing for a first-impression
  "wow" a task-completion tool doesn't need.
- A restrained, structure-forward visual vocabulary (ledger/grid
  rhythm, disciplined alignment, one material idea) is easier to keep
  accessible and performant than a heavier, more decorative direction
  would be — it doesn't fight WCAG 2.2 AA contrast/motion requirements
  the way a saturated-gradient or heavy-glass aesthetic would.
- It has no dependency on DepEd/government branding (explicitly
  prohibited — no seal, flag, or implied official endorsement), so it
  doesn't risk correctness/compliance the way a "make it look
  official" instinct could.

No competing direction was seriously weighed against these criteria
this session beyond the prompt's own alternative framing ("or a
stronger Impeccable-recommended alternative") — a fuller multi-concept
comparison pass through Impeccable's own `shape`/`new-work` commands is
reasonable future-session work if the chosen direction doesn't hold up
under UX-01's real component work, but re-litigating the choice from
scratch here would not be a good use of UX-00's already-large scope.

### What it means, concretely

A modern Philippine public-school workbench: precise like a class
record, welcoming like a well-prepared classroom, calm enough for
repetitive daily work. Trustworthy, capable, humane, quietly premium.
Locally relevant without costume or cliché. Distinctive through rhythm,
typography, and detail — not through a mascot, an illustration style,
or a color explosion. Fast and legible on ordinary school hardware.

## Tokens (target — see "Relationship to the incumbent system")

The incumbent token set (`src/ui/theme/styles.css`'s `:root` custom
properties) already covers the _mechanism_ correctly: semantic
color/spacing/typography/sizing tokens, a light/dark pair, and a
teacher-mode density multiplier. What it doesn't yet have is the Calm
Civic Classroom _palette and type_ itself — the current values are a
generic, unbranded neutral-gray-plus-blue system. UX-01 evolves the
existing token mechanism to these values rather than inventing a new
mechanism:

- **Neutrals**: warm paper-like off-whites and warm ink/navy darks,
  replacing the current sterile pure-gray scale. Keep the existing
  `--color-border` ≥3:1 non-text-contrast discipline — recompute for
  the new hex values, don't assume the ratio survives a hue change.
- **Structure/trust**: a deep ink/navy as the primary structural color
  (replacing the current generic blue `#1d5fa8`), used for primary
  actions, focus, and structural chrome.
- **Productive state**: a restrained teal/jade for "in progress" /
  positive-productive state, distinct from the existing green
  `--color-success` (a completed/confirmed state) — evaluate whether
  these should merge into one token or stay two purposeful ones once
  real screens are being touched in UX-01, rather than deciding in the
  abstract here.
- **Attention**: warm sunrise/amber for meaningful highlights — the
  existing `--color-warning` (added this session for the idle-timeout
  banner) is already close to this in spirit; refine its exact hue
  toward the chosen palette rather than replacing it.
- **Destructive/error**: red, reserved strictly for genuine
  destructive/error states — the existing `--color-danger` usage
  pattern is already correct and narrow; keep that discipline.
- **Structural rhythm**: a subtle ledger/grid cue (rule lines, a
  classroom-record-like structure) used as actual layout structure in
  shared components (tables, rosters, the app shell), never as
  decoration layered on top.

## Typography (target)

A locally-bundled, permissively-licensed, highly readable typeface
chosen deliberately for this product — not the current accidental
`system-ui` default, and not a default-SaaS choice picked without
comparison. Selection and bundling (no runtime web-font dependency, per
the directing prompt's performance gate) is UX-01 work, not decided in
this file yet; record the actual choice and its license here once made.

## Composition and Components

Existing shared patterns worth carrying forward as-is into the token
refresh, not rebuilt: the `.field`/`.field-hint` form pattern, the
`role="group"` + `aria-pressed` + non-color `::before` check-mark
pattern already used for mode/section switchers and attendance status
buttons (a real, working WCAG 1.4.1 fix, don't regress it), the
`.visually-hidden` utility, and the phone-width roster-to-stacked-block
pattern in `ClassRecordWorkspace`'s score entry (the one deliberately
mobile-specific layout already in the app).

Real gaps UX-01 should close: no shared button/banner/table component
abstraction yet (each screen repeats its own markup shape against the
shared CSS classes — functional, but not a true component system);
`error-banner`/`confirmation-banner`/`idle-timeout-warning` are three
near-identical banner patterns that could share one component; no
skeleton/loading-state visual pattern beyond plain `<p role="status">`
text; no empty-state visual pattern beyond plain text.

## Responsive Rules

Desktop: productivity density, keyboard-first, tables stay tabular.
Android/narrow: touch-first, thumb-sized targets (≥44px, already the
convention in the one mobile-specific CSS block that exists), full-
width stacked rows rather than a shrunk table — extend this pattern app-
wide in UX-01/UX-07, don't invent a second mobile pattern per screen.

## Motion

None exists in the codebase today beyond ordinary browser-default focus
outlines and CSS `filter: brightness()` on button hover. UX-01 onward
introduces motion only per the directing prompt's timing/easing policy
(100-150ms immediate feedback, 150-250ms routine transitions, 300-500ms
meaningful view transitions; no bounce/elastic easing; every animation
gets a `prefers-reduced-motion` treatment that still preserves state
confirmation). Do not add motion to make the redesign "look animated" —
only where it explains feedback, state, hierarchy, or continuity, per
the "ledger continuity" signature idea named in the directing prompt.

## Accessibility

WCAG 2.2 AA is the explicit floor (see `PRODUCT.md`). The incumbent
implementation already has real, hard-won accessibility work worth
protecting through the redesign, not discarding: the non-color state
cues (WCAG 1.4.1, fixed once already after shipping the bug — see
`.claude/skills/premium-teacher-ui/SKILL.md`), the `--color-border`
non-text-contrast discipline, the 24px minimum checkbox/radio target
size floor that doesn't shrink with teacher-mode density, and the
`.visually-hidden` pattern for redundant-but-required accessible names.

## Anti-Patterns (project-specific, extends the directing prompt's general list)

- Do not restyle SF2/report-card export layouts for visual taste — their
  structure is fixed by the DepEd source they're inspired by.
- Do not use DepEd's seal, government marks, the Philippine flag, or
  school branding, or imply official DepEd endorsement.
- Do not let Efficient/Comfortable/Guided differ in capability, only in
  density/copy/help — a mode difference that removes or restricts a
  control is a bug, not a design choice.
- Do not infer `prefers-reduced-motion` from teacher mode, device, age,
  or role — it is queried directly, always.

## Relationship to the incumbent system

Per `reference/new-work.md`'s framing (refinement preserves; redesign
replaces): this is a **refinement**, not a redesign-from-scratch. The
incumbent identity (teacher-first, calm, accessible, three-mode parity),
behavior, and copy are preserved and extended with the actual Calm
Civic Classroom palette/type/rhythm — the old CSS is evolution
material, not anti-reference to be thrown out. No screen's function,
DepEd-compliance behavior, or authorization boundary changes as a
result of this file.
