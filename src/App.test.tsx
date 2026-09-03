import { invoke } from "@tauri-apps/api/core";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import App from "./App";
import type { CurrentSession } from "./domain/session";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockInvoke = vi.mocked(invoke);

const session: CurrentSession = {
  userId: "u1",
  username: "ana.cruz",
  displayName: "Ana Cruz",
  schoolId: "s1",
  schoolName: "Rizal Elementary",
  expiresAtUnixMs: 1_000_000,
  // Far in the future, not the same magic-past-timestamp convention as
  // expiresAtUnixMs above -- IdleTimeoutWarning polls this on mount and
  // would otherwise immediately treat every signed-in test as idle-
  // expired (see ADR-0026).
  idleExpiresAtUnixMs: Date.now() + 30 * 60_000,
  roles: ["teacher"],
};

beforeEach(() => {
  mockInvoke.mockReset();
});

describe("App", () => {
  it("shows the first-run setup screen when the backend reports the install needs setup", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: true });
      if (command === "current_session") return Promise.resolve(null);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Set up your school" })).toBeInTheDocument();
    expect(screen.queryByRole("form", { name: "Sign in" })).not.toBeInTheDocument();
  });

  it("shows the sign-in screen when setup is already done and there is no current session", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(null);
      if (command === "list_schools") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "LIKHA-SIS" })).toBeInTheDocument();
  });

  it("shows the workspace overview by default when there is an active session", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("region", { name: "Workspace" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Welcome, Ana Cruz" })).toBeInTheDocument();
    expect(screen.getByText(/Rizal Elementary/)).toBeInTheDocument();
  });

  it("groups the navigation into named workbench clusters, preserving every destination", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);
    await screen.findByRole("region", { name: "Workspace" });

    const nav = screen.getByRole("navigation", { name: "Primary" });
    expect(nav).toBeInTheDocument();
    for (const groupName of ["Daily Teaching", "Learner Records", "Grading", "Security"]) {
      expect(within(nav).getByRole("button", { name: groupName })).toHaveAttribute(
        "aria-expanded",
        "true",
      );
    }
    for (const destination of [
      "Home",
      "Attendance",
      "Monthly Summary",
      "Learners",
      "Sections",
      "Grading Periods",
      "Class Records",
      "Sign-in Activity",
    ]) {
      expect(within(nav).getByRole("button", { name: destination })).toBeInTheDocument();
    }
  });

  it("sets the browser tab title to the active destination", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("region", { name: "Workspace" });
    await waitFor(() => expect(document.title).toBe("Home · LIKHA-SIS"));

    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Learners" }));

    await waitFor(() => expect(document.title).toBe("Learners · LIKHA-SIS"));
  });

  it("shows the learner screen after switching to the Learners tab", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });
    const user = userEvent.setup();

    render(<App />);
    await screen.findByRole("region", { name: "Workspace" });
    const nav = screen.getByRole("navigation", { name: "Primary" });
    await user.click(within(nav).getByRole("button", { name: "Learners" }));

    expect(await screen.findByRole("region", { name: "Learners" })).toBeInTheDocument();
  });

  it("returns to sign-in with a clear notice when a command fails because the session expired", async () => {
    // The client believed it had an active session (current_session
    // returned one), but the backend has since idle-timed it out, been
    // revoked, or hit its absolute TTL — the first real protected
    // command discovers this. See ADR-0022 / src/infrastructure/tauri/invoke.ts.
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.reject("unauthorized");
      if (command === "list_sections_by_school") return Promise.resolve([]);
      if (command === "list_audit_log") return Promise.resolve([]);
      if (command === "list_schools") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("form", { name: "Sign in" })).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent(/session has expired/i);
  });
});
