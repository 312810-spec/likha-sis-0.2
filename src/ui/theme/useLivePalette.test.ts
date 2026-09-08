import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyLivePaletteStyle,
  computeLivePaletteStyleText,
  useLivePalette,
} from "./useLivePalette";

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

/** jsdom's real `Image` never decodes -- this stand-in synchronously
 * "loads" (or "errors", for a src containing "broken") on the next
 * microtask, exactly like `useLivePalette`'s real onload/onerror wiring
 * expects, without a real image decode. */
class FakeImage {
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  naturalWidth = 10;
  naturalHeight = 10;
  width = 10;
  height = 10;
  #src = "";
  get src() {
    return this.#src;
  }
  set src(value: string) {
    this.#src = value;
    queueMicrotask(() => {
      if (value.includes("broken")) this.onerror?.();
      else this.onload?.();
    });
  }
}

function flushMicrotasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

afterEach(() => {
  applyLivePaletteStyle(null);
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("computeLivePaletteStyleText", () => {
  it("returns dark-theme CSS overrides for a color that clears WCAG AA", () => {
    const css = computeLivePaletteStyleText(solidImage(230, 60, 40));
    expect(css).not.toBeNull();
    expect(css).toContain(':root[data-theme="dark"]');
    expect(css).toContain("--color-primary:");
    expect(css).toContain("--color-surface:");
    expect(css).toContain("--color-text:");
    expect(css).toContain("prefers-color-scheme: dark");
  });

  it("returns null when there is no usable pixel data (never applies an unverified pair)", () => {
    expect(computeLivePaletteStyleText(new Uint8ClampedArray(0))).toBeNull();
  });
});

describe("applyLivePaletteStyle", () => {
  it("inserts a single #live-palette-tokens style element with the given CSS", () => {
    applyLivePaletteStyle("body { color: red; }");
    const style = document.getElementById("live-palette-tokens");
    expect(style).toBeInstanceOf(HTMLStyleElement);
    expect(style?.textContent).toBe("body { color: red; }");
  });

  it("updates the existing element in place rather than duplicating it", () => {
    applyLivePaletteStyle("body { color: red; }");
    applyLivePaletteStyle("body { color: blue; }");
    expect(document.querySelectorAll("#live-palette-tokens")).toHaveLength(1);
    expect(document.getElementById("live-palette-tokens")?.textContent).toBe(
      "body { color: blue; }",
    );
  });

  it("removes the element cleanly (fallback to the static palette) when passed null", () => {
    applyLivePaletteStyle("body { color: red; }");
    applyLivePaletteStyle(null);
    expect(document.getElementById("live-palette-tokens")).toBeNull();
  });
});

describe("useLivePalette", () => {
  it("removes any override and does nothing else when there is no logo", () => {
    applyLivePaletteStyle("body { color: red; }");
    renderHook(() => useLivePalette(null));
    expect(document.getElementById("live-palette-tokens")).toBeNull();
  });

  it("applies derived AA-verified tokens once the logo image decodes and the canvas samples it", async () => {
    const fakeContext = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({ data: solidImage(230, 60, 40) })),
    };
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(
      fakeContext as unknown as CanvasRenderingContext2D,
    );
    vi.stubGlobal("Image", FakeImage);

    renderHook(() => useLivePalette("blob:fake-logo-url"));
    await flushMicrotasks();

    expect(fakeContext.getImageData).toHaveBeenCalled();
    const style = document.getElementById("live-palette-tokens");
    expect(style?.textContent).toContain("--color-primary:");
  });

  it("falls back cleanly (no override, no throw) when the canvas context is unavailable", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
    vi.stubGlobal("Image", FakeImage);
    applyLivePaletteStyle("body { color: red; }");

    renderHook(() => useLivePalette("blob:fake-logo-url"));
    await flushMicrotasks();

    expect(document.getElementById("live-palette-tokens")).toBeNull();
  });

  it("falls back cleanly when the logo image fails to decode", async () => {
    vi.stubGlobal("Image", FakeImage);
    applyLivePaletteStyle("body { color: red; }");

    renderHook(() => useLivePalette("blob:broken-logo-url"));
    await flushMicrotasks();

    expect(document.getElementById("live-palette-tokens")).toBeNull();
  });
});
