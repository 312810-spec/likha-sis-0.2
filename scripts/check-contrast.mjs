#!/usr/bin/env node
// Verifies that the semantic colour-token pairs in src/ui/theme/styles.css
// meet WCAG 2.2 AA contrast in BOTH the light and the dark palette.
//
// This automates the by-hand contrast checks recorded in
// docs/adr/0031-design-system-and-app-shell.md and
// docs/adr/0064-ui-redesign-shell.md — a future token edit that drops a
// pair below AA now fails a check instead of shipping silently.
//
// Zero dependency: the WCAG relative-luminance maths is ~15 lines below.

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const CSS = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "..", "src", "ui", "theme", "styles.css"),
  "utf8",
);

// --- WCAG maths ---------------------------------------------------------
function channel(c) {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}
function luminance([r, g, b]) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
function parseHex(hex) {
  let h = hex.replace("#", "").trim();
  if (h.length === 3) h = [...h].map((c) => c + c).join("");
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function contrast(fgHex, bgHex) {
  const a = luminance(parseHex(fgHex));
  const b = luminance(parseHex(bgHex));
  const [hi, lo] = a > b ? [a, b] : [b, a];
  return (hi + 0.05) / (lo + 0.05);
}

// --- extract token blocks from styles.css ----------------------------
/** Grab the `{ ... }` body that immediately follows the first occurrence
 * of `selector` (brace-matched), then pull every `--name: <value>;`. */
function tokensAfter(selector) {
  const at = CSS.indexOf(selector);
  if (at === -1) throw new Error(`selector not found: ${selector}`);
  let i = CSS.indexOf("{", at);
  let depth = 0;
  const start = i + 1;
  for (; i < CSS.length; i++) {
    if (CSS[i] === "{") depth++;
    else if (CSS[i] === "}" && --depth === 0) break;
  }
  const body = CSS.slice(start, i);
  const out = {};
  for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out[m[1].trim()] = m[2].trim();
  }
  return out;
}

const light = tokensAfter(":root {");
// The dark palette is applied by two selectors with identical values;
// the explicit-override block is the stable one to read.
const dark = tokensAfter(':root[data-appearance="dark"]');

// --- the pairs to hold to AA ---------------------------------------
// [foreground token, background token, min ratio, what it is]
// 4.5 = normal text (WCAG 1.4.3); 3.0 = UI component / non-text (1.4.11).
const PAIRS = [
  ["--color-text", "--color-bg", 4.5, "body text on the page"],
  ["--color-text", "--color-surface", 4.5, "text on the raised surface"],
  ["--color-text", "--color-surface-2", 4.5, "text on the card surface"],
  ["--color-text-muted", "--color-surface-2", 4.5, "muted text on the card surface"],
  ["--color-text-muted", "--color-bg", 4.5, "muted text on the page"],
  ["--color-text", "--color-primary-wash", 4.5, "text on a nav/table hover fill"],
  ["--color-border", "--color-bg", 3.0, "control border on the page"],
  ["--color-border", "--color-surface", 3.0, "control border on the raised surface"],
  ["--color-border", "--color-surface-2", 3.0, "control border on the card surface"],
  ["--color-primary-text", "--color-primary", 4.5, "primary-button text on its fill"],
  ["--color-productive", "--color-productive-surface", 4.5, "productive chip text on its tint"],
  ["--color-success", "--color-success-surface", 4.5, "success chip text on its tint"],
  ["--color-warning", "--color-warning-surface", 4.5, "warning chip text on its tint"],
  ["--color-danger", "--color-danger-surface", 4.5, "danger chip text on its tint"],
  ["--color-productive", "--color-bg", 4.5, "productive text on the page"],
  ["--color-success", "--color-bg", 4.5, "success text on the page"],
  ["--color-warning", "--color-bg", 4.5, "warning text on the page"],
  ["--color-danger", "--color-bg", 4.5, "danger text on the page"],
  ["--color-focus", "--color-bg", 3.0, "focus ring on the page"],
];

let failures = 0;
for (const [name, palette] of [
  ["light", light],
  ["dark", dark],
]) {
  for (const [fg, bg, min, what] of PAIRS) {
    const fgv = palette[fg];
    const bgv = palette[bg];
    if (!fgv || !bgv || !parseHex(fgv) || !parseHex(bgv)) {
      console.error(`MISSING  ${name}: ${fg} (${fgv ?? "?"}) / ${bg} (${bgv ?? "?"}) — ${what}`);
      failures++;
      continue;
    }
    const ratio = contrast(fgv, bgv);
    if (ratio < min) {
      console.error(
        `FAIL     ${name}: ${what} — ${ratio.toFixed(2)}:1 (need ${min}:1)  [${fg} ${fgv} / ${bg} ${bgv}]`,
      );
      failures++;
    }
  }
}

if (failures) {
  console.error(`\ncheck:contrast FAILED — ${failures} pair(s) below WCAG 2.2 AA.`);
  process.exit(1);
}
console.log(
  `check:contrast PASS — ${PAIRS.length} token pairs meet WCAG 2.2 AA in both the light and dark palette.`,
);
