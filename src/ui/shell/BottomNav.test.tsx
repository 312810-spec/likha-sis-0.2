import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { BottomNav } from "./BottomNav";
import { expectNoAccessibilityViolations } from "../../test/a11y";

function renderBottomNav(over: Partial<ComponentProps<typeof BottomNav>> = {}) {
  return render(
    <BottomNav activeTab="workspace" onNavigate={vi.fn()} onOpenMore={vi.fn()} {...over} />,
  );
}

describe("BottomNav", () => {
  it("renders four destinations plus More", () => {
    renderBottomNav();
    for (const name of ["Home", "Classes", "Learners", "Grades", "More"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
  });

  it("marks the active destination", () => {
    renderBottomNav({ activeTab: "learners" });
    expect(screen.getByRole("button", { name: "Learners" })).toHaveAttribute(
      "aria-current",
      "page",
    );
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

  it("calls onNavigate / onOpenMore", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const onOpenMore = vi.fn();
    renderBottomNav({ onNavigate, onOpenMore });
    await user.click(screen.getByRole("button", { name: "Classes" }));
    expect(onNavigate).toHaveBeenCalledWith("today-classes");
    await user.click(screen.getByRole("button", { name: "More" }));
    expect(onOpenMore).toHaveBeenCalledTimes(1);
  });
});
