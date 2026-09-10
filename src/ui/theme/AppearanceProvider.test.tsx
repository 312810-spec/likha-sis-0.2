import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { AppearanceProvider } from "./AppearanceProvider";
import { useAppearance } from "./useAppearance";

function AppearanceProbe() {
  const { appearance, setAppearance } = useAppearance();
  return (
    <div>
      <span data-testid="current">{appearance}</span>
      <button type="button" onClick={() => setAppearance("dark")}>
        Dark
      </button>
      <button type="button" onClick={() => setAppearance("light")}>
        Light
      </button>
      <button type="button" onClick={() => setAppearance("system")}>
        System
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-appearance");
});

describe("AppearanceProvider", () => {
  it("defaults to system and sets no data-appearance attribute", () => {
    render(
      <AppearanceProvider>
        <AppearanceProbe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("current")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-appearance")).toBe(false);
  });

  it("choosing dark updates context, the html attribute, and storage", async () => {
    const user = userEvent.setup();
    render(
      <AppearanceProvider>
        <AppearanceProbe />
      </AppearanceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));

    expect(screen.getByTestId("current")).toHaveTextContent("dark");
    expect(document.documentElement.getAttribute("data-appearance")).toBe("dark");
    expect(window.localStorage.getItem("likha-sis:appearance")).toBe("dark");
  });

  it("choosing system again clears the attribute (dark mode falls back to the media query)", async () => {
    const user = userEvent.setup();
    render(
      <AppearanceProvider>
        <AppearanceProbe />
      </AppearanceProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Dark" }));
    await user.click(screen.getByRole("button", { name: "System" }));

    expect(screen.getByTestId("current")).toHaveTextContent("system");
    expect(document.documentElement.hasAttribute("data-appearance")).toBe(false);
    expect(window.localStorage.getItem("likha-sis:appearance")).toBe("system");
  });

  it("restores a previously stored preference on mount", () => {
    window.localStorage.setItem("likha-sis:appearance", "light");

    render(
      <AppearanceProvider>
        <AppearanceProbe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("current")).toHaveTextContent("light");
    expect(document.documentElement.getAttribute("data-appearance")).toBe("light");
  });

  it("ignores an invalid stored value and falls back to system", () => {
    window.localStorage.setItem("likha-sis:appearance", "sepia");

    render(
      <AppearanceProvider>
        <AppearanceProbe />
      </AppearanceProvider>,
    );

    expect(screen.getByTestId("current")).toHaveTextContent("system");
  });

  it("useAppearance throws outside of an AppearanceProvider", () => {
    expect(() => render(<AppearanceProbe />)).toThrow(/useAppearance must be used within/);
  });
});
