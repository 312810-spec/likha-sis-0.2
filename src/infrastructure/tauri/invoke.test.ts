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

  // Wave 3B: every command gated by a Capability, `authorize_view_teacher_load`,
  // `authorize_own_assignment`, or `authorize_adviser_of_section` can
  // reject `unauthorized` for a
  // perfectly valid session that simply isn't permitted for this one
  // action -- see invoke.ts's own doc comment for the full discovery.
  // One representative command per gate shape, not all 32, since the
  // exemption logic itself is identical for each -- the coverage that
  // actually matters is proving the mechanism works, and that it does
  // not accidentally cover every command (the next test below).
  it.each([
    "create_teaching_assignment",
    "get_teacher_load",
    "open_subject_attendance_session",
    "adviser_subject_attendance_overview",
    "create_section",
    "create_learner",
    "admin_reset_teacher_password",
  ])(
    "does not notify the listener for %s's own unauthorized rejection (a permission denial, not session expiry)",
    async (command) => {
      mockTauriInvoke.mockRejectedValueOnce("unauthorized");
      const listener = vi.fn();
      onSessionExpired(listener);

      await expect(invoke(command, {})).rejects.toBe("unauthorized");

      expect(listener).not.toHaveBeenCalled();
    },
  );

  it("still notifies the listener for a session-only-gated command's unauthorized rejection", async () => {
    mockTauriInvoke.mockRejectedValueOnce("unauthorized");
    const listener = vi.fn();
    onSessionExpired(listener);

    await expect(invoke("list_teaching_assignments_by_section", {})).rejects.toBe("unauthorized");

    expect(listener).toHaveBeenCalledTimes(1);
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
