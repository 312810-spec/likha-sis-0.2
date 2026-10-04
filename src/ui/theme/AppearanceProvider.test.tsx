import { act, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AppearanceProvider } from "./AppearanceProvider";
import { AppearanceControl } from "./AppearanceControl";
let dark = false;
let notify: (() => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  dark = false;
  notify = undefined;
  vi.stubGlobal(
    "matchMedia",
    vi.fn(() => ({
      get matches() {
        return dark;
      },
      addEventListener: (_event: string, callback: () => void) => {
        notify = callback;
      },
      removeEventListener: vi.fn(),
    })),
  );
});
afterEach(() => vi.unstubAllGlobals());
const show = () =>
  render(
    <AppearanceProvider>
      <AppearanceControl />
    </AppearanceProvider>,
  );
describe("School appearance", () => {
  it("follows OS changes in System and preserves explicit Light or Dark", async () => {
    const user = userEvent.setup();
    show();
    expect(document.documentElement.dataset.appearance).toBe("light");
    act(() => {
      dark = true;
      notify?.();
    });
    expect(document.documentElement.dataset.appearance).toBe("dark");
    await user.selectOptions(screen.getByLabelText("Appearance"), "light");
    act(() => notify?.());
    expect(document.documentElement.dataset.appearance).toBe("light");
    await user.selectOptions(screen.getByLabelText("Appearance"), "dark");
    act(() => {
      dark = false;
      notify?.();
    });
    expect(document.documentElement.dataset.appearance).toBe("dark");
    expect(localStorage.getItem("likha-sis:appearance")).toBe("dark");
    await user.selectOptions(screen.getByLabelText("Appearance"), "system");
    expect(document.documentElement.dataset.appearance).toBe("light");
  });
  it("restores a device preference and rejects invalid stored values", () => {
    localStorage.setItem("likha-sis:appearance", "dark");
    const first = show();
    expect(document.documentElement.dataset.appearance).toBe("dark");
    first.unmount();
    localStorage.setItem("likha-sis:appearance", "bad-value");
    show();
    expect(screen.getByLabelText("Appearance")).toHaveValue("system");
    expect(document.documentElement.dataset.appearance).toBe("light");
  });
  it("keeps appearance functional when device storage is disabled", async () => {
    const user = userEvent.setup();
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("disabled");
    });
    show();
    await user.selectOptions(screen.getByLabelText("Appearance"), "dark");
    expect(document.documentElement.dataset.appearance).toBe("dark");
    spy.mockRestore();
  });
});
