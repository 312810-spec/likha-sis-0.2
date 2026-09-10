# UI / Visual Quality — Tooling Enhancement Plan

Status: **Proposal + partial apply** (2026-09-10). Requested by the owner
after the Precision Intelligence program (Waves A–N) completed: research
repos/tools/MCPs that improve the app's UI/visual quality, produce a
plan, and apply what complies with project rules without breaking
anything.

On the shared "Claude Mastery Map" infographic: reviewed. It is a
generic beginner→power-user Claude roadmap (skills / connectors / MCP /
automation), not LIKHA-specific. LIKHA is already at the mature end of
that map — a certified frozen harness (`docs/adr/0054`), a locked design
language (ADR-0070), Playwright + axe in CI. It does not change any
recommendation below.

## Constraints every candidate is checked against

- **Zero billing / no telemetry / no runtime CDN / offline-first / no
  external asset fetch** — CLAUDE.md, ADR-0070.
- **Permissive license only** (MIT / ISC / Apache-2.0 / BSD / MPL-2.0).
- **No runtime dependency added to the shipped app** unless it earns its
  place (the app ships 6 runtime deps total, by design).
- **No third-party component system / theme generator / CSS framework** —
  ADR-0070 "system before spectacle"; the hand-rolled shell + primitives
  - `styles.css` `:root` tokens are the design decision.
- **`npm run quality` must stay green** — "nothing breaks".
- Any harness tool (MCP, skill, CLI) is a change to the certified
  harness and must be recorded in `docs/adr/0054` + `docs/SOURCE-REGISTRY.md`
  - `.harness/inventory.json`.

## Research — candidate matrix (facts current Sep 2026)

### A. Static quality gates (dev-only, ship nothing)

| Candidate                                         | Ver / license                 | What it adds                                                                                                                                                                                                                | Verdict                                                                                                                                                                                                                                                                                                                             |
| ------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`eslint-plugin-jsx-a11y`**                      | 6.10.2 (Oct 2024) · MIT       | Lint-time a11y: bad ARIA props, `onClick` w/o key handler, missing `alt`, wrong roles — catches issues the axe _runtime_ unit tests miss unless that element renders in a test.                                             | **BLOCKED.** No ESLint-10-compatible release; peer is `eslint ^3..^9`, repo is on ESLint 10. PRs [#1079/#1081](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/issues/1075) open since Feb 2026, unmerged. Installing needs `--legacy-peer-deps` → fails "nothing breaks". **Watch the issue; adopt on a compatible release.** |
| **`stylelint`** + **`stylelint-config-standard`** | 17.15.0 / 40.0.0 (2026) · MIT | CSS linter for the 2000+-line `styles.css` (currently unlinted): invalid properties, duplicate selectors, unknown units, malformed values, `!important` sprawl. Standalone toolchain — no ESLint entanglement, clean peers. | **ADOPT** (needs `npm install` — see §Apply). Config must be tuned to pass on the current file; substantive rules on, purely-stylistic rules that would mass-fail off.                                                                                                                                                              |
| **`stylelint-declaration-strict-value`**          | 1.12.1 (2026) · MIT           | Forces `color` / `background` / `border-color` etc. to use `var(--color-*)`, not raw hex — mechanically enforces ADR-0070's "LIKHA-owned semantic tokens".                                                                  | **ADOPT after** plain stylelint lands and any raw-value exceptions (shadows use `rgba()`) are whitelisted.                                                                                                                                                                                                                          |
| `stylelint-order`                                 | 8.1.1 · MIT                   | Property ordering.                                                                                                                                                                                                          | **Hold** — cosmetic; not worth the churn on an existing 2000-line file.                                                                                                                                                                                                                                                             |
| `stylelint-a11y`                                  | 1.2.3 (2022, stale)           | CSS-level a11y (e.g. `outline: none` without a `:focus` alternative).                                                                                                                                                       | **Reject** — unmaintained since 2022.                                                                                                                                                                                                                                                                                               |

### B. Contrast automation (LIKHA-specific, high value)

| Candidate                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Verdict                                                    |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| A repo-local `scripts/check-contrast.mjs` — parses `styles.css`'s `:root`, dark-media, and `:root[data-appearance="dark"]` blocks, then asserts every token pair documented in ADR-0031/0064 (text/bg, muted/surface-2, border/surface, primary-text/primary, each `-surface` tint pair …) meets WCAG AA (4.5 text, 3.0 non-text) in **both** palettes. **Zero dependency** — inline WCAG relative-luminance math. Automates what ADR-0031/0064 did by hand and catches a future token edit that breaks contrast. | **ADOPT — applied this session** (see §Applied).           |
| `wcag-contrast` (npm, 3.0.0, BSD-2)                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Not needed — the math is ~15 lines; a dep isn't warranted. |

### C. Visual regression (the owed "visual pass" — web render only)

| Candidate                                                           | Ver / license                                                                                                                                          | Verdict                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **`@playwright/test` + `toHaveScreenshot()`**                       | 1.63.0 · Apache-2.0                                                                                                                                    | **Adopt when you want it.** `playwright` is already a dep; adding the test runner enables a Light×Dark × Efficient/Comfortable/Guided screenshot baseline in `quality:ui`. Cost: baseline images in the repo + review discipline when they change. Covers the **web/dev-preview render**, not the compiled Tauri binary. |
| `jest-image-snapshot` 6.5.2 · Apache-2.0 / `pixelmatch` 7.2.0 · ISC | Lower-level diffing; only if you'd rather diff inside Vitest than use Playwright's built-in. **Hold** — Playwright's is simpler and already 90% there. |
| Chromatic / Percy / Applitools                                      | **Reject** — paid SaaS + telemetry; violates zero-billing.                                                                                             |
| BackstopJS / Loki / reg-suit                                        | **Hold** — config-heavy or Storybook-bound; the Playwright route is lighter.                                                                           |

### D. Bundle budget

| Candidate                                                        | Verdict                                                                                                                                                                                            |
| ---------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **`size-limit` + `@size-limit/preset-small-lib`** (13.0.3 · MIT) | **Adopt when you want CI enforcement.** Every UI-redesign ADR records `dist` gzip by hand; `size-limit` fails CI if it grows past a set budget (e.g. JS gzip ≤ 122 kB, CSS gzip ≤ 8 kB). Low risk. |
| `rollup-plugin-visualizer` 7.1.1 · MIT                           | **Optional** dev aid — `npm run build -- --mode analyze` opens a treemap. Useful once, not a gate.                                                                                                 |

### E. Icons (from the prior message)

| Verdict                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Do nothing / copy-paths.** 3 icons in use, ~15 anticipated; the hand-rolled `icons.tsx` behind the `Icon`/`IconName` wrapper is fine. If the count grows, copy specific **Lucide** (ISC) `<path>` d-strings into `icons.tsx` with an attribution comment — no package. Adopt `lucide-react` (ISC, 1.44.0) only if icons proliferate across dozens of screens; it wires behind the existing wrapper and the exit path is one file. |

### F. MCPs

| Candidate                                              | Verdict                                                                                                                                 |
| ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------- |
| `@playwright/mcp` (Microsoft, Apache-2.0, **v0.0.80**) | **Hold.** 0.0.x = unstable API; overlaps the `Claude_Browser` / `claude-in-chrome` MCPs already available this session. Revisit at 1.0. |
| `chrome-devtools-mcp` (Google)                         | **Hold** — perf/console/network debugging, not UI _enhancement_.                                                                        |
| Figma / design-to-code MCPs                            | **Reject** — no Figma in this project.                                                                                                  |

### G. Claude skills

| Verdict                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Reject `frontend-design`** (`anthropics/skills`, Apache-2.0). First-party and safe, but ~80% overlaps `.claude/skills/premium-teacher-ui` + `impeccable` + ADR-0070 — even the exact AI-default palettes it forbids (cream+terracotta) are ones LIKHA already avoids. It re-states a capability the repo already documents and enforces; does not clear the "substantial improvement" bar for a harness change. Third-party mega-skills ("UI/UX Pro Max" etc.) — reject (unvetted supply chain, and a browse-50-styles database contradicts a locked design language). |

## What was APPLIED this session

- **`scripts/check-contrast.mjs`** + `npm run check:contrast` — zero
  dependency; asserts every documented `styles.css` token pair meets
  WCAG AA in both the light and dark palettes. Wired into `npm run
quality` only if it passes clean on the current tokens (it must — the
  ADRs verified them by hand). See the commit.

Nothing else was applied: `stylelint` needs an `npm install` (which
needs owner permission in this environment) and `jsx-a11y` is
version-incompatible. Both are staged below.

## Apply steps — for the owner to run (each is an approval-gated dep add)

### 1. stylelint (safe; recommended next)

```bash
npm install -D stylelint@^17 stylelint-config-standard@^40
```

Then add `stylelint.config.js` (starts from `stylelint-config-standard`,
turns off the purely-stylistic rules that would mass-fail on the
existing file — `color-hex-length`, `alpha-value-notation`,
`hue-degree-notation`, `custom-property-pattern` — keeping the
substantive ones), add `"lint:css": "stylelint \"src/**/*.css\""` and
fold it into `quality`. First run `stylelint --fix` (conservative
auto-fixes) then hand-fix any remainder; confirm the built CSS is
byte-identical in intent before committing. Record in
`docs/SOURCE-REGISTRY.md`.

### 2. jsx-a11y — WATCH, do not install yet

Track [jsx-a11y#1075](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/issues/1075).
On a release whose peer allows `eslint ^10`, add
`eslint-plugin-jsx-a11y`, extend `jsxA11y.flatConfigs.recommended` in
`eslint.config.js`, fix the findings, keep `quality` green.

### 3–5. `size-limit`, `@playwright/test` visual snapshots,

`stylelint-declaration-strict-value` — adopt individually when you want
the corresponding gate; each is low-risk and staged above.

## Sources

npm registry metadata for every package named (versions + SPDX licenses
as shown); [ESLint v10 release](https://eslint.org/blog/2026/02/eslint-v10.0.0-released/);
[jsx-a11y ESLint 10 issue](https://github.com/jsx-eslint/eslint-plugin-jsx-a11y/issues/1075);
[anthropics/skills](https://github.com/anthropics/skills);
[Lucide guide](https://lucide.dev/guide/).
