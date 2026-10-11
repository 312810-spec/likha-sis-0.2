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
  readShouldFail = false;
  /** When set, `extendSession` never resolves on its own -- the test
   * controls completion. Used to prove the in-flight guard blocks a
   * second click while the first extension is still pending. */
  pending = false;

  async login(): Promise<CurrentSession> {
    throw new Error("not used in this test");
  }

  async logout(): Promise<void> {}

  async currentSession(): Promise<CurrentSession | null> {
    if (this.readShouldFail) throw new Error("device read failed");
    return this.sessionToReturn;
  }

  async extendSession(): Promise<CurrentSession> {
    this.extendSessionCalls += 1;
    if (this.pending) {
      return new Promise(() => {});
    }
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

  it("does not extend a second time while the first extension is still in flight", async () => {
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    repo.pending = true;
    const onExpired = vi.fn();

    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    await screen.findByRole("alert");

    const stayButton = screen.getByRole("button", { name: "Stay signed in" });
    await user.click(stayButton);
    await vi.waitFor(() => expect(repo.extendSessionCalls).toBe(1));

    expect(stayButton).toHaveAttribute("aria-disabled", "true");
    await user.click(stayButton);

    expect(repo.extendSessionCalls).toBe(1);
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

  it("keeps the session when extension fails but a fresh check still confirms it", async () => {
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

    expect(onExpired).not.toHaveBeenCalled();
    expect(await screen.findByRole("button", { name: "Stay signed in" })).toBeInTheDocument();
  });

  it("does not infer expiry from a failed session read and recovers on retry", async () => {
    const repo = new FakeAuthRepository();
    repo.readShouldFail = true;
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    const onExpired = vi.fn();
    render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not check your session");
    expect(onExpired).not.toHaveBeenCalled();
    repo.readShouldFail = false;
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    await user.click(screen.getByRole("button", { name: "Retry session check" }));
    expect(await screen.findByRole("button", { name: "Stay signed in" })).toBeInTheDocument();
    expect(onExpired).not.toHaveBeenCalled();
  });

  it("does not expire a later screen from an extension response after unmount", async () => {
    const repo = new FakeAuthRepository();
    repo.sessionToReturn = aSession(Date.now() + 60_000);
    let resolve!: (session: CurrentSession) => void;
    vi.spyOn(repo, "extendSession").mockImplementation(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    const onExpired = vi.fn();
    const { unmount } = render(
      <IdleTimeoutWarning authService={new AuthApplicationService(repo)} onExpired={onExpired} />,
    );
    const user = (await import("@testing-library/user-event")).default.setup({
      advanceTimers: vi.advanceTimersByTime,
    });
    await user.click(await screen.findByRole("button", { name: "Stay signed in" }));
    unmount();
    resolve(aSession(Date.now() - 1));
    await Promise.resolve();
    expect(onExpired).not.toHaveBeenCalled();
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
