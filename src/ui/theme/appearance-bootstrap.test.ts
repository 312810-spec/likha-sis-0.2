import { describe, expect, it, vi } from "vitest";
import html from "../../../index.html?raw";

// Exercise the actual pre-module script, not a test-only reimplementation.
const script = html.match(/<script id="likha-appearance-bootstrap">([\s\S]*?)<\/script>/)?.[1];

function boot(preference: string | null, systemDark: boolean, failure?: "storage" | "media") {
  const document = { documentElement: { dataset: {} as Record<string, string> } };
  const setItem = vi.fn();
  const window = {
    localStorage: {
      getItem: vi.fn(() => {
        if (failure === "storage") throw new Error("storage denied");
        return preference;
      }),
      setItem,
    },
    matchMedia: vi.fn(() => {
      if (failure === "media") throw new Error("media unavailable");
      return { matches: systemDark };
    }),
  };
  expect(script).toBeTruthy();
  new Function("window", "document", script!)(window, document);
  expect(setItem).not.toHaveBeenCalled();
  return { appearance: document.documentElement.dataset.appearance, window };
}

describe("pre-React appearance", () => {
  it.each([false, true])("preserves explicit appearance on system dark=%s", (dark) => {
    expect(boot("light", dark).appearance).toBe("light");
    expect(boot("dark", dark).appearance).toBe("dark");
  });
  it.each([null, "system", "invalid", "", "DARK"])(
    "follows the OS for absent/non-explicit preference %s",
    (preference) => {
      expect(boot(preference, false).appearance).toBe("light");
      expect(boot(preference, true).appearance).toBe("dark");
    },
  );
  it("uses the OS when storage throws, without blocking startup", () => {
    expect(boot(null, true, "storage").appearance).toBe("dark");
    expect(boot(null, false, "storage").appearance).toBe("light");
  });
  it("falls back safely when media queries throw and respects explicit preferences", () => {
    expect(boot(null, true, "media").appearance).toBe("light");
    const explicit = boot("dark", false, "media");
    expect(explicit.appearance).toBe("dark");
    expect(explicit.window.matchMedia).not.toHaveBeenCalled();
  });
  it("works without a media-query API", () => {
    const document = { documentElement: { dataset: {} as Record<string, string> } };
    new Function("window", "document", script!)(
      { localStorage: { getItem: () => null } },
      document,
    );
    expect(document.documentElement.dataset.appearance).toBe("light");
  });
  it("runs in the head before the application entry module", () => {
    expect(html.indexOf('id="likha-appearance-bootstrap"')).toBeLessThan(html.indexOf("</head>"));
    expect(html.indexOf('id="likha-appearance-bootstrap"')).toBeLessThan(
      html.indexOf('src="/src/main.tsx"'),
    );
  });
});
