import { afterEach, describe, expect, it, vi } from "vitest";
import { BrowserConnectivityChecker } from "./connectivity-checker";

describe("BrowserConnectivityChecker", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("resolves false immediately when the OS reports no network interface", async () => {
    vi.stubGlobal("navigator", { onLine: false });
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const checker = new BrowserConnectivityChecker();
    await expect(checker.isOnline()).resolves.toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("resolves true when the OS reports a network interface and a probe request succeeds", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response));

    const checker = new BrowserConnectivityChecker();
    await expect(checker.isOnline()).resolves.toBe(true);
  });

  it("resolves false when the interface is up but the probe request fails (captive portal / no real internet)", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network error")));

    const checker = new BrowserConnectivityChecker();
    await expect(checker.isOnline()).resolves.toBe(false);
  });

  it("resolves false when the probe request times out", async () => {
    vi.stubGlobal("navigator", { onLine: true });
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(
        () =>
          new Promise((_resolve, reject) => {
            setTimeout(() => reject(new DOMException("Aborted", "AbortError")), 5);
          }),
      ),
    );

    const checker = new BrowserConnectivityChecker({ timeoutMs: 1 });
    await expect(checker.isOnline()).resolves.toBe(false);
  });

  it("treats a missing navigator (non-browser test/build context) as unknown and falls back to a probe", async () => {
    vi.stubGlobal("navigator", undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true } as Response));

    const checker = new BrowserConnectivityChecker();
    await expect(checker.isOnline()).resolves.toBe(true);
  });
});
