import type { ConnectivityChecker } from "../../domain/ports/connectivity-checker";

const DEFAULT_PROBE_URL = "https://www.gstatic.com/generate_204";
const DEFAULT_TIMEOUT_MS = 4000;

interface BrowserConnectivityCheckerOptions {
  /** Overridable for tests; defaults to a lightweight, cookie-free endpoint. */
  probeUrl?: string;
  timeoutMs?: number;
}

/**
 * Only `infrastructure/tauri/*` may reach for `navigator`/`fetch` directly
 * (see `../../domain/ports/connectivity-checker.ts` and
 * `.claude/rules/architecture.md`) — this is that one adapter.
 *
 * `navigator.onLine` alone is not trustworthy: it reflects whether the OS
 * has a network interface up, which is true on a Wi-Fi network with no
 * real internet access (a captive portal, an unplugged router upstream).
 * So a `false` short-circuits immediately (no interface at all), but a
 * `true` still requires a real network round-trip to a small, stable
 * endpoint before we call the device "online".
 */
export class BrowserConnectivityChecker implements ConnectivityChecker {
  private readonly probeUrl: string;
  private readonly timeoutMs: number;

  constructor(options: BrowserConnectivityCheckerOptions = {}) {
    this.probeUrl = options.probeUrl ?? DEFAULT_PROBE_URL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  }

  async isOnline(): Promise<boolean> {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return false;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      // `no-cors` responses are always "opaque" (status 0, `ok: false`)
      // even on success, so a resolved promise — no thrown network error
      // — is itself the reachability signal here, not the response body.
      await fetch(this.probeUrl, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        signal: controller.signal,
      });
      return true;
    } catch {
      return false;
    } finally {
      clearTimeout(timer);
    }
  }
}
