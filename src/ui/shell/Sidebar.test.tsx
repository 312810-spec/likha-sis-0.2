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

  it("shows school branding and Today and six primary destinations", () => {
    renderSidebar();
    expect(screen.getByText("LIKHA-SIS")).toBeInTheDocument();
    expect(screen.getByText("Rizal Elementary")).toBeInTheDocument();
    expect(screen.getAllByRole("button")).toHaveLength(7);
    for (const name of [
      "Today",
      "Dashboard",
      "My Advisory",
      "Class Record",
      "School Forms",
      "Calendar",
      "More",
    ]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByText("Ana Cruz")).not.toBeInTheDocument();
  });
  it("keeps My Advisory highlighted while recording advisory attendance", () => {
    renderSidebar("attendance");
    expect(screen.getByRole("button", { name: "My Advisory" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });
  it("keeps More highlighted for contextual school setup tools", () => {
    renderSidebar("section-roster");
    expect(screen.getByRole("button", { name: "More" })).toHaveAttribute("aria-current", "page");
  });
  it("navigates to a real primary destination", async () => {
    const onNavigate = vi.fn();
    renderSidebar("attendance", onNavigate);
    await userEvent.setup().click(screen.getByRole("button", { name: "School Forms" }));
    expect(onNavigate).toHaveBeenCalledWith("school-forms");
  });

  it("has no axe violations on a default render", async () => {
    const { container } = renderSidebar();
    await expectNoAccessibilityViolations(container);
  });
});
