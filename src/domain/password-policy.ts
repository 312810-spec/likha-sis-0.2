/**
 * Shared client-side password length floor. Both `UserApplicationService`
 * and `SetupApplicationService` use this so the two account-creation paths
 * can never silently drift apart. This is a UX convenience only — Argon2id
 * hashing on the Rust side is the real security property (ADR-0004); this
 * constant exists to give teachers a helpful error before ever calling it.
 */
export const MIN_PASSWORD_LENGTH = 8;
