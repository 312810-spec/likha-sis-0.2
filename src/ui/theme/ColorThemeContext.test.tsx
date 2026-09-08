import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it } from "vitest";
import { ColorThemeProvider } from "./ColorThemeContext";
import { useColorTheme } from "./useColorTheme";

function ThemeProbe() {
  const { theme, setTheme } = useColorTheme();
  return (
    <div>
      <span data-testid="current-theme">{theme}</span>
      <button type="button" onClick={() => setTheme("dark")}>
        Switch to dark
      </button>
      <button type="button" onClick={() => setTheme("system")}>
        Switch to system
      </button>
    </div>
  );
}

beforeEach(() => {
  window.localStorage.clear();
  delete document.documentElement.dataset.theme;
});

describe("ColorThemeProvider", () => {
  it("defaults to system with no data-theme attribute stamped", () => {
    render(
      <ColorThemeProvider>
        <ThemeProbe />
      </ColorThemeProvider>,
    );

    expect(screen.getByTestId("current-theme")).toHaveTextContent("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("switching to dark updates the context, the DOM attribute, and storage", async () => {
    const user = userEvent.setup();
    render(
      <ColorThemeProvider>
        <ThemeProbe />
      </ColorThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark" }));

    expect(screen.getByTestId("current-theme")).toHaveTextContent("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(window.localStorage.getItem("likha-sis:color-theme")).toBe("dark");
  });

  it("switching back to system removes the data-theme attribute", async () => {
    const user = userEvent.setup();
    render(
      <ColorThemeProvider>
        <ThemeProbe />
      </ColorThemeProvider>,
    );

    await user.click(screen.getByRole("button", { name: "Switch to dark" }));
    await user.click(screen.getByRole("button", { name: "Switch to system" }));

    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("restores a previously stored theme on mount", () => {
    window.localStorage.setItem("likha-sis:color-theme", "light");

    render(
      <ColorThemeProvider>
        <ThemeProbe />
      </ColorThemeProvider>,
    );

    expect(screen.getByTestId("current-theme")).toHaveTextContent("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("ignores an invalid stored value and falls back to system", () => {
    window.localStorage.setItem("likha-sis:color-theme", "not-a-real-theme");

    render(
      <ColorThemeProvider>
        <ThemeProbe />
      </ColorThemeProvider>,
    );

    expect(screen.getByTestId("current-theme")).toHaveTextContent("system");
  });

  it("useColorTheme throws outside of a ColorThemeProvider", () => {
    expect(() => render(<ThemeProbe />)).toThrow(/useColorTheme must be used within/);
  });
});
