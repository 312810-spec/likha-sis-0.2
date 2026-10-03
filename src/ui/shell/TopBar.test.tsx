import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { ModeProvider } from "../theme/ModeContext";
import { expectNoAccessibilityViolations } from "../../test/a11y";
import type { CurrentSession } from "../../domain/session";

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
  roles: ["teacher"],
};

function renderTopBar(over: Partial<ComponentProps<typeof TopBar>> = {}) {
  return render(
    <ModeProvider>
      <TopBar
        session={session}
        activeTab="attendance"
        onLogout={vi.fn()}
        onOpenDrawer={vi.fn()}
        {...over}
      />
    </ModeProvider>,
  );
}

describe("TopBar", () => {
  it("shows the current screen without navigation breadcrumbs", () => {
    renderTopBar();
    expect(screen.getByText("Attendance", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByText("Daily Teaching")).not.toBeInTheDocument();
  });
  it("shows Dashboard and keeps preferences out of the normal header", () => {
    renderTopBar({ activeTab: "workspace" });
    expect(screen.getByText("Dashboard", { selector: "strong" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Efficient" })).not.toBeInTheDocument();
  });
  it("shows the teacher name in the account control", () => {
    renderTopBar();
    expect(
      screen.getByRole("button", { name: "Account preferences for Ana Cruz" }),
    ).toBeInTheDocument();
  });

  it("renders no logo image by default (no logo uploaded)", () => {
    const { container } = renderTopBar();
    expect(container.querySelector(".app-topbar-logo")).not.toBeInTheDocument();
  });

  it("renders the school logo when logoUrl is provided", () => {
    const { container } = renderTopBar({ logoUrl: "blob:mock-logo" });
    const img = container.querySelector(".app-topbar-logo");
    expect(img).toHaveAttribute("src", "blob:mock-logo");
  });

  it("calls onLogout from the Log out button", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderTopBar({ onLogout });
    await user.click(screen.getByRole("button", { name: "Account preferences for Ana Cruz" }));
    await user.click(screen.getByRole("button", { name: "Log out" }));
    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("calls onOpenDrawer from the hamburger", async () => {
    const user = userEvent.setup();
    const onOpenDrawer = vi.fn();
    renderTopBar({ onOpenDrawer });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    expect(onOpenDrawer).toHaveBeenCalledTimes(1);
  });

  it("has no axe violations on a default render", async () => {
    const { container } = renderTopBar();
    await expectNoAccessibilityViolations(container);
  });

  it("keeps a working density-mode switcher", async () => {
    const user = userEvent.setup();
    renderTopBar();
    await user.click(screen.getByRole("button", { name: "Account preferences for Ana Cruz" }));
    const efficient = screen.getByRole("button", { name: "Efficient" });
    await user.click(efficient);
    expect(efficient).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.teacherMode).toBe("efficient");
  });
  it("opens preferences with focus and closes on Escape, restoring focus", async () => {
    const user = userEvent.setup();
    renderTopBar();
    const trigger = screen.getByRole("button", { name: "Account preferences for Ana Cruz" });
    await user.click(trigger);
    expect(screen.getByRole("dialog", { name: "Account preferences" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Appearance" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });
  it("dismisses preferences when clicking outside", async () => {
    const user = userEvent.setup();
    renderTopBar();
    await user.click(screen.getByRole("button", { name: "Account preferences for Ana Cruz" }));
    await user.click(screen.getByText("Attendance", { selector: "strong" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("has no axe violations with account preferences open", async () => {
    const { container } = renderTopBar();
    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Account preferences for Ana Cruz" }));
    await expectNoAccessibilityViolations(container);
  });
});
