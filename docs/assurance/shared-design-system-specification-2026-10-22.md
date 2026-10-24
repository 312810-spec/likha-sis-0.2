# Shared design-system specification — PM-03/04

22 October 2026, Asia/Manila. Measured incumbent implementation; KEEP_BASE. This supplements DESIGN.md and the FORGE4 adapter. Production CSS/components/providers remain the authority. No new palette, dependency, runtime route or school-record write is introduced.

## Evidence and scope

Source checkpoint: `d00278602ed843b1a841b1830de35b891013a9a3`. Exact file hashes, fixture hash, Chromium/Node versions, declarations, computed properties and case results: [measurement receipt](design-system-measurements-2026-10-22.json). Reproduce with `node scripts/assurance/design-system-browser.mjs --check-built` after `npm run build`.

36 configurations cover Light/Dark/System × light/dark host × efficient/comfortable/guided density × normal/reduced motion. They resolve to 12 exactly compared profiles. Each case passed its intended contrast pairs, selected native targets >=24px, focus/hover/active checks and axe AA scan. All 108 viewport checks (390/640/1280px) passed without document overflow. Two provider interactions passed: actual preference changes preserve a synthetic unsaved DOM input and focused selector; System follows host, explicit choice wins, and preferences survive reload. This does not certify persisted task drafts.

Internally inspected light comfortable desktop and dark guided phone renders: long labels wrap, feedback remains legible, zero differs from Not recorded, and phone table retains its labelled values. Synthetic content intentionally has no service authority.

## Semantic palette

Use semantic roles on their intended opaque surfaces. Soft borders are decorative; control boundaries use `--color-border`. Status meaning requires visible text, not color alone. Pair measurements do not permit arbitrary foreground/background combinations.

| Token                        | Light     | Dark      |
| ---------------------------- | --------- | --------- |
| `--color-bg`                 | `#f6f7fa` | `#141722` |
| `--color-border`             | `#7a8192` | `#8993aa` |
| `--color-border-soft`        | `#dce0e9` | `#363d51` |
| `--color-danger`             | `#b42318` | `#ffaaa1` |
| `--color-danger-surface`     | `#fff0ed` | `#422521` |
| `--color-focus`              | `#2536c4` | `#b8bdf8` |
| `--color-primary`            | `#2536c4` | `#b8bdf8` |
| `--color-primary-text`       | `#ffffff` | `#181b40` |
| `--color-primary-wash`       | `#eaecfa` | `#303555` |
| `--color-productive`         | `#096451` | `#83d6bf` |
| `--color-productive-surface` | `#e5f3ef` | `#183b34` |
| `--color-success`            | `#074c0b` | `#a0d99e` |
| `--color-success-surface`    | `#e9f3e8` | `#213a24` |
| `--color-surface`            | `#eef0f6` | `#1b1f2d` |
| `--color-surface-2`          | `#ffffff` | `#222737` |
| `--color-text`               | `#172033` | `#f0f2fa` |
| `--color-text-muted`         | `#586174` | `#b3bbcf` |
| `--color-warning`            | `#8a4b00` | `#f3cc8f` |
| `--color-warning-surface`    | `#fff4de` | `#40331f` |

### Measured contrast pairs

| Pair/selector               |  Light |   Dark | Required |
| --------------------------- | -----: | -----: | -------: |
| `text / bg`                 | 15.186 | 15.983 |      4.5 |
| `text-muted / bg`           |  5.805 |  9.295 |      4.5 |
| `primary / bg`              |  8.156 |  9.931 |      4.5 |
| `border / bg`               |  3.642 |  5.800 |        3 |
| `focus / bg`                |  8.156 |  9.931 |        3 |
| `text / surface`            | 14.278 | 14.671 |      4.5 |
| `text-muted / surface`      |  5.458 |  8.533 |      4.5 |
| `primary / surface`         |  7.668 |  9.116 |      4.5 |
| `border / surface`          |  3.424 |  5.324 |        3 |
| `focus / surface`           |  7.668 |  9.116 |        3 |
| `text / surface-2`          | 16.268 | 13.292 |      4.5 |
| `text-muted / surface-2`    |  6.219 |  7.730 |      4.5 |
| `primary / surface-2`       |  8.737 |  8.259 |      4.5 |
| `border / surface-2`        |  3.901 |  4.824 |        3 |
| `focus / surface-2`         |  8.737 |  8.259 |        3 |
| `text / primary-wash`       | 13.849 | 10.637 |      4.5 |
| `text-muted / primary-wash` |  5.294 |  6.186 |      4.5 |
| `primary / primary-wash`    |  7.438 |  6.609 |      4.5 |
| `border / primary-wash`     |  3.321 |  3.860 |        3 |
| `focus / primary-wash`      |  7.438 |  6.609 |        3 |
| `.alert-error`              |  5.929 |  7.585 |      4.5 |
| `.alert-warning`            |  6.235 |  8.090 |      4.5 |
| `.alert-success`            |  9.010 |  7.617 |      4.5 |
| `.alert-info`               |  7.668 |  9.116 |      4.5 |
| `.status-chip-neutral`      |  5.458 |  8.533 |      4.5 |
| `.status-chip-productive`   |  6.230 |  7.197 |      4.5 |
| `.status-chip-success`      |  9.010 |  7.617 |      4.5 |
| `.status-chip-warning`      |  6.235 |  8.090 |      4.5 |
| `.status-chip-danger`       |  5.929 |  7.585 |      4.5 |
| `#primary`                  |  8.737 |  9.194 |      4.5 |

## Density, typography and geometry

| Density     | Spacing unit | Base text | Control minimum height |
| ----------- | -----------: | --------: | ---------------------: |
| efficient   |          8px |      14px |                   34px |
| comfortable |         12px |      15px |                   40px |
| guided      |         18px |      17px |                   72px |

Space steps multiply the unit by .25/.5/.75/1/1.5/2/3/4. Base typography uses Public Sans with system fallbacks and 1.5 line-height. Token availability does not authorize tiny text for required instructions. Base radius is 8px, large 14px; additional existing aliases remain in the inventory below. Focus-visible outline is 2px with 2px offset. Shared geometry is a floor: long labels/content may increase actual height. Catalog control geometry and 21 computed style properties for each of22 sampled selectors are in the receipt.

## Control and component contract

| Owner                                   | State/semantics                                                                                                                                                                                         | Consumer obligation                                                                                                   |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `src/ui/theme/styles.css` native button | Normal uses surface/text/control border; `.button-primary` uses primary/primary-text. Hover settles at brightness(.97); actual :active was exercised, without inventing a distinct shared active color. | Use primary for the current task's principal action; retain meaningful accessible names.                              |
| Native disabled / aria-disabled button  | Both sampled with opacity .6; native disabled removes native activation. An aria-disabled attribute alone does not block handlers.                                                                      | Guard production actions and explain availability; the catalog's guarded busy-looking sample is visual evidence only. |
| Consumer selection variants             | Generic aria-pressed sample retains base visuals. Selection styling is task-specific.                                                                                                                   | Pair actual selected styling with visible state and appropriate semantics; do not infer a universal selected variant. |
| Native fields / `.field-error`          | Invalid sample links aria-invalid and aria-describedby to visible error; readonly sample retains zero. No automatic universal invalid border is asserted.                                               | Own validation timing, field association, recovery and focus; readonly must not imply missing data.                   |
| `Alert.tsx`                             | error/warning => alert; success/info => status. Default stacks blocks; inline is opt-in.                                                                                                                | Own announcement timing and truthful task outcome; avoid duplicate live announcements.                                |
| `StatusChip.tsx`                        | neutral/productive/success/warning/danger with visible text.                                                                                                                                            | Preserve textual meaning and task-specific status authority.                                                          |
| `Loading.tsx`                           | Paragraph role=status with caller label.                                                                                                                                                                | Own async guards, stale responses, failure/retry and completion announcement.                                         |
| `EmptyState.tsx`                        | Children-only legacy paragraph; structured variant is a labelled section with optional action.                                                                                                          | Explain context/next step; distinguish no results, missing evidence and successful zero.                              |
| `DataTable.tsx`                         | Explicit table/row/rowheader/cell roles; catalog reflow at640 retains labelled values.                                                                                                                  | Preserve headers, stable row identity, zero vs absent meaning and task-specific selection/keyboard behavior.          |
| Checkbox/radio                          | Native controls sampled for size/style.                                                                                                                                                                 | Native glyph pixel contrast, platform rendering and manual AT remain separate checks.                                 |

Native fields are not extracted into a new generic component without repeated same-intent uses. Contrast assertions exclude inactive-control opacity; it remains recorded. Normal/reduced motion use120/180/240ms versus0.01ms tokens. Interaction meaning and focus do not depend on animation.

## Root-active token inventory

Values below are raw computed custom properties on comfortable density/light/dark. CSS calc expressions remain explicit; typed resolved values (including all densities/motion profiles) are in the JSON. The receipt enumerates130 CSS declarations with selector and conditional scope, including inactive/component-local/print declarations. Those scopes are not globally promoted. JSX-local properties such as skeleton geometry remain consumer-owned.

| Token                          | Light comfortable                                                 | Dark comfortable                                                  |
| ------------------------------ | ----------------------------------------------------------------- | ----------------------------------------------------------------- |
| `--accent`                     | `#2536c4`                                                         | `#b8bdf8`                                                         |
| `--accent-contrast`            | `#ffffff`                                                         | `#181b40`                                                         |
| `--border-control`             | `#7a8192`                                                         | `#8993aa`                                                         |
| `--border-subtle`              | `#dce0e9`                                                         | `#363d51`                                                         |
| `--breakpoint-phone`           | `640px`                                                           | `640px`                                                           |
| `--breakpoint-tablet`          | `860px`                                                           | `860px`                                                           |
| `--chart-absent`               | `#b42318`                                                         | `#ffaaa1`                                                         |
| `--chart-excused`              | `#2536c4`                                                         | `#b8bdf8`                                                         |
| `--chart-late`                 | `#8a4b00`                                                         | `#f3cc8f`                                                         |
| `--chart-present`              | `#096451`                                                         | `#83d6bf`                                                         |
| `--color-bg`                   | `#f6f7fa`                                                         | `#141722`                                                         |
| `--color-border`               | `#7a8192`                                                         | `#8993aa`                                                         |
| `--color-border-soft`          | `#dce0e9`                                                         | `#363d51`                                                         |
| `--color-danger`               | `#b42318`                                                         | `#ffaaa1`                                                         |
| `--color-danger-surface`       | `#fff0ed`                                                         | `#422521`                                                         |
| `--color-focus`                | `#2536c4`                                                         | `#b8bdf8`                                                         |
| `--color-primary`              | `#2536c4`                                                         | `#b8bdf8`                                                         |
| `--color-primary-text`         | `#ffffff`                                                         | `#181b40`                                                         |
| `--color-primary-wash`         | `#eaecfa`                                                         | `#303555`                                                         |
| `--color-productive`           | `#096451`                                                         | `#83d6bf`                                                         |
| `--color-productive-surface`   | `#e5f3ef`                                                         | `#183b34`                                                         |
| `--color-success`              | `#074c0b`                                                         | `#a0d99e`                                                         |
| `--color-success-surface`      | `#e9f3e8`                                                         | `#213a24`                                                         |
| `--color-surface`              | `#eef0f6`                                                         | `#1b1f2d`                                                         |
| `--color-surface-2`            | `#ffffff`                                                         | `#222737`                                                         |
| `--color-text`                 | `#172033`                                                         | `#f0f2fa`                                                         |
| `--color-text-muted`           | `#586174`                                                         | `#b3bbcf`                                                         |
| `--color-warning`              | `#8a4b00`                                                         | `#f3cc8f`                                                         |
| `--color-warning-surface`      | `#fff4de`                                                         | `#40331f`                                                         |
| `--content-width`              | `720px`                                                           | `720px`                                                           |
| `--content-width-wide`         | `1440px`                                                          | `1440px`                                                          |
| `--control-height`             | `40px`                                                            | `40px`                                                            |
| `--elevation-1`                | `0 1px 2px rgb(23 32 51 / 5%)`                                    | `0 1px 2px rgb(23 32 51 / 5%)`                                    |
| `--elevation-2`                | `0 16px 40px -12px rgb(23 32 51 / 24%)`                           | `0 16px 40px -12px rgb(0 0 0 / 60%)`                              |
| `--focus-ring-offset`          | `2px`                                                             | `2px`                                                             |
| `--focus-ring-width`           | `2px`                                                             | `2px`                                                             |
| `--font-family`                | `"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-numeric`               | `"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif` | `"Public Sans", system-ui, -apple-system, "Segoe UI", sans-serif` |
| `--font-size-2xl`              | `calc(15px * 1.5)`                                                | `calc(15px * 1.5)`                                                |
| `--font-size-2xs`              | `calc(15px * 0.7)`                                                | `calc(15px * 0.7)`                                                |
| `--font-size-3xl`              | `calc(15px * 1.8)`                                                | `calc(15px * 1.8)`                                                |
| `--font-size-4xl`              | `calc(15px * 2)`                                                  | `calc(15px * 2)`                                                  |
| `--font-size-base`             | `15px`                                                            | `15px`                                                            |
| `--font-size-large`            | `calc(15px * 1.33)`                                               | `calc(15px * 1.33)`                                               |
| `--font-size-lg`               | `calc(15px * 1.22)`                                               | `calc(15px * 1.22)`                                               |
| `--font-size-md`               | `calc(15px * 1.13)`                                               | `calc(15px * 1.13)`                                               |
| `--font-size-sm`               | `calc(15px * 0.9)`                                                | `calc(15px * 0.9)`                                                |
| `--font-size-small`            | `calc(15px * 0.9)`                                                | `calc(15px * 0.9)`                                                |
| `--font-size-xl`               | `calc(15px * 1.33)`                                               | `calc(15px * 1.33)`                                               |
| `--font-size-xs`               | `calc(15px * 0.8)`                                                | `calc(15px * 0.8)`                                                |
| `--line-height-base`           | `1.5`                                                             | `1.5`                                                             |
| `--line-height-none`           | `1`                                                               | `1`                                                               |
| `--line-height-snug`           | `1.3`                                                             | `1.3`                                                             |
| `--line-height-tight`          | `1.2`                                                             | `1.2`                                                             |
| `--motion-duration-immediate`  | `120ms`                                                           | `120ms`                                                           |
| `--motion-duration-meaningful` | `240ms`                                                           | `240ms`                                                           |
| `--motion-duration-routine`    | `180ms`                                                           | `180ms`                                                           |
| `--motion-easing-exit`         | `cubic-bezier(0.4, 0, 1, 1)`                                      | `cubic-bezier(0.4, 0, 1, 1)`                                      |
| `--motion-easing-standard`     | `cubic-bezier(0.2, 0, 0, 1)`                                      | `cubic-bezier(0.2, 0, 0, 1)`                                      |
| `--overlay-scrim`              | `rgb(10 14 20 / 42%)`                                             | `rgb(10 14 20 / 42%)`                                             |
| `--radius`                     | `8px`                                                             | `8px`                                                             |
| `--radius-large`               | `14px`                                                            | `14px`                                                            |
| `--radius-medium`              | `10px`                                                            | `10px`                                                            |
| `--radius-pill`                | `999px`                                                           | `999px`                                                           |
| `--radius-small`               | `6px`                                                             | `6px`                                                             |
| `--sidebar-width`              | `232px`                                                           | `232px`                                                           |
| `--sidebar-width-collapsed`    | `76px`                                                            | `76px`                                                            |
| `--space-1`                    | `calc(12px * 0.25)`                                               | `calc(12px * 0.25)`                                               |
| `--space-2`                    | `calc(12px * 0.5)`                                                | `calc(12px * 0.5)`                                                |
| `--space-3`                    | `calc(12px * 0.75)`                                               | `calc(12px * 0.75)`                                               |
| `--space-4`                    | `12px`                                                            | `12px`                                                            |
| `--space-5`                    | `calc(12px * 1.5)`                                                | `calc(12px * 1.5)`                                                |
| `--space-6`                    | `calc(12px * 2)`                                                  | `calc(12px * 2)`                                                  |
| `--space-7`                    | `calc(12px * 3)`                                                  | `calc(12px * 3)`                                                  |
| `--space-8`                    | `calc(12px * 4)`                                                  | `calc(12px * 4)`                                                  |
| `--spacing-unit`               | `12px`                                                            | `12px`                                                            |
| `--surface-canvas`             | `#f6f7fa`                                                         | `#141722`                                                         |
| `--surface-navigation`         | `#f6f7fa`                                                         | `#141722`                                                         |
| `--surface-selected`           | `#eaecfa`                                                         | `#303555`                                                         |
| `--surface-subtle`             | `#eef0f6`                                                         | `#1b1f2d`                                                         |
| `--surface-working`            | `#ffffff`                                                         | `#222737`                                                         |
| `--text-primary`               | `#172033`                                                         | `#f0f2fa`                                                         |
| `--text-secondary`             | `#586174`                                                         | `#b3bbcf`                                                         |

## Acceptance boundary and next task

DS1–DS6 pass for this shared catalog/specification only. DS7 local quality/build/isolation pass; publication/CI evidence belongs to the handoff and merge receipt. PM-03/04 core measurement advances without marking their full consumer/brand scope complete. All81 UI consumers, full role/state compositions, brand/logo, print/native surfaces, manual AT/OS zoom, teacher comprehension, installed Windows/Android, two-device exchange and Scores A1–A7 remain separately pending. Continue the Scores pilot and source-owned state inventory; expand runtime journeys only after the governing external acceptance gate.
