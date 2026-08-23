/**
 * A teacher's independent LIKHA identity. Never carries credential
 * material — the password hash never crosses the Tauri IPC boundary.
 */
export interface User {
  id: string;
  username: string;
  displayName: string;
  createdAt: string;
}
