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
}
