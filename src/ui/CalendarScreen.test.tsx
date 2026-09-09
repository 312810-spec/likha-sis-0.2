import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { CalendarScreen } from "./CalendarScreen";
import { ModeProvider } from "./theme/ModeContext";

function renderScreen() {
  return render(
    <ModeProvider>
      <CalendarScreen />
    </ModeProvider>,
  );
}

describe("CalendarScreen", () => {
  it("renders the SY 2025-2026 holiday table with its source citation visible", () => {
    renderScreen();
    expect(screen.getByRole("heading", { name: "School Calendar" })).toBeInTheDocument();
    expect(screen.getByText("Christmas Day")).toBeInTheDocument();
    expect(screen.getByText("National Heroes Day")).toBeInTheDocument();
    expect(screen.getByText(/Proclamation No\. 727, s\. 2025/)).toBeInTheDocument();
    expect(screen.getByText(/Proclamation No\. 665, s\. 2025/)).toBeInTheDocument();
  });

  it("lists holidays in date order", () => {
    renderScreen();
    const rows = screen.getAllByRole("row").slice(1); // drop header row
    const dates = rows.map((row) => row.querySelector("th")?.textContent);
    const sorted = [...dates].sort();
    expect(dates).toEqual(sorted);
  });

  it("has no axe-detectable accessibility violations", async () => {
    const { container } = renderScreen();
    await expectNoAccessibilityViolations(container);
  });
});
