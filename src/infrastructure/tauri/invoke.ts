import { invoke as tauriInvoke } from "@tauri-apps/api/core";

type SessionExpiredListener = () => void;

let sessionExpiredListener: SessionExpiredListener | null = null;

/**
 * Registers the single listener notified when a command fails because
 * the session is no longer valid (idle-timed-out, past the absolute
 * TTL, or revoked) — see ADR-0022. `App.tsx` is the only caller: it
 * clears the current session and shows a clear "please sign in again"
 * message instead of leaving each screen to fail with a generic error.
 * Registering a new listener replaces any previous one (this app has
 * exactly one place that should ever care).
 */
export function onSessionExpired(listener: SessionExpiredListener): () => void {
  sessionExpiredListener = listener;
  return () => {
    if (sessionExpiredListener === listener) {
      sessionExpiredListener = null;
    }
  };
}

/**
 * Commands whose own `Unauthorized` rejection means something other
 * than "the session expired" and must not trigger the global handler:
 * `login` itself rejects with `Unauthorized` for "this account isn't a
 * member of the selected school," a normal login-time validation
 * outcome `LoginScreen` already surfaces on its own, not a session that
 * was ever valid and then expired.
 */
const COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING = new Set(["login"]);

/**
 * Every `TauriXRepository` calls this instead of importing `invoke`
 * directly from `@tauri-apps/api/core` — a thin wrapper that also
 * notices an `Unauthorized` rejection and notifies the single
 * registered listener before re-throwing the original error unchanged,
 * so existing per-repository error handling is completely unaffected.
 */
export function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  // Forward exactly as many arguments as the caller passed — always
  // passing `args` (even as `undefined`) is observably different from
  // omitting it entirely (a call with one argument vs. two), which
  // broke every repository test asserting the exact `invoke` call shape
  // and, more importantly, is a real behavioral change to preserve
  // parity on, not just a test-satisfying one.
  const call = args === undefined ? tauriInvoke<T>(command) : tauriInvoke<T>(command, args);
  return call.catch((error: unknown) => {
    if (!COMMANDS_EXEMPT_FROM_SESSION_EXPIRY_HANDLING.has(command) && isUnauthorized(error)) {
      sessionExpiredListener?.();
    }
    throw error;
  });
}

function isUnauthorized(error: unknown): boolean {
  return String(error).includes("unauthorized");
}
