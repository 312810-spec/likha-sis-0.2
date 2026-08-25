# Design

**Status**: chosen direction for the UI-First World-Class Product
Program (ADR-0030), written at UX-00. **As of UX-01 (ADR-0031), the
token palette, typography, and shared component set below are
implemented** in `src/ui/theme/styles.css` and `src/ui/components/` —
not just a target anymore. **As of UX-02 (ADR-0032), the Teacher
Workspace screen's own information hierarchy and visual treatment are
implemented and pixel-verified** through a dev-only fixture
(`src/dev-preview/`). What's still target-only: the per-screen visual
polish of Attendance/Gradebook/Learner/Section/Auth/Audit belongs to
UX-03 through UX-06, which have not started.

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

## Tokens (implemented, UX-01 — see ADR-0031)

`src/ui/theme/styles.css`'s `:root` custom properties now carry the Calm
Civic Classroom palette, every pair verified with computed WCAG
contrast (full ratio table in ADR-0031, not just asserted):

- **Neutrals**: warm paper `#fbf8f2`/`#f3eee3` (light), warm ink-navy
  `#14181d`/`#1c2129` (dark) — replacing the prior sterile pure-gray
  scale. `--color-border` (`#8a7f6e` light / `#6f7b87` dark) keeps the
  ≥3:1 non-text-contrast discipline, recomputed for the new hues.
- **Structure/trust**: deep ink/navy `--color-primary` (`#1e3a5f`
  light / `#8fb4dd` dark), replacing the prior generic blue.
- **Productive state**: `--color-productive` (`#0f6b5c` light /
  `#6fccb9` dark), kept as its own token distinct from
  `--color-success` (completed/confirmed) rather than merged, since the
  two real usages that emerged during UX-01 (an in-progress attendance
  count vs. a fully-confirmed export) are genuinely different states.
- **Attention**: `--color-warning` darkened from the prior
  `#8a5a00` draft to `#8f5209` — the lighter draft only reached 4.10:1
  text contrast, short of AA.
- **Destructive/error**: `--color-danger` unchanged (`#a3271f` /
  `#ff9c94`) — already correct and narrowly scoped.
- **Structural rhythm**: the nav's grouped clusters (`.nav-group`, a
  vertical rule between groups) and the active-item selection-rule
  underline are the first real application of the ledger/grid rhythm
  idea — used as layout structure, not decoration.

New non-color tokens: `--font-family`/`--font-numeric`,
`--font-size-small`, `--line-height-base`, `--content-width`/
`--content-width-wide`, `--radius-large`, `--elevation-1`,
`--focus-ring-width`/`--focus-ring-offset`, and the
`--motion-duration-*`/`--motion-easing-*` group (collapsed under
`prefers-reduced-motion` in one shared rule).

## Typography (implemented, UX-01)

**Public Sans** (`@fontsource/public-sans@5.3.0`, OFL-1.1), self-hosted
— no runtime webfont fetch. Chosen over Atkinson Hyperlegible Next and
Inter (all three compared, all real/legitimate/OFL-licensed) for its
civic/government-digital-service design heritage, matching "Calm Civic
Classroom" thematically without using any government mark, plus strong
legibility and tabular-figure support for grades/LRNs/dates. Only
weights 400/600/700 imported (what the app actually uses).
`font-variant-numeric: tabular-nums` applied globally so numeric
columns align. See `docs/SOURCE-REGISTRY.md` and ADR-0031.

## Composition and Components

Existing shared patterns worth carrying forward as-is into the token
refresh, not rebuilt: the `.field`/`.field-hint` form pattern, the
`role="group"` + `aria-pressed` + non-color `::before` check-mark
pattern already used for mode/section switchers and attendance status
buttons (a real, working WCAG 1.4.1 fix, don't regress it), the
`.visually-hidden` utility, and the phone-width roster-to-stacked-block
pattern in `ClassRecordWorkspace`'s score entry (the one deliberately
mobile-specific layout already in the app).

**Closed in UX-01** (ADR-0031): `Alert` consolidates
`error-banner`/`confirmation-banner`/`idle-timeout-warning` into one
component (error/success/warning/info tones), migrated everywhere;
`Loading` consolidates the loading-paragraph pattern, migrated
everywhere; `EmptyState`, `StatusChip`, `PageHeader`, and `NavItem` are
new, each with at least one real migrated usage proving reuse (full
list in ADR-0031's table) without redesigning any screen's own
information architecture. `Button` was deliberately left as the
existing CSS-class pattern (`.button-primary` etc.) rather than wrapped
in a new component — no markup duplication existed to consolidate.

## Teacher Workspace (implemented, UX-02 — see ADR-0032)

The first screen-level application of the direction above, and the
first authenticated screen this program has pixel-verified end to end
(via the new `src/dev-preview/` fixture — see ADR-0032 §1). A
three-level hierarchy, not a second dashboard: a dominant "Today's
priority" ledger rail (one bordered list, left-accent-bar per row by
attendance state — not N separate cards), a single-sentence "useful
overview" (no KPI-card decoration), and a visually secondary "quiet"
recent-activity list. Status is always conveyed by a text `StatusChip`
label alongside its color, never color alone. The only content
reordering in this program so far — sections sorted by a documented
deterministic attendance-priority rank — carries its rationale in code,
not just in this doc. Confirmed at three viewports, two color schemes,
and all three teacher modes: no card-spam, no SaaS-dashboard framing,
full functional parity across modes (Guided mode's extra copy pushes
content below the fold but never removes it).

## Responsive Rules

Desktop: productivity density, keyboard-first, tables stay tabular.
Android/narrow: touch-first, thumb-sized targets (≥44px, already the
convention in the one mobile-specific CSS block that exists), full-
width stacked rows rather than a shrunk table — extend this pattern app-
wide in UX-01/UX-07, don't invent a second mobile pattern per screen.

## Motion (first treatment implemented, UX-01)

Motion tokens (`--motion-duration-immediate/routine/meaningful`,
`--motion-easing-standard/exit`) defined once in `:root`, collapsed to
`0.01ms` under one shared `prefers-reduced-motion: reduce` rule so every
component using them complies automatically. The one "ledger
continuity" treatment so far: a selection-rule underline beneath the
active nav item (`transform: scaleX()` + `opacity`, 200ms,
`--motion-easing-standard`) — see ADR-0031. Buttons also gained a
120ms `filter`/`background-color` transition on hover/press (previously
instant). Do not add motion to make a screen "look animated" — only
where it explains feedback, state, hierarchy, or continuity.

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
