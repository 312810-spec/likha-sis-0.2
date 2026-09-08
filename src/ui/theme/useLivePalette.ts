import { useEffect } from "react";
import { derivePaletteTokens } from "../../domain/palette";

const STYLE_ELEMENT_ID = "live-palette-tokens";

/**
 * Live palette wiring (Batch 8 item 6, ADR-0078). Given a school logo's
 * extracted dominant color, `domain/palette.ts` already derives a
 * WCAG-AA-verified dark-mode accent/surface/text triple; this module is
 * the "small piece of UI glue" that module's own doc comment says is
 * needed to actually draw the logo to a canvas, sample it, and apply the
 * result. Pure `computeLivePaletteStyleText`/`applyLivePaletteStyle`
 * halves are exported separately so they're testable without a real
 * `<img>` decode -- only `useLivePalette` itself touches `Image`/canvas.
 */

/** Pure: given already-sampled logo pixel data, returns the CSS text to
 * override the dark-mode accent/surface/text tokens, or `null` when the
 * derived pair does not clear WCAG AA (the caller must then fall back to
 * the existing static dark palette in `styles.css`, never apply an
 * unverified pair). */
export function computeLivePaletteStyleText(pixels: Uint8ClampedArray | number[]): string | null {
  const tokens = derivePaletteTokens(pixels);
  if (!tokens.meetsAa) return null;
  const overrides = `--color-primary: ${tokens.accent}; --color-surface: ${tokens.darkSurface}; --color-text: ${tokens.darkText};`;
  return (
    `:root[data-theme="dark"] { ${overrides} }\n` +
    `@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) { ${overrides} } }`
  );
}

/** Pure DOM effect: creates/updates/removes the single
 * `#live-palette-tokens` `<style>` element. Passing `null` removes it
 * entirely -- the app then falls back to the static dark palette already
 * in `styles.css`, cleanly, with no "broken theme" state. */
export function applyLivePaletteStyle(cssText: string | null): void {
  const existing = document.getElementById(STYLE_ELEMENT_ID);
  if (cssText === null) {
    existing?.remove();
    return;
  }
  const style = existing instanceof HTMLStyleElement ? existing : document.createElement("style");
  style.id = STYLE_ELEMENT_ID;
  style.textContent = cssText;
  if (!existing) document.head.appendChild(style);
}

/**
 * Draws `logoUrl` (an object URL for the current school logo, already
 * fetched by the caller -- see `AppLayout`) to an offscreen canvas,
 * samples it via `domain/palette.ts`, and applies the derived dark-mode
 * tokens app-wide when they clear WCAG AA. Falls back cleanly (removes
 * any prior override, never throws into the UI) for: no logo, an image
 * that fails to decode, a canvas context unavailable in this runtime, or
 * a derived pair that does not meet AA.
 */
export function useLivePalette(logoUrl: string | null): void {
  useEffect(() => {
    if (!logoUrl) {
      applyLivePaletteStyle(null);
      return;
    }
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width || 1;
        canvas.height = image.naturalHeight || image.height || 1;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          applyLivePaletteStyle(null);
          return;
        }
        ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
        const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
        applyLivePaletteStyle(computeLivePaletteStyleText(data));
      } catch {
        // Canvas tainted, decode failure, or any other runtime quirk --
        // fall back to the static palette rather than surface an error.
        applyLivePaletteStyle(null);
      }
    };
    image.onerror = () => {
      if (!cancelled) applyLivePaletteStyle(null);
    };
    image.src = logoUrl;
    return () => {
      cancelled = true;
    };
  }, [logoUrl]);
}
