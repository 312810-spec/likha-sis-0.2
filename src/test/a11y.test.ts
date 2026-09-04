import { afterEach, describe, expect, it, vi } from "vitest";
import { expectNoAccessibilityViolations } from "./a11y";

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe("expectNoAccessibilityViolations", () => {
  it("does not invoke jsdom's unsupported canvas API", async () => {
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, "getContext");
    const container = document.createElement("main");
    container.innerHTML = '<button type="button">Save</button>';
    document.body.append(container);

    await expectNoAccessibilityViolations(container);

    expect(getContext).not.toHaveBeenCalled();
  });

  it("continues to report structural accessibility violations", async () => {
    const container = document.createElement("main");
    container.innerHTML = '<button type="button"></button>';
    document.body.append(container);

    await expect(expectNoAccessibilityViolations(container)).rejects.toThrow(/button-name/);
  });
});
