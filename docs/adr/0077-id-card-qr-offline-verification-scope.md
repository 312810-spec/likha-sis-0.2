# ADR-0077: Student ID Card QR — Offline-Only Verification, No Cloud Endpoint

Status: Accepted

## Context

`docs/product/MASTER-TASK-INVENTORY.md` §3.4 asks for a Student ID Card
Generator with a "tokenized QR verification code". The reference project
(`likha-sis-master`) verified a printed ID's QR token via a live
Supabase lookup (`get_public_student_by_token`) — a public,
unauthenticated, internet-facing endpoint that resolves a token to a
learner's identity.

This project's own 2026-09-07 unbuilt-features audit
(`docs/CURRENT-HANDOFF.md`) explicitly flagged this as open question #5:
"ID card QR verification — cloud-dependent or fully offline?" — a
genuine, undecided product-policy call belonging to the owner, not
something this batch should guess at. LIKHA-SIS is offline-first by
mission (`CLAUDE.md`) and currently has **no public-facing endpoint of
any kind** — adding one would be a new category of infrastructure
(a public API, a new attack surface exposing at least a learner
identifier to anyone who can guess or brute-force a token) with real
privacy stakes for a system whose top priority is
security/privacy → correctness.

## Decision

Ship the conservative default that resolves cleanly with either eventual
owner decision, and build nothing that forecloses either option:

1. **No cloud-facing verification endpoint is built, at all, this
   batch or ever without an explicit approval.** Per this batch's own
   constraint and the general "no paid infrastructure/APIs/services
   without explicit approval" + "production PII/security gate" rules,
   standing up any public endpoint that resolves a token to (or toward)
   a real learner's identity is exactly the kind of decision that
   belongs to the owner, not to be shipped speculatively.
2. **The token is fully offline-verifiable.** `generateIdCardToken`/
   `verifyIdCardToken` (`src/domain/id-card-token.ts`) compute
   `HMAC-SHA256(secretKey, schoolId|learnerId|lrn)`, truncated and
   hex-encoded, using the Web Crypto `SubtleCrypto` API already available
   in the Tauri WebView2 runtime — no new dependency. Verification
   recomputes the token from data already on the device (the three
   fields above) and compares — no database lookup beyond what's already
   local, no network call, ever. A garbled/tampered scan returns `false`
   rather than throwing, so a failed scan reads as "not verified," not an
   error dialog.
3. **Key sourcing is explicitly out of this ADR's scope.** The token
   functions take a `CryptoKey` as a parameter; they make no assumption
   about where it comes from. Wiring this to a real device/school-bound
   secret (most naturally the existing SSPK/device-credential material
   in `src-tauri/src/crypto/` — see `docs/adr/0003-encryption-at-rest.md`)
   is recorded as next-slice work, once a UI screen actually needs to
   generate/verify real cards. Keeping this decoupled means the token
   engine's own contract and tests do not change no matter which secret
   source is chosen later.
4. **QR image rendering is deferred, not faked.** No QR-code rendering
   library exists in this project yet (`package.json` has none), and
   hand-rolling a correct QR encoder (Reed-Solomon error correction,
   format/version information, quiet zones) is real, error-prone
   cryptography-adjacent work this batch does not have room to do
   correctly. Rendering a fake, non-scannable placeholder graphic and
   calling it a QR code would be actively misleading. This batch ships
   the security-relevant token engine only; the printable front/back
   card layout and a real scannable QR image are deferred to the next
   slice, which should evaluate a specific QR-rendering dependency (e.g.
   `qrcode`, MIT-licensed, actively maintained, ~30KB, zero
   sub-dependencies of concern) against this codebase's "flag every new
   dependency" constraint before adding it.

## Consequences

- If the owner later decides ID verification should be cloud-checkable
  (e.g. for an outside party — a new school, a scholarship body — to
  verify a card without the original device), that is a different,
  larger feature (a real public endpoint, its own auth/rate-limiting/
  privacy review) layered on top of, not replacing, this offline token.
  Nothing here needs to be torn out to support that later; the offline
  path keeps working for verification on the issuing device regardless.
- Until a UI screen and real secret-key wiring exist, this token engine
  is not yet usable end-to-end — it is a tested foundation, not a
  shippable feature on its own. This is called out explicitly rather
  than implied.

## Verification

- `src/domain/id-card-token.test.ts`: deterministic token generation,
  different learner/different key produce different tokens, correct
  verification, rejection of a token from a different key, rejection of
  a token for mismatched learner data (tamper/reuse), rejection of a
  malformed scan without throwing, and an explicit assertion that
  verification never calls `fetch` — proving the "no cloud round trip"
  property in code, not just in this document.
