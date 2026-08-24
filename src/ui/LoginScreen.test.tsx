import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApplicationService } from "../application/auth-service";
import { SchoolApplicationService } from "../application/school-service";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { SchoolRepository } from "../domain/ports/school-repository";
import type { School } from "../domain/school";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { LoginScreen } from "./LoginScreen";

class FakeSchoolRepository implements SchoolRepository {
  constructor(private schools: School[]) {}

  async listAll(): Promise<School[]> {
    return this.schools;
  }

  async create(name: string): Promise<School> {
    const school: School = { id: `s${this.schools.length + 1}`, name, createdAt: "now" };
    this.schools.push(school);
    return school;
  }
}

class FakeAuthRepository implements AuthRepository {
  loginCalls: Array<{ username: string; password: string; schoolId: string }> = [];
  shouldFail = false;
  shouldLock = false;

  async login(username: string, password: string, schoolId: string): Promise<CurrentSession> {
    this.loginCalls.push({ username, password, schoolId });
    if (this.shouldLock) {
      throw new Error("account_locked");
    }
    if (this.shouldFail) {
      throw new Error("authentication_failed");
    }
    return {
      userId: "u1",
      username,
      displayName: "Ana Cruz",
      schoolId,
      schoolName: "Rizal Elementary",
      expiresAtUnixMs: 1_000_000,
      idleExpiresAtUnixMs: 1_000_000,
    };
  }

  async logout(): Promise<void> {}

  async currentSession(): Promise<CurrentSession | null> {
    return null;
  }

  async extendSession(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async listAuditLog(): Promise<AuditLogEntry[]> {
    return [];
  }
}

const seedSchools = (): School[] => [
  { id: "s1", name: "Rizal Elementary", createdAt: "now" },
  { id: "s2", name: "Bonifacio High School", createdAt: "now" },
];

function renderLoginScreen(props: {
  authRepo?: FakeAuthRepository;
  schoolRepo?: FakeSchoolRepository;
  onLoggedIn?: (session: CurrentSession) => void;
  notice?: string | null;
}) {
  const authRepo = props.authRepo ?? new FakeAuthRepository();
  const schoolRepo = props.schoolRepo ?? new FakeSchoolRepository(seedSchools());
  const result = render(
    <ModeProvider>
      <LoginScreen
        authService={new AuthApplicationService(authRepo)}
        schoolService={new SchoolApplicationService(schoolRepo)}
        onLoggedIn={props.onLoggedIn ?? (() => {})}
        notice={props.notice}
      />
    </ModeProvider>,
  );
  return { ...result, authRepo, schoolRepo };
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("LoginScreen", () => {
  it("loads schools and preselects the first one", async () => {
    renderLoginScreen({});

    await waitFor(() => {
      expect(screen.getByRole("option", { name: "Bonifacio High School" })).toBeInTheDocument();
    });
    expect(screen.getByLabelText("School")).toHaveValue("s1");
  });

  it("submits username, password, and the selected school, and reports the session", async () => {
    const user = userEvent.setup();
    let loggedInSession: CurrentSession | null = null;
    const { authRepo } = renderLoginScreen({
      onLoggedIn: (session) => {
        loggedInSession = session;
      },
    });

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    await user.selectOptions(screen.getByLabelText("School"), "s2");
    await user.type(screen.getByLabelText("Username"), "ana.cruz");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(loggedInSession).not.toBeNull());
    expect(authRepo.loginCalls).toEqual([
      { username: "ana.cruz", password: "hunter2", schoolId: "s2" },
    ]);
  });

  it("shows an error message and never reports a session when login fails", async () => {
    const user = userEvent.setup();
    const authRepo = new FakeAuthRepository();
    authRepo.shouldFail = true;
    const onLoggedIn = vi.fn();
    renderLoginScreen({ authRepo, onLoggedIn });

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    await user.type(screen.getByLabelText("Username"), "ana.cruz");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/couldn't sign you in/i);
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a specific locked-account message, distinct from the generic failure message", async () => {
    const user = userEvent.setup();
    const authRepo = new FakeAuthRepository();
    authRepo.shouldLock = true;
    const onLoggedIn = vi.fn();
    renderLoginScreen({ authRepo, onLoggedIn });

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    await user.type(screen.getByLabelText("Username"), "ana.cruz");
    await user.type(screen.getByLabelText("Password"), "wrong");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/temporarily locked/i);
    expect(onLoggedIn).not.toHaveBeenCalled();
  });

  it("shows a notice above the form when one is provided", async () => {
    renderLoginScreen({ notice: "Your session has expired. Please sign in again." });

    expect(await screen.findByRole("status")).toHaveTextContent(/session has expired/i);
  });

  it("shows no notice banner when none is provided", async () => {
    renderLoginScreen({});
    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));

    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("shows the specific validation message rather than the generic one", async () => {
    const user = userEvent.setup();
    renderLoginScreen({});

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    // A whitespace-only username satisfies the native `required` attribute
    // (the field isn't empty) but fails AuthApplicationService's trim-based
    // validation — this is the one ValidationError path reachable through
    // real keyboard interaction rather than blocked by native validation.
    await user.type(screen.getByLabelText("Username"), "   ");
    await user.type(screen.getByLabelText("Password"), "hunter2");
    await user.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/username must not be empty/i);
  });

  it("moves focus to the heading on mount", async () => {
    renderLoginScreen({});

    await waitFor(() => expect(screen.getByRole("heading", { name: "Sign in" })).toHaveFocus());
  });

  it("shows field hints only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderLoginScreen({});

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    expect(screen.getByText(/choose the school you want to sign in for/i)).toBeInTheDocument();
  });

  it("does not show field hints in comfortable (default) mode", async () => {
    renderLoginScreen({});

    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));
    expect(
      screen.queryByText(/choose the school you want to sign in for/i),
    ).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderLoginScreen({});
    await waitFor(() => expect(screen.getByLabelText("School")).toHaveValue("s1"));

    await expectNoAccessibilityViolations(container);
  });
});
