# ADR-0029 — Proptest Pilot on the Account-Lockout Invariant

Status: Accepted

## Context

Fourth pick from the post-sequence evidence-based scoring pass
(`docs/product/POST-SEQUENCE-REASSESSMENT-DECISION.md`, score 4.85).
This resumes Phase B of the Compounding Engineering tooling pass
(`docs/product/COMPOUNDING-ENGINEERING-DECISION.md`), which classified
`proptest` ADOPT SELECTIVELY but deferred actually piloting it,
explicitly naming `repository::user`'s account-lockout logic (ADR-0019)
as the "next best" candidate — "the newest security-critical invariant"
at the time.

`repository::user.rs` already had 9 example-based unit tests covering
the lockout logic, including the exact `MAX_FAILED_LOGIN_ATTEMPTS`
boundary and a couple of specific attempt counts. What those don't
generalize over: "for ANY number of consecutive wrong attempts, is the
resulting lock state exactly what the threshold predicts" — a property,
not a handful of hand-picked examples. That gap is exactly what
property-based testing is for.

## Decision

Added `proptest = "1"` as a `[dev-dependencies]`-only entry in
`src-tauri/Cargo.toml` (no production code depends on it). Two
properties added in a new `lockout_properties` submodule inside
`repository::user`'s existing `tests` module:

1. **Threshold correctness**: for any number of consecutive wrong
   attempts `0..=15` against one known account, the account is locked
   after exactly that many attempts if and only if
   `attempts >= MAX_FAILED_LOGIN_ATTEMPTS`.
2. **Unknown-username safety**: for any generated username (never
   actually created) and any attempt count `1..=10`, every attempt
   returns the same generic `AuthenticationFailed` — never locks,
   never differs based on the username's content.

**Deliberately configured to 8 cases per property**, not proptest's
default of 256. Every case in this suite runs real Argon2id verification
— this app's security posture means `auth::verify_password`/
`verify_dummy_password_for_timing_safety` are never mocked or given
lighter test-only parameters, unlike some codebases that swap in a fast
hash for tests. A high case count would multiply real, deliberately-
expensive hashing work without adding coverage proportional to the cost
(the lockout counter resets to 0 the instant it locks, so behavior past
the threshold is already fully determined and already covered by the
existing example test `a_locked_account_rejects_even_the_correct_password`).
Measured: ~20-25 seconds combined for both properties.

## Consequences

- `src-tauri/Cargo.toml`: `proptest = "1"` dev-dependency.
- `src-tauri/src/repository/user.rs`: new `lockout_properties` test
  submodule, 2 properties, 8 cases each.
- `docs/SOURCE-REGISTRY.md`: `proptest` moved from "ADOPT SELECTIVELY,
  deferred" to "ADOPT SELECTIVELY (piloted)" with the measured runtime
  and the reasoning above.
- **Verification actually run this session**: `cargo nextest run`
  312/312 (up from 310, the 2 new proptest properties), `cargo clippy
--all-targets -D warnings` clean, plain `cargo test` (the stable-
  checkpoint command nextest doesn't replace) also green including 0
  doctest failures. `cargo deny check` unavailable on this machine's
  `PATH` this session — same disclosed per-machine security-tooling gap
  noted in prior sessions (`docs/CURRENT-HANDOFF.md`'s Windows-migration
  checkpoint note), not newly introduced by this change. No TS change.
- **Independent review**: not dispatched — both `teacher-ux-reviewer`
  and `accessibility-reviewer` are documented as unreliable this session
  (ADR-0027); this change also isn't a UI change those reviewers would
  cover. A `security-reviewer` dispatch was considered but judged not
  warranted for a dev-dependency-only addition of pure test code with no
  production-code change and no new authorization surface — the real
  security logic under test (`verify_credentials`, `is_locked`,
  `record_failed_login_attempt`) is unchanged, already reviewed at
  ADR-0019's own milestone. Self-review: confirmed `proptest` is
  `[dev-dependencies]` only, confirmed no production code path changed,
  confirmed the two properties' assertions match `verify_credentials`'s
  own documented contract exactly (not a weakened restatement of it).
- Not implemented (deliberately out of scope, noted as a next candidate
  in `docs/SOURCE-REGISTRY.md`): property tests for monthly-attendance
  aggregation or grade-rounding/transmutation boundaries — good future
  Phase B candidates per the original Compounding Engineering shortlist,
  not attempted this pass to keep this pilot scoped to one invariant.
