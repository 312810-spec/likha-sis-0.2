import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AuthApplicationService } from "../application/auth-service";
import type { AuthRepository } from "../domain/ports/auth-repository";
import type { AuditLogEntry, CurrentSession } from "../domain/session";
import { expectNoAccessibilityViolations } from "../test/a11y";
import { IdleTimeoutWarning } from "./IdleTimeoutWarning";

class FakeAuthRepository implements AuthRepository {
  sessionToReturn: CurrentSession | null = null;
  extendedSessionToReturn: CurrentSession | null = null;
  extendSessionCalls = 0;
  extendSessionShouldFail = false;

  async login(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async logout(): Promise<void> {}

  async currentSession(): Promise<CurrentSession | null> {
    return this.sessionToReturn;
  }

  async extendSession(): Promise<CurrentSession> {
    this.extendSessionCalls += 1;
    if (this.extendSessionShouldFail) {
      throw new Error("unauthorized");
    }
    if (!this.extendedSessionToReturn) throw new Error("no extended session configured");
    return this.extendedSessionToReturn;
  }

  async listAuditLog(): Promise<AuditLogEntry[]> {
    return [];
  }
}

function aSession(idleExpiresAtUnixMs: number): CurrentSession {
  return {
    userId: "u1",
    username: "ana.cruz",
    displayName: "Ana Cruz",
    schoolId: "s1",
    schoolName: "Rizal Elementary",
    expiresAtUnixMs: Date.now() + 8 * 60 * 60_000,
    idleExpiresAtUnixMs,
    roles: ["teacher"],
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("IdleTimeoutWarning", () => {
  it("renders nothing when the session is comfortably far from idling out", async () => {
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 20 * 60_000);
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    await vi.waitFor(() => expect(repo.extendSessionCalls).toBe(0));

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("shows a warning once the idle deadline is within the threshold", async () => {
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );

    expect(await screen.findByRole("alert")).toHaveTextContent(/expire in about 1 minute/i);
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("clicking 'Stay signed in' extends the session and hides the warning", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    repo.extendedSessionToReturn = aSession(Date.now() + 30 * 60_000);
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Stay signed in" }));

    expect(repo.extendSessionCalls).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("calls onExpired when a poll finds the session already gone", async () => {
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = null;
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );

    await vi.waitFor(() => expect(onExpired).toHaveBeenCalledTimes(1));
  });

  it("calls onExpired if extending the session itself fails", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    repo.extendSessionShouldFail = true;
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    await screen.findByRole("alert");

    await user.click(screen.getByRole("button", { name: "Stay signed in" }));

    expect(onExpired).toHaveBeenCalledTimes(1);
  });

  it("has no accessibility violations while the warning is shown", async () => {
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);

    const { container } = render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={vi.fn()} />,
    );
    await screen.findByRole("alert");

    await expectNoAccessibilityViolations(container);
  });
});
