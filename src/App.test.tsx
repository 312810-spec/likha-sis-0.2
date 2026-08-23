import { invoke } from "@tauri-apps/api/core";
import { render, screen } from "@testing-library/react";
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

  it("shows the learner screen when there is an active session", async () => {
    mockInvoke.mockImplementation((command) => {
      if (command === "installation_status") return Promise.resolve({ needsSetup: false });
      if (command === "current_session") return Promise.resolve(session);
      if (command === "list_learners_by_school") return Promise.resolve([]);
      return Promise.reject(new Error(`unexpected command: ${String(command)}`));
    });

    render(<App />);

    expect(await screen.findByRole("region", { name: "Learners" })).toBeInTheDocument();
    expect(screen.getByText(/Ana Cruz/)).toBeInTheDocument();
    expect(screen.getByText(/Rizal Elementary/)).toBeInTheDocument();
  });
});
