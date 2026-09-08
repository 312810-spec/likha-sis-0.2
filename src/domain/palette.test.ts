import { describe, expect, it } from "vitest";
import { contrastRatio, derivePaletteTokens, extractDominantColors, meetsWcagAa } from "./palette";

function solidImage(r: number, g: number, b: number, count = 100, a = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(count * 4);
  for (let i = 0; i < count; i++) {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = a;
  }
  return data;
}

describe("extractDominantColors", () => {
  it("returns the single color of a solid-fill image", () => {
    const [color] = extractDominantColors(solidImage(30, 90, 160));
    expect(color).toBeDefined();
    expect(color!.r).toBeCloseTo(30, 0);
    expect(color!.g).toBeCloseTo(90, 0);
    expect(color!.b).toBeCloseTo(160, 0);
  });

  it("picks the majority color when two colors are mixed", () => {
    const majority = solidImage(200, 40, 40, 80);
    const minority = solidImage(40, 200, 40, 20);
    const mixed = new Uint8ClampedArray([...majority, ...minority]);
    const [color] = extractDominantColors(mixed);
    expect(color!.r).toBeGreaterThan(color!.g);
  });

  it("ignores fully transparent pixels", () => {
    const data = solidImage(10, 10, 10, 50, 0); // all transparent
    expect(extractDominantColors(data)).toEqual([]);
  });

  it("ignores near-white and near-black pixels as background/foreground noise", () => {
    const white = solidImage(255, 255, 255, 50);
    const black = solidImage(0, 0, 0, 50);
    const brand = solidImage(20, 120, 90, 5);
    const combined = new Uint8ClampedArray([...white, ...black, ...brand]);
    const [color] = extractDominantColors(combined);
    expect(color).toBeDefined();
    expect(color!.g).toBeGreaterThan(color!.r);
  });

  it("returns no colors for an empty buffer", () => {
    expect(extractDominantColors(new Uint8ClampedArray(0))).toEqual([]);
  });
});

describe("contrastRatio / meetsWcagAa", () => {
  it("gives the maximum ratio (21:1) for pure black on pure white", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
  });

  it("gives a ratio of 1 for identical colors", () => {
    expect(contrastRatio("#336699", "#336699")).toBeCloseTo(1, 5);
  });

  it("is symmetric regardless of argument order", () => {
    const a = contrastRatio("#1e3a5f", "#fbf8f2");
    const b = contrastRatio("#fbf8f2", "#1e3a5f");
    expect(a).toBeCloseTo(b, 10);
  });

  it("accepts RgbColor objects as well as hex strings", () => {
    expect(contrastRatio({ r: 0, g: 0, b: 0 }, { r: 255, g: 255, b: 255 })).toBeCloseTo(21, 0);
  });

  it("passes AA normal-text threshold for this project's own verified primary/bg pair", () => {
    // Verified in styles.css: --color-primary #1e3a5f on --color-bg #fbf8f2, 10.85:1.
    expect(meetsWcagAa("#1e3a5f", "#fbf8f2")).toBe(true);
  });

  it("fails AA normal-text threshold for a genuinely low-contrast pair", () => {
    expect(meetsWcagAa("#aaaaaa", "#bbbbbb")).toBe(false);
  });

  it("applies the relaxed 3:1 threshold for large text / UI components", () => {
    // A pair with a real ratio between 3:1 and 4.5:1.
    const fg = "#8c8c8c";
    const bg = "#ffffff";
    const ratio = contrastRatio(fg, bg);
    expect(ratio).toBeGreaterThanOrEqual(3);
    expect(ratio).toBeLessThan(4.5);
    expect(meetsWcagAa(fg, bg, { largeTextOrUiComponent: true })).toBe(true);
    expect(meetsWcagAa(fg, bg)).toBe(false);
  });
});

describe("derivePaletteTokens", () => {
  it("derives a WCAG-AA-verified dark surface/text pair from a bright logo color", () => {
    const bright = solidImage(230, 60, 40); // a vivid, bright brand red
    const tokens = derivePaletteTokens(bright);
    expect(tokens.meetsAa).toBe(true);
    expect(meetsWcagAa(tokens.darkText, tokens.darkSurface)).toBe(true);
  });

  it("derives an AA-verified pair even from a very dark logo color", () => {
    const dark = solidImage(15, 20, 35);
    const tokens = derivePaletteTokens(dark);
    expect(tokens.meetsAa).toBe(true);
  });

  it("falls back to the existing static dark palette when there is no usable pixel data", () => {
    const tokens = derivePaletteTokens(new Uint8ClampedArray(0));
    expect(tokens.meetsAa).toBe(false);
    expect(tokens.darkSurface).toBe("#1c2129");
    expect(tokens.darkText).toBe("#ece9e1");
  });

  it("never claims meetsAa true without the derived pair actually clearing the check", () => {
    const bright = solidImage(255, 255, 0); // extreme, hard case
    const tokens = derivePaletteTokens(bright);
    expect(tokens.meetsAa).toBe(meetsWcagAa(tokens.darkText, tokens.darkSurface));
  });
});
