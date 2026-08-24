import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { expectNoAccessibilityViolations } from "../test/a11y";
import type { CurrentSession } from "../domain/session";
import { AppShell } from "./AppShell";
import { ModeProvider } from "./theme/ModeContext";

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  idleExpiresAtUnixMs: 1_000_000,
};

function renderShell(sessionValue: CurrentSession | null, onLogout = vi.fn()) {
  return render(
    <ModeProvider>
      <AppShell session={sessionValue} onLogout={onLogout}>
        <p>content</p>
      </AppShell>
    </ModeProvider>,
  );
}

describe("AppShell", () => {
  it("shows the mode switcher with Comfortable pressed by default", () => {
    renderShell(null);

    const group = screen.getByRole("group", { name: "Teacher interface mode" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Comfortable" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Efficient" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("does not show a user greeting or logout button when signed out", () => {
    renderShell(null);

    expect(screen.queryByRole("button", { name: "Log out" })).not.toBeInTheDocument();
  });

  it("shows the signed-in teacher's name, school, and a working logout button", async () => {
    const user = userEvent.setup();
    const onLogout = vi.fn();
    renderShell(session, onLogout);

    expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
    expect(screen.getByText(/Rizal Elementary/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Log out" }));

    expect(onLogout).toHaveBeenCalledTimes(1);
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderShell(session);

    await expectNoAccessibilityViolations(container);
  });
});
