import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TopBar } from "./TopBar";
import { ModeProvider } from "../theme/ModeContext";
import { AppearanceProvider } from "../theme/AppearanceProvider";
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
    <AppearanceProvider>
      <ModeProvider>
        <TopBar
          session={session}
          activeTab="attendance"
          onLogout={vi.fn()}
          onOpenDrawer={vi.fn()}
          {...over}
        />
      </ModeProvider>
    </AppearanceProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-appearance");
  document.documentElement.removeAttribute("data-teacher-mode");
});
afterEach(() => {
  window.localStorage.clear();
  document.documentElement.removeAttribute("data-appearance");
});

describe("TopBar", () => {
  it("shows the group + screen breadcrumb for the active tab", () => {
    renderTopBar({ activeTab: "attendance" });
    expect(screen.getByText("Daily Teaching")).toBeInTheDocument();
    expect(screen.getByText("Attendance", { selector: "strong" })).toBeInTheDocument();
  });

  it("shows only the screen title for a tab with no group (Home)", () => {
    renderTopBar({ activeTab: "workspace" });
    expect(screen.getByText("Home", { selector: "strong" })).toBeInTheDocument();
  });

  it("renders the identity line", () => {
    renderTopBar();
    expect(screen.getByText("Ana Cruz · Rizal Elementary")).toBeInTheDocument();
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
    const efficient = screen.getByRole("button", { name: "Efficient" });
    await user.click(efficient);
    expect(efficient).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.dataset.teacherMode).toBe("efficient");
  });

  it("offers an appearance switcher defaulting to System", () => {
    renderTopBar();
    const group = screen.getByRole("group", { name: "Appearance" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "System" })).toHaveAttribute("aria-pressed", "true");
  });

  it("choosing Dark from the appearance switcher sets html[data-appearance]", async () => {
    const user = userEvent.setup();
    renderTopBar();
    await user.click(screen.getByRole("button", { name: "Dark" }));
    expect(screen.getByRole("button", { name: "Dark" })).toHaveAttribute("aria-pressed", "true");
    expect(document.documentElement.getAttribute("data-appearance")).toBe("dark");
  });
});
