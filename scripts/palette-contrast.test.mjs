// @vitest-environment node
import { readFileSync } from "node:fs";
const css = readFileSync("src/ui/theme/styles.css", "utf8");
import { describe, expect, it } from "vitest";
function palette(selector) {
  const block = css.slice(css.indexOf(selector)).split("}")[0];
  return Object.fromEntries(
    [...block.matchAll(/--color-([\w-]+):\s*(#[\da-f]{3,6})/g)].map((match) => [
      match[1],
      match[2],
    ]),
  );
}
function luminance(hex) {
  if (hex.length === 4) hex = "#" + [...hex.slice(1)].map((char) => char + char).join("");
  const rgb = hex
    .slice(1)
    .match(/../g)
    .map((value) => parseInt(value, 16) / 255)
    .map((value) => (value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
}
function contrast(a, b) {
  const pair = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (pair[0] + 0.05) / (pair[1] + 0.05);
}
for (const selector of [":root {", ':root[data-appearance="dark"] {']) {
  describe(selector, () => {
    const colors = palette(selector);
    for (const surface of ["bg", "surface", "surface-2", "primary-wash"]) {
      it(`keeps normal, secondary text and controls readable on ${surface}`, () => {
        for (const text of ["text", "text-muted", "primary"])
          expect(contrast(colors[text], colors[surface])).toBeGreaterThanOrEqual(4.5);
        expect(contrast(colors.border, colors[surface])).toBeGreaterThanOrEqual(3);
      });
    }
    for (const state of ["success", "warning", "danger", "productive"]) {
      it(`keeps ${state} labels readable`, () =>
        expect(contrast(colors[state], colors[`${state}-surface`])).toBeGreaterThanOrEqual(4.5));
    }
    it("keeps primary action text readable", () =>
      expect(contrast(colors.primary, colors["primary-text"])).toBeGreaterThanOrEqual(4.5));
  });
}

it("keeps status text readable on white paper when printing from dark mode", () => {
  const colors = palette(":root[data-appearance],");
  expect(colors.bg).toBe("#fff");
  for (const state of ["success", "warning", "danger", "productive"]) {
    expect(colors[`${state}-surface`]).toBe("#fff");
    expect(contrast(colors[state], colors.bg)).toBeGreaterThanOrEqual(4.5);
  }
});
