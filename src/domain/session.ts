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
  /**
   * Every role the signed-in user holds in this school (e.g.
   * `["school_head", "teacher"]`), sorted. Display-only: the UI uses it
   * only to choose which Home layout to show. It is NOT an authorization
   * signal — every protected command is gated server-side regardless.
   */
  roles: string[];
}

/**
 * Authentication events only (login/logout/lockout) — not a general
 * data-mutation audit trail. See `docs/adr/0021-authentication-audit-log.md`
 * for why this is scoped narrower than "audit everything."
 */
export type AuditEventType = "login_success" | "login_failed" | "account_locked" | "logout";

export interface AuditLogEntry {
  id: string;
  schoolId: string;
  userId: string | null;
  username: string;
  eventType: AuditEventType;
  createdAt: string;
}
