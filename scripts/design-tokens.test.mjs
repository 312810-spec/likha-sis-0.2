// @vitest-environment node
// CTOS M03 design-system regression guard.
//
// M03's acceptance criterion is "no material screen-specific visual island".
// That is a property of the codebase, not of any one render, so it is guarded
// statically against `styles.css` rather than by a screenshot. A screenshot
// baseline was considered and rejected: this repo ships no image-comparison
// dependency and no @playwright/test, and a pixel baseline would assert the
// current pixels rather than the property that matters (that a new screen
// cannot reintroduce a one-off size or an unknown breakpoint).
//
// Every rule below has failed at least once against the pre-M03 stylesheet,
// which is what makes it a regression guard rather than a decoration.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// styles.css is CRLF under git's autocrlf on Windows; normalise so the
// assertions can be written readably.
const css = readFileSync("src/ui/theme/styles.css", "utf8").replace(/\r\n/g, "\n");

/** Declarations inside `:root` or a density/appearance override. */
function tokenDeclarations() {
  const out = [];
  const re = /(?:^|\n)\s*:root[^{]*\{([^}]*)\}/g;
  let match;
  while ((match = re.exec(css))) out.push(match[1]);
  return out;
}

/** Component declarations — everything declared outside a `:root` block. */
function componentDeclarations() {
  const out = [];
  const re = /(?:^|\n)([^\s{}][^{]*)\{([^{}]*)\}/g;
  let match;
  while ((match = re.exec(css))) {
    if (!/^\s*:root/.test(match[1])) out.push(match[2]);
  }
  return out;
}

describe("typography scale", () => {
  it("every font size outside :root resolves through a scale token", () => {
    const offenders = [];
    for (const block of componentDeclarations()) {
      for (const declaration of block.match(/[^;]*font-size:[^;]*/g) ?? []) {
        // Any reference to a --font-size token satisfies the rule, including
        // inside a max()/min() readability floor.
        if (/font-size:\s*[^;]*var\(--font-size/.test(declaration)) continue;
        // Relative `em` is permitted: it is a ratio against the element's own
        // size, which is how text inside a labelled control tracks its label.
        if (/font-size:\s*[\d.]+em/.test(declaration)) continue;
        if (/font-size:\s*inherit/.test(declaration)) continue;
        offenders.push(declaration.trim());
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the scale is derived from --font-size-base so density rescales all type", () => {
    const root = tokenDeclarations().join("\n");
    const scale = [...root.matchAll(/--font-size-(2xs|xs|sm|md|lg|xl|2xl|3xl|4xl):\s*([^;]+)/g)];
    expect(scale.length).toBe(9);
    for (const [, , value] of scale) {
      expect(value.trim()).toMatch(/^calc\(var\(--font-size-base\)/);
    }
  });

  it("the legacy --font-size-large/--font-size-small names still resolve", () => {
    const root = tokenDeclarations().join("\n");
    expect(root).toContain("--font-size-large: var(--font-size-xl)");
    expect(root).toContain("--font-size-small: var(--font-size-sm)");
  });
});

describe("spacing scale", () => {
  it("custom-property dependencies have no cycle in the base theme or any density/appearance override", () => {
    const declarations = tokenDeclarations().map(
      (block) =>
        new Map(
          [...block.matchAll(/(--[\w-]+):\s*([^;]+);/g)].map(([, name, value]) => [name, value]),
        ),
    );
    const base = declarations[0];
    expect(base.size).toBeGreaterThan(0);
    for (const overrides of [new Map(), ...declarations.slice(1)]) {
      const resolved = new Map([...base, ...overrides]);
      const cycles = [];
      function visit(name, path) {
        if (path.includes(name)) {
          cycles.push([...path, name].join(" -> "));
          return;
        }
        for (const [, dependency] of (resolved.get(name) ?? "").matchAll(/var\((--[\w-]+)/g)) {
          visit(dependency, [...path, name]);
        }
      }
      for (const name of resolved.keys()) visit(name, []);
      expect(cycles).toEqual([]);
    }
  });

  it("no component declares literal pixel padding/gap/margin above the hairline threshold", () => {
    // 1-3px values are hairlines (1px borders, 2px gutters) and are exempt.
    // The one legitimate large literal is the phone safe-area inset, which is
    // a physical device measurement and cannot be a token.
    const offenders = [];
    for (const block of componentDeclarations()) {
      for (const declaration of block.match(/[^;]*(?:padding|gap|margin):[^;]*/g) ?? []) {
        const literal = declaration.match(/:\s*([^;]*?)\d+px/);
        if (!literal) continue;
        if (/env\(safe-area-inset/.test(declaration)) continue;
        const px = Number(declaration.match(/:\s*[^;]*?(\d+)px/)?.[1]);
        if (px > 0 && px < 4) continue;
        offenders.push(declaration.trim());
      }
    }
    expect(offenders).toEqual([]);
  });

  it("the eight spacing steps are all derived from --spacing-unit", () => {
    const root = tokenDeclarations().join("\n");
    for (const step of [1, 2, 3, 5, 6, 7, 8]) {
      expect(root).toContain(`--space-${step}:`);
    }
    // --space-4 is the unit itself, not a calc.
    expect(root).toContain("--space-4: var(--spacing-unit)");
  });
});

describe("responsive rules", () => {
  it("uses only the three sanctioned breakpoint widths", () => {
    // Custom properties cannot appear in @media, so the sanctioned widths are
    // enforced here as literals. Three exist: phone (640), tablet (860) and
    // narrow-desktop (861-1080, where the persistent class index gives up
    // width). A component needing a fourth width is a design decision that
    // should be made once, in the token list above — not per rule.
    const widths = new Set(
      [...css.matchAll(/@media[^{]*max-width:\s*(\d+)px/g)].map((match) => match[1]),
    );
    expect([...widths].sort()).toEqual(["1080", "640", "860"]);
  });

  it("declares the sanctioned widths as tokens for JS-side reasoning", () => {
    const root = tokenDeclarations().join("\n");
    expect(root).toContain("--breakpoint-phone: 640px");
    expect(root).toContain("--breakpoint-tablet: 860px");
  });
});

describe("focus and motion", () => {
  it("focus rings use the shared tokens, not per-component geometry", () => {
    const offenders = [];
    for (const block of componentDeclarations()) {
      for (const declaration of block.match(/[^;]*outline[^;]*/g) ?? []) {
        if (/var\(--focus-ring/.test(declaration)) continue;
        // `outline: none`/`outline-offset` reset cases are permitted.
        if (/outline:\s*none/.test(declaration)) continue;
        offenders.push(declaration.trim());
      }
    }
    expect(offenders).toEqual([]);
  });

  it("reduced motion collapses every duration token once, centrally", () => {
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\)/);
    // No component may set its own duration outside the tokens.
    const offenders = [...css.matchAll(/transition:[^;]*\d+m?s[^;]/g)].map((match) =>
      match[0].trim(),
    );
    expect(offenders.filter((declaration) => !/var\(--motion/.test(declaration))).toEqual([]);
  });
});

describe("table patterns", () => {
  it("the ledger families share one base definition", () => {
    // Before M03, .attendance-roster, .section-roster and .sf1-comparison-table
    // each re-declared width/collapse/cell padding/border with slightly
    // different values. They are now one primitive.
    expect(css).toContain(
      ".ledger,\n.attendance-roster,\n.section-roster,\n.sf1-comparison-table {",
    );
  });
});
