/**
 * A narrow port over "is this device online right now" — kept separate
 * from any repository because it is a platform/network fact, not a data
 * read/write (matching the architecture rule that only
 * `infrastructure/tauri/*` may know about a concrete network probe or
 * browser API; UI/application code depends on this port, never on
 * `navigator.onLine` or `fetch` directly).
 *
 * Used to gate features that call a third-party cloud service directly
 * from the device (e.g. the teacher's own Gemini API key for AI-assisted
 * lesson-plan generation) — those features must never appear usable while
 * offline, since the call would simply fail after the teacher has already
 * invested time filling in a form.
 */
export interface ConnectivityChecker {
  /**
   * Resolves `true` only when an actual network path is currently
   * reachable — not merely that the OS reports a network interface as up
   * (a Wi-Fi connection with no internet access must resolve `false`).
   */
  isOnline(): Promise<boolean>;
}
