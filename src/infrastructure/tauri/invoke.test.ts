import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { invoke, onSessionExpired } from "./invoke";

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(),
}));

const mockTauriInvoke = vi.mocked(tauriInvoke);

describe("invoke", () => {
  afterEach(() => {
    mockTauriInvoke.mockReset();
    // Clear any listener a test registered so it can't leak into the
    // next one — `onSessionExpired` only ever tracks one at a time.
    onSessionExpired(() => {})();
  });

  it("passes through a successful call unchanged", async () => {
    mockTauriInvoke.mockResolvedValueOnce({ ok: true });

    const result = await invoke("some_command", { a: 1 });

    expect(mockTauriInvoke).toHaveBeenCalledWith("some_command", { a: 1 });
    expect(result).toEqual({ ok: true });
  });

  it("calls invoke with exactly one argument when args is omitted, not with an explicit undefined", async () => {
    mockTauriInvoke.mockResolvedValueOnce([]);

    await invoke("list_something");

    expect(mockTauriInvoke).toHaveBeenCalledWith("list_something");
    expect(mockTauriInvoke.mock.calls[0]).toHaveLength(1);
  });

  it("notifies the registered session-expired listener when a command rejects with unauthorized", async () => {
    mockTauriInvoke.mockRejectedValueOnce("unauthorized");
    const listener = vi.fn();
    onSessionExpired(listener);

    await expect(invoke("list_learners_by_school")).rejects.toBe("unauthorized");

    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify the listener for a login command's own unauthorized rejection", async () => {
    mockTauriInvoke.mockRejectedValueOnce("unauthorized");
    const listener = vi.fn();
    onSessionExpired(listener);

    await expect(invoke("login", { username: "x", password: "y", schoolId: "s1" })).rejects.toBe(
      "unauthorized",
    );

    expect(listener).not.toHaveBeenCalled();
  });

  it("does not notify the listener for an unrelated error", async () => {
    mockTauriInvoke.mockRejectedValueOnce("authentication_failed");
    const listener = vi.fn();
    onSessionExpired(listener);

    await expect(invoke("login", {})).rejects.toBe("authentication_failed");

    expect(listener).not.toHaveBeenCalled();
  });

  it("a listener registered after unregistering an earlier one is the only one notified", async () => {
    mockTauriInvoke.mockRejectedValueOnce("unauthorized");
    const firstListener = vi.fn();
    const unregisterFirst = onSessionExpired(firstListener);
    unregisterFirst();
    const secondListener = vi.fn();
    onSessionExpired(secondListener);

    await expect(invoke("list_learners_by_school")).rejects.toBe("unauthorized");

    expect(firstListener).not.toHaveBeenCalled();
    expect(secondListener).toHaveBeenCalledTimes(1);
  });
});
