/**
 * What the frontend is allowed to know about the current session — just
 * enough to display "logged in as ... at ..." and know when to prompt for
 * login again. Real authorization enforcement happens server-side (Rust);
 * nothing here is a security boundary by itself.
 */
export interface CurrentSession {
  userId: string;
  username: string;
  displayName: string;
  schoolId: string;
  schoolName: string;
  expiresAtUnixMs: number;
  /**
   * When this session will be idle-timed-out if no further protected
   * command is made before then — see ADR-0020's 30-minute idle window.
   * A fresh peek (`currentSession()`), not something that advances just
   * by reading it — only a real protected call (e.g. `extendSession()`)
   * pushes this forward. Used to show an advance warning before the
   * session silently expires — see ADR-0026.
   */
  idleExpiresAtUnixMs: number;
}

/**
 * Authentication events only (login/logout/lockout/admin-assisted
 * password reset) — not a general data-mutation audit trail. See
 * `docs/adr/0021-authentication-audit-log.md` for why this is scoped
 * narrower than "audit everything." `password_reset_by_admin` was added
 * in Wave 3N (ADR-0060) and is the only event type so far where the
 * acting user and the event's subject genuinely differ — see
 * `AuditLogEntry.actorUserId`.
 */
export type AuditEventType =
  "login_success" | "login_failed" | "account_locked" | "logout" | "password_reset_by_admin";

export interface AuditLogEntry {
  id: string;
  schoolId: string;
  userId: string | null;
  username: string;
  /** Who performed the action, when that differs from `userId` (the
   * event's subject) — `null`/absent for every event type except
   * `password_reset_by_admin`. Optional so every pre-existing fixture/
   * test literal built before Wave 3N stays valid without change. */
  actorUserId?: string | null;
  /** `actorUserId`'s username, resolved server-side for display. */
  actorUsername?: string | null;
  eventType: AuditEventType;
  createdAt: string;
}
