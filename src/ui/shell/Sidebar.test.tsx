import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { SignedInTab } from "../components/workbench-nav-data";
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
  idleExpiresAtUnixMs: 2_000_000,
  roles: ["teacher"],
};

function renderSidebar(
  activeTab: SignedInTab = "attendance",
  onNavigate = vi.fn(),
  logoUrl: string | null = null,
) {
  return render(
    <ModeProvider>
      <Sidebar session={session} activeTab={activeTab} onNavigate={onNavigate} logoUrl={logoUrl} />
    </ModeProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("Sidebar", () => {
  it("renders no logo image by default (no logo uploaded)", () => {
    const { container } = renderSidebar();
    expect(container.querySelector(".app-sidebar-logo")).not.toBeInTheDocument();
  });

  it("renders the school logo when logoUrl is provided", () => {
    const { container } = renderSidebar("attendance", vi.fn(), "blob:mock-logo");
    const img = container.querySelector(".app-sidebar-logo");
    expect(img).toHaveAttribute("src", "blob:mock-logo");
  });

  it("renders the brand, signed-in identity, pinned Home, and navigation groups", () => {
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1, name: "LIKHA-SIS" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    expect(screen.getByText("Ana Cruz")).toBeInTheDocument();
    expect(screen.getByText("Rizal Elementary")).toBeInTheDocument();
    for (const g of ["Daily Teaching", "Class Overview", "Learner Records", "Grading"]) {
      expect(screen.getByRole("button", { name: g })).toHaveAttribute("aria-expanded", "true");
    }
    // Sync and Security are lower-frequency/admin groups -- collapsed by
    // default so a first-time sidebar isn't ~24 destinations deep.
    for (const g of ["Sync", "Security"]) {
      expect(screen.getByRole("button", { name: g })).toHaveAttribute("aria-expanded", "false");
    }
  });

  it("collapses Sync and Security by default on fresh storage, leaving the other groups expanded", () => {
    renderSidebar();
    expect(screen.getByRole("button", { name: "Sync" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("button", { name: "Sync Status" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "Sign-in Activity" })).not.toBeInTheDocument();
  });

  it("a teacher's own choice to expand Security overrides the default and survives a remount", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();
    await user.click(screen.getByRole("button", { name: "Security" }));
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    unmount();

    renderSidebar();
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
  });

  it("marks the active destination with aria-current", () => {
    renderSidebar("attendance");
    expect(screen.getByRole("button", { name: "Attendance" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("normalizes a contextual tab so its parent stays highlighted", () => {
    renderSidebar("section-roster");
    expect(screen.getByRole("button", { name: /Sections/ })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("calls onNavigate with the tab id when a destination is clicked", async () => {
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    renderSidebar("attendance", onNavigate);
    await user.click(screen.getByRole("button", { name: "Learners" }));
    expect(onNavigate).toHaveBeenCalledWith("learners");
  });

  it("collapses a group, hides its items, and persists the choice", async () => {
    const user = userEvent.setup();
    const { unmount } = renderSidebar();
    await user.click(screen.getByRole("button", { name: "Grading" }));
    expect(screen.getByRole("button", { name: "Grading" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("button", { name: "Class Records" })).not.toBeInTheDocument();
    expect(window.localStorage.getItem("likha-sis:nav-collapsed")).toContain("Grading");
    unmount();
    renderSidebar();
    expect(screen.getByRole("button", { name: "Grading" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
  });

  it("has no axe violations on a default render", async () => {
    const { container } = renderSidebar();
    await expectNoAccessibilityViolations(container);
  });

  it("survives unreadable localStorage by falling back to the same default as fresh storage", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderSidebar();
    expect(screen.getByRole("button", { name: "Daily Teaching" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    // There's no way to know what the teacher chose when storage throws --
    // fall back to the same collapsed-by-default set as fresh storage, not
    // an empty (all-expanded) one.
    expect(screen.getByRole("button", { name: "Sync" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Security" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    spy.mockRestore();
  });
});
