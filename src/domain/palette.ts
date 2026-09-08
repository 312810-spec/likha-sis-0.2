/**
 * Batch 4 (Tier 3.1): dependency-light logo palette extraction and WCAG
 * contrast checking. See
 * `docs/adr/0075-visual-timetable-and-theme-tokens.md` for why this is a
 * hand-written dominant-color sampler rather than a new npm dependency
 * (e.g. `colorthief`, `color-thief-react`, `node-vibrant`) -- the legacy
 * reference project's `ColorThief` approach is ported in *intent* only.
 *
 * Pure functions over plain pixel/color data -- no `<canvas>`, no DOM,
 * no UI import, so this is independently testable
 * (`palette.test.ts`). The caller (a small piece of UI glue, not this
 * module) is responsible for actually drawing the uploaded logo to an
 * offscreen `<canvas>` and calling `getImageData()` to obtain the
 * `Uint8ClampedArray` this module consumes.
 */

export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

function toHex(c: RgbColor): string {
  const hex = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, "0");
  return `#${hex(c.r)}${hex(c.g)}${hex(c.b)}`;
}

function parseHex(hex: string): RgbColor {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  const num = parseInt(full, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
}

/**
 * Dominant-color extraction via naive color-bucket quantization: pixels
 * are grouped into coarse RGB buckets (default 8 levels per channel, so
 * 512 buckets total -- enough to separate a logo's real hues from
 * antialiasing noise without a heavy k-means/median-cut implementation),
 * the bucket with the most (non-transparent, non-near-white,
 * non-near-black) pixels wins, and its member pixels are averaged for a
 * clean representative color.
 *
 * `pixels` is an RGBA-interleaved buffer, exactly the shape
 * `CanvasRenderingContext2D.getImageData().data` already produces (this
 * function never touches `ImageData` itself, only its `.data`, so it
 * needs no DOM to test). `alphaThreshold` and `extremeThreshold` let a
 * caller tune what counts as "background" without a canvas re-sample.
 */
export function extractDominantColors(
  pixels: Uint8ClampedArray | number[],
  options: {
    maxColors?: number;
    bucketLevels?: number;
    alphaThreshold?: number;
    extremeThreshold?: number;
  } = {},
): RgbColor[] {
  const maxColors = options.maxColors ?? 3;
  const bucketLevels = options.bucketLevels ?? 8;
  const alphaThreshold = options.alphaThreshold ?? 16;
  const extremeThreshold = options.extremeThreshold ?? 12; // within this of 0 or 255 on every channel = ignored

  const bucketSize = 256 / bucketLevels;
  const buckets = new Map<string, { count: number; rSum: number; gSum: number; bSum: number }>();

  for (let i = 0; i + 3 < pixels.length; i += 4) {
    const r = pixels[i] ?? 0;
    const g = pixels[i + 1] ?? 0;
    const b = pixels[i + 2] ?? 0;
    const a = pixels[i + 3] ?? 255;
    if (a < alphaThreshold) continue;
    const isNearBlack = r < extremeThreshold && g < extremeThreshold && b < extremeThreshold;
    const isNearWhite =
      r > 255 - extremeThreshold && g > 255 - extremeThreshold && b > 255 - extremeThreshold;
    if (isNearBlack || isNearWhite) continue;

    const key = `${Math.floor(r / bucketSize)}-${Math.floor(g / bucketSize)}-${Math.floor(b / bucketSize)}`;
    const bucket = buckets.get(key) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    bucket.count += 1;
    bucket.rSum += r;
    bucket.gSum += g;
    bucket.bSum += b;
    buckets.set(key, bucket);
  }

  const ranked = [...buckets.values()].sort((a, b) => b.count - a.count).slice(0, maxColors);
  return ranked.map((bucket) => ({
    r: bucket.rSum / bucket.count,
    g: bucket.gSum / bucket.count,
    b: bucket.bSum / bucket.count,
  }));
}

/** Relative luminance per WCAG 2.x (sRGB), used by `contrastRatio`. */
function relativeLuminance(c: RgbColor): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(c.r) + 0.7152 * channel(c.g) + 0.0722 * channel(c.b);
}

/** WCAG contrast ratio between two colors, each accepted as an `RgbColor`
 * or a `#rrggbb`/`#rgb` hex string. Result is in [1, 21]. */
export function contrastRatio(a: RgbColor | string, b: RgbColor | string): number {
  const colorA = typeof a === "string" ? parseHex(a) : a;
  const colorB = typeof b === "string" ? parseHex(b) : b;
  const lumA = relativeLuminance(colorA);
  const lumB = relativeLuminance(colorB);
  const lighter = Math.max(lumA, lumB);
  const darker = Math.min(lumA, lumB);
  return (lighter + 0.05) / (darker + 0.05);
}

/** WCAG AA thresholds: 4.5:1 normal text, 3:1 large text (>=18pt, or
 * >=14pt bold) and non-text UI components. */
export function meetsWcagAa(
  foreground: RgbColor | string,
  background: RgbColor | string,
  options: { largeTextOrUiComponent?: boolean } = {},
): boolean {
  const threshold = options.largeTextOrUiComponent ? 3 : 4.5;
  return contrastRatio(foreground, background) >= threshold;
}

/** Nudges a color's lightness toward black/white (in simple linear RGB
 * space -- adequate for token derivation, not a perceptual color space)
 * until it clears the given contrast ratio against `against`, or gives
 * up after a bounded number of steps and returns the best it found. Used
 * to derive a WCAG-AA-compliant dark-mode surface/text token pair from a
 * school logo's extracted dominant color, without hand-tuning per
 * school. */
function deriveAccessibleVariant(
  base: RgbColor,
  against: RgbColor | string,
  targetRatio: number,
  direction: "lighten" | "darken",
): RgbColor {
  let current = { ...base };
  const step = direction === "lighten" ? 8 : -8;
  for (let i = 0; i < 32; i++) {
    if (contrastRatio(current, against) >= targetRatio) return current;
    current = {
      r: current.r + step,
      g: current.g + step,
      b: current.b + step,
    };
    if (current.r <= 0 && current.g <= 0 && current.b <= 0) return { r: 0, g: 0, b: 0 };
    if (current.r >= 255 && current.g >= 255 && current.b >= 255) return { r: 255, g: 255, b: 255 };
  }
  return current;
}

export interface DerivedThemeTokens {
  /** The extracted (or fallback) brand accent, as a hex string. */
  accent: string;
  /** A dark-mode surface tone derived from the accent, verified >= 3:1
   * against darkText below (non-text UI contrast) before being returned. */
  darkSurface: string;
  /** A dark-mode text tone, verified >= 4.5:1 against darkSurface. */
  darkText: string;
  /** True only when every derived pair above actually cleared its WCAG
   * AA target -- lets the caller fall back to the existing static dark
   * palette (`styles.css`) rather than ship an unverified pair. */
  meetsAa: boolean;
}

/**
 * Full pipeline: dominant-color extraction -> accessible dark-mode
 * surface/text token derivation -> programmatic AA verification. Given
 * no usable pixels (a transparent/blank logo, or none at all), returns
 * `meetsAa: false` and a neutral fallback so a caller always has
 * *something* to render, but never silently claims accessibility it
 * didn't verify.
 */
function darkenUntilLuminanceBelow(color: RgbColor, maxLuminance: number): RgbColor {
  let current = { ...color };
  for (let i = 0; i < 32 && relativeLuminance(current) > maxLuminance; i++) {
    current = {
      r: Math.max(0, current.r - 10),
      g: Math.max(0, current.g - 10),
      b: Math.max(0, current.b - 10),
    };
  }
  return current;
}

export function derivePaletteTokens(pixels: Uint8ClampedArray | number[]): DerivedThemeTokens {
  const [dominant] = extractDominantColors(pixels, { maxColors: 1 });
  const fallback: DerivedThemeTokens = {
    accent: "#1e3a5f",
    darkSurface: "#1c2129",
    darkText: "#ece9e1",
    meetsAa: false,
  };
  if (!dominant) return fallback;

  // Push the dominant hue down to a genuinely dark surface tone first (a
  // bright logo color would otherwise stay bright and never read as a
  // "dark mode" surface at all), then pick white text and, only if that
  // alone doesn't clear AA, darken the surface further until it does.
  let surface = darkenUntilLuminanceBelow(dominant, 0.08);
  const text: RgbColor = { r: 255, g: 255, b: 255 };
  if (!meetsWcagAa(text, surface)) {
    surface = deriveAccessibleVariant(surface, text, 4.5, "darken");
  }
  const meetsAa = meetsWcagAa(text, surface);

  return {
    accent: toHex(dominant),
    darkSurface: toHex(surface),
    darkText: toHex(text),
    meetsAa,
  };
}
