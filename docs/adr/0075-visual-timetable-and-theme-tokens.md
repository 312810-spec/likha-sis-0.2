# ADR-0075: Visual Timetable / Class Program Builder, Theme Token Extensions, and Logo Palette Extraction

Status: Accepted

## Context

Batch 4 of `docs/product/MASTER-TASK-INVENTORY.md` §3.1-3.2 asks LIKHA to
port the _intent_ of `likha-sis-master`'s (the Next.js/Firebase reference
project) UI/theme direction and its Visual Timetable / Class Program
Builder — not its stack. This project already has its own shell
(ADR-0064's `AppLayout`/`Sidebar`/`TopBar`, Wave 1) and its own token
system (ADR-0031's Calm Civic Classroom palette, `styles.css`), so this
ADR extends those, it does not replace them. It also already has
per-class weekly scheduling with server-side conflict rejection
(`docs/adr/0039-teacher-load-class-schedule-foundation.md`,
`schedule_meetings` + `CreateMeetingOutcome`, Wave 2Z's
`ScheduleMeetingsScreen`) — this batch adds a section-wide grid view and
client-side tooling over that existing data, not a second persistence
layer.

## Decisions

### 1. No new npm dependency for palette extraction

The reference project uses `ColorThief` (a real npm package) for
dominant-color extraction from an uploaded logo. This batch's
constraints require flagging any new dependency rather than silently
adding one. `src/domain/palette.ts` instead implements a small,
dependency-free color-bucket quantizer (RGB pixels grouped into coarse
buckets, majority bucket wins, member pixels averaged) operating on a
plain `Uint8ClampedArray`/`number[]` — the same shape
`CanvasRenderingContext2D.getImageData().data` already produces, so a
thin UI-side glue component (not yet wired to a live screen this batch —
see Deferred below) can feed it real logo pixels without this module
ever touching the DOM. This is a **10-scenario-equivalent** call: the
alternative (`colorthief`/`node-vibrant`/`get-image-colors`, all real
npm packages) was rejected specifically because "flag before adding" was
an explicit batch constraint and a ~100-line, fully-tested, zero-runtime-
cost quantizer covers this batch's actual need (one dominant swatch, not
a full 5-color palette workbench).

`src/domain/palette.ts` also implements WCAG relative-luminance/contrast-
ratio math and a bounded darken/lighten search
(`deriveAccessibleVariant`) that derives a dark-mode surface/text pair
from that dominant color and **programmatically verifies** the pair
against the real WCAG AA thresholds (4.5:1 normal text, 3:1 large
text/UI) before returning `meetsAa: true` — never a claimed-but-
unverified pass. `derivePaletteTokens` is the single entry point;
`palette.test.ts` covers extraction (solid fill, majority-color mixing,
transparent/near-white/near-black exclusion), contrast math (including a
cross-check against this project's own already-verified primary/bg pair
from `styles.css`), and the full derivation pipeline (bright-source,
dark-source, and no-pixel-data fallback cases).

### 2. Typography pairing: CSS custom properties applied now, Fraunces/IBM Plex Mono webfonts deferred

The reference project's "Ledger Pairing" typography uses Fraunces (serif
headings) and IBM Plex Mono (tabular numerals) as real Google Fonts
alongside its existing Public Sans body. This batch's constraints
require flagging any new font before adding it — not defaulting to it
silently. Two new CSS custom properties, `--font-serif` (a system serif
stack: Georgia/Cambria/Times New Roman) and `--font-mono` (a system
monospace stack: ui-monospace/SFMono-Regular/Menlo/Consolas), are added
to `styles.css` and applied today (`.page-header h2` uses `--font-serif`;
a new opt-in `.font-tabular` utility class uses `--font-mono`, applied to
the shell's live clock and the timetable grid's time column). This gets
the _structural_ serif/sans/mono pairing effect immediately, at zero new
dependency cost and zero webfont network fetch, and confines a future
real Fraunces/IBM Plex Mono adoption to swapping these two token values
plus adding `@fontsource` imports (the same self-hosted pattern
`@fontsource/public-sans` already uses, per `docs/SOURCE-REGISTRY.md`) —
**flagged here as a deferred, explicitly-approval-gated follow-up, not
implemented this batch.**

### 3. 3-way Light/System/Dark theme toggle

`src/ui/theme/color-theme.ts` + `ColorThemeContext.tsx` +
`useColorTheme.ts` mirror the existing `TeacherMode`
(Efficient/Comfortable/Guided, `ModeContext.tsx`) pattern exactly: a
per-device `localStorage` preference (`likha-sis:color-theme`), never
app data, never touching the encrypted working database or the
session/authorization model. "System" (default) writes no `data-theme`
attribute at all, so the pre-existing `prefers-color-scheme` media query
in `styles.css` remains the sole source of truth for it, byte-for-byte
unchanged from before this batch. "Light"/"Dark" stamp
`data-theme="light"`/`"dark"` on `<html>`; the dark palette values are
now defined identically in three places by necessity (the media query,
guarded with `:root:not([data-theme="light"])` so an explicit Dark
choice still applies on a light-preferring OS; the `[data-theme="dark"]`
block for an explicit choice regardless of OS; and a trivial
`[data-theme="light"]` block that only restates `color-scheme: light`,
since the light values are already `:root`'s unguarded defaults) — a
maintenance cost accepted deliberately so a future palette change still
has one clear place per mode to edit, not a spread of conditional
overrides.

### 4. Card/elevation system: extended, not replaced

ADR-0057's shell already defined `--elevation-1`/`--elevation-2` for
chrome separation (the sticky header, drawer/overlay). This batch adds
three new tokens for _interactive surfaces_ specifically —
`--elevation-small` (resting card/button/input), `--elevation-medium`
(hover-lifted card), `--elevation-pressed` (an inset shadow for an
actively-held button) — plus `--radius-medium`/`--radius-card`, each
with a verified dark-mode override. `.card` now uses
`--elevation-small` at rest and `--elevation-medium` on
`@media (hover: hover)` (so a touch/keyboard user, who gets no hover
state at all, is never gated behind this — purely a decorative
affordance); `button:active` (excluding disabled/aria-disabled states)
uses `--elevation-pressed`.

### 5. Sidebar collapse-to-rail

`Sidebar.tsx` gains a second, independent collapse axis alongside the
existing per-group collapse (`likha-sis:nav-collapsed`): a whole-rail
collapse (`likha-sis:sidebar-rail-collapsed`) that shrinks the sidebar
from the existing `--sidebar-width` (~16.5rem) to a ~5rem icon-only rail.
Tooltips on the collapsed icons are the native `title` attribute — zero
new dependency, matching this batch's dependency-light mandate, at the
cost of the browser's own (unstyled, but fully functional and
accessible) tooltip UI rather than a custom-styled one. The grid-width
response is driven by a `:has()` selector
(`.app-layout:has(.app-sidebar[data-collapsed="true"])`) so the collapse
state stays local to `Sidebar` rather than needing to be lifted into
`AppLayout`; `:has()` has been supported in the Chromium version bundled
with Tauri 2's WebView2 runtime since well before this project's stated
Windows-first target, so this is not treated as a compatibility risk.

### 6. Visual Timetable: click-to-arm/click-to-place, not drag-and-drop

The reference project's builder is drag-and-drop. A real drag-and-drop
library (`@dnd-kit/core`, `react-dnd`, `react-beautiful-dnd`, ...) is a
new dependency this batch's constraints require flagging, and this
batch's own instructions explicitly offer click-to-arm/click-to-place as
the lower-cost alternative when drag-and-drop would add a large new
dependency. **Decision: click-to-arm/click-to-place, zero new
dependency.** Tradeoff accepted deliberately: drag-and-drop reads as
more "premium"/fluid for a mouse user, but click-to-arm/place (a) needs
no new dependency, (b) is fully keyboard-operable (a real accessibility
requirement a drag gesture is not, without a large additional a11y
implementation on top of the DnD library itself), and (c) keeps full
Efficient/Comfortable/Guided parity trivially — the interaction never
changes across modes, only Guided mode's extra hint text does.

`SectionTimetableScreen.tsx` renders a Monday-Friday x hourly-slot grid
for one section, sourced from the _existing_
`TeachingAssignmentApplicationService.listBySection`/`listMeetings` (no
new Rust migration, repository, or command — this is a read/compose
layer over Wave 2Y/2Z's already-shipped, already-tested persistence).
Arming a teaching assignment and clicking an open cell calls the
existing `createMeeting`, whose `CreateMeetingOutcome` (teacher/section/
room conflict, invalid time, etc.) is still the real, server-enforced
authority; the client additionally previews conflicts _before_ the click
via `detectTimetableConflicts` (`src/domain/timetable.ts`), against every
meeting already loaded for the section, so a teacher sees "⚠ Conflict"
on a colliding cell without waiting on a round trip. This preview is
scoped to the current section's own assignments (a cross-section teacher
conflict is not visible on this screen without loading every other
section too, which this batch does not add) — the server remains the
final word regardless.

### 7. Subject-hours validation and auto-seed: pure domain functions, curriculum-minutes input stays a caller-supplied parameter

`validateSubjectWeeklyMinutes` and `autoSeedWeeklySlots`
(`src/domain/timetable.ts`) are pure, fully unit-tested functions with no
UI or persistence import. Neither invents a new
`curriculum_subject_requirements` persistence table this batch — the
required-weekly-minutes figure is a parameter the caller (today, a
number the School Head types into the auto-seed form) supplies, not a
value sourced from a new curriculum-requirements table. **This is a
deliberately scoped simplification, flagged here, not a silent gap**:
building real DepEd curriculum-hours-per-subject persistence is a
separate, non-trivial DepEd-compliance research task (an authoritative
per-subject weekly-minutes table would need to be sourced and verified,
the same sourcing-confidence discipline this project already applies
elsewhere — see `docs/PROJECT-MEMORY.md`'s SF8 BMI-cutoffs entry for the
established precedent of not hardcoding an unverified authoritative
table). `autoSeedWeeklySlots` greedily fills a section's open slots
(caller-provided, in caller-controlled priority order) up to the
required minutes, skipping any slot that would conflict — including
against other candidates it has itself already chosen in the same run
(a real bug caught and fixed during this batch's own TDD: an earlier
draft's "don't conflict with yourself" guard compared by
`teachingAssignmentId` alone, which incorrectly treated two _different_
new weekly meetings of the same subject as the same slot and let them
overlap; fixed by comparing an optional `meetingId` instead, which only
an already-persisted meeting being edited in place carries).

Derived Teacher Load is unaffected by this batch: `TeacherLoad`
(`src/domain/teacher-load.ts`) was already computed live from
`schedule_meetings` (ADR-0039), never a separately persisted table — this
batch does not touch it, and the visual timetable reads/writes the same
`schedule_meetings` rows that load computation already reads.

## Consequences

- No new npm dependency and no new Rust migration this batch.
- Fraunces, IBM Plex Mono, and a real drag-and-drop/ColorThief-equivalent
  library are explicitly deferred, approval-gated follow-ups, not silent
  omissions — recorded here and in the wave report.
- The logo-palette pipeline (`palette.ts`) is fully implemented and
  tested but **not yet wired to a live screen** — no screen this batch
  draws an uploaded logo to a canvas and feeds its pixels through
  `derivePaletteTokens` to actually theme the app per-school. That wiring
  (a small `SchoolBrandingScreen` addition) is the natural next slice;
  recorded as retained scope, not abandoned.
- `curriculum_subject_requirements` persistence remains unbuilt;
  subject-hours validation works today only when a caller supplies the
  required-minutes figure by hand.
- Sidebar rail-collapse tooltips are native `title` attributes, not a
  custom-styled tooltip component — acceptable for this batch, revisit
  only if a real design need for richer tooltip content emerges.
