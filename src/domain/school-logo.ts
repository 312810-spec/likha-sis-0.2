/**
 * A school's in-app branding logo. `bytes` is the raw image payload
 * (PNG/JPEG/WebP) as it round-trips over the Tauri IPC boundary — the
 * UI turns it into a displayable `<img>` source, it never inspects the
 * bytes itself. In-app display only: official-form export was
 * explicitly dropped from this feature's scope (DepEd's SF10 rule
 * restricts official forms to DepEd's own seal/logo — see
 * `docs/CURRENT-HANDOFF.md`'s 2026-09-06 entry).
 */
export interface SchoolLogo {
  mime: string;
  bytes: Uint8Array;
}

/** Mirrors `commands::school::ALLOWED_LOGO_MIME_TYPES` on the Rust side —
 * kept in sync by hand since MIME allow-listing is deliberately narrow
 * and rarely changes; the backend stays authoritative regardless. */
export const ALLOWED_LOGO_MIME_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;

/** Mirrors `commands::school::MAX_LOGO_BYTES` on the Rust side — a UX
 * convenience so the picker can reject an oversized file before ever
 * invoking the backend; the backend enforces the real limit regardless. */
export const MAX_LOGO_BYTES = 512 * 1024;
