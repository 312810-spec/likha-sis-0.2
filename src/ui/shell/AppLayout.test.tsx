import type { ComponentProps } from "react";
import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AppLayout } from "./AppLayout";
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
};

// jsdom has no real matchMedia -- stub one whose result is switchable per test.
let matchMediaResult = false;
function stubMatchMedia() {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: matchMediaResult,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Drive the `change` listeners AppLayout registered on its matchMedia
// query -- the stub above records them via addEventListener but never
// fires them on its own.
function emitViewportChange(matches: boolean) {
  matchMediaResult = matches;
  const mockFn = window.matchMedia as unknown as ReturnType<typeof vi.fn>;
  act(() => {
    for (const result of mockFn.mock.results) {
      for (const [event, handler] of result.value.addEventListener.mock.calls) {
        if (event === "change") handler({ matches } as MediaQueryListEvent);
      }
    }
  });
}

beforeEach(() => {
  matchMediaResult = false;
  stubMatchMedia();
});

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
    matchMediaResult = true; // the drawer is a phone-width concern
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
    matchMediaResult = true; // the drawer is a phone-width concern
    const user = userEvent.setup();
    const onNavigate = vi.fn();
    const { container } = renderLayout({ onNavigate });
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    // With the drawer open at phone width the sidebar is the only live
    // navigation landmark (aria-label "Primary", exact).
    const sidebar = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(sidebar).getByRole("button", { name: "Learners" }));
    expect(onNavigate).toHaveBeenCalledWith("learners");
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  it("closes the drawer when the scrim is clicked", async () => {
    matchMediaResult = true; // the drawer is a phone-width concern
    const user = userEvent.setup();
    const { container } = renderLayout();
    await user.click(screen.getByRole("button", { name: "Open navigation" }));
    await user.click(container.querySelector(".app-layout-scrim")!);
    expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
  });

  describe("inert gating at phone width", () => {
    it("hides the closed drawer from AT, and swaps to hiding main when the drawer opens", async () => {
      matchMediaResult = true; // phone
      const user = userEvent.setup();
      const { container } = renderLayout();
      const sidebarWrap = container.querySelector(".app-layout-sidebar")!;
      const mainWrap = container.querySelector(".app-layout-main")!;

      // Drawer closed -> sidebar wrapper is hidden, main is reachable.
      expect(sidebarWrap).toHaveAttribute("aria-hidden", "true");
      expect(mainWrap).not.toHaveAttribute("aria-hidden");

      // Open the drawer -> sidebar reachable, background main hidden.
      await user.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(sidebarWrap).not.toHaveAttribute("aria-hidden");
      expect(mainWrap).toHaveAttribute("aria-hidden", "true");

      // Close it -> back to the initial state.
      await user.keyboard("{Escape}");
      expect(sidebarWrap).toHaveAttribute("aria-hidden", "true");
      expect(mainWrap).not.toHaveAttribute("aria-hidden");
    });

    it("leaves neither wrapper hidden at desktop width, regardless of drawer state", async () => {
      matchMediaResult = false; // desktop
      const user = userEvent.setup();
      const { container } = renderLayout();
      const sidebarWrap = container.querySelector(".app-layout-sidebar")!;
      const mainWrap = container.querySelector(".app-layout-main")!;

      expect(sidebarWrap).not.toHaveAttribute("aria-hidden");
      expect(mainWrap).not.toHaveAttribute("aria-hidden");

      await user.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(sidebarWrap).not.toHaveAttribute("aria-hidden");
      expect(mainWrap).not.toHaveAttribute("aria-hidden");
    });
  });

  describe("single nav landmark at phone width", () => {
    it("exposes exactly one navigation landmark with the drawer closed (the bottom nav)", () => {
      matchMediaResult = true; // phone
      renderLayout();
      const navs = screen.queryAllByRole("navigation");
      expect(navs).toHaveLength(1);
      // The sidebar wrapper is aria-hidden; the live one is the bottom bar.
      expect(navs[0]).toHaveAccessibleName("Primary — quick access");
    });

    it("exposes exactly one navigation landmark with the drawer open (the sidebar)", async () => {
      matchMediaResult = true; // phone
      const user = userEvent.setup();
      renderLayout();
      await user.click(screen.getByRole("button", { name: "Open navigation" }));
      const navs = screen.queryAllByRole("navigation");
      // The bottom nav now lives inside .app-layout-main, which is
      // aria-hidden while the drawer is open -- so only the sidebar shows.
      expect(navs).toHaveLength(1);
      expect(navs[0]).toHaveAccessibleName("Primary");
    });
  });

  describe("resize while the drawer is open", () => {
    it("closes the drawer when the viewport leaves phone width", async () => {
      matchMediaResult = true; // phone
      const user = userEvent.setup();
      const { container } = renderLayout();
      await user.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "open");

      emitViewportChange(false); // widen past 860px
      expect(container.querySelector(".app-layout")).toHaveAttribute("data-drawer", "closed");
    });
  });

  describe("accessibility", () => {
    it("has no axe violations with the drawer closed", async () => {
      const { container } = renderLayout();
      await expectNoAccessibilityViolations(container);
    });

    it("has no axe violations with the drawer open (phone)", async () => {
      matchMediaResult = true;
      const user = userEvent.setup();
      const { container } = renderLayout();
      await user.click(screen.getByRole("button", { name: "Open navigation" }));
      await expectNoAccessibilityViolations(container);
    });
  });
});
