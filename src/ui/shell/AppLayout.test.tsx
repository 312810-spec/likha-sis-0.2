import type { ComponentProps } from "react";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
import { ModeProvider } from "../theme/ModeContext";
import type { CurrentSession } from "../../domain/session";

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
};

function renderLayout(over: Partial<ComponentProps<typeof AppLayout>> = {}) {
  return render(
    <ModeProvider>
      <AppLayout
        session={session}
        activeTab="attendance"
        onNavigate={vi.fn()}
        onLogout={vi.fn()}
        {...over}
      >
        <div data-testid="screen">screen content</div>
      </AppLayout>
    </ModeProvider>,
  );
}

describe("AppLayout", () => {
  it("renders one main landmark wrapping the screen content", () => {
    renderLayout();
    const main = screen.getByRole("main");
    expect(within(main).getByTestId("screen")).toBeInTheDocument();
  });

  it("starts with the drawer closed", () => {
    const { container } = renderLayout();
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  it("opens the drawer from the hamburger and closes it on Escape, restoring focus", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    const hamburger = screen.getByRole("button", { name: "Open navigation" });
    await user.click(hamburger);
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "open");
    await user.keyboard("{Escape}");
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
    expect(hamburger).toHaveFocus();
  });

  it("closes the drawer when a navigation happens", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderLayout({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    // Both the sidebar and the bottom nav expose a "Learners" button, so
    // scope to the sidebar landmark (aria-label "Primary", exact).
    const sidebar = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(sidebar).getByRole("button", { name: "Learners" }));
    expect(onNavigate).toHaveBeenCalledWith("learners");
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  it("closes the drawer when the scrim is clicked", async () => {
    const user = userEvent.setup();
    const { container } = renderLayout();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(container.querySelector(".app-layout-scrim")!);
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });
});
