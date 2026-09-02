import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Sidebar } from "./Sidebar";
import type { SignedInTab } from "../components/workbench-nav-data";
import { ModeProvider } from "../theme/ModeContext";

function renderSidebar(activeTab: SignedInTab = "attendance", onNavigate = vi.fn()) {
  return render(
    <ModeProvider>
      <Sidebar activeTab={activeTab} onNavigate={onNavigate} />
    </ModeProvider>,
  );
}

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe("Sidebar", () => {
  it("renders the brand, a pinned Home, and the four groups", () => {
    renderSidebar();
    expect(screen.getByRole("navigation", { name: "Primary" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Home" })).toBeInTheDocument();
    for (const g of ["Daily Teaching", "Learner Records", "Grading", "Security"]) {
      expect(screen.getByRole("button", { name: g })).toHaveAttribute("aria-expanded", "true");
    }
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

  it("survives unreadable localStorage by defaulting to all expanded", () => {
    const spy = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    renderSidebar();
    expect(screen.getByRole("button", { name: "Daily Teaching" })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    spy.mockRestore();
  });
});
