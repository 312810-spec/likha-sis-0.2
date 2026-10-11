import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { expectNoAccessibilityViolations } from "../../test/a11y";

function renderBottomNav(over: Partial<ComponentProps<typeof BottomNav>> = {}) {
  return render(<BottomNav activeTab="workspace" onNavigate={vi.fn()} {...over} />);
}

describe("BottomNav", () => {
  it("maps Today's teaching work and class folios to their real destinations", async () => {
    const onNavigate = vi.fn();
    const { rerender } = renderBottomNav({ activeTab: "daily-planner", onNavigate });
    expect(screen.getByRole("button", { name: "Today" })).toHaveAttribute("aria-current", "page");
    await userEvent.setup().click(screen.getByRole("button", { name: "Today" }));
    expect(onNavigate).toHaveBeenCalledWith("today");
    rerender(<BottomNav activeTab="workspace" onNavigate={onNavigate} />);
    expect(screen.getByRole("button", { name: "Classes" })).toHaveAttribute("aria-current", "page");
  });

  it("renders the four concept destinations", () => {
    renderBottomNav();
    for (const name of ["Today", "Classes", "Forms", "Account"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the active destination", () => {
    renderBottomNav({ activeTab: "account" });
    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-current", "page");
  });

  it("normalizes contextual tabs (section-roster -> nothing in the bar is current)", () => {
    renderBottomNav({ activeTab: "section-roster" });
    // section-roster normalizes to "sections", which is not one of the four
    // bottom-nav ids, so none is current -- and that is fine.
    expect(screen.queryByRole("button", { current: "page" })).toBeNull();
  });

  it("has no axe violations on a default render", async () => {
    const { container } = renderBottomNav();
    await expectNoAccessibilityViolations(container);
  });

  it("navigates to Classes and Account without opening a synthetic drawer destination", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderBottomNav({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Classes" }));
    expect(onNavigate).toHaveBeenCalledWith("my-day");
    await user.click(screen.getByRole("button", { name: "Account" }));
    expect(onNavigate).toHaveBeenCalledWith("account");
  });
});
