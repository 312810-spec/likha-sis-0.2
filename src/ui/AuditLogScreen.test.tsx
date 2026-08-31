import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { AuthApplicationService } from "../application/auth-service";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { ModeProvider } from "./theme/ModeContext";
import { AuditLogScreen } from "./AuditLogScreen";

class FakeAuthRepository implements AuthRepository {
  constructor(private entries: AuditLogEntry[] = []) {}

  async login(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async logout(): Promise<void> {}

  async currentSession(): Promise<CurrentSession | null> {
    return null;
  }

  async extendSession(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async listAuditLog(): Promise<AuditLogEntry[]> {
    return this.entries;
  }
}

function renderScreen(entries: AuditLogEntry[] = []) {
  const repo = new FakeAuthRepository(entries);
  return render(
    <ModeProvider>
      <AuditLogScreen authService={new AuthApplicationService(repo)} />
    </ModeProvider>,
  );
}

beforeEach(() => {
  window.localStorage.clear();
});

describe("AuditLogScreen", () => {
  it("shows an empty state when there is no activity yet", async () => {
    renderScreen([]);

    expect(await screen.findByText("No sign-in activity recorded yet.")).toBeInTheDocument();
  });

  it("lists recent events with a plain-language label for each event type", async () => {
    renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "2026-08-25T08:00:00.000Z",
      },
      {
        id: "a2",
        schoolId: "s1",
        userId: null,
        username: "unknown.user",
        eventType: "login_failed",
        createdAt: "2026-08-25T08:01:00.000Z",
      },
      {
        id: "a3",
        schoolId: "s1",
        userId: "u2",
        username: "ben.reyes",
        eventType: "account_locked",
        createdAt: "2026-08-25T08:02:00.000Z",
      },
      {
        id: "a4",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "logout",
        createdAt: "2026-08-25T08:03:00.000Z",
      },
    ]);

    expect(await screen.findByText("Signed in")).toBeInTheDocument();
    expect(screen.getByText("Failed sign-in attempt")).toBeInTheDocument();
    expect(screen.getByText("Account temporarily locked")).toBeInTheDocument();
    expect(screen.getByText("Signed out")).toBeInTheDocument();
    expect(screen.getByText("unknown.user")).toBeInTheDocument();
  });

  it("shows who performed a password reset -- the one event type where the actor differs from the subject", async () => {
    renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        actorUserId: "u2",
        actorUsername: "corazon.santos",
        eventType: "password_reset_by_admin",
        createdAt: "2026-08-31T08:00:00.000Z",
      },
    ]);

    expect(await screen.findByText("Password reset by corazon.santos")).toBeInTheDocument();
    expect(screen.getByText("ana.cruz")).toBeInTheDocument();
  });

  it("falls back to a generic label for a password reset with no resolvable actor username", async () => {
    renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "password_reset_by_admin",
        createdAt: "2026-08-31T08:00:00.000Z",
      },
    ]);

    expect(await screen.findByText("Password reset by an administrator")).toBeInTheDocument();
  });

  it("shows a human-readable date/time, not the raw ISO storage timestamp", async () => {
    renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "2026-08-25T08:00:00.000Z",
      },
    ]);
    await screen.findByText("Signed in");

    expect(screen.queryByText("2026-08-25T08:00:00.000Z")).not.toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("falls back to the raw value for a timestamp that doesn't parse as a date", async () => {
    renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "not-a-real-timestamp",
      },
    ]);

    expect(await screen.findByText("not-a-real-timestamp")).toBeInTheDocument();
  });

  it("shows an error message when loading fails", async () => {
    class FailingAuthRepository extends FakeAuthRepository {
      override async listAuditLog(): Promise<AuditLogEntry[]> {
        throw new Error("boom");
      }
    }
    render(
      <ModeProvider>
        <AuditLogScreen authService={new AuthApplicationService(new FailingAuthRepository())} />
      </ModeProvider>,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/could not load/i);
  });

  it("moves focus to the heading on mount", async () => {
    renderScreen([]);

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "Sign-in Activity" })).toHaveFocus(),
    );
  });

  it("shows a field hint only in guided mode", async () => {
    window.localStorage.setItem("likha-sis:teacher-mode", "guided");
    renderScreen([]);
    await screen.findByText("No sign-in activity recorded yet.");

    expect(screen.getByText(/recent sign-in attempts/i)).toBeInTheDocument();
  });

  it("does not show the field hint in comfortable (default) mode", async () => {
    renderScreen([]);
    await screen.findByText("No sign-in activity recorded yet.");

    expect(screen.queryByText(/recent sign-in attempts/i)).not.toBeInTheDocument();
  });

  it("has no detectable accessibility violations", async () => {
    const { container } = renderScreen([
      {
        id: "a1",
        schoolId: "s1",
        userId: "u1",
        username: "ana.cruz",
        eventType: "login_success",
        createdAt: "2026-08-25T08:00:00.000Z",
      },
    ]);
    await waitFor(() => screen.getByText("Signed in"));

    await expectNoAccessibilityViolations(container);
  });
});
