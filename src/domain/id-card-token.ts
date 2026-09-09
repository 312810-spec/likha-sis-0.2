/**
 * Student ID Card Generator — offline-verifiable token engine.
 *
 * SCOPE DECISION: fully offline, no cloud-facing verification endpoint.
 * Legacy verified a printed ID's QR token via a live Supabase lookup
 * (`get_public_student_by_token`). This project is offline-first with no
 * public-facing endpoint of any kind, and the owner's cloud-vs-offline
 * policy call for this feature is explicitly still open (see
 * `docs/CURRENT-HANDOFF.md`'s 2026-09-07 audit, open question #5). This
 * module implements the conservative default pending that decision: a
 * token that is deterministically derivable from data already on the
 * device and a device/school-local secret, verifiable by recomputing it
 * — no network call, no server round trip, ever. See
 * `docs/adr/0078-id-card-qr-offline-verification-scope.md`.
 *
 * The token is HMAC-SHA256(secretKey, schoolId|learnerId|lrn), truncated
 * and hex-encoded — enough to (a) be embedded in a QR code and (b) let
 * an in-app "Verify ID" screen recompute it from the same three fields
 * already in the local database and compare, without ever needing to
 * store the token itself as a new source of truth.
 *
 * `secretKey` sourcing (which device/school-local key actually signs
 * these) is NOT decided by this module — it is a pure function of
 * whatever `CryptoKey`/secret bytes the caller supplies. Wiring this to
 * a real device-bound secret (e.g. via the existing
 * `src-tauri/src/crypto/` key material) is the recorded next-slice work;
 * this module's own contract does not change either way.
 */

const TOKEN_BYTE_LENGTH = 16; // 128 bits of the 256-bit HMAC digest, hex-encoded to 32 chars

export interface IdCardTokenInput {
  schoolId: string;
  learnerId: string;
  lrn: string;
}

function tokenMessage(input: IdCardTokenInput): string {
  return `${input.schoolId}|${input.learnerId}|${input.lrn}`;
}

async function hmacSha256Hex(secretKey: CryptoKey, message: string): Promise<string> {
  const encoded = new TextEncoder().encode(message);
  const digest = await crypto.subtle.sign("HMAC", secretKey, encoded.buffer as ArrayBuffer);
  const bytes = new Uint8Array(digest).slice(0, TOKEN_BYTE_LENGTH);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Imports raw secret bytes as an HMAC-SHA256 `CryptoKey` for use with
 * `generateIdCardToken`/`verifyIdCardToken`. Kept separate so a caller
 * that already has a `CryptoKey` (e.g. a cached one) need not re-import
 * it on every call. */
export function importIdCardSecretKey(secretBytes: Uint8Array): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    secretBytes.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

export function generateIdCardToken(
  secretKey: CryptoKey,
  input: IdCardTokenInput,
): Promise<string> {
  return hmacSha256Hex(secretKey, tokenMessage(input));
}

/** Recomputes the token from `input` and constant-time-compares it
 * against `token` (a printed/scanned QR payload) — never a database
 * lookup, never a network call. Returns `false` for a malformed token
 * rather than throwing, so a garbled scan reads as "not verified," not
 * an error dialog. */
export async function verifyIdCardToken(
  secretKey: CryptoKey,
  input: IdCardTokenInput,
  token: string,
): Promise<boolean> {
  if (!/^[0-9a-f]+$/i.test(token)) return false;
  const expected = await generateIdCardToken(secretKey, input);
  if (expected.length !== token.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ token.toLowerCase().charCodeAt(i);
  }
  return diff === 0;
}
