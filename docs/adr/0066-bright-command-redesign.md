# ADR-0066 — Bright Command redesign: app shell (header + sidebar)

Status: Accepted (in progress — this ADR covers the app-shell checkpoint only)

## Context

`docs/adr/0030` through `0033` established and implemented "Calm Civic
Classroom": a deliberately restrained, low-decoration direction chosen
because the audience (Filipino public-school teachers, often on a
shared computer, with varied digital confidence and vision) was judged
better served by calm, trustworthy, non-decorative UI than by visual
spectacle. `DESIGN.md` stated this explicitly: "Trustworthy over
impressive," "no SaaS-dashboard framing," "no KPI-card decoration."

The product owner explicitly asked for a full reversal of that
direction: "make it look like [a] multimillion dollar designer... it
must have a dashboard, a dedicated header." Asked directly whether to
keep the calm foundation and only raise craft, or fully replace it even
at the cost of the low-distraction reasoning behind the old direction,
the owner chose the full replacement. The owner then supplied a
concrete visual reference (a Behance case study, "School Management
Dashboard UI Design I Admin Panel" by Opedia Studio) as six screenshots
after this session's network egress proxy blocked fetching the URL
directly (`docs/VERIFICATION-DEBT.md`'s standing "session network
egress blocks all external fetch" entry).

## Decision

Adopt "Bright Command": a glossy, energetic edtech-SaaS dashboard
direction, replacing Calm Civic Classroom, built from the supplied
reference's own working system (per `new-work.md`'s "catalog worlds are
working systems, not mood references" instruction) — its palette,
typeface, card language, and topology carried into LIKHA-SIS's own real
content, not the reference's content.

**Palette** (`src/ui/theme/styles.css` `:root`, every pair computed
WCAG contrast, not eyeballed — see the file's own inline comments for
exact ratios): a bright near-white/pale-lavender canvas (`--color-bg:
#f6f5fc`), vivid indigo-violet primary (`--color-primary: #4b2fd9`,
8.34:1 on bg), and a warm orange-gold gradient accent
(`--gradient-accent`, `#f9b72f` → `#ff8633`) matching the reference's
own two-color brand pair. The accent color is explicitly restricted to
large/bold text, icons, and non-text fills — it only clears 3.44:1 on
its own, short of the 4.5:1 body-text floor — documented inline so a
future edit doesn't drop it into small text. A parallel dark-mode
palette was computed and verified independently, not derived by a
blind invert.

**Typography**: Nunito (OFL-1.1, self-hosted via `@fontsource`) —
pinned by the reference's own style guide, per this skill's "the brief
wins... honor pinned aesthetics... fonts" rule. `@fontsource/public-sans`
is kept, scoped to `--font-numeric` only, for its already-verified
tabular-figure alignment on grade/LRN/date tables — real, hard-won
legibility work that predates and is independent of this typeface
swap, not discarded for consistency's sake. See
`docs/SOURCE-REGISTRY.md`.

**App shell structure** (`src/ui/AppShell.tsx`): replaced the single
horizontal header bar with a persistent left sidebar (brand mark +
grouped navigation, `WorkbenchNav` now rendered vertically with a
pill-highlighted active item) plus a sticky glass header (segmented-pill
mode switcher using the gradient accent, an avatar-initials + name/school
session chip). `AppShell` gained a `nav` prop so `App.tsx` and
`src/dev-preview/DevPreviewApp.tsx` pass `WorkbenchNav` into the
sidebar rather than rendering it as the first child of `main`. Below
900px width the grid collapses to a single column with the nav as a
horizontal chip strip, extending the existing narrow-viewport pattern
rather than inventing a second one.

**What this ADR does NOT cover**: no fabricated data or feature. The
reference's "Students / Teachers / Awards" stat tiles, donut "Course
Statistics," "Star Students" table, and "Upgrade to Pro" promo card are
reference-only decoration this pass did not carry over verbatim — this
app has no teacher-count/awards/subject-score-aggregate data on this
screen today, and no paid tier to upsell (`PRODUCT.md`'s zero-billing
constraint). A dashboard-style stat-tile treatment of this screen's own
_real_ data (learner/section counts, today's completion) is scoped as
the next slice, not invented here to chase the reference's literal
content.

**Accessibility retained, not traded away**: `PRODUCT.md`'s own Product
Principles state accessibility is never traded for visual spectacle
even under this bolder direction. Every new color pair is computed
against the same WCAG AA floor the prior direction used; the WCAG 1.4.1
checkmark non-color cue on pressed nav/mode-switcher state (previously
fixed as a real bug in this codebase) was kept visible, not hidden for
a cleaner look — an early draft of this change moved it off-screen and
was corrected before shipping.

## Consequences

- `DESIGN.md`'s "Calm Civic Classroom" section is now superseded for
  the app shell; the rest of `DESIGN.md` (per-screen work for
  Learner/Section/Grading/Auth screens) still describes the old
  direction until each screen is redesigned in a future slice.
  `DESIGN.md` itself has not yet been rewritten end-to-end — recorded
  as owed, not silently left stale.
- Every existing screen still renders correctly under the new tokens
  (shared components — `Alert`, `Loading`, `StatusChip`, `PageHeader`,
  the `attendance-roster`/`monthly-summary` table styles — inherit the
  new palette automatically), but only the app shell itself has been
  deliberately re-composed. Individual screens' own bespoke layouts
  (stat tiles, dashboard framing) are not yet redesigned.
- No business logic, computation, authorization, or DepEd-compliance
  behavior changed — this is a visual/structural-only change to
  `AppShell.tsx`, `styles.css`, and the two call sites that render
  `WorkbenchNav`.

## Verification

`npm run quality` (869/869 tests, typecheck/lint/format/architecture
clean), `npm run build` clean, `npm run check:dev-preview-isolation`
clean (51 files scanned). Real browser-rendered verification via the
documented `playwright-cli`-mismatch workaround (`chromium.launch({
executablePath: "/opt/pw-browsers/chromium" })` against `vite dev`'s
dev-preview): screenshots taken and inspected directly at desktop
(1440px, light and dark) and narrow (800px, light) widths — not just
claimed. No independent design review was dispatched for this
checkpoint (recorded as owed, not skipped silently) — this ADR itself,
plus the direct screenshots, is the verification record for now.

## Next slice

Redesign `TeacherWorkspaceScreen.tsx` into a real dashboard treatment
(stat tiles for learner/section/completion counts, a donut or ring
visualization of today's real marked/total split) using this shell's
new token system and only this screen's own real, already-fetched
data — no fabricated metrics. After that, extend the direction
screen-by-screen (Learners, Sections, Grading, Auth) rather than
attempting all of them in one pass, and rewrite `DESIGN.md` end-to-end
once enough of the surface is actually built to describe truthfully.
